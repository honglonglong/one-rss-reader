import type { Feed, OPMLOutline } from './types'

// Parse OPML XML string to array of feed outlines
export function parseOPML(xmlString: string): OPMLOutline[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')
  
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Invalid OPML format')
  }

  const outlines: OPMLOutline[] = []
  const outlineElements = doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]')

  outlineElements.forEach((outline) => {
    const xmlUrl = outline.getAttribute('xmlUrl') || outline.getAttribute('xmlurl')
    const title = outline.getAttribute('title') || outline.getAttribute('text') || xmlUrl
    const htmlUrl = outline.getAttribute('htmlUrl') || outline.getAttribute('htmlurl')
    const type = outline.getAttribute('type')

    if (xmlUrl && title) {
      outlines.push({
        title,
        xmlUrl,
        htmlUrl: htmlUrl || undefined,
        type: type || undefined,
      })
    }
  })

  return outlines
}

// Generate OPML XML string from feeds
export function generateOPML(feeds: Feed[], title: string = 'RSS Reader Subscriptions'): string {
  const now = new Date().toUTCString()
  
  const outlines = feeds
    .map((feed) => {
      const attrs = [
        `text="${escapeXml(feed.title)}"`,
        `title="${escapeXml(feed.title)}"`,
        `type="rss"`,
        `xmlUrl="${escapeXml(feed.url)}"`,
      ]
      
      if (feed.siteUrl) {
        attrs.push(`htmlUrl="${escapeXml(feed.siteUrl)}"`)
      }
      
      return `      <outline ${attrs.join(' ')} />`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${now}</dateCreated>
    <dateModified>${now}</dateModified>
  </head>
  <body>
    <outline text="Subscriptions" title="Subscriptions">
${outlines}
    </outline>
  </body>
</opml>`
}

// Helper to escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Download OPML file
export function downloadOPML(feeds: Feed[], filename: string = 'subscriptions.opml'): void {
  const content = generateOPML(feeds)
  const blob = new Blob([content], { type: 'text/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
