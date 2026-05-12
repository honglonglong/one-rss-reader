'use client'

import useSWR from 'swr'
import { getAllFeeds, addFeed, deleteFeed, getFeedByUrl, updateFeedGroup, addArticles, deleteNonSavedArticlesByFeed } from '@/lib/db'
import { parseFeed, createFeedFromParsed } from '@/lib/rss-parser'
import type { Feed } from '@/lib/types'

export function useFeeds() {
  const { data: feeds, error, isLoading, mutate } = useSWR<Feed[]>(
    'feeds',
    () => getAllFeeds(),
    { fallbackData: [] }
  )

  const subscribe = async (url: string, group?: string): Promise<Feed> => {
    // Check if already subscribed
    const existing = await getFeedByUrl(url)
    if (existing) {
      throw new Error('已订阅此源')
    }

    // Parse the feed
    const parsed = await parseFeed(url)
    const { feed, articles } = createFeedFromParsed(parsed, url)

    // Add group if provided
    if (group) {
      feed.group = group
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
        
        // 只保留收藏的文章，非收藏文章由新拉取的内容替换
        await deleteNonSavedArticlesByFeed(feed.id)
        await addArticles(updatedArticles)
      } catch (error) {
        console.error(`Failed to refresh feed ${feed.title}:`, error)
      }
    }

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
    mutate,
  }
}
