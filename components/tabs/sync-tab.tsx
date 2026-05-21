// SyncTab: 云同步/本地备份 Tab
'use client'
import { SyncDialog } from '../sync-dialog'
import { useSync } from '@/hooks/use-sync'
import { useFeeds } from '@/hooks/use-feeds'

export default function SyncTab() {
  const { encryptedConfig, isSyncing, lastSyncAt, needsPassphrase, triggerSync, saveConfig, clearConfig } = useSync()
  const { refresh } = useFeeds()

  return (
    <SyncDialog
      asPanel
      encryptedConfig={encryptedConfig}
      lastSyncAt={lastSyncAt}
      isSyncing={isSyncing}
      needsPassphrase={needsPassphrase}
      onSaveConfig={saveConfig}
      onClearConfig={clearConfig}
      onTriggerSync={triggerSync}
      onImportDone={() => refresh()}
    />
  )
}
