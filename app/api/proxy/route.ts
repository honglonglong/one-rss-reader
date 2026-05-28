import { NextRequest, NextResponse } from 'next/server'
import Parser from 'rss-parser'

const parser = new Parser({
  customFields: {
    feed: ['image', 'icon'],
    item: ['content:encoded', 'dc:creator', 'media:content'],
  },
})

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate URL
    let feedUrl: URL
    try {
      feedUrl = new URL(url)
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(feedUrl.protocol)) {
        return NextResponse.json(
          { error: `不支持的协议: ${feedUrl.protocol} 仅支持 http 和 https` },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Fetch and parse the feed.
    // Use fetch + parseString instead of parseURL to avoid the deprecated url.parse() call
    // that rss-parser uses internally in its parseURL implementation (Node.js DEP0169).
    // AbortController caps the outbound fetch at 15 s so we return a clean error before
    // Vercel's 10-second function timeout kills the request with a generic 504.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    let fetchResponse: Response
    try {
      fetchResponse = await fetch(feedUrl.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      })
    } catch (fetchError) {
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError'
      const msg = isTimeout
        ? `Fetch timed out after 15 s for ${feedUrl.toString()}`
        : `Network error fetching ${feedUrl.toString()}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
      console.error('[proxy] fetch error:', msg)
      return NextResponse.json({ error: msg }, { status: 502 })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!fetchResponse.ok) {
      const msg = `Failed to fetch feed: HTTP ${fetchResponse.status} ${fetchResponse.statusText} — ${feedUrl.toString()}`
      console.error('[proxy]', msg)
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    const feedText = await fetchResponse.text()
    let feed: Awaited<ReturnType<typeof parser.parseString>>
    try {
      feed = await parser.parseString(feedText)
    } catch (parseError) {
      const msg = `Failed to parse RSS/Atom feed from ${feedUrl.toString()}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      console.error('[proxy] parse error:', msg)
      return NextResponse.json({ error: msg }, { status: 422 })
    }

    // Extract favicon
    let favicon = ''
    if (feed.image?.url) {
      favicon = feed.image.url
    } else {
      // Try to get favicon from site using DuckDuckGo's favicon service
      favicon = `https://icons.duckduckgo.com/ip3/${feedUrl.hostname}.ico`
    }

    const result = {
      feed: {
        title: feed.title || 'Untitled Feed',
        url: feedUrl.toString(),
        siteUrl: feed.link || feedUrl.origin,
        description: feed.description || '',
        favicon,
      },
      articles: (feed.items || []).slice(0, 50).map((item) => ({
        title: item.title || 'Untitled',
        content: item['content:encoded'] || item.content || item.contentSnippet || '',
        summary: item.contentSnippet || item.summary || '',
        link: item.link || '',
        author: item['dc:creator'] || item.creator || item.author || '',
        pubDate: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      })),
    }

    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy] unexpected error:', msg, error)
    return NextResponse.json(
      { error: `Unexpected error: ${msg}` },
      { status: 500 }
    )
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
