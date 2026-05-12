import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Feed, Article, Highlight, ReadingSettings, DEFAULT_READING_SETTINGS } from './types'

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
    value: ReadingSettings
  }
}

const DB_NAME = 'rss-reader-db'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<RSSReaderDB> | null = null

export async function getDB(): Promise<IDBPDatabase<RSSReaderDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<RSSReaderDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
  return db.getAll('feeds')
}

export async function deleteFeed(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('feeds', id)
  // Also delete all articles from this feed
  const articles = await db.getAllFromIndex('articles', 'by-feed', id)
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(articles.map((a) => tx.store.delete(a.id)))
  await tx.done
}

export async function getFeedByUrl(url: string): Promise<Feed | undefined> {
  const db = await getDB()
  return db.getFromIndex('feeds', 'by-url', url)
}

// Article operations
export async function addArticle(article: Article): Promise<void> {
  const db = await getDB()
  await db.put('articles', article)
}

export async function addArticles(articles: Article[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(articles.map((a) => tx.store.put(a)))
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

// 清理30天前已读的文章（保留收藏的）
export async function cleanupOldReadArticles(): Promise<number> {
  const db = await getDB()
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const articles = await db.getAll('articles')
  const toDelete = articles.filter(
    (a) => a.isRead && a.readAt && a.readAt < thirtyDaysAgo && !a.isSaved
  )
  
  const tx = db.transaction('articles', 'readwrite')
  await Promise.all(toDelete.map((a) => tx.store.delete(a.id)))
  await tx.done
  
  return toDelete.length
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
  return highlights.sort((a, b) => a.startOffset - b.startOffset)
}

export async function getAllHighlights(): Promise<Highlight[]> {
  const db = await getDB()
  return db.getAllFromIndex('highlights', 'by-date')
}

export async function updateHighlight(highlight: Highlight): Promise<void> {
  const db = await getDB()
  await db.put('highlights', highlight)
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('highlights', id)
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
  await db.put('settings', { ...settings, id: 'reading' } as ReadingSettings & { id: string })
}

// Utility to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
