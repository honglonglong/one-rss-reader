// RSS Reader Types

export interface Feed {
  id: string
  title: string
  url: string
  siteUrl?: string
  description?: string
  favicon?: string
  lastUpdated: number
  lastRefreshedAt?: number // 最近一次成功刷新的时间戳，用于冷却判断
  estimatedUpdateIntervalMs?: number // 根据历史文章 pubDate 间隔推算的更新频率（毫秒）
  category?: string
  group?: string // 分组名称
  deletedAt?: number // 软删除时间戳；有值则视为已删除（同步时作为 tombstone 传播）
}

export interface FeedGroup {
  name: string
  feeds: Feed[]
  isExpanded?: boolean
}

export interface Article {
  id: string
  feedId: string
  feedTitle: string
  title: string
  content: string
  summary?: string
  link: string
  author?: string
  pubDate: number
  isRead: boolean
  isSaved: boolean
  cachedAt: number
  readAt?: number  // 阅读时间戳，用于30天后自动删除
  savedAt?: number // 收藏时间戳，用于 LWW 冲突解决
  isContentManuallyFilled?: boolean // 用户手动补全文，刷新时不覆盖 content
  fullContentFetchedAt?: number     // 手动补全时间戳
}

export interface Highlight {
  id: string
  articleId: string
  text: string
  color: HighlightColor
  note?: string
  startOffset: number
  endOffset: number
  containerSelector: string
  createdAt: number
  updatedAt?: number // 最后编辑时间戳，用于 LWW 冲突解决
  deletedAt?: number // 软删除时间戳；有值则视为已删除（导入时不恢复）
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export interface ReadingSettings {
  fontSize: number
  lineHeight: number
  theme: 'light' | 'dark' | 'sepia'
  fontFamily: 'sans' | 'serif'
  maxWidth: number
  hideRead: boolean
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'light',
  fontFamily: 'sans',
  maxWidth: 680,
  hideRead: false,
}

export interface OPMLOutline {
  title: string
  xmlUrl: string
  htmlUrl?: string
  type?: string
}

export interface ExportedNote {
  articleTitle: string
  articleLink: string
  feedTitle: string
  exportedAt: number
  highlights: {
    text: string
    color: HighlightColor
    note?: string
  }[]
}

// ── Sync types ────────────────────────────────────────────────────────────────

export type SyncProviderType = 'github-gist' | 'webdav' | 'cloudflare-r2' | 'aws-s3'

export interface GistSyncConfig {
  type: 'github-gist'
  token: string
  gistId?: string
}

export interface WebDAVSyncConfig {
  type: 'webdav'
  url: string
  username: string
  password: string
  path?: string // default: rss-reader-sync.json
}

export interface R2SyncConfig {
  type: 'cloudflare-r2'
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  path?: string // default: rss-reader-sync.json
}

export interface S3SyncConfig {
  type: 'aws-s3'
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  path?: string // default: rss-reader-sync.json
}

export type SyncConfig = GistSyncConfig | WebDAVSyncConfig | R2SyncConfig | S3SyncConfig

/** Stored in IndexedDB settings store under key "sync". */
export interface EncryptedSyncConfig {
  provider: SyncProviderType
  /**
   * true  → encrypted field is AES-GCM ciphertext; salt & iv are populated.
   * false → encrypted field is plain JSON string; no passphrase needed.
   */
  isEncrypted: boolean
  encrypted: string // base64 AES-GCM ciphertext, OR plain JSON when !isEncrypted
  salt: string      // base64 PBKDF2 salt  (empty string when !isEncrypted)
  iv: string        // base64 AES-GCM IV   (empty string when !isEncrypted)
  lastSyncAt?: number
  gistId?: string   // plaintext convenience copy (not sensitive)
}

export interface SyncSnapshot {
  version: 2
  exportedAt: number
  feeds: Feed[]
  articles: Article[]
  highlights: Highlight[]
  settings: ReadingSettings | null
}

/**
 * Slim snapshot used for cloud sync — article HTML content is stripped to
 * keep the payload small (~KB instead of potentially ~MB).
 * The receiving device merges state fields only; content is re-fetched via RSS.
 */
export interface ArticleState {
  id: string
  feedId: string
  feedTitle: string
  title: string
  link: string
  pubDate: number
  isRead: boolean
  isSaved: boolean
  cachedAt: number
  readAt?: number
  savedAt?: number
}

export interface CloudSyncSnapshot {
  version: 2
  exportedAt: number
  feeds: Feed[]
  articleStates: ArticleState[]
  highlights: Highlight[]
  settings: ReadingSettings | null
}

export interface ImportStats {
  feedsAdded: number
  feedsUpdated: number
  articlesAdded: number
  articlesUpdated: number
  highlightsAdded: number
  highlightsUpdated: number
  /** Feed IDs that had new stub articles created (content='') during cloud import — these feeds should be refreshed to fill in content. */
  newFeedIds?: string[]
}
