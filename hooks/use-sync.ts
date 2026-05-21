'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSWRConfig } from 'swr'
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

export interface UseSyncReturn {
  encryptedConfig: EncryptedSyncConfig | null
  isSyncing: boolean
  status: SyncStatus
  lastSyncAt: number | undefined
  /** True when there is a stored config but no session key cached */
  needsPassphrase: boolean
  /** Trigger a full sync. Pass passphrase only when needsPassphrase is true. */
  triggerSync: (passphrase?: string) => Promise<void>
  /** Save new encrypted config (after user configures a provider). */
  saveConfig: (cfg: EncryptedSyncConfig) => Promise<void>
  /** Clear stored config and session key. */
  clearConfig: () => Promise<void>
}

export function useSync(): UseSyncReturn {
  const { mutate: globalMutate } = useSWRConfig()
  const [encryptedConfig, setEncryptedConfig] = useState<EncryptedSyncConfig | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>()
  const [needsPassphrase, setNeedsPassphrase] = useState(false)

  // Load config on mount and attempt auto-sync
  useEffect(() => {
    let cancelled = false
    getSyncConfig().then((cfg) => {
      if (cancelled || !cfg) return
      setEncryptedConfig(cfg)
      setLastSyncAt(cfg.lastSyncAt)
      const needsKey = (cfg.isEncrypted === true || (!!cfg.salt && !!cfg.iv)) && !hasSessionKey()
      if (!needsKey) {
        doSync(cfg).catch(() => {/* errors surface via status */})
      } else {
        setNeedsPassphrase(true)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doSync = useCallback(async (blob: EncryptedSyncConfig, config?: SyncConfig) => {
    setIsSyncing(true)
    setStatus('syncing')
    try {
      const decrypted = config ?? (await decryptWithSessionKey(blob))
      if (!decrypted) {
        setNeedsPassphrase(true)
        setStatus('idle')
        const isActuallyEncrypted = blob.isEncrypted === true || (!!blob.salt && !!blob.iv)
        throw new Error(isActuallyEncrypted ? '会话已过期，请重新输入同步密码' : '同步配置已损坏，请移除后重新配置')
      }

      // 1. Download + merge (state-only: no article HTML content transferred)
      const remote = await downloadFromCloud(decrypted)
      if (remote) {
        await importCloudData(remote)
        // Invalidate all SWR caches so UI reflects merged data without a page reload
        await globalMutate((key) => typeof key === 'string')
      }

      // 2. Upload merged local state
      const snapshot = await exportCloudData()
      const { gistId } = await uploadToCloud(decrypted, snapshot)

      // 2a. Tombstones already uploaded — safe to purge stale ones locally
      purgeStaleTombstones().catch(() => {/* non-critical, ignore errors */})

      // 3. Update lastSyncAt; patch gistId if this was the first Gist upload
      const now = Date.now()
      let updated: EncryptedSyncConfig = { ...blob, lastSyncAt: now }

      if (gistId && gistId !== blob.gistId) {
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
      setNeedsPassphrase(false)
      setStatus('success')
    } catch (err) {
      console.error('[useSync] sync failed', err)
      setStatus('error')
      throw err
    } finally {
      setIsSyncing(false)
    }
  }, [globalMutate])

  const triggerSync = useCallback(async (passphrase?: string) => {
    const blob = encryptedConfig
    if (!blob) throw new Error('未配置云同步')

    let config: SyncConfig | null = null
    if (passphrase) {
      config = await decryptSyncConfig(blob, passphrase)
    }
    await doSync(blob, config ?? undefined)
  }, [encryptedConfig, doSync])

  // Scheduled auto-sync: every 15 min via setInterval, and immediately when the tab regains focus
  const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000

  // Keep a ref to the latest check-and-sync logic so the interval never goes stale
  const autoSyncRef = useRef<() => void>(() => {})
  useEffect(() => {
    autoSyncRef.current = () => {
      if (isSyncing) return
      if (document.visibilityState !== 'visible') return
      if (lastSyncAt !== undefined && Date.now() - lastSyncAt < AUTO_SYNC_INTERVAL_MS) return
      triggerSync().catch((e) => {/* silent — errors surface via status */console.log(e)})
    }
  })

  // Only re-register the interval when the sync config itself changes
  useEffect(() => {
    if (!encryptedConfig || needsPassphrase) return

    const run = () => autoSyncRef.current()
    const timer = setInterval(run, AUTO_SYNC_INTERVAL_MS)
    document.addEventListener('visibilitychange', run)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [encryptedConfig, needsPassphrase])

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

  return { encryptedConfig, isSyncing, status, lastSyncAt, needsPassphrase, triggerSync, saveConfig, clearConfig }
}
