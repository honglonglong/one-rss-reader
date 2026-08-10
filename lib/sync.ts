import { exportAllData, importAllData } from './db'
import type { SyncSnapshot, ImportStats } from './types'

/** Serialize and trigger a browser download of the snapshot JSON. */
export async function downloadSnapshot(options?: { includeSyncConfig?: boolean }): Promise<void> {
  const snapshot = await exportAllData(options)
  const json = JSON.stringify(snapshot, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const date = new Date().toISOString().slice(0, 10)
  const link = document.createElement('a')
  link.href = url
  link.download = `rss-reader-backup-${date}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Read a File object and parse it as a SyncSnapshot. Throws on bad format. */
export async function readSnapshotFile(file: File): Promise<SyncSnapshot> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON 格式')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    ((parsed as SyncSnapshot).version !== 1 && (parsed as SyncSnapshot).version !== 2) ||
    !Array.isArray((parsed as SyncSnapshot).feeds) ||
    !Array.isArray((parsed as SyncSnapshot).articles) ||
    !Array.isArray((parsed as SyncSnapshot).highlights)
  ) {
    throw new Error('文件格式不正确，请选择由本应用导出的备份文件')
  }

  return parsed as SyncSnapshot
}

/** Import a snapshot into the local database and return statistics. */
export async function importSnapshot(snapshot: SyncSnapshot): Promise<ImportStats> {
  return importAllData(snapshot)
}

/** Format an ISO date string for display. */
export function formatExportDate(ts: number): string {
  return new Date(ts).toLocaleString()
}
