import Parser from 'rss-parser'
import type { Feed, Article } from './types'
import { stableFeedId, stableArticleId } from './db'

export interface ParsedFeed {
  feed: Omit<Feed, 'id' | 'lastUpdated'>
  articles: Omit<Article, 'id' | 'feedId' | 'feedTitle' | 'cachedAt' | 'isRead' | 'isSaved'>[]
}

// Rejects after `ms` milliseconds — used to bound the direct-fetch attempt
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// Convert rss-parser output to the shared ParsedFeed shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformRssOutput(feed: any, feedUrl: URL): ParsedFeed {
  const favicon: string = feed.image?.url
    ? (feed.image.url as string)
    : `https://icons.duckduckgo.com/ip3/${feedUrl.hostname}.ico`

  return {
    feed: {
      title: feed.title || 'Untitled Feed',
      url: feedUrl.toString(),
      siteUrl: feed.link || feedUrl.origin,
      description: feed.description || '',
      favicon,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    articles: (feed.items || []).slice(0, 50).map((item: any) => ({
      title: item.title || 'Untitled',
      content: item['content:encoded'] || item.content || item.contentSnippet || '',
      summary: item.contentSnippet || item.summary || '',
      link: item.link || '',
      author: item['dc:creator'] || item.creator || item.author || '',
      pubDate: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
    })),
  }
}

// Attempt to parse the feed directly from the browser (CORS-permitting).
// Throws on CORS failures, network errors, or timeouts — caller falls back to proxy.
async function parseFeedDirect(url: string): Promise<ParsedFeed> {
  const parser = new Parser({
    customFields: {
      feed: ['image', 'icon'],
      item: ['content:encoded', 'dc:creator', 'media:content'],
    },
  })
  const feedUrl = new URL(url)
  const feed = await parser.parseURL(url)
  return transformRssOutput(feed, feedUrl)
}

// Fallback: parse via server-side proxy (always succeeds for valid URLs)
async function parseFeedViaProxy(url: string): Promise<ParsedFeed> {
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch feed')
  }

  return response.json()
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
  // Try direct (CORS) first with a 5-second cap; on any failure fall back to proxy
  try {
    return await withTimeout(parseFeedDirect(url), 5000)
  } catch {
    return await parseFeedViaProxy(url)
  }
}

export function createFeedFromParsed(
  parsed: ParsedFeed,
  url: string
): { feed: Feed; articles: Article[] } {
  const feedId = stableFeedId(url)
  const now = Date.now()

  const feed: Feed = {
    id: feedId,
    title: parsed.feed.title || 'Untitled Feed',
    url,
    siteUrl: parsed.feed.siteUrl,
    description: parsed.feed.description,
    favicon: parsed.feed.favicon,
    lastUpdated: now,
  }

  const articles: Article[] = parsed.articles.map((item) => ({
    id: stableArticleId(item.link || ''),
    feedId,
    feedTitle: feed.title,
    title: item.title || 'Untitled',
    content: item.content || item.summary || '',
    summary: item.summary,
    link: item.link || '',
    author: item.author,
    pubDate: item.pubDate || now,
    isRead: false,
    isSaved: false,
    cachedAt: now,
  }))

  return { feed, articles }
}

// Sanitize HTML content for safe rendering
export function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Remove style tags and their content
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  
  // Remove event handlers
  clean = clean.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  clean = clean.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Remove javascript: urls
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')

  // Remove autoplay attribute from video/audio elements
  clean = clean.replace(/\s*autoplay(\s*=\s*["'][^"']*["'])?/gi, '')

  return clean
}

// Extract plain text from HTML
export function htmlToText(html: string): string {
  const div = typeof document !== 'undefined' 
    ? document.createElement('div') 
    : null
  
  if (div) {
    div.innerHTML = html
    return div.textContent || div.innerText || ''
  }
  
  // Fallback for server-side
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Get estimated reading time
export function getReadingTime(content: string): number {
  const text = htmlToText(content)
  const words = text.split(/\s+/).length
  const wordsPerMinute = 200
  return Math.ceil(words / wordsPerMinute)
}
