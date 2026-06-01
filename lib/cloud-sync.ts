/**
 * Client-side wrappers that call /api/sync.
 * All provider credentials stay in the request body and are handled server-side.
 */

import type { SyncConfig, CloudSyncSnapshot } from './types'

async function callSyncApi(body: {
  operation: 'test' | 'upload' | 'download'
  config: SyncConfig
  snapshot?: CloudSyncSnapshot
}) {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { ok: boolean; message?: string; snapshot?: CloudSyncSnapshot; gistId?: string }
  if (!data.ok) throw new Error(data.message ?? '同步请求失败')
  return data
}

export async function testCloudConnection(config: SyncConfig): Promise<void> {
  await callSyncApi({ operation: 'test', config })
}

/** Download the remote cloud snapshot. Returns null if nothing uploaded yet. */
export async function downloadFromCloud(config: SyncConfig): Promise<CloudSyncSnapshot | null> {
  const data = await callSyncApi({ operation: 'download', config })
  return data.snapshot ?? null
}

/**
 * Upload a cloud snapshot.
 * @returns gistId if the provider is GitHub Gist (needed on first upload)
 */
export async function uploadToCloud(
  config: SyncConfig,
  snapshot: CloudSyncSnapshot,
): Promise<{ gistId?: string }> {
  const data = await callSyncApi({ operation: 'upload', config, snapshot })
  return { gistId: data.gistId }
}
