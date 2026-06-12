'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSWRConfig } from 'swr'
import { showCloudSyncSuccessIndicator } from '@/components/cloud-sync-success-indicator'
import { exportCloudData, importCloudData, getSyncConfig, saveSyncConfig, purgeStaleTombstones } from '@/lib/db'
import {
  decryptWithSessionKey,
  decryptSyncConfig,
  reEncryptWithSessionKey,
  hasSessionKey,
} from '@/lib/sync-crypto'
import { downloadFromCloud, uploadToCloud } from '@/lib/cloud-sync'
import type { EncryptedSyncConfig, SyncConfig } from '@/lib/types'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

// How often the 15-minute periodic full sync fires
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000
// How long to suppress repeated foreground-triggered pulls after switching back
const FOREGROUND_PULL_THROTTLE_MS = 15 * 1000
// How long to wait after markDirty() before uploading (batches rapid read events)
const DIRTY_PUSH_DELAY_MS = 15 * 1000

export interface UseSyncReturn {
  encryptedConfig: EncryptedSyncConfig | null
  isSyncing: boolean
  status: SyncStatus
  lastSyncAt: number | undefined
  /** Timestamp of the last successful pull (in-memory only, not persisted) */
  lastPulledAt: number | undefined
  /** True when there is a stored config but no session key cached */
  needsPassphrase: boolean
  /**
   * Feed IDs that had new stub articles created during the last pull.
   * Consume these to trigger a background RSS refresh so content is filled in.
   * Call clearFeedsToRefreshAfterSync() once consumed.
   */
  feedsToRefreshAfterSync: string[] | null
  clearFeedsToRefreshAfterSync: () => void
  /** Trigger a full sync. Pass passphrase only when needsPassphrase is true. */
  triggerSync: (passphrase?: string) => Promise<void>
  /** Save new encrypted config (after user configures a provider). */
  saveConfig: (cfg: EncryptedSyncConfig) => Promise<void>
  /** Clear stored config and session key. */
  clearConfig: () => Promise<void>
  /**
   * Mark local state as dirty (e.g. after marking an article read).
   * Schedules a deferred upload within DIRTY_PUSH_DELAY_MS so that another
   * device sees the update without waiting for the 15-minute periodic sync.
   */
  markDirty: () => void
}

export function useSync(): UseSyncReturn {
  const { mutate: globalMutate } = useSWRConfig()
  const [encryptedConfig, setEncryptedConfig] = useState<EncryptedSyncConfig | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>()
  const [lastPulledAt, setLastPulledAt] = useState<number | undefined>()
  const [needsPassphrase, setNeedsPassphrase] = useState(false)
  const [feedsToRefreshAfterSync, setFeedsToRefreshAfterSync] = useState<string[] | null>(null)

  const clearFeedsToRefreshAfterSync = useCallback(() => {
    setFeedsToRefreshAfterSync(null)
  }, [])

  // Refs for stable access inside timers / event listeners without stale closures.
  // Assigned directly on every render so closures always read the latest value.
  const encryptedConfigRef = useRef<EncryptedSyncConfig | null>(null)
  const isSyncingRef = useRef(false)
  encryptedConfigRef.current = encryptedConfig
  isSyncingRef.current = isSyncing

  // Dirty-push state: tracks whether local changes haven't been uploaded yet
  const isDirtyRef = useRef(false)
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastForegroundPullAtRef = useRef(0)

  // ─── doPull: download remote snapshot and merge into local DB ─────────────
  const doPull = useCallback(async (decrypted: SyncConfig) => {
    const remote = await downloadFromCloud(decrypted)
    if (remote) {
      const stats = await importCloudData(remote)
      // Invalidate all SWR caches so UI reflects merged data without a page reload
      await globalMutate((key) => typeof key === 'string')
      setLastPulledAt(Date.now())
      if (stats.newFeedIds && stats.newFeedIds.length > 0) {
        setFeedsToRefreshAfterSync(stats.newFeedIds)
      }
    }
  }, [globalMutate])

  // ─── doPush: export local state and upload to cloud ───────────────────────
  const doPush = useCallback(async (encryptedCfg: EncryptedSyncConfig, decrypted: SyncConfig) => {
    const snapshot = await exportCloudData()
    const { gistId } = await uploadToCloud(decrypted, snapshot)

    // Tombstones already uploaded — safe to purge stale ones locally
    purgeStaleTombstones().catch(() => {})

    const now = Date.now()
    let updated: EncryptedSyncConfig = { ...encryptedCfg, lastSyncAt: now }

    if (gistId && gistId !== encryptedCfg.gistId) {
      const updatedConfig: SyncConfig = decrypted.type === 'github-gist'
        ? { ...decrypted, gistId }
        : decrypted
      const reEncrypted = await reEncryptWithSessionKey(updatedConfig, updated)
      if (reEncrypted) updated = { ...reEncrypted, lastSyncAt: now, gistId }
      else updated = { ...updated, gistId }
    }

    await saveSyncConfig(updated)
    setEncryptedConfig(updated)
    setLastSyncAt(now)
    isDirtyRef.current = false
  }, [])

  // ─── pullIfPossible / pushIfPossible: decrypt-then-act helpers ─────────────
  // Centralise the "get config ref → decrypt → act" pattern used in multiple
  // places (markDirty timer, on-hide flush, focus pull).
  const pullIfPossible = useCallback(async () => {
    const blob = encryptedConfigRef.current
    if (!blob) return
    const decrypted = await decryptWithSessionKey(blob).catch(() => null)
    if (!decrypted) return
    isSyncingRef.current = true  // guard concurrent calls before React re-render
    setIsSyncing(true)
    setStatus('syncing')
    try {
      await doPull(decrypted)
      setStatus('success')
      showCloudSyncSuccessIndicator()
    } catch (err) {
      setStatus('error')
      throw err
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
    }
  }, [doPull])

  const pushIfPossible = useCallback(async () => {
    const blob = encryptedConfigRef.current
    if (!blob) return
    const decrypted = await decryptWithSessionKey(blob).catch(() => null)
    if (!decrypted) return
    await doPush(blob, decrypted)
  }, [doPush])

  // ─── doSync: full pull + push (used by manual trigger and periodic timer) ──
  const doSync = useCallback(async (encryptedCfg: EncryptedSyncConfig, config?: SyncConfig) => {
    isSyncingRef.current = true  // guard concurrent calls before React re-render
    setIsSyncing(true)
    setStatus('syncing')
    try {
      const decrypted = config ?? (await decryptWithSessionKey(encryptedCfg))
      if (!decrypted) {
        setNeedsPassphrase(true)
        setStatus('idle')
        const isActuallyEncrypted = encryptedCfg.isEncrypted === true || (!!encryptedCfg.salt && !!encryptedCfg.iv)
        throw new Error(isActuallyEncrypted ? '会话已过期，请重新输入同步密码' : '同步配置已损坏，请移除后重新配置')
      }

      await doPull(decrypted)
      await doPush(encryptedCfg, decrypted)
      setNeedsPassphrase(false)
      setStatus('success')
      showCloudSyncSuccessIndicator()
    } catch (err) {
      console.error('[useSync] sync failed', err)
      setStatus('error')
      throw err
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
    }
  }, [doPull, doPush])

  // ─── Startup: pull only ────────────────────────────────────────────────────
  // Only download and merge cloud state. No push — the 15-min periodic sync
  // or markDirty will push when there is actually something new to upload.
  useEffect(() => {
    let cancelled = false
    getSyncConfig().then((cfg) => {
      if (cancelled || !cfg) return
      setEncryptedConfig(cfg)
      setLastSyncAt(cfg.lastSyncAt)
      const needsKey = (cfg.isEncrypted === true || (!!cfg.salt && !!cfg.iv)) && !hasSessionKey()
      if (!needsKey) {
        const runStartup = async () => {
          if (cancelled) return
          isSyncingRef.current = true  // guard concurrent calls before React re-render
          setIsSyncing(true)
          setStatus('syncing')
          try {
            const decrypted = await decryptWithSessionKey(cfg)
            if (!decrypted) {
              if (!cancelled) { setNeedsPassphrase(true); setStatus('idle') }
              return
            }
            await doPull(decrypted)
            if (!cancelled) {
              setNeedsPassphrase(false)
              setStatus('success')
              showCloudSyncSuccessIndicator()
            }
          } catch (err) {
            console.error('[useSync] startup pull failed', err)
            if (!cancelled) setStatus('error')
          } finally {
            isSyncingRef.current = false
            if (!cancelled) setIsSyncing(false)
          }
        }
        runStartup()
      } else {
        setNeedsPassphrase(true)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerSync = useCallback(async (passphrase?: string) => {
    const encryptedCfg = encryptedConfig
    if (!encryptedCfg) throw new Error('未配置云同步')

    let config: SyncConfig | null = null
    if (passphrase) {
      config = await decryptSyncConfig(encryptedCfg, passphrase)
    }
    await doSync(encryptedCfg, config ?? undefined)
  }, [encryptedConfig, doSync])

  // ─── Periodic full sync: pull + push every 15 min ────────────────────────
  // Latest-ref pattern so the interval callback never captures stale closures.
  const autoSyncRef = useRef<() => void>(() => {})
  // No dep array: intentionally re-runs on every render to keep ref current
  useEffect(() => {
    autoSyncRef.current = () => {
      if (isSyncing) return
      if (document.visibilityState !== 'visible') return
      triggerSync()
        .catch((e) => { console.log(e) })
    }
  })

  // ─── Timers & visibilitychange — registered once per config change ─────────
  // One listener handles both visibility directions:
  //   visible → unconditional pull (always fetch latest cloud state on focus)
  //   hidden  → immediate push if dirty (flush reads before the tab goes away)
  useEffect(() => {
    if (!encryptedConfig || needsPassphrase) return

    const onVisibilityChange = () => {
      if (isSyncingRef.current) return
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        if (now - lastForegroundPullAtRef.current < FOREGROUND_PULL_THROTTLE_MS) return
        lastForegroundPullAtRef.current = now
        pullIfPossible()
          .catch(() => {})
      } else {
        if (!isDirtyRef.current) return
        if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null }
        pushIfPossible().catch(() => {})
      }
    }

    const timer = setInterval(() => autoSyncRef.current(), AUTO_SYNC_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [encryptedConfig, needsPassphrase, pullIfPossible, pushIfPossible])

  // ─── markDirty: schedule a deferred push after local reads/saves ───────────
  const markDirty = useCallback(() => {
    isDirtyRef.current = true
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(async () => {
      pushTimerRef.current = null
      if (!isDirtyRef.current || isSyncingRef.current) return
      setIsSyncing(true)
      setStatus('syncing')
      try {
        await pushIfPossible()
        setStatus('success')
        showCloudSyncSuccessIndicator()
      } catch {
        setStatus('error')
      } finally {
        setIsSyncing(false)
      }
    }, DIRTY_PUSH_DELAY_MS)
  }, [pushIfPossible])

  const saveConfig = useCallback(async (cfg: EncryptedSyncConfig) => {
    await saveSyncConfig(cfg)
    setEncryptedConfig(cfg)
    setLastSyncAt(cfg.lastSyncAt)
    setNeedsPassphrase(cfg.isEncrypted && !hasSessionKey())
  }, [])

  const clearConfig = useCallback(async () => {
    const { clearSessionKey } = await import('@/lib/sync-crypto')
    const { getDB } = await import('@/lib/db')
    clearSessionKey()
    const dbInstance = await getDB()
    await dbInstance.delete('settings', 'sync')
    setEncryptedConfig(null)
    setLastSyncAt(undefined)
    setNeedsPassphrase(false)
    setStatus('idle')
  }, [])

  return { encryptedConfig, isSyncing, status, lastSyncAt, lastPulledAt, needsPassphrase, feedsToRefreshAfterSync, clearFeedsToRefreshAfterSync, triggerSync, saveConfig, clearConfig, markDirty }
}
