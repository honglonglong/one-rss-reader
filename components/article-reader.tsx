git 'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Clock,
  User,
  FileDown,
  ChevronRight,
  X,
  Trash2,
  Maximize2,
  Minimize2,
  Wand2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useArticles, useArticle } from '@/hooks/use-articles'
import { useHighlights } from '@/hooks/use-highlights'
import { useReadingSettings } from '@/hooks/use-reading-settings'
import { sanitizeHtml, getReadingTime } from '@/lib/rss-parser'
import { generateMarkdown, downloadMarkdown, generateFilename } from '@/lib/markdown-export'
import { ReadingSettings } from './reading-settings'
import { HighlightToolbar } from './highlight-toolbar'
import { useIsMobile } from '@/hooks/use-mobile'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Article, HighlightColor, Highlight } from '@/lib/types'
import { toast } from 'sonner'

const COLOR_CLASSES: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-200 dark:bg-yellow-900/50',
  green: 'bg-green-200 dark:bg-green-900/50',
  blue: 'bg-blue-200 dark:bg-blue-900/50',
  pink: 'bg-pink-200 dark:bg-pink-900/50',
  purple: 'bg-purple-200 dark:bg-purple-900/50',
}

const THEME_CLASSES = {
  system: 'bg-background text-foreground',
  light: 'bg-white text-zinc-900',
  dark: 'bg-zinc-900 text-zinc-100',
  sepia: 'bg-amber-50 text-amber-950',
}

interface ArticleReaderProps {
  article: Article | null
  onClose?: () => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export function ArticleReader({ article, onClose, isExpanded, onToggleExpand }: ArticleReaderProps) {
  const { markAsRead, toggleSaved, fetchFullContent } = useArticles()
  // SWR-backed live view of the article — auto-refreshes after fetchFullContent
  // invalidates the 'article-${id}' cache key via globalMutate.
  const { article: liveArticle } = useArticle(article?.id ?? null)
  const displayArticle = liveArticle ?? article!
  const { settings } = useReadingSettings()
  const { highlights, createHighlight, removeHighlight } = useHighlights(article?.id || null)
  const isMobile = useIsMobile()
  
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [selectionRange, setSelectionRange] = useState<{
    startOffset: number
    endOffset: number
    containerSelector: string
  } | null>(null)
  const [showHighlights, setShowHighlights] = useState(false)
  const [isFetchingContent, setIsFetchingContent] = useState(false)
  
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (article && !article.isRead) {
      markAsRead(article.id)
    }
    // 切换文章时滚动到顶部
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [article?.id])

  // Force all links in article content to open in new tab and ensure single-tap works on mobile
  useEffect(() => {
    if (!contentRef.current) return
    const links = contentRef.current.querySelectorAll<HTMLAnchorElement>('a[href]')
    links.forEach((link) => {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
      link.style.touchAction = 'manipulation'
    })
  }, [article?.id])

  // Prevent video/audio autoplay
  useEffect(() => {
    if (!contentRef.current) return
    contentRef.current.querySelectorAll<HTMLVideoElement | HTMLAudioElement>('video, audio').forEach((el) => {
      el.removeAttribute('autoplay')
      el.pause()
    })
  }, [article?.id])

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setToolbarPosition(null)
      setSelectedText('')
      return
    }

    const text = selection.toString().trim()
    if (!text || text.length < 3) {
      setToolbarPosition(null)
      setSelectedText('')
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // Check if selection is within our content
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      return
    }

    setToolbarPosition({
      x: rect.left + rect.width / 2,
      y: rect.top,
    })
    setSelectedText(text)

    // Calculate offsets relative to content container
    const preRange = document.createRange()
    preRange.selectNodeContents(contentRef.current)
    preRange.setEnd(range.startContainer, range.startOffset)
    const startOffset = preRange.toString().length

    setSelectionRange({
      startOffset,
      endOffset: startOffset + text.length,
      containerSelector: '.article-content',
    })
  }, [])

  const handleHighlight = async (color: HighlightColor, note?: string) => {
    if (!selectedText || !selectionRange || !article) return

    await createHighlight(
      selectedText,
      color,
      selectionRange.startOffset,
      selectionRange.endOffset,
      selectionRange.containerSelector,
      note
    )

    window.getSelection()?.removeAllRanges()
    setToolbarPosition(null)
    setSelectedText('')
    setSelectionRange(null)
    toast.success('已添加高亮')
  }

  const handleExport = () => {
    if (!article) return
    const md = generateMarkdown(article, highlights, false, true)
    const filename = generateFilename(article.title)
    downloadMarkdown(md, filename)
    toast.success('已导出文章')
  }

  const handleToggleSaved = async () => {
    if (!article) return
    const isSaved = await toggleSaved(article.id)
    toast.success(isSaved ? '已收藏' : '已取消收藏')
  }

  const handleFetchFullContent = async () => {
    if (!article || isFetchingContent) return
    setIsFetchingContent(true)
    try {
      await fetchFullContent(article)
      toast.success('已成功补全文章内容')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '补全文失败')
    } finally {
      setIsFetchingContent(false)
    }
  }

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!link) return
    const href = link.getAttribute('href')
    if (!href || href === '#') return
    e.preventDefault()
    window.open(href, '_blank', 'noopener,noreferrer')
  }, [])

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground bg-muted/30">
        <p className="text-sm">选择一篇文章开始阅读</p>
      </div>
    )
  }

  const readingTime = getReadingTime(displayArticle.content)
  const pubDate = new Date(displayArticle.pubDate)
  const sanitizedContent = sanitizeHtml(displayArticle.content)

  return (
    <div
      className="flex h-full overflow-hidden"
    >
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 overflow-hidden',
          THEME_CLASSES[settings.theme]
        )}
      >
        {/* Header - 固定在顶部 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {onClose && (
              <Button variant="ghost" size="icon" className="size-10 lg:size-8 shrink-0" onClick={onClose}>
                <X className="size-5 lg:size-4" />
              </Button>
            )}
            <span className="text-sm text-muted-foreground truncate">
              {displayArticle.feedTitle}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onToggleExpand && (
              <Button
                variant="ghost"
                size="icon"
                className="size-10 lg:size-8"
                onClick={onToggleExpand}
                title={isExpanded ? '退出全屏' : '全屏阅读'}
              >
                {isExpanded ? (
                  <Minimize2 className="size-5 lg:size-4" />
                ) : (
                  <Maximize2 className="size-5 lg:size-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-10 lg:size-8"
              onClick={() => setShowHighlights(!showHighlights)}
            >
              <ChevronRight
                className={cn('size-5 lg:size-4 transition-transform', showHighlights && 'rotate-180')}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'size-10 lg:size-8',
                displayArticle.isContentManuallyFilled && 'text-primary'
              )}
              onClick={handleFetchFullContent}
              disabled={isFetchingContent}
              title={
                displayArticle.isContentManuallyFilled
                  ? '已补全文（点击重新抓取）'
                  : '智能补全文'
              }
            >
              {isFetchingContent ? (
                <Loader2 className="size-5 lg:size-4 animate-spin" />
              ) : (
                <Wand2 className="size-5 lg:size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 lg:size-8"
              onClick={handleExport}
              title="导出文章到 Markdown"
            >
              <FileDown className="size-5 lg:size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 lg:size-8"
              onClick={handleToggleSaved}
              title={displayArticle.isSaved ? '取消收藏' : '收藏'}
            >
              {displayArticle.isSaved ? (
                <BookmarkCheck className="size-5 lg:size-4 text-primary" />
              ) : (
                <Bookmark className="size-5 lg:size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 lg:size-8"
              asChild
              title="在浏览器中打开"
            >
              <a href={displayArticle.link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-5 lg:size-4" />
              </a>
            </Button>
            <ReadingSettings />
          </div>
        </div>

        {/* Content - 独立滚动区域 */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
        >
          <article
            className="mx-auto px-6 py-8"
            style={{ maxWidth: settings.maxWidth }}
          >
            <header className="mb-8">
              <h1
                className="font-bold leading-tight mb-4 text-balance"
                style={{ fontSize: settings.fontSize * 1.5 }}
              >
              {displayArticle.title}
            </h1>
              <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                {displayArticle.author && (
                  <span className="flex items-center gap-1 text-sm">
                    <User className="size-3" />
                    {displayArticle.author}
                  </span>
                )}
                <span className="flex items-center gap-1 text-sm">
                  <Clock className="size-3" />
                  {format(pubDate, 'yyyy年M月d日', { locale: zhCN })}
                  {' · '}
                  {formatDistanceToNow(pubDate, { addSuffix: true, locale: zhCN })}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {readingTime} 分钟阅读
                </Badge>
              </div>
            </header>

            <Separator className="mb-8" />

            <div
              ref={contentRef}
              className={cn(
                'article-content prose prose-zinc dark:prose-invert max-w-none',
                settings.fontFamily === 'serif' ? 'font-serif' : 'font-sans'
              )}
              style={{
                fontSize: settings.fontSize,
                lineHeight: settings.lineHeight,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              onMouseUp={handleMouseUp}
              onClick={handleContentClick}
            />
          </article>
        </div>

        <HighlightToolbar
          position={toolbarPosition}
          selectedText={selectedText}
          onHighlight={handleHighlight}
          onClose={() => {
            setToolbarPosition(null)
            setSelectedText('')
          }}
        />
      </div>

      {/* Highlights sidebar - desktop/tablet, or bottom sheet on mobile */}
      {isMobile ? (
        <Sheet open={showHighlights} onOpenChange={setShowHighlights}>
          <SheetContent side="bottom" className="h-[70vh] flex flex-col">
            <SheetHeader className="shrink-0">
              <SheetTitle>高亮与笔记</SheetTitle>
              <p className="text-xs text-muted-foreground">{highlights.length} 条高亮</p>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 flex flex-col gap-3">
                {highlights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    选中文字添加高亮
                  </p>
                ) : (
                  highlights.map((h) => (
                    <HighlightCard
                      key={h.id}
                      highlight={h}
                      onDelete={() => removeHighlight(h.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        showHighlights && (
          <div className="w-72 border-l border-border flex flex-col bg-muted/30 shrink-0 overflow-hidden">
            <div className="p-4 border-b border-border shrink-0">
              <h3 className="font-semibold">高亮与笔记</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {highlights.length} 条高亮
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 flex flex-col gap-3">
                {highlights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    选中文字添加高亮
                  </p>
                ) : (
                  highlights.map((h) => (
                    <HighlightCard
                      key={h.id}
                      highlight={h}
                      onDelete={() => removeHighlight(h.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}

function HighlightCard({
  highlight,
  onDelete,
}: {
  highlight: Highlight
  onDelete: () => void
}) {
  return (
    <div className="group relative rounded-lg border border-border p-3 bg-background">
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-lg',
          COLOR_CLASSES[highlight.color]
        )}
      />
      <p className="text-sm pl-2 line-clamp-3">{highlight.text}</p>
      {highlight.note && (
        <p className="text-xs text-muted-foreground mt-2 pl-2 italic">
          {highlight.note}
        </p>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}
