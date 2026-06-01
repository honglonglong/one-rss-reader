import { NextRequest, NextResponse } from 'next/server'
import type { SyncConfig, CloudSyncSnapshot } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Operation = 'test' | 'upload' | 'download'

interface RequestBody {
  operation: Operation
  config: SyncConfig
  snapshot?: CloudSyncSnapshot
}

interface UploadResult {
  ok: true
  gistId?: string
}

interface DownloadResult {
  ok: true
  snapshot: CloudSyncSnapshot | null
}

interface TestResult {
  ok: true
}

type ProviderResult = UploadResult | DownloadResult | TestResult

// ── GitHub Gist ───────────────────────────────────────────────────────────────

const GIST_FILENAME = 'rss-reader-sync.json'

async function gistRequest(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

async function handleGist(op: Operation, config: Extract<SyncConfig, { type: 'github-gist' }>, snapshot?: CloudSyncSnapshot): Promise<ProviderResult> {
  if (op === 'test') {
    const res = await gistRequest('GET', '/user', config.token)
    if (!res.ok) throw new Error('GitHub Token 无效或权限不足')
    return { ok: true }
  }

  if (op === 'download') {
    if (!config.gistId) return { ok: true, snapshot: null }
    const res = await gistRequest('GET', `/gists/${config.gistId}`, config.token)
    if (!res.ok) {
      if (res.status === 404) return { ok: true, snapshot: null }
      throw new Error(`Gist 下载失败: ${res.status}`)
    }
    const data = await res.json() as { files: Record<string, { content: string }> }
    const content = data.files?.[GIST_FILENAME]?.content
    if (!content) return { ok: true, snapshot: null }
    return { ok: true, snapshot: JSON.parse(content) as CloudSyncSnapshot }
  }

  // upload
  if (!snapshot) throw new Error('缺少 snapshot 数据')
  const content = JSON.stringify(snapshot)

  if (config.gistId) {
    const res = await gistRequest('PATCH', `/gists/${config.gistId}`, config.token, {
      files: { [GIST_FILENAME]: { content } },
    })
    if (!res.ok) throw new Error(`Gist 更新失败: ${res.status}`)
    return { ok: true, gistId: config.gistId }
  }

  // First upload — create a new private gist
  const res = await gistRequest('POST', '/gists', config.token, {
    description: 'One RSS Reader Sync',
    public: false,
    files: { [GIST_FILENAME]: { content } },
  })
  if (!res.ok) throw new Error(`Gist 创建失败: ${res.status}`)
  const created = await res.json() as { id: string }
  return { ok: true, gistId: created.id }
}

// ── WebDAV ────────────────────────────────────────────────────────────────────

async function handleWebDAV(op: Operation, config: Extract<SyncConfig, { type: 'webdav' }>, snapshot?: CloudSyncSnapshot): Promise<ProviderResult> {
  const { createClient } = await import('webdav')
  const client = createClient(config.url, { username: config.username, password: config.password })
  const filePath = config.path ?? 'rss-reader-sync.json'

  if (op === 'test') {
    try {
      await client.getDirectoryContents('/')
    } catch {
      throw new Error('WebDAV 连接失败，请检查 URL 和凭证')
    }
    return { ok: true }
  }

  if (op === 'download') {
    try {
      const content = await client.getFileContents(filePath, { format: 'text' }) as string
      return { ok: true, snapshot: JSON.parse(content) as CloudSyncSnapshot }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 404) return { ok: true, snapshot: null }
      throw new Error('WebDAV 下载失败')
    }
  }

  // upload
  if (!snapshot) throw new Error('缺少 snapshot 数据')
  await client.putFileContents(filePath, JSON.stringify(snapshot), { overwrite: true })
  return { ok: true }
}

// ── S3-compatible (AWS S3 + Cloudflare R2) ────────────────────────────────────

async function handleS3(
  op: Operation,
  config: Extract<SyncConfig, { type: 'aws-s3' | 'cloudflare-r2' }>,
  snapshot?: CloudSyncSnapshot,
): Promise<ProviderResult> {
  const { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3')

  const endpoint =
    config.type === 'cloudflare-r2'
      ? `https://${config.accountId}.r2.cloudflarestorage.com`
      : undefined

  const region = config.type === 'aws-s3' ? config.region : 'auto'

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    ...(config.type === 'cloudflare-r2' ? { forcePathStyle: false } : {}),
  })

  const key = config.path ?? 'rss-reader-sync.json'

  if (op === 'test') {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    return { ok: true }
  }

  if (op === 'download') {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
      const body = await res.Body?.transformToString()
      if (!body) return { ok: true, snapshot: null }
      return { ok: true, snapshot: JSON.parse(body) as CloudSyncSnapshot }
    } catch (err: unknown) {
      const code = (err as { name?: string }).name
      if (code === 'NoSuchKey' || code === 'NotFound') return { ok: true, snapshot: null }
      throw new Error('对象存储下载失败')
    }
  }

  // upload
  if (!snapshot) throw new Error('缺少 snapshot 数据')
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: JSON.stringify(snapshot),
      ContentType: 'application/json',
    }),
  )
  return { ok: true }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ ok: false, message: '无效的请求体' }, { status: 400 })
  }

  const { operation, config, snapshot } = body
  if (!operation || !config) {
    return NextResponse.json({ ok: false, message: '缺少必要参数' }, { status: 400 })
  }

  try {
    let result: ProviderResult
    switch (config.type) {
      case 'github-gist':
        result = await handleGist(operation, config, snapshot)
        break
      case 'webdav':
        result = await handleWebDAV(operation, config, snapshot)
        break
      case 'cloudflare-r2':
      case 'aws-s3':
        result = await handleS3(operation, config, snapshot)
        break
      default:
        return NextResponse.json({ ok: false, message: '不支持的同步提供商' }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '同步操作失败'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
