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

  // Remove inline sizing/styles that can keep fetched content wider than the reader.
  // Require a leading whitespace so we only strip real attributes, not
  // "width=" / "height=" substrings that appear inside query-string URLs
  // (e.g. CDN image resize params like ".../image/width=2000,quality=80/...").
  clean = clean.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '')
  clean = clean.replace(/\s+(width|height)\s*=\s*["'][^"']*["']/gi, '')
  clean = clean.replace(/\s+(width|height)\s*=\s*[^\s>]+/gi, '')
  
  // Remove event handlers
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Remove javascript: urls
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')

  // Remove autoplay attribute from video/audio elements
  clean = clean.replace(/\s+autoplay(\s*=\s*["'][^"']*["'])?/gi, '')

  return clean
}

// Extract plain text from HTML
// NOTE: Do NOT use innerHTML on a detached element — browsers still fire
// network requests for <img> and other sub-resources even when the element
// is never attached to the document.  A regex strip is sufficient here
// because we only need plain text for previews / reading-time estimates.
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
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
