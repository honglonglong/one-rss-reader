// SyncTab: 云同步/本地备份 Tab
'use client'
import { SyncDialog } from '../sync-dialog'
import { useSyncContext } from '@/components/sync-provider'
import { useFeeds } from '@/hooks/use-feeds'

export default function SyncTab() {
  const { encryptedConfig, isSyncing, lastSyncAt, lastPulledAt, needsPassphrase, triggerSync, saveConfig, clearConfig } = useSyncContext()
  const { refresh } = useFeeds()

  return (
    <SyncDialog
      asPanel
      encryptedConfig={encryptedConfig}
      lastSyncAt={lastSyncAt}
      lastPulledAt={lastPulledAt}
      isSyncing={isSyncing}
      needsPassphrase={needsPassphrase}
      onSaveConfig={saveConfig}
      onClearConfig={clearConfig}
      onTriggerSync={triggerSync}
      onImportDone={() => refresh()}
    />
  )
}
