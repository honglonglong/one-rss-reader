'use client'

import { useState, useRef } from 'react'
import { useSWRConfig } from 'swr'
import { Download, Upload, RefreshCw, CheckCircle2, Info, Cloud, Eye, EyeOff, Trash2, Wifi } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { downloadSnapshot, readSnapshotFile, importSnapshot, formatExportDate } from '@/lib/sync'
import { encryptSyncConfig, decryptSyncConfig, hasSessionKey } from '@/lib/sync-crypto'
import { testCloudConnection } from '@/lib/cloud-sync'
import type { SyncSnapshot } from '@/lib/types'
import type { ImportStats } from '@/lib/types'
import type { SyncProviderType, SyncConfig, EncryptedSyncConfig } from '@/lib/types'
import { toast } from 'sonner'

interface SyncDialogProps {
  trigger?: React.ReactNode
  onImportDone?: () => void
  /** Injected from useSync in page.tsx */
  encryptedConfig?: EncryptedSyncConfig | null
  lastSyncAt?: number
  isSyncing?: boolean
  needsPassphrase?: boolean
  onSaveConfig?: (cfg: EncryptedSyncConfig) => Promise<void>
  onClearConfig?: () => Promise<void>
  onTriggerSync?: (passphrase?: string) => Promise<void>
  /** When true, renders content directly without Dialog wrapper */
  asPanel?: boolean
}

// ── Provider form helpers ─────────────────────────────────────────────────────

function PasswordInput({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}

function TextInput({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
    </div>
  )
}

const PROVIDER_LABELS: Record<SyncProviderType, string> = {
  'github-gist': 'GitHub Gist',
  webdav: 'WebDAV',
  'cloudflare-r2': 'Cloudflare R2',
  'aws-s3': 'AWS S3',
}

// ── Main component ────────────────────────────────────────────────────────────

export function SyncDialog({
  trigger,
  onImportDone,
  encryptedConfig,
  lastSyncAt,
  isSyncing = false,
  needsPassphrase = false,
  onSaveConfig,
  onClearConfig,
  onTriggerSync,
  asPanel,
}: SyncDialogProps) {
  const { mutate: globalMutate } = useSWRConfig()
  const [open, setOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [pendingSnapshot, setPendingSnapshot] = useState<SyncSnapshot | null>(null)
  const [importStats, setImportStats] = useState<ImportStats | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cloud sync form state
  const [provider, setProvider] = useState<SyncProviderType>('github-gist')
  const [passphrase, setPassphrase] = useState('')
  const [syncPassphrase, setSyncPassphrase] = useState('') // for unlock flow
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Provider field values (intentionally not persisted to state between mounts — user re-enters)
  const [gistToken, setGistToken] = useState('')
  const [webdavUrl, setWebdavUrl] = useState('')
  const [webdavUser, setWebdavUser] = useState('')
  const [webdavPass, setWebdavPass] = useState('')
  const [webdavPath, setWebdavPath] = useState('')
  const [r2AccountId, setR2AccountId] = useState('')
  const [r2AccessKey, setR2AccessKey] = useState('')
  const [r2SecretKey, setR2SecretKey] = useState('')
  const [r2Bucket, setR2Bucket] = useState('')
  const [r2Path, setR2Path] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [s3AccessKey, setS3AccessKey] = useState('')
  const [s3SecretKey, setS3SecretKey] = useState('')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Path, setS3Path] = useState('')

  // ── Backup tab handlers ──────────────────────────────────────────────────────

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await downloadSnapshot()
      toast.success('备份文件已下载')
    } catch {
      toast.error('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    try {
      const snapshot = await readSnapshotFile(file)
      setPendingSnapshot(snapshot)
      setImportStats(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文件读取失败')
    }
  }

  const handleImport = async () => {
    if (!pendingSnapshot) return
    setIsImporting(true)
    try {
      const stats = await importSnapshot(pendingSnapshot)
      setImportStats(stats)
      setPendingSnapshot(null)
      toast.success('导入完成')
      await globalMutate((key) => typeof key === 'string')
      onImportDone?.()
    } catch {
      toast.error('导入失败，请重试')
    } finally {
      setIsImporting(false)
    }
  }

  // ── Cloud sync helpers ───────────────────────────────────────────────────────

  function buildConfig(): SyncConfig | null {
    switch (provider) {
      case 'github-gist':
        if (!gistToken) return null
        return { type: 'github-gist', token: gistToken }
      case 'webdav':
        if (!webdavUrl || !webdavUser || !webdavPass) return null
        return { type: 'webdav', url: webdavUrl, username: webdavUser, password: webdavPass, ...(webdavPath ? { path: webdavPath } : {}) }
      case 'cloudflare-r2':
        if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) return null
        return { type: 'cloudflare-r2', accountId: r2AccountId, accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey, bucket: r2Bucket, ...(r2Path ? { path: r2Path } : {}) }
      case 'aws-s3':
        if (!s3Region || !s3AccessKey || !s3SecretKey || !s3Bucket) return null
        return { type: 'aws-s3', region: s3Region, accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey, bucket: s3Bucket, ...(s3Path ? { path: s3Path } : {}) }
    }
  }

  const handleTest = async () => {
    const config = buildConfig()
    if (!config) { toast.error('请填写完整的连接信息'); return }
    setIsTesting(true)
    try {
      await testCloudConnection(config)
      toast.success('连接测试成功')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '连接测试失败')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSaveConfig = async () => {
    const config = buildConfig()
    if (!config) { toast.error('请填写完整的连接信息'); return }
    if (!onSaveConfig) return
    setIsSaving(true)
    try {
      const encrypted = await encryptSyncConfig(config, passphrase)
      await onSaveConfig(encrypted)
      setPassphrase('')
      toast.success('云同步已配置')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUnlockSync = async () => {
    if (!syncPassphrase || !onTriggerSync) return
    try {
      await onTriggerSync(syncPassphrase)
      setSyncPassphrase('')
      toast.success('同步成功')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步失败，请检查密码')
    }
  }

  const handleSyncNow = async () => {
    if (!onTriggerSync) return
    try {
      await onTriggerSync()
      toast.success('同步完成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步失败')
    }
  }

  const handleClearConfig = async () => {
    if (!onClearConfig) return
    await onClearConfig()
    toast.success('云同步配置已清除')
  }

  const isConfigured = !!encryptedConfig
  const sessionActive = isConfigured && (encryptedConfig!.isEncrypted === false || hasSessionKey())

  // ── Render ───────────────────────────────────────────────────────────────────

  const tabsContent = (
    <Tabs defaultValue={isConfigured ? 'cloud' : 'export'}>
          <TabsList className="w-full">
            <TabsTrigger value="cloud" className="flex-1">
              <Cloud className="mr-1.5 size-3.5" />云同步
            </TabsTrigger>
            <TabsTrigger value="export" className="flex-1">导出备份</TabsTrigger>
            <TabsTrigger value="import" className="flex-1">导入备份</TabsTrigger>
          </TabsList>

          {/* ── Cloud Sync Tab ── */}
          <TabsContent value="cloud" className="space-y-4 mt-4">
            {isConfigured ? (
              /* ── Configured state ── */
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {PROVIDER_LABELS[encryptedConfig!.provider]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sessionActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                      {sessionActive ? '已解锁' : '🔒 已锁定'}
                    </span>
                  </div>
                  {lastSyncAt && (
                    <p className="text-muted-foreground">上次同步：{new Date(lastSyncAt).toLocaleString()}</p>
                  )}
                </div>

                {(encryptedConfig?.isEncrypted === true || (!!encryptedConfig?.salt && !!encryptedConfig?.iv)) && !hasSessionKey() ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">输入同步密码以解锁并同步数据：</p>
                    <PasswordInput id="sync-unlock" label="同步密码" value={syncPassphrase} onChange={setSyncPassphrase} placeholder="••••••••" />
                    <Button className="w-full" onClick={handleUnlockSync} disabled={!syncPassphrase || isSyncing}>
                      {isSyncing ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Wifi className="mr-2 size-4" />}
                      解锁并立即同步
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full" onClick={handleSyncNow} disabled={isSyncing}>
                    {isSyncing ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                    立即同步
                  </Button>
                )}

                <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={handleClearConfig}>
                  <Trash2 className="mr-2 size-4" />移除云同步配置
                </Button>
              </div>
            ) : (
              /* ── Setup state ── */
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>同步提供商</Label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as SyncProviderType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github-gist">GitHub Gist</SelectItem>
                      <SelectItem value="webdav">WebDAV（Nextcloud / iCloud…）</SelectItem>
                      <SelectItem value="cloudflare-r2">Cloudflare R2</SelectItem>
                      <SelectItem value="aws-s3">AWS S3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {provider === 'github-gist' && (
                  <PasswordInput id="gist-token" label="Personal Access Token（Gist 权限）" value={gistToken} onChange={setGistToken} placeholder="ghp_..." />
                )}
                {provider === 'webdav' && (<>
                  <TextInput id="webdav-url" label="WebDAV 地址" value={webdavUrl} onChange={setWebdavUrl} placeholder="https://nextcloud.example.com/remote.php/dav/files/user/" />
                  <TextInput id="webdav-user" label="用户名" value={webdavUser} onChange={setWebdavUser} />
                  <PasswordInput id="webdav-pass" label="密码" value={webdavPass} onChange={setWebdavPass} />
                  <TextInput id="webdav-path" label="文件路径（可选）" value={webdavPath} onChange={setWebdavPath} placeholder="rss-reader-sync.json" />
                </>)}
                {provider === 'cloudflare-r2' && (<>
                  <TextInput id="r2-account" label="Account ID" value={r2AccountId} onChange={setR2AccountId} placeholder="a1b2c3d4..." />
                  <TextInput id="r2-access" label="Access Key ID" value={r2AccessKey} onChange={setR2AccessKey} />
                  <PasswordInput id="r2-secret" label="Secret Access Key" value={r2SecretKey} onChange={setR2SecretKey} />
                  <TextInput id="r2-bucket" label="Bucket 名称" value={r2Bucket} onChange={setR2Bucket} />
                  <TextInput id="r2-path" label="文件路径（可选）" value={r2Path} onChange={setR2Path} placeholder="rss-reader-sync.json" />
                </>)}
                {provider === 'aws-s3' && (<>
                  <TextInput id="s3-region" label="Region" value={s3Region} onChange={setS3Region} placeholder="us-east-1" />
                  <TextInput id="s3-access" label="Access Key ID" value={s3AccessKey} onChange={setS3AccessKey} />
                  <PasswordInput id="s3-secret" label="Secret Access Key" value={s3SecretKey} onChange={setS3SecretKey} />
                  <TextInput id="s3-bucket" label="Bucket 名称" value={s3Bucket} onChange={setS3Bucket} />
                  <TextInput id="s3-path" label="文件路径（可选）" value={s3Path} onChange={setS3Path} placeholder="rss-reader-sync.json" />
                </>)}

                <Button variant="outline" className="w-full" onClick={handleTest} disabled={isTesting}>
                  {isTesting ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Wifi className="mr-2 size-4" />}
                  测试连接
                </Button>

                <Separator />

                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex gap-1.5 items-start">
                    <Info className="size-3.5 mt-0.5 shrink-0" />
                    <p>同步密码（可选）用于加密存储凭证。留空则明文存储，方便自动同步但凭证在 DevTools 中可见。</p>
                  </div>
                </div>

                <PasswordInput id="enc-passphrase" label="同步密码（可选）" value={passphrase} onChange={setPassphrase} placeholder="留空则不加密" />

                <Button className="w-full" onClick={handleSaveConfig} disabled={isSaving}>
                  {isSaving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Cloud className="mr-2 size-4" />}
                  保存并启用云同步
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── Export Tab ── */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">备份内容包括：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>所有订阅源及分组</li>
                <li>已缓存的文章（含已读 / 收藏状态）</li>
                <li>高亮标注和笔记</li>
              </ul>
            </div>
            <Button className="w-full" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              下载备份文件
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              文件名格式：rss-reader-backup-YYYY-MM-DD.json
            </p>
          </TabsContent>

          {/* ── Import Tab ── */}
          <TabsContent value="import" className="space-y-4 mt-4">
            {!importStats ? (
              <>
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
                  <div className="flex gap-2 items-start">
                    <Info className="size-4 mt-0.5 shrink-0" />
                    <p>导入时使用<strong>合并策略</strong>：已读 / 收藏状态取两端最新值，高亮以最后编辑时间为准，阅读设置不受影响。</p>
                  </div>
                </div>

                {pendingSnapshot && (
                  <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                    <p className="font-medium">已选择文件：</p>
                    <p className="text-muted-foreground">备份时间：{formatExportDate(pendingSnapshot.exportedAt)}</p>
                    <div className="flex gap-4 text-muted-foreground">
                      <span>{pendingSnapshot.feeds.length} 个订阅</span>
                      <span>{pendingSnapshot.articles.length} 篇文章</span>
                      <span>{pendingSnapshot.highlights.length} 条高亮</span>
                    </div>
                    <Separator />
                    <Button className="w-full" onClick={handleImport} disabled={isImporting}>
                      {isImporting ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                      合并导入
                    </Button>
                  </div>
                )}

                <Button
                  variant={pendingSnapshot ? 'outline' : 'default'}
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 size-4" />
                  {pendingSnapshot ? '重新选择文件' : '选择备份文件'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </>
            ) : (
              <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <CheckCircle2 className="size-4" />导入成功
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>新增订阅</span><span className="font-medium text-foreground">{importStats.feedsAdded}</span>
                  <span>更新订阅</span><span className="font-medium text-foreground">{importStats.feedsUpdated}</span>
                  <span>新增文章</span><span className="font-medium text-foreground">{importStats.articlesAdded}</span>
                  <span>合并文章</span><span className="font-medium text-foreground">{importStats.articlesUpdated}</span>
                  <span>新增高亮</span><span className="font-medium text-foreground">{importStats.highlightsAdded}</span>
                  <span>更新高亮</span><span className="font-medium text-foreground">{importStats.highlightsUpdated}</span>
                </div>
                <Button variant="outline" className="w-full" onClick={() => { setImportStats(null); setOpen(false) }}>
                  关闭
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
  )

  if (asPanel) {
    return tabsContent
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>数据同步 / 备份</DialogTitle>
          <DialogDescription>
            通过云端存储在多设备间同步订阅、已读状态、收藏和高亮标注。
          </DialogDescription>
        </DialogHeader>
        {tabsContent}
      </DialogContent>
    </Dialog>
  )
}
