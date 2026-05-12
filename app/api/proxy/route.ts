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

    // Fetch and parse the feed
    const feed = await parser.parseURL(feedUrl.toString())

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
    console.error('RSS proxy error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch feed' },
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
