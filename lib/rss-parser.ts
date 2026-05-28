import type { Feed, Article } from './types'
import { stableFeedId, stableArticleId } from './db'

export interface ParsedFeed {
  feed: Omit<Feed, 'id' | 'lastUpdated'>
  articles: Omit<Article, 'id' | 'feedId' | 'feedTitle' | 'cachedAt' | 'isRead' | 'isSaved'>[]
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
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
