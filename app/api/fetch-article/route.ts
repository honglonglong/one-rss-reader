import { NextRequest, NextResponse } from 'next/server'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate URL — only allow http/https
    let targetUrl: URL
    try {
      targetUrl = new URL(url)
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return NextResponse.json(
          { error: `不支持的协议: ${targetUrl.protocol}，仅支持 http 和 https` },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Fetch page HTML with a timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    let fetchResponse: Response
    try {
      fetchResponse = await fetch(targetUrl.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader Bot)',
        },
      })
    } catch (fetchError) {
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError'
      const msg = isTimeout
        ? `抓取超时 (10s): ${targetUrl.toString()}`
        : `网络错误: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
      return NextResponse.json({ error: msg }, { status: 502 })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!fetchResponse.ok) {
      return NextResponse.json(
        { error: `HTTP ${fetchResponse.status}: ${fetchResponse.statusText}` },
        { status: 502 }
      )
    }

    const html = await fetchResponse.text()

    // Use JSDOM + Readability to extract main article content
    const dom = new JSDOM(html, { url: targetUrl.toString() })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article || !article.content) {
      return NextResponse.json({ error: '无法提取文章正文' }, { status: 422 })
    }

    return NextResponse.json({
      content: article.content,
      title: article.title,
      excerpt: article.excerpt,
    })
  } catch (error) {
    console.error('[fetch-article]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    )
  }
}
