'use client'

import useSWR, { useSWRConfig } from 'swr'
import { useOffline } from '@/hooks/use-offline'
import {
  getAllArticles,
  getArticlesByFeed,
  getSavedArticles,
  getUnreadArticles,
  getUnreadCountsByFeed,
  getArticle,
  markArticleAsRead,
  markAllArticlesAsRead,
  toggleArticleSaved,
  cleanupOldReadArticles,
  updateArticleContent,
  revertArticleContent,
} from '@/lib/db'
import { useSyncContext } from '@/components/sync-provider'
import type { Article } from '@/lib/types'

// ---------------------------------------------------------------------------
// Content completeness helpers (client-side, no import needed)
// ---------------------------------------------------------------------------

/** Strip HTML tags and return plain text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Returns true when the article content appears to be incomplete or absent */
export function isContentIncomplete(content: string): boolean {
  const text = stripHtml(content)
  if (!text || text.length < 200) return true
  const readMoreRe =
    /阅读(全文|更多|原文)|查看(全文|原文|更多)|继续阅读|展开全文|read\s*more|full\s*(article|post|story)/i
  return readMoreRe.test(text)
}

/**
 * Searches the existing article HTML for a "read full article" anchor and
 * returns its absolute URL, or null if none is found.
 */
export function findReadMoreUrl(content: string, articleLink: string): string | null {
  if (typeof window === 'undefined') return null
  const readMoreRe =
    /阅读(全文|更多|原文)|查看(全文|原文|更多)|继续阅读|展开全文|read\s*more|full\s*(article|post|story)/i
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/html')
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (readMoreRe.test(a.textContent || '')) {
      const href = a.getAttribute('href')
      if (href) {
        try {
          return new URL(href, articleLink).toString()
        } catch {
          return href
        }
      }
    }
  }
  return null
}

export function useArticles(feedId?: string, hideRead: boolean = false) {
  const { mutate: globalMutate } = useSWRConfig()
  const { markDirty } = useSyncContext()
  const isOffline = useOffline()
  const key = feedId 
    ? `articles-${feedId}${hideRead ? '-unread' : ''}` 
    : `articles-all${hideRead ? '-unread' : ''}`
  
  const { data: articles, error, isLoading, mutate } = useSWR<Article[]>(
    key,
    async () => {
      if (hideRead) {
        return getUnreadArticles(feedId)
      }
      return feedId ? getArticlesByFeed(feedId) : getAllArticles()
    },
    { fallbackData: [] }
  )

  const markAsRead = async (articleId: string) => {
    await markArticleAsRead(articleId)
    mutate(
      (current) => current?.map(a =>
        a.id === articleId ? { ...a, isRead: true, readAt: Date.now() } : a
      ),
      { revalidate: false }
    )
    await globalMutate('unread-counts')
    markDirty()
  }

  const toggleSaved = async (articleId: string) => {
    const isSaved = await toggleArticleSaved(articleId)
    await mutate()
    markDirty()
    return isSaved
  }

  const cleanup = async () => {
    const count = await cleanupOldReadArticles()
    await mutate()
    return count
  }

  const markAllAsRead = async () => {
    const count = await markAllArticlesAsRead(feedId)
    await mutate()
    await globalMutate('unread-counts')
    markDirty()
    return count
  }

  /**
   * Intelligently fetches and fills the full content for a single article.
   * - If content is empty → fetch article.link
   * - If content is incomplete → look for a "read more" link first, otherwise fetch article.link
   * - Persists result with isContentManuallyFilled = true so refresh won't overwrite it
   * - Calling again clears the flag first (force re-fetch)
   */
  const fetchFullContent = async (article: Article): Promise<void> => {
    if (isOffline) {
      throw new Error('离线时无法补全文章内容')
    }

    // Determine the URL to fetch
    const readMoreUrl = findReadMoreUrl(article.content, article.link)
    const targetUrl = readMoreUrl || article.link

    const response = await fetch('/api/fetch-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(err.error || '抓取失败')
    }

    const { content } = await response.json()
    await updateArticleContent(article.id, content, true)

    // Refresh all caches that might include this article
    await globalMutate((k: unknown) => typeof k === 'string' && k.startsWith('article'))
  }

  /** 回退到上一次抓取前的内容备份；返回 false 表示没有可回退的内容 */
  const revertFullContent = async (articleId: string): Promise<boolean> => {
    const reverted = await revertArticleContent(articleId)
    if (reverted) {
      await globalMutate((k: unknown) => typeof k === 'string' && k.startsWith('article'))
    }
    return reverted
  }

  return {
    articles: articles || [],
    isLoading,
    error,
    markAsRead,
    toggleSaved,
    cleanup,
    markAllAsRead,
    fetchFullContent,
    revertFullContent,
    mutate,
  }
}

export function useSavedArticles() {
  const { markDirty } = useSyncContext()
  const { data: articles, error, isLoading, mutate } = useSWR<Article[]>(
    'articles-saved',
    () => getSavedArticles(),
    { fallbackData: [] }
  )

  const toggleSaved = async (articleId: string) => {
    const isSaved = await toggleArticleSaved(articleId)
    await mutate()
    markDirty()
    return isSaved
  }

  return {
    articles: articles || [],
    isLoading,
    error,
    toggleSaved,
    mutate,
  }
}

export function useArticle(articleId: string | null) {
  const { data: article, error, isLoading, mutate } = useSWR<Article | undefined>(
    articleId ? `article-${articleId}` : null,
    () => (articleId ? getArticle(articleId) : undefined)
  )

  return {
    article,
    isLoading,
    error,
    mutate,
  }
}

export function useUnreadCounts() {
  const { data: counts } = useSWR<Record<string, number>>(
    'unread-counts',
    () => getUnreadCountsByFeed(),
    { fallbackData: {} }
  )
  return counts || {}
}
