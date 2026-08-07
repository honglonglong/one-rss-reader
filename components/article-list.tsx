'use client'

import { useEffect, useState, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Bookmark, BookmarkCheck, Loader2, Eye, EyeOff, Trash2, HardDriveDownload, CheckCheck, ChevronDown, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useArticles, useSavedArticles } from '@/hooks/use-articles'
import { useReadingSettings } from '@/hooks/use-reading-settings'
import { useListFontSize } from '@/hooks/use-list-font-size'
import { useFeeds } from '@/hooks/use-feeds'
import { useOffline } from '@/hooks/use-offline'
import { useIsMobile } from '@/hooks/use-mobile'
import { htmlToText, getReadingTime } from '@/lib/rss-parser'
import { toast } from 'sonner'
import type { Article } from '@/lib/types'

interface ArticleListProps {
  feedId: string | null
  view: 'all' | 'feed' | 'saved' | 'highlights'
  selectedArticleId: string | null
  onSelectArticle: (article: Article) => void
  /** 每次左侧导航点击时自增，用于显式触发重新拉取并应用已读过滤 */
  refreshKey: number
  /** 每当当前展示的文章数组变化时上报完整（未分页截断的）数组，供上一篇/下一篇导航使用 */
  onArticlesChange?: (articles: Article[]) => void
}

const PAGE_SIZE = 50

export function ArticleList({ feedId, view, selectedArticleId, onSelectArticle, refreshKey, onArticlesChange }: ArticleListProps) {
  const { settings, updateSettings } = useReadingSettings()
  const hideRead = view === 'saved' ? false : (settings.hideRead ?? false)
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

  const { feeds, refresh } = useFeeds()
  const isMobile = useIsMobile()
  const isOffline = useOffline()
  const feedTitle = view === 'feed' ? feeds.find(f => f.id === feedId)?.title : undefined
  const canPullRefresh = isMobile && view === 'feed' && !!feedId && !isOffline
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartYRef = useRef(0)
  const [pullY, setPullY] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { listFontSize, updateListFontSize } = useListFontSize()
  const pinchStartDistRef = useRef(0)
  const pinchStartFontRef = useRef(14)
  const isPinchingRef = useRef(false)

  // 阻止容器内的双指手势触发浏览器原生缩放（非 passive 监听才能 preventDefault）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const preventBrowserPinch = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault()
    }
    el.addEventListener('touchmove', preventBrowserPinch, { passive: false })
    return () => el.removeEventListener('touchmove', preventBrowserPinch)
  })

  // Reset pagination when switching feeds or views
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE)
  }, [feedId, view])
  
  const {
    articles: feedArticles,
    isLoading: isFeedLoading,
    markAsRead,
    toggleSaved: toggleFeedSaved,
    cleanup,
    markAllAsRead,
    mutate: mutateFeedArticles,
  } = useArticles(view === 'feed' ? feedId || undefined : undefined, hideRead)

  // 仅在左侧导航发生点击（refreshKey 变化）时才显式重新拉取，跳过首次挂载避免与初始 fetch 重复
  const isFirstMountRef = useRef(true)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      return
    }
    mutateFeedArticles()
  }, [refreshKey, mutateFeedArticles])
  
  const {
    articles: savedArticles,
    isLoading: isSavedLoading,
    toggleSaved: toggleSavedSaved,
  } = useSavedArticles()

  const articles = view === 'saved' ? savedArticles : feedArticles
  const isLoading = view === 'saved' ? isSavedLoading : isFeedLoading
  const toggleSaved = view === 'saved' ? toggleSavedSaved : toggleFeedSaved

  useEffect(() => {
    onArticlesChange?.(articles)
  }, [articles, onArticlesChange])

  // 在 saved 视图不显示隐藏已读按钮
  const showHideReadToggle = view !== 'saved'

  const handleToggleHideRead = () => {
    updateSettings({ hideRead: !hideRead })
  }

  const handleSelectArticle = async (article: Article) => {
    if (!article.isRead) {
      await markAsRead(article.id)
    }
    onSelectArticle(article)
  }

  // 计算已读和未读数量
  const readCount = articles.filter(a => a.isRead).length
  const unreadCount = articles.filter(a => !a.isRead).length

  const handleToggleSaved = async (e: React.MouseEvent, articleId: string) => {
    e.stopPropagation()
    await toggleSaved(articleId)
  }

  const handleCleanup = async () => {
    const count = await cleanup()
    if (count > 0) {
      toast.success(`已清理 ${count} 篇30天前的已读文章`)
    } else {
      toast.info('没有需要清理的文章')
    }
  }

  const handleMarkAllRead = async () => {
    const count = await markAllAsRead()
    if (count > 0) {
      toast.success(`已将 ${count} 篇文章标记为已读`)
    } else {
      toast.info('没有未读文章')
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isOffline) return

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchStartDistRef.current = Math.hypot(dx, dy)
      pinchStartFontRef.current = listFontSize
      isPinchingRef.current = true
      return
    }
    if (!canPullRefresh) return
    touchStartYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      if (pinchStartDistRef.current > 0) {
        const scale = dist / pinchStartDistRef.current
        const next = Math.min(22, Math.max(10, pinchStartFontRef.current * scale))
        updateListFontSize(next)
      }
      return
    }
    if (!canPullRefresh || isRefreshing) return
    const delta = e.touches[0].clientY - touchStartYRef.current
    if (delta <= 0) { setPullY(0); return }
    const viewport = containerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
    if ((viewport?.scrollTop ?? 0) > 0) { setPullY(0); return }
    setPullY(Math.min(delta * 0.4, 64))
  }

  const handleTouchEnd = async () => {
    if (isOffline) {
      setPullY(0)
      return
    }

    if (isPinchingRef.current) {
      isPinchingRef.current = false
      pinchStartDistRef.current = 0
      return
    }
    if (!canPullRefresh) return
    if (pullY >= 60 && !isRefreshing) {
      setIsRefreshing(true)
      setPullY(0)
      try { await refresh(feedId!) }
      finally { setIsRefreshing(false) }
    } else {
      setPullY(0)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center border-r border-border">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div ref={containerRef} className="flex h-full flex-col border-r border-border" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <ArticleListHeader
          view={view}
          feedTitle={feedTitle}
          articleCount={0}
          readCount={0}
          unreadCount={0}
          hideRead={hideRead}
          onToggleHideRead={handleToggleHideRead}
          showHideReadToggle={showHideReadToggle}
          onCleanup={handleCleanup}
        />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <Inbox className="size-8 mb-2 opacity-40" />
          <p className="text-sm">
            {view === 'saved' 
              ? '暂无收藏文章' 
              : hideRead 
                ? '没有未读文章' 
                : '暂无文章'}
          </p>
          {hideRead && view !== 'saved' && (
            <Button
              variant="link"
              size="sm"
              className="mt-2"
              onClick={handleToggleHideRead}
            >
              显示已读文章
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col border-r border-border" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <ArticleListHeader
        view={view}
        feedTitle={feedTitle}
        articleCount={articles.length}
        readCount={readCount}
        unreadCount={unreadCount}
        hideRead={hideRead}
        onToggleHideRead={handleToggleHideRead}
        showHideReadToggle={showHideReadToggle}
        onCleanup={handleCleanup}
        onMarkAllRead={view === 'feed' ? handleMarkAllRead : undefined}
      />
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height: isRefreshing ? 40 : pullY }}
      >
        {isRefreshing ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : pullY > 0 ? (
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-200',
              pullY >= 60 && 'rotate-180'
            )}
          />
        ) : null}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col" style={{ fontSize: `${listFontSize}px` }}>
          {articles.slice(0, displayLimit).map((article) => (
            <ArticleItem
              key={article.id}
              article={article}
              isSelected={selectedArticleId === article.id}
              onSelect={() => handleSelectArticle(article)}
              onToggleSaved={(e) => handleToggleSaved(e, article.id)}
            />
          ))}
          {articles.length > displayLimit && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisplayLimit((d) => d + PAGE_SIZE)}
              >
                加载更多（还有 {articles.length - displayLimit} 篇）
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface ArticleListHeaderProps {
  view: string
  feedTitle?: string
  articleCount: number
  readCount: number
  unreadCount: number
  hideRead: boolean
  onToggleHideRead: () => void
  showHideReadToggle: boolean
  onCleanup: () => void
  onMarkAllRead?: () => void
}

function ArticleListHeader({
  view,
  feedTitle,
  articleCount,
  readCount,
  unreadCount,
  hideRead,
  onToggleHideRead,
  showHideReadToggle,
  onCleanup,
  onMarkAllRead,
}: ArticleListHeaderProps) {
  return (
    <div className="border-b border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">
            {view === 'saved' ? '收藏' : view === 'feed' ? (feedTitle ?? '订阅文章') : '所有文章'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hideRead ? `${unreadCount} 篇未读` : `${articleCount} 篇文章`}
            {!hideRead && readCount > 0 && ` · ${unreadCount} 未读`}
          </p>
        </div>
        {showHideReadToggle && (
          <div className="flex items-center gap-1">
            {onMarkAllRead && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 lg:size-8"
                      onClick={onMarkAllRead}
                    >
                      <CheckCheck className="size-5 lg:size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>全部标记为已读</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={hideRead}
                    onPressedChange={onToggleHideRead}
                    size="sm"
                    className="size-10 lg:size-8"
                    aria-label={hideRead ? '显示已读' : '隐藏已读'}
                  >
                    {hideRead ? <EyeOff className="size-5 lg:size-4" /> : <Eye className="size-5 lg:size-4" />}
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{hideRead ? '显示已读文章' : '隐藏已读文章'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 lg:size-8"
                    onClick={onCleanup}
                  >
                    <Trash2 className="size-5 lg:size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>清理30天前的已读文章</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  )
}

interface ArticleItemProps {
  article: Article
  isSelected: boolean
  onSelect: () => void
  onToggleSaved: (e: React.MouseEvent) => void
}

function ArticleItem({ article, isSelected, onSelect, onToggleSaved }: ArticleItemProps) {
  const summary = htmlToText(article.summary || article.content).slice(0, 120)
  const readingTime = getReadingTime(article.content)
  const timeAgo = formatDistanceToNow(article.pubDate, { addSuffix: true, locale: zhCN })

  return (
    <div
      className={cn(
        'group flex cursor-pointer flex-col gap-1 border-b border-border p-4 hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent',
        article.isRead && 'opacity-60'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {!article.isRead && (
            <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />
          )}
          <h3
            className={cn(
              'leading-snug line-clamp-2',
              !article.isRead && 'font-semibold'
            )}
            style={{ fontSize: '1em' }}
          >
            {article.title}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
          onClick={onToggleSaved}
        >
          {article.isSaved ? (
            <BookmarkCheck className="size-4 text-primary" />
          ) : (
            <Bookmark className="size-4" />
          )}
        </Button>
      </div>
      {summary && (
        <p className={cn('text-muted-foreground line-clamp-2', !article.isRead && 'ml-4')} style={{ fontSize: '0.857em' }}>
          {summary}
        </p>
      )}
      <div className={cn('flex items-center gap-2 text-muted-foreground mt-1', !article.isRead && 'ml-4')} style={{ fontSize: '0.857em' }}>
        <span className="truncate max-w-32">{article.feedTitle}</span>
        <span>·</span>
        <span>{timeAgo}</span>
        <span>·</span>
        <span>{readingTime} 分钟</span>
        {article.isSaved && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HardDriveDownload className="size-3 text-primary shrink-0" />
              </TooltipTrigger>
              <TooltipContent>
                <p>已离线缓存</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}
