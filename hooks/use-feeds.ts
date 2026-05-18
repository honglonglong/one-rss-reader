'use client'

import useSWR, { useSWRConfig } from 'swr'
import { getAllFeeds, addFeed, deleteFeed, getFeedByUrl, updateFeedGroup, addArticles, deleteNonSavedArticlesByFeed, getArticlesByFeed, updateFeed } from '@/lib/db'
import { parseFeed, createFeedFromParsed } from '@/lib/rss-parser'
import type { Feed } from '@/lib/types'

export function useFeeds() {
  const { mutate: globalMutate } = useSWRConfig()
  const { data: feeds, error, isLoading, mutate } = useSWR<Feed[]>(
    'feeds',
    () => getAllFeeds(),
    { fallbackData: [] }
  )

  const subscribe = async (url: string, group?: string): Promise<Feed> => {
    // Check if already subscribed (getFeedByUrl returns even soft-deleted records)
    const existing = await getFeedByUrl(url)
    if (existing && !existing.deletedAt) {
      throw new Error('已订阅此源')
    }

    // Parse the feed
    const parsed = await parseFeed(url)
    const { feed, articles } = createFeedFromParsed(parsed, url)

    // Add group if provided
    if (group) {
      feed.group = group
    }

    if (existing?.deletedAt) {
      // Re-subscribe: restore the soft-deleted record keeping the same ID
      // (a new ID would conflict with the unique URL index still pointing to the old record)
      const restoredFeed: Feed = { ...feed, id: existing.id, deletedAt: undefined }
      await addFeed(restoredFeed)
      await addArticles(articles.map((a) => ({ ...a, feedId: existing.id, feedTitle: restoredFeed.title })))
      await mutate()
      return restoredFeed
    }

    // Save to database
    await addFeed(feed)
    await addArticles(articles)

    // Update cache
    await mutate()

    return feed
  }

  const setFeedGroup = async (feedId: string, group: string | undefined) => {
    await updateFeedGroup(feedId, group)
    await mutate()
  }

  const unsubscribe = async (feedId: string) => {
    await deleteFeed(feedId)
    await mutate()
  }

  const refresh = async (feedId?: string) => {
    const feedsToRefresh = feedId 
      ? feeds?.filter(f => f.id === feedId) || []
      : feeds || []

    for (const feed of feedsToRefresh) {
      try {
        const parsed = await parseFeed(feed.url)
        const { articles } = createFeedFromParsed(parsed, feed.url)
        
        // Update articles with correct feedId
        const updatedArticles = articles.map(a => ({
          ...a,
          feedId: feed.id,
          feedTitle: feed.title,
        }))
        
        // 刷新前记录已读状态（按 link 索引），刷新后恢复，避免已读标记丢失
        const existingArticles = await getArticlesByFeed(feed.id)
        const readStateByLink = new Map(
          existingArticles
            .filter((a) => a.isRead)
            .map((a) => [a.link, { isRead: true as const, readAt: a.readAt }])
        )

        // 只保留收藏的文章，非收藏文章由新拉取的内容替换
        await deleteNonSavedArticlesByFeed(feed.id)
        // 获取剩余收藏文章的链接，避免重复添加
        const savedArticles = await getArticlesByFeed(feed.id)
        const savedLinks = new Set(savedArticles.map((a) => a.link))
        // 恢复之前已读的文章的已读状态
        const articlesToAdd = updatedArticles
          .filter((a) => !savedLinks.has(a.link))
          .map((a) => {
            const readState = readStateByLink.get(a.link)
            return readState ? { ...a, ...readState } : a
          })
        await addArticles(articlesToAdd)
      } catch (error) {
        console.error(`Failed to refresh feed ${feed.title}:`, error)
        if (feedId) throw error
      }
    }

    await mutate()
    await globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('articles'))
    await globalMutate('unread-counts')
  }

  const editFeed = async (feedId: string, updates: Partial<Pick<import('@/lib/types').Feed, 'title' | 'url' | 'group'>>) => {
    await updateFeed(feedId, updates)
    await mutate()
  }

  return {
    feeds: feeds || [],
    isLoading,
    error,
    subscribe,
    unsubscribe,
    refresh,
    setFeedGroup,
    editFeed,
    mutate,
  }
}
