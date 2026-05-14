'use client'

import useSWR, { useSWRConfig } from 'swr'
import {
  getAllArticles,
  getArticlesByFeed,
  getSavedArticles,
  getUnreadArticles,
  getUnreadCountsByFeed,
  getArticle,
  markArticleAsRead,
  toggleArticleSaved,
  cleanupOldReadArticles,
} from '@/lib/db'
import type { Article } from '@/lib/types'

export function useArticles(feedId?: string, hideRead: boolean = false) {
  const { mutate: globalMutate } = useSWRConfig()
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
    await mutate()
    await globalMutate('unread-counts')
  }

  const toggleSaved = async (articleId: string) => {
    const isSaved = await toggleArticleSaved(articleId)
    await mutate()
    return isSaved
  }

  const cleanup = async () => {
    const count = await cleanupOldReadArticles()
    await mutate()
    return count
  }

  return {
    articles: articles || [],
    isLoading,
    error,
    markAsRead,
    toggleSaved,
    cleanup,
    mutate,
  }
}

export function useSavedArticles() {
  const { data: articles, error, isLoading, mutate } = useSWR<Article[]>(
    'articles-saved',
    () => getSavedArticles(),
    { fallbackData: [] }
  )

  const toggleSaved = async (articleId: string) => {
    const isSaved = await toggleArticleSaved(articleId)
    await mutate()
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
