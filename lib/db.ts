import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Feed, Article, Highlight, ReadingSettings, EncryptedSyncConfig, SyncSnapshot, ImportStats, CloudSyncSnapshot, ArticleState } from './types'

interface RSSReaderDB extends DBSchema {
  feeds: {
    key: string
    value: Feed
    indexes: { 'by-url': string; 'by-category': string }
  }
  articles: {
    key: string
    value: Article
    indexes: { 'by-feed': string; 'by-date': number; 'by-saved': number }
  }
  highlights: {
    key: string
    value: Highlight
    indexes: { 'by-article': string; 'by-date': number }
  }
  settings: {
    key: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  }
}

const DB_NAME = 'rss-reader-db'
const DB_VERSION = 4

// Retention / lookback windows — shared with hooks/use-feeds.ts
export const ARTICLE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const CLOUD_SYNC_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

let dbInstance: IDBPDatabase<RSSReaderDB> | null = null

export async function getDB(): Promise<IDBPDatabase<RSSReaderDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<RSSReaderDB>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      // Feeds store
      if (!db.objectStoreNames.contains('feeds')) {
        const feedStore = db.createObjectStore('feeds', { keyPath: 'id' })
        feedStore.createIndex('by-url', 'url', { unique: true })
        feedStore.createIndex('by-category', 'category')
      }

      // Articles store
      if (!db.objectStoreNames.contains('articles')) {
        const articleStore = db.createObjectStore('articles', { keyPath: 'id' })
        articleStore.createIndex('by-feed', 'feedId')
        articleStore.createIndex('by-date', 'pubDate')
        articleStore.createIndex('by-saved', 'isSaved')
      }

      // Highlights store
      if (!db.objectStoreNames.contains('highlights')) {
        const highlightStore = db.createObjectStore('highlights', { keyPath: 'id' })
        highlightStore.createIndex('by-article', 'articleId')
        highlightStore.createIndex('by-date', 'createdAt')
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' })
      }

      // v1/v2 → v3: re-key articles to stable link-based IDs, remap highlight articleIds
      if (oldVersion >= 1 && oldVersion < 3) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const articleStore = (transaction as any).objectStore('articles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highlightStore = (transaction as any).objectStore('highlights')
        const articles: Article[] = await articleStore.getAll()
        for (const article of articles) {
          if (!article.link) continue
          const stableId = stableArticleId(article.link)
          if (stableId === article.id) continue
          // Remap all highlights for this article to the new stable ID
          const highlights: Highlight[] = await highlightStore.index('by-article').getAll(article.id)
          for (const h of highlights) {
            await highlightStore.delete(h.id)
            await highlightStore.put({ ...h, articleId: stableId })
          }
          // Replace article record with stable ID
          await articleStore.delete(article.id)
          await articleStore.put({ ...article, id: stableId })
        }
      }

      // v3 → v4: re-key feeds to stable URL-based IDs, remap articles' feedId
      if (oldVersion < 4) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feedStore = (transaction as any).objectStore('feeds')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const articleStore = (transaction as any).objectStore('articles')
        const feeds: Feed[] = await feedStore.getAll()
        for (const feed of feeds) {
          if (!feed.url) continue
          const newId = stableFeedId(feed.url)
          if (newId === feed.id) continue
          // Remap all articles for this feed to the new stable feedId
          const articles: Article[] = await articleStore.index('by-feed').getAll(feed.id)
          for (const a of articles) {
            await articleStore.delete(a.id)
            await articleStore.put({ ...a, feedId: newId })
          }
          // Replace feed record with stable ID
          await feedStore.delete(feed.id)
          await feedStore.put({ ...feed, id: newId })
        }
      }
    },
  })

  return dbInstance
}

// Feed operations
export async function addFeed(feed: Feed): Promise<void> {
  const db = await getDB()
  await db.put('feeds', feed)
}

export async function getFeed(id: string): Promise<Feed | undefined> {
  const db = await getDB()
  return db.get('feeds', id)
}

export async function getAllFeeds(): Promise<Feed[]> {
  const db = await getDB()
  const feeds = await db.getAll('feeds')
  return feeds.filter((f) => !f.deletedAt)
}

export async function deleteFeed(id: string): Promise<void> {
  const db = await getDB()
  // Soft-delete: keep tombstone so cloud sync can propagate the deletion
  const feed = await db.get('feeds', id)
  if (feed) {
    await db.put('feeds', { ...feed, deletedAt: Date.now() })
  }
  // Still physically delete articles to free up space
  const articles = await db.getAllFromIndex('articles', 'by-feed', id)
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(articles.map((a) => tx.store.delete(a.id)))
  await tx.done
}

export async function getFeedByUrl(url: string): Promise<Feed | undefined> {
  const db = await getDB()
  return db.getFromIndex('feeds', 'by-url', url)
}

export async function updateFeed(id: string, updates: Partial<Pick<Feed, 'title' | 'url' | 'group'>>): Promise<void> {
  const db = await getDB()
  const feed = await db.get('feeds', id)
  if (feed) {
    Object.assign(feed, updates)
    await db.put('feeds', feed)
    // If URL changed, also update feedTitle on existing articles
    if (updates.title) {
      const articles = await db.getAllFromIndex('articles', 'by-feed', id)
      const tx = db.transaction('articles', 'readwrite')
      await Promise.all(articles.map((a) => tx.store.put({ ...a, feedTitle: updates.title! })))
      await tx.done
    }
  }
}

export async function updateFeedLastRefreshed(id: string, ts: number, intervalMs?: number): Promise<void> {
  const db = await getDB()
  const feed = await db.get('feeds', id)
  if (feed) {
    const updated = { ...feed, lastRefreshedAt: ts }
    if (intervalMs !== undefined) updated.estimatedUpdateIntervalMs = intervalMs
    await db.put('feeds', updated)
  }
}

// Article operations
export async function addArticle(article: Article): Promise<void> {
  const db = await getDB()
  await db.put('articles', article)
}

export async function addArticles(articles: Article[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(articles.map(async (a) => {
    const existing = await tx.store.get(a.id)
    if (existing) {
      // OR-merge read/saved state so a feed refresh can never downgrade a
      // read/saved article that was written by a concurrent cloud sync.
      const merged: Article = {
        ...a,
        isRead: existing.isRead || a.isRead,
        readAt: existing.readAt ?? a.readAt,
        isSaved: existing.isSaved || a.isSaved,
        savedAt: (existing.savedAt && a.savedAt)
          ? Math.max(existing.savedAt, a.savedAt)
          : existing.savedAt ?? a.savedAt,
      }
      return tx.store.put(merged)
    }
    return tx.store.put(a)
  }))
  await tx.done
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const db = await getDB()
  return db.get('articles', id)
}

export async function getArticlesByFeed(feedId: string): Promise<Article[]> {
  const db = await getDB()
  const articles = await db.getAllFromIndex('articles', 'by-feed', feedId)
  return articles.sort((a, b) => b.pubDate - a.pubDate)
}

export async function getAllArticles(): Promise<Article[]> {
  const db = await getDB()
  const articles = await db.getAll('articles')
  return articles.sort((a, b) => b.pubDate - a.pubDate)
}

export async function getSavedArticles(): Promise<Article[]> {
  const db = await getDB()
  const articles = await db.getAll('articles')
  return articles.filter((a) => a.isSaved).sort((a, b) => b.pubDate - a.pubDate)
}

export async function markArticleAsRead(id: string): Promise<void> {
  const db = await getDB()
  const article = await db.get('articles', id)
  if (article) {
    article.isRead = true
    article.readAt = Date.now()
    await db.put('articles', article)
  }
}

export async function updateArticleContent(
  id: string,
  content: string,
  manual: boolean
): Promise<void> {
  const db = await getDB()
  const article = await db.get('articles', id)
  if (article) {
    await db.put('articles', {
      ...article,
      content,
      isContentManuallyFilled: manual,
      fullContentFetchedAt: manual ? Date.now() : undefined,
    })
  }
}

export async function markAllArticlesAsRead(feedId?: string): Promise<number> {
  const db = await getDB()
  const now = Date.now()
  const articles = feedId
    ? await db.getAllFromIndex('articles', 'by-feed', feedId)
    : await db.getAll('articles')
  const unread = articles.filter((a) => !a.isRead)
  if (unread.length === 0) return 0
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(unread.map((a) => tx.store.put({ ...a, isRead: true, readAt: now })))
  await tx.done
  return unread.length
}

// 清理30天前已读的文章（保留收藏的）
export async function cleanupOldReadArticles(): Promise<number> {
  const db = await getDB()
  const thirtyDaysAgo = Date.now() - ARTICLE_RETENTION_MS
  const articles = await db.getAll('articles')
  const toDelete = articles.filter(
    (a) => a.isRead && a.readAt && a.readAt < thirtyDaysAgo && !a.isSaved
  )
  
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(toDelete.map((a) => tx.store.delete(a.id)))
  await tx.done
  
  return toDelete.length
}

// 获取每个订阅的未读文章数量
export async function getUnreadCountsByFeed(): Promise<Record<string, number>> {
  const db = await getDB()
  const articles = await db.getAll('articles')
  const counts: Record<string, number> = {}
  for (const a of articles) {
    if (!a.isRead) {
      counts[a.feedId] = (counts[a.feedId] || 0) + 1
    }
  }
  return counts
}

// 获取未读文章
export async function getUnreadArticles(feedId?: string): Promise<Article[]> {
  const db = await getDB()
  let articles: Article[]
  if (feedId) {
    articles = await db.getAllFromIndex('articles', 'by-feed', feedId)
  } else {
    articles = await db.getAll('articles')
  }
  return articles.filter((a) => !a.isRead).sort((a, b) => b.pubDate - a.pubDate)
}

// 更新订阅分组
export async function updateFeedGroup(id: string, group: string | undefined): Promise<void> {
  const db = await getDB()
  const feed = await db.get('feeds', id)
  if (feed) {
    feed.group = group
    await db.put('feeds', feed)
  }
}

// 获取所有分组
export async function getAllGroups(): Promise<string[]> {
  const db = await getDB()
  const feeds = await db.getAll('feeds')
  const groups = new Set<string>()
  feeds.forEach((f) => {
    if (f.group) groups.add(f.group)
  })
  return Array.from(groups).sort()
}

export async function toggleArticleSaved(id: string): Promise<boolean> {
  const db = await getDB()
  const article = await db.get('articles', id)
  if (article) {
    article.isSaved = !article.isSaved
    article.savedAt = Date.now()
    await db.put('articles', article)
    return article.isSaved
  }
  return false
}

// 删除某个订阅下所有未收藏的文章（刷新前调用，只保留收藏文章）
export async function deleteNonSavedArticlesByFeed(feedId: string): Promise<void> {
  const db = await getDB()
  const articles = await db.getAllFromIndex('articles', 'by-feed', feedId)
  const toDelete = articles.filter((a) => !a.isSaved)
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(toDelete.map((a) => tx.store.delete(a.id)))
  await tx.done
}

// Highlight operations
export async function addHighlight(highlight: Highlight): Promise<void> {
  const db = await getDB()
  await db.put('highlights', highlight)
}

export async function getHighlight(id: string): Promise<Highlight | undefined> {
  const db = await getDB()
  return db.get('highlights', id)
}

export async function getHighlightsByArticle(articleId: string): Promise<Highlight[]> {
  const db = await getDB()
  const highlights = await db.getAllFromIndex('highlights', 'by-article', articleId)
  return highlights.filter(h => !h.deletedAt).sort((a, b) => a.startOffset - b.startOffset)
}

export async function getAllHighlights(): Promise<Highlight[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('highlights', 'by-date')
  return all.filter(h => !h.deletedAt)
}

export async function updateHighlight(highlight: Highlight): Promise<void> {
  const db = await getDB()
  await db.put('highlights', { ...highlight, updatedAt: Date.now() })
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('highlights', id)
  if (existing) {
    await db.put('highlights', { ...existing, deletedAt: Date.now() })
  }
}

export async function getDeletedHighlights(): Promise<Highlight[]> {
  const db = await getDB()
  const all = await db.getAll('highlights')
  return all
    .filter((h) => h.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export async function restoreHighlight(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('highlights', id)
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { deletedAt, ...rest } = existing
    await db.put('highlights', rest)
  }
}

export async function permanentlyDeleteHighlight(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('highlights', id)
}

export async function emptyTrash(): Promise<void> {
  const db = await getDB()
  const all = await db.getAll('highlights')
  const deleted = all.filter((h) => h.deletedAt)
  if (deleted.length === 0) return
  const tx = db.transaction('highlights', 'readwrite')
  await Promise.all(deleted.map((h) => tx.store.delete(h.id)))
  await tx.done
}

// Settings operations
export async function getSettings(): Promise<ReadingSettings> {
  const db = await getDB()
  const settings = await db.get('settings', 'reading')
  if (settings) return settings
  
  // Return default settings
  const { DEFAULT_READING_SETTINGS } = await import('./types')
  return DEFAULT_READING_SETTINGS
}

export async function saveSettings(settings: ReadingSettings): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...settings, id: 'reading' })
}

export async function getSyncConfig(): Promise<EncryptedSyncConfig | null> {
  const db = await getDB()
  const raw = await db.get('settings', 'sync')
  if (!raw) return null
  const { id: _id, ...rest } = raw as EncryptedSyncConfig & { id: string }
  return rest as EncryptedSyncConfig
}

export async function saveSyncConfig(config: EncryptedSyncConfig): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...config, id: 'sync' })
}

// Utility to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate a stable, deterministic article ID from its link URL.
 * Same URL always produces the same ID on any device — enabling cross-device
 * highlight linking. Falls back to generateId() for articles with no link.
 */
export function stableArticleId(link: string): string {
  if (!link) return generateId()
  let h1 = 5381, h2 = 52711
  for (let i = 0; i < link.length; i++) {
    const c = link.charCodeAt(i)
    h1 = Math.imul(31, h1) ^ c
    h2 = Math.imul(29, h2) ^ c
  }
  return `a-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`
}

export function stableFeedId(url: string): string {
  if (!url) return generateId()
  let h1 = 5381, h2 = 52711
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i)
    h1 = Math.imul(31, h1) ^ c
    h2 = Math.imul(29, h2) ^ c
  }
  return `f-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`
}

// ── Sync helpers ──────────────────────────────────────────────────────────────

export type { SyncSnapshot, ImportStats, CloudSyncSnapshot, ArticleState } from './types'

/**
 * Physically remove soft-deleted tombstones that are older than `olderThanMs`.
 * Should be called after a successful cloud upload to ensure tombstones have
 * already been propagated before they are purged locally.
 */
export async function purgeStaleTombstones(olderThanMs = ARTICLE_RETENTION_MS): Promise<void> {
  const db = await getDB()
  const cutoff = Date.now() - olderThanMs

  // Feed tombstones
  const feeds = await db.getAll('feeds')
  const staleFeedIds = feeds
    .filter((f) => f.deletedAt !== undefined && f.deletedAt < cutoff)
    .map((f) => f.id)
  if (staleFeedIds.length > 0) {
    const tx = db.transaction('feeds', 'readwrite')
    await Promise.all(staleFeedIds.map((id) => tx.store.delete(id)))
    await tx.done
  }

  // Highlight tombstones
  const highlights = await db.getAll('highlights')
  const staleHighlightIds = highlights
    .filter((h) => h.deletedAt !== undefined && h.deletedAt < cutoff)
    .map((h) => h.id)
  if (staleHighlightIds.length > 0) {
    const tx = db.transaction('highlights', 'readwrite')
    await Promise.all(staleHighlightIds.map((id) => tx.store.delete(id)))
    await tx.done
  }
}

/** Dump the entire database to a plain JS object. */
export async function exportAllData(): Promise<SyncSnapshot> {
  const db = await getDB()
  const [feeds, articles, highlights, rawSettings] = await Promise.all([
    db.getAll('feeds'),
    db.getAll('articles'),
    db.getAll('highlights'),
    db.get('settings', 'reading'),
  ])
  return {
    version: 2,
    exportedAt: Date.now(),
    feeds,
    articles,
    highlights,
    settings: rawSettings ?? null,
  }
}

/**
 * Merge a snapshot into the local database.
 *
 * Merge rules:
 * - Feeds     : union; update title/group if remote.lastUpdated is newer.
 * - Articles  : union; HTML content stripped (state only); isRead = OR; isSaved = LWW via savedAt.
 * - Highlights: union; LWW via updatedAt/deletedAt (soft-delete tombstones respected).
 * - Settings  : applied from snapshot.
 */
export async function importAllData(snapshot: SyncSnapshot): Promise<ImportStats> {
  const db = await getDB()
  const stats: ImportStats = {
    feedsAdded: 0,
    feedsUpdated: 0,
    articlesAdded: 0,
    articlesUpdated: 0,
    highlightsAdded: 0,
    highlightsUpdated: 0,
    newFeedIds: [],
  }

  // ── Feeds ──────────────────────────────────────────────────────────────────
  const localFeeds = await db.getAll('feeds')
  const localFeedByUrl = new Map(localFeeds.map((f) => [f.url, f]))
  const localFeedById = new Map(localFeeds.map((f) => [f.id, f]))

  const feedTx = db.transaction('feeds', 'readwrite')
  for (const remote of snapshot.feeds) {
    const existing = localFeedByUrl.get(remote.url) ?? localFeedById.get(remote.id)
    // Use deletedAt as effective timestamp (tombstone wins over lastUpdated)
    const remoteTs = remote.deletedAt ?? remote.lastUpdated
    if (!existing) {
      if (remote.deletedAt) continue // tombstone for non-existent local feed — skip
      await feedTx.store.put(remote)
      stats.feedsAdded++
    } else {
      const localTs = existing.deletedAt ?? existing.lastUpdated
      if (remoteTs > localTs) {
        await feedTx.store.put({ ...remote, id: existing.id })
        if (!remote.deletedAt) stats.feedsUpdated++
      }
    }
  }
  await feedTx.done

  // ── Articles ───────────────────────────────────────────────────────────────
  const localArticles = await db.getAll('articles')
  const localArticleById = new Map(localArticles.map((a) => [a.id, a]))

  const articleTx = db.transaction('articles', 'readwrite')
  for (const remote of snapshot.articles) {
    const local = localArticleById.get(remote.id)
    // Strip HTML content — state fields only, consistent with cloud sync
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { content: _content, ...remoteState } = remote
    if (!local) {
      await articleTx.store.put({ ...remoteState, content: '' })
      stats.articlesAdded++
    } else {
      const remoteSavedAt = remote.savedAt ?? 0
      const localSavedAt = local.savedAt ?? 0
      const merged: Article = {
        ...local, // keep local HTML content
        isRead: local.isRead || remote.isRead,
        isSaved: remoteSavedAt > localSavedAt ? remote.isSaved : local.isSaved,
        savedAt: Math.max(localSavedAt, remoteSavedAt) || undefined,
        readAt: local.readAt ?? remote.readAt,
      }
      await articleTx.store.put(merged)
      stats.articlesUpdated++
    }
  }
  await articleTx.done

  // ── Highlights ─────────────────────────────────────────────────────────────
  const localHighlights = await db.getAll('highlights')
  const localHighlightById = new Map(localHighlights.map((h) => [h.id, h]))

  const hlTx = db.transaction('highlights', 'readwrite')
  for (const remote of snapshot.highlights) {
    const local = localHighlightById.get(remote.id)
    // Use deletedAt as effective timestamp for tombstone LWW
    const remoteTs = remote.updatedAt ?? remote.deletedAt ?? remote.createdAt
    if (!local) {
      if (remote.deletedAt) continue // tombstone for non-existent local highlight — skip
      await hlTx.store.put(remote)
      stats.highlightsAdded++
    } else {
      // LWW: compare updatedAt/deletedAt, fall back to createdAt
      const localTs = local.updatedAt ?? local.deletedAt ?? local.createdAt
      if (remoteTs > localTs) {
        await hlTx.store.put(remote)
        if (!remote.deletedAt) stats.highlightsUpdated++
      }
    }
  }
  await hlTx.done

  // ── Settings ───────────────────────────────────────────────────────────────
  if (snapshot.settings) {
    await db.put('settings', { ...snapshot.settings, id: 'reading' })
  }

  return stats
}

/**
 * Build a slim snapshot for cloud sync: article HTML content is stripped so
 * the payload stays small (~KB instead of potentially ~MB).
 * Feeds and highlights are included in full.
 */
export async function exportCloudData(): Promise<CloudSyncSnapshot> {
  const db = await getDB()
  const [feeds, articles, highlights, rawSettings] = await Promise.all([
    db.getAll('feeds'),
    db.getAll('articles'),
    db.getAll('highlights'),
    db.get('settings', 'reading'),
  ])
  // Only sync article states from the last 90 days (or saved articles) to keep
  // the cloud snapshot small regardless of how long the user has been using the app.
  const ninetyDaysAgo = Date.now() - CLOUD_SYNC_LOOKBACK_MS
  const articleStates: ArticleState[] = articles
    .filter((a) => a.isSaved || a.pubDate > ninetyDaysAgo)
    .map((a) => ({
    id: a.id,
    feedId: a.feedId,
    feedTitle: a.feedTitle,
    title: a.title,
    link: a.link,
    pubDate: a.pubDate,
    isRead: a.isRead,
    isSaved: a.isSaved,
    cachedAt: a.cachedAt,
    readAt: a.readAt,
    savedAt: a.savedAt,
  }))
  return {
    version: 2,
    exportedAt: Date.now(),
    feeds,
    articleStates,
    highlights,
    settings: rawSettings ?? null,
  }
}

/**
 * Merge a CloudSyncSnapshot (state-only) into the local database.
 *
 * Article merge note: if a remote article state has no local counterpart, a
 * stub record (content='') is written so that refresh() can restore the
 * isRead/isSaved state via its readStateByLink logic on the next feed refresh.
 */
export async function importCloudData(snapshot: CloudSyncSnapshot): Promise<ImportStats> {
  const db = await getDB()
  const newFeedIdSet = new Set<string>()
  const stats: ImportStats = {
    feedsAdded: 0,
    feedsUpdated: 0,
    articlesAdded: 0,
    articlesUpdated: 0,
    highlightsAdded: 0,
    highlightsUpdated: 0,
    newFeedIds: [],
  }

  // ── Feeds (same logic as importAllData) ────────────────────────────────────
  const localFeeds = await db.getAll('feeds')
  const localFeedByUrl = new Map(localFeeds.map((f) => [f.url, f]))
  const localFeedById = new Map(localFeeds.map((f) => [f.id, f]))

  const feedTx = db.transaction('feeds', 'readwrite')
  for (const remote of snapshot.feeds) {
    const existing = localFeedByUrl.get(remote.url) ?? localFeedById.get(remote.id)
    // Use deletedAt as effective timestamp (tombstone wins over lastUpdated)
    const remoteTs = remote.deletedAt ?? remote.lastUpdated
    if (!existing) {
      if (remote.deletedAt) continue // tombstone for non-existent local feed — skip
      await feedTx.store.put(remote)
      stats.feedsAdded++
    } else {
      const localTs = existing.deletedAt ?? existing.lastUpdated
      if (remoteTs > localTs) {
        await feedTx.store.put({ ...remote, id: existing.id })
        if (!remote.deletedAt) stats.feedsUpdated++
      }
    }
  }
  await feedTx.done

  // Build mapping: remote feedId → local feedId (handles ID mismatch during v3→v4 transition
  // where two devices independently subscribed the same feed before syncing)
  const remoteFeedIdToLocal = new Map<string, string>()
  for (const remote of snapshot.feeds) {
    const existing = localFeedByUrl.get(remote.url)
    if (existing && existing.id !== remote.id) {
      remoteFeedIdToLocal.set(remote.id, existing.id)
    }
  }

  // ── Article states (only update existing local records) ────────────────────
  const localArticles = await db.getAll('articles')
  const localArticleById = new Map(localArticles.map((a) => [a.id, a]))

  const articleTx = db.transaction('articles', 'readwrite')
  for (const remote of (snapshot.articleStates ?? [])) {
    const local = localArticleById.get(remote.id)
    if (!local) {
      // No local record yet: write a stub (content='') so that refresh() can
      // restore the isRead/isSaved state via its readStateByLink logic.
      const resolvedFeedId = remoteFeedIdToLocal.get(remote.feedId) ?? remote.feedId
      await articleTx.store.put({ ...remote, feedId: resolvedFeedId, content: '' })
      stats.articlesAdded++
      if (!remote.isRead) {
        newFeedIdSet.add(resolvedFeedId)
      }
      continue
    }
    const remoteSavedAt = remote.savedAt ?? 0
    const localSavedAt = local.savedAt ?? 0
    const merged: Article = {
      ...local, // keep local content intact
      isRead: local.isRead || remote.isRead,
      isSaved: remoteSavedAt > localSavedAt ? remote.isSaved : local.isSaved,
      savedAt: Math.max(localSavedAt, remoteSavedAt) || undefined,
      readAt: local.readAt ?? remote.readAt,
    }
    await articleTx.store.put(merged)
    stats.articlesUpdated++
    // If local article has no content yet (stub from a previous sync), schedule the feed for refresh
    if (!merged.content && !merged.isContentManuallyFilled && !merged.isRead) {
      newFeedIdSet.add(merged.feedId)
    }
  }
  await articleTx.done

  // ── Highlights (same logic as importAllData) ────────────────────────────────
  const localHighlights = await db.getAll('highlights')
  const localHighlightById = new Map(localHighlights.map((h) => [h.id, h]))

  const hlTx = db.transaction('highlights', 'readwrite')
  for (const remote of snapshot.highlights) {
    const local = localHighlightById.get(remote.id)
    const remoteTs = remote.updatedAt ?? remote.deletedAt ?? remote.createdAt
    if (!local) {
      if (remote.deletedAt) continue // tombstone for non-existent local highlight — skip
      await hlTx.store.put(remote)
      stats.highlightsAdded++
    } else {
      // LWW: compare updatedAt/deletedAt, fall back to createdAt
      const localTs = local.updatedAt ?? local.deletedAt ?? local.createdAt
      if (remoteTs > localTs) {
        await hlTx.store.put(remote)
        if (!remote.deletedAt) stats.highlightsUpdated++
      }
    }
  }
  await hlTx.done

  stats.newFeedIds = Array.from(newFeedIdSet)
  return stats
}
