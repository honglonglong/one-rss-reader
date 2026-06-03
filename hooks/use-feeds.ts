'use client'

import useSWR, { useSWRConfig } from 'swr'
import { getAllFeeds, addFeed, deleteFeed, getFeedByUrl, updateFeedGroup, addArticles, deleteNonSavedArticlesByFeed, getArticlesByFeed, updateFeed, updateFeedLastRefreshed, CLOUD_SYNC_LOOKBACK_MS } from '@/lib/db'
import { parseFeed, createFeedFromParsed } from '@/lib/rss-parser'
import type { Feed } from '@/lib/types'

const DEFAULT_INTERVAL = 60 * 60 * 1000        // 1 hour — used when no history is available
const MIN_INTERVAL    = 30 * 60 * 1000        // 30 minutes minimum
const MAX_INTERVAL    = 7  * 24 * 60 * 60 * 1000 // 7 days maximum

/**
 * Estimates a feed's update frequency from the publication dates of its articles.
 * Uses the median inter-article interval of the 20 most-recent articles, clamped
 * to [30 min, 7 days]. Falls back to 1 hour when fewer than 2 articles are available.
 */
function estimateUpdateInterval(articles: { pubDate: number }[]): number {
  if (articles.length < 2) return DEFAULT_INTERVAL

  const sorted = [...articles]
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, 20)

  const intervals: number[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i].pubDate - sorted[i + 1].pubDate
    if (diff > 0) intervals.push(diff)
  }

  if (intervals.length === 0) return DEFAULT_INTERVAL

  intervals.sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)]
  return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, median))
}

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

    // Estimate update frequency from initial articles so the first refresh
    // cooldown is based on the feed's actual cadence, not the 1-hour default.
    const estimatedInterval = estimateUpdateInterval(articles)

    if (existing?.deletedAt) {
      // Re-subscribe: restore the soft-deleted record keeping the same ID
      // (a new ID would conflict with the unique URL index still pointing to the old record)
      const restoredFeed: Feed = { ...feed, id: existing.id, deletedAt: undefined, estimatedUpdateIntervalMs: estimatedInterval }
      await addFeed(restoredFeed)
      await addArticles(articles.map((a) => ({ ...a, feedId: existing.id, feedTitle: restoredFeed.title })))
      await mutate()
      return restoredFeed
    }

    // Save to database
    feed.estimatedUpdateIntervalMs = estimatedInterval
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

  const refresh = async (feedId?: string): Promise<boolean> => {
    const feedsToRefresh = feedId 
      ? feeds?.filter(f => f.id === feedId) || []
      : feeds || []

    let didRefresh = false

    for (const feed of feedsToRefresh) {
      const cooldown = feed.estimatedUpdateIntervalMs ?? DEFAULT_INTERVAL
      const existingArticles = await getArticlesByFeed(feed.id)
      const latestArticle = existingArticles[0]
      const isLatestArticleStale = latestArticle
        ? Date.now() - latestArticle.pubDate > cooldown
        : false

      // Skip if last refresh is more recent than the feed's estimated update
      // interval, unless the local latest article is already older than that
      // interval, in which case we need to refresh it immediately.
      if (feed.lastRefreshedAt && Date.now() - feed.lastRefreshedAt < cooldown && !isLatestArticleStale) {
        continue
      }

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
        const readStateByLink = new Map(
          existingArticles
            .filter((a) => a.isRead)
            .map((a) => [a.link, { isRead: true as const, readAt: a.readAt }])
        )

        // 刷新前记录手动补全的内容（按 link 索引），刷新后恢复，避免用户补全的全文被覆盖
        const manualContentByLink = new Map(
          existingArticles
            .filter((a) => a.isContentManuallyFilled)
            .map((a) => [a.link, { content: a.content, isContentManuallyFilled: true as const, fullContentFetchedAt: a.fullContentFetchedAt }])
        )

        // 只保留收藏的文章，非收藏文章由新拉取的内容替换
        await deleteNonSavedArticlesByFeed(feed.id)
        // 获取剩余收藏文章的链接，避免重复添加
        const savedArticles = await getArticlesByFeed(feed.id)
        const savedLinks = new Set(savedArticles.map((a) => a.link))
        // 只保留 90 天内的文章，与云同步截断保持一致
        const ninetyDaysAgo = Date.now() - CLOUD_SYNC_LOOKBACK_MS
        // 恢复之前已读状态和手动补全内容
        const articlesToAdd = updatedArticles
          .filter((a) => !savedLinks.has(a.link) && a.pubDate > ninetyDaysAgo)
          .map((a) => {
            const readState = readStateByLink.get(a.link)
            const manualContent = manualContentByLink.get(a.link)
            let result = readState ? { ...a, ...readState } : a
            if (manualContent) result = { ...result, ...manualContent }
            return result
          })
        await addArticles(articlesToAdd)
        // Re-estimate update interval from fresh articles and persist alongside refresh timestamp
        const newInterval = estimateUpdateInterval(updatedArticles)
        await updateFeedLastRefreshed(feed.id, Date.now(), newInterval)
        didRefresh = true
      } catch (error) {
        console.error(`Failed to refresh feed ${feed.title}:`, error)
        if (feedId) throw error
      }
    }

    await mutate()
    await globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('articles'))
    await globalMutate('unread-counts')
    return didRefresh
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
