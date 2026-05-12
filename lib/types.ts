// RSS Reader Types

export interface Feed {
  id: string
  title: string
  url: string
  siteUrl?: string
  description?: string
  favicon?: string
  lastUpdated: number
  category?: string
  group?: string // 分组名称
}

export interface FeedGroup {
  name: string
  feeds: Feed[]
  isExpanded?: boolean
}

export interface Article {
  id: string
  feedId: string
  feedTitle: string
  title: string
  content: string
  summary?: string
  link: string
  author?: string
  pubDate: number
  isRead: boolean
  isSaved: boolean
  cachedAt: number
  readAt?: number // 阅读时间戳，用于30天后自动删除
}

export interface Highlight {
  id: string
  articleId: string
  text: string
  color: HighlightColor
  note?: string
  startOffset: number
  endOffset: number
  containerSelector: string
  createdAt: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export interface ReadingSettings {
  fontSize: number
  lineHeight: number
  theme: 'light' | 'dark' | 'sepia'
  fontFamily: 'sans' | 'serif'
  maxWidth: number
  hideRead: boolean
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'light',
  fontFamily: 'sans',
  maxWidth: 680,
  hideRead: false,
}

export interface OPMLOutline {
  title: string
  xmlUrl: string
  htmlUrl?: string
  type?: string
}

export interface ExportedNote {
  articleTitle: string
  articleLink: string
  feedTitle: string
  exportedAt: number
  highlights: {
    text: string
    color: HighlightColor
    note?: string
  }[]
}
