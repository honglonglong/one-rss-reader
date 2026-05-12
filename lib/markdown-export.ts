import type { Article, Highlight, ExportedNote, HighlightColor } from './types'

const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  pink: '粉色',
  purple: '紫色',
}

const COLOR_EMOJI: Record<HighlightColor, string> = {
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  pink: '🩷',
  purple: '🟣',
}

export function generateMarkdown(
  article: Article,
  highlights: Highlight[],
  includeEmoji: boolean = false
): string {
  const now = new Date()
  const dateStr = now.toLocaleString('zh-CN')
  
  let md = `# ${article.title}\n\n`
  md += `**来源**: [${article.feedTitle}](${article.link})\n`
  md += `**作者**: ${article.author || '未知'}\n`
  md += `**发布时间**: ${new Date(article.pubDate).toLocaleString('zh-CN')}\n`
  md += `**导出时间**: ${dateStr}\n\n`
  md += `---\n\n`
  md += `## 高亮与笔记\n\n`

  if (highlights.length === 0) {
    md += `*暂无高亮和笔记*\n`
  } else {
    // Group by color
    const byColor = highlights.reduce((acc, h) => {
      if (!acc[h.color]) acc[h.color] = []
      acc[h.color].push(h)
      return acc
    }, {} as Record<HighlightColor, Highlight[]>)

    const colorOrder: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']
    
    for (const color of colorOrder) {
      const items = byColor[color]
      if (!items || items.length === 0) continue

      const label = includeEmoji 
        ? `${COLOR_EMOJI[color]} ${COLOR_LABELS[color]}`
        : COLOR_LABELS[color]
      
      md += `### ${label}\n\n`

      for (const h of items) {
        md += `> ${h.text}\n\n`
        if (h.note) {
          md += `📝 **批注**: ${h.note}\n\n`
        }
      }
    }
  }

  md += `---\n\n`
  md += `*由 RSS Reader 导出*\n`

  return md
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function generateFilename(title: string): string {
  // Sanitize filename
  const safe = title
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 50)
  
  const date = new Date().toISOString().split('T')[0]
  return `${safe}_notes_${date}.md`
}

// Export all highlights as a single markdown file
export function generateAllHighlightsMarkdown(
  notes: { article: Article; highlights: Highlight[] }[]
): string {
  const now = new Date()
  const dateStr = now.toLocaleString('zh-CN')
  
  let md = `# 阅读笔记汇总\n\n`
  md += `**导出时间**: ${dateStr}\n`
  md += `**共计**: ${notes.length} 篇文章\n\n`
  md += `---\n\n`

  for (const { article, highlights } of notes) {
    md += `## ${article.title}\n\n`
    md += `**来源**: [${article.feedTitle}](${article.link})\n`
    md += `**发布时间**: ${new Date(article.pubDate).toLocaleString('zh-CN')}\n\n`

    for (const h of highlights) {
      md += `> ${h.text}\n`
      if (h.note) {
        md += `>\n> 📝 ${h.note}\n`
      }
      md += `\n`
    }

    md += `---\n\n`
  }

  md += `*由 RSS Reader 导出*\n`
  return md
}
