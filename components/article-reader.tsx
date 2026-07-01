'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
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
  List,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useArticles, useArticle } from '@/hooks/use-articles'
import { useHighlights } from '@/hooks/use-highlights'
import { useReadingSettings } from '@/hooks/use-reading-settings'
import { useOffline } from '@/hooks/use-offline'
import { sanitizeHtml, getReadingTime } from '@/lib/rss-parser'
import { generateMarkdown, downloadMarkdown, generateFilename } from '@/lib/markdown-export'
import { ReadingSettings } from './reading-settings'
import { HighlightToolbar } from './highlight-toolbar'
import { useIsMobile } from '@/hooks/use-mobile'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toastError } from '@/lib/error-utils'
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

interface OutlineItem {
  id: string
  title: string
  level: number
}

interface OutlineState {
  html: string
  items: OutlineItem[]
}

function slugifyOutlineTitle(title: string) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function buildOutlineState(html: string): OutlineState {
  if (!html) {
    return { html, items: [] }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  const usedIds = new Map<string, number>()
  const items: OutlineItem[] = []

  headings.forEach((heading, index) => {
    const title = heading.textContent?.replace(/\s+/g, ' ').trim()
    if (!title) return

    const level = Number(heading.tagName.slice(1))
    const baseId = slugifyOutlineTitle(title) || `section-${index + 1}`
    const duplicateCount = usedIds.get(baseId) ?? 0
    usedIds.set(baseId, duplicateCount + 1)
    const id = duplicateCount === 0 ? baseId : `${baseId}-${duplicateCount + 1}`

    const anchor = doc.createElement('a')
    anchor.className = 'rss-reader-outline-achor'
    anchor.id = id
    anchor.setAttribute('aria-hidden', 'true')
    anchor.setAttribute('tabindex', '-1')
    heading.insertBefore(anchor, heading.firstChild)

    items.push({ id, title, level })
  })

  return {
    html: doc.body.innerHTML,
    items,
  }
}

interface ArticleReaderProps {
  article: Article | null
  onClose?: () => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export function ArticleReader({ article, onClose, isExpanded, onToggleExpand }: ArticleReaderProps) {
  const { markAsRead, toggleSaved, fetchFullContent } = useArticles()
  const isOffline = useOffline()
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
  const [showOutline, setShowOutline] = useState(false)
  const [isFetchingContent, setIsFetchingContent] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)
  
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const articleContent = displayArticle?.content ?? ''
  const readingTime = getReadingTime(articleContent)
  const pubDate = new Date(displayArticle?.pubDate ?? Date.now())
  const sanitizedContent = useMemo(() => sanitizeHtml(articleContent), [articleContent])
  const outlineState = useMemo(() => buildOutlineState(sanitizedContent), [sanitizedContent])
  const outlineBaseLevel =
    outlineState.items.length > 0 ? Math.min(...outlineState.items.map((item) => item.level)) : 0

  useEffect(() => {
    if (article && !article.isRead) {
      markAsRead(article.id)
    }
    // 切换文章时滚动到顶部
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
    setReadingProgress(0)
  }, [article?.id])

  useEffect(() => {
    setShowOutline(false)
  }, [article?.id])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const updateReadingProgress = () => {
      const totalScroll = container.scrollHeight - container.clientHeight

      if (totalScroll <= 0) {
        setReadingProgress(100)
        return
      }

      const progress = (container.scrollTop / totalScroll) * 100
      setReadingProgress(Math.min(100, Math.max(0, progress)))
    }

    updateReadingProgress()
    container.addEventListener('scroll', updateReadingProgress, { passive: true })
    window.addEventListener('resize', updateReadingProgress)

    const resizeObserver = new ResizeObserver(updateReadingProgress)
    resizeObserver.observe(container)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }

    return () => {
      container.removeEventListener('scroll', updateReadingProgress)
      window.removeEventListener('resize', updateReadingProgress)
      resizeObserver.disconnect()
    }
  }, [outlineState.html])

  // Force all links in the rendered article content to open in new tab and ensure single-tap works on mobile
  useEffect(() => {
    if (!contentRef.current) return
    const links = contentRef.current.querySelectorAll<HTMLAnchorElement>('a[href]')
    links.forEach((link) => {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
      link.style.touchAction = 'manipulation'
    })
  }, [outlineState.html])

  // Prevent video/audio autoplay
  useEffect(() => {
    if (!contentRef.current) return
    contentRef.current.querySelectorAll<HTMLVideoElement | HTMLAudioElement>('video, audio').forEach((el) => {
      el.removeAttribute('autoplay')
      el.pause()
    })
  }, [outlineState.html])

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
      toastError(err, '补全文失败')
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

  const handleOutlineClick = useCallback((anchorId: string) => {
    const container = scrollContainerRef.current
    const target = document.getElementById(anchorId)

    if (!container || !target) return

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const top = container.scrollTop + targetRect.top - containerRect.top - 24

    container.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    })
    setShowOutline(false)
  }, [])

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground bg-muted/30">
        <p className="text-sm">选择一篇文章开始阅读</p>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-full overflow-hidden"
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
              disabled={isFetchingContent || isOffline}
              title={isOffline
                ? '离线时只能浏览本地内容'
                : displayArticle.isContentManuallyFilled
                  ? '已补全文（点击重新抓取）'
                  : '智能补全文'}
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

        <Progress value={readingProgress} className="h-[2px] rounded-none" />

        {/* Content - 独立滚动区域 */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
        >
          <article
            className="mx-auto px-6 py-8 overflow-x-hidden"
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
              dangerouslySetInnerHTML={{ __html: outlineState.html }}
              onMouseUp={handleMouseUp}
              onClick={handleContentClick}
            />
          </article>
        </div>

        {outlineState.items.length > 0 && (
          <div className="absolute right-4 top-16 z-40">
            {isMobile ? (
              <Sheet open={showOutline} onOpenChange={setShowOutline}>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-10 rounded-full border border-border/70 bg-background/90 shadow-lg backdrop-blur"
                  onClick={() => setShowOutline(true)}
                  title="文章大纲"
                  aria-label="文章大纲"
                >
                  <List className="size-5" />
                </Button>
                <SheetContent side="bottom" className="h-[70vh] p-0">
                  <SheetHeader className="border-b border-border/50 pb-3">
                    <SheetTitle>文章大纲</SheetTitle>
                    <p className="text-xs text-muted-foreground">{outlineState.items.length} 个标题</p>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(70vh-4.75rem)]">
                    <div className="flex flex-col gap-1 p-3 pb-6">
                      {outlineState.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                          style={{ paddingLeft: 12 + (item.level - outlineBaseLevel) * 12 }}
                          onClick={() => handleOutlineClick(item.id)}
                        >
                          <span className="line-clamp-2">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            ) : (
              <Popover open={showOutline} onOpenChange={setShowOutline}>
                <PopoverAnchor asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-10 rounded-full border border-border/70 bg-background/90 shadow-lg backdrop-blur"
                    onClick={() => setShowOutline((current) => !current)}
                    title="文章大纲"
                    aria-label="文章大纲"
                  >
                    <List className="size-5" />
                  </Button>
                </PopoverAnchor>
                <PopoverContent align="end" side="bottom" sideOffset={12} className="w-80 p-0">
                  <div className="border-b border-border/50 px-4 py-3">
                    <p className="text-sm font-medium">文章大纲</p>
                    <p className="text-xs text-muted-foreground">{outlineState.items.length} 个标题</p>
                  </div>
                  <ScrollArea className="max-h-96">
                    <div className="flex flex-col gap-1 p-2 pb-3">
                      {outlineState.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                          style={{ paddingLeft: 12 + (item.level - outlineBaseLevel) * 12 }}
                          onClick={() => handleOutlineClick(item.id)}
                        >
                          <span className="line-clamp-2">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

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
