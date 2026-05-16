'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Bookmark, BookmarkCheck, Loader2, Eye, EyeOff, Trash2, HardDriveDownload, CheckCheck } from 'lucide-react'
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
import { htmlToText, getReadingTime } from '@/lib/rss-parser'
import { toast } from 'sonner'
import type { Article } from '@/lib/types'

interface ArticleListProps {
  feedId: string | null
  view: 'all' | 'feed' | 'saved' | 'highlights'
  selectedArticleId: string | null
  onSelectArticle: (article: Article) => void
}

const PAGE_SIZE = 50

export function ArticleList({ feedId, view, selectedArticleId, onSelectArticle }: ArticleListProps) {
  const { settings, updateSettings } = useReadingSettings()
  const hideRead = view === 'saved' ? false : (settings.hideRead ?? false)
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

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
  
  const {
    articles: savedArticles,
    isLoading: isSavedLoading,
    toggleSaved: toggleSavedSaved,
  } = useSavedArticles()

  const articles = view === 'saved' ? savedArticles : feedArticles
  const isLoading = view === 'saved' ? isSavedLoading : isFeedLoading
  const toggleSaved = view === 'saved' ? toggleSavedSaved : toggleFeedSaved

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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center border-r border-border">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="flex h-full flex-col border-r border-border">
        <ArticleListHeader
          view={view}
          articleCount={0}
          readCount={0}
          unreadCount={0}
          hideRead={hideRead}
          onToggleHideRead={handleToggleHideRead}
          showHideReadToggle={showHideReadToggle}
          onCleanup={handleCleanup}
        />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
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
    <div className="flex h-full flex-col border-r border-border">
      <ArticleListHeader
        view={view}
        articleCount={articles.length}
        readCount={readCount}
        unreadCount={unreadCount}
        hideRead={hideRead}
        onToggleHideRead={handleToggleHideRead}
        showHideReadToggle={showHideReadToggle}
        onCleanup={handleCleanup}
        onMarkAllRead={view === 'feed' ? handleMarkAllRead : undefined}
      />
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col">
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
            {view === 'saved' ? '收藏' : view === 'feed' ? '订阅文章' : '所有文章'}
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
                      className="size-8"
                      onClick={onMarkAllRead}
                    >
                      <CheckCheck className="size-4" />
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
                    aria-label={hideRead ? '显示已读' : '隐藏已读'}
                  >
                    {hideRead ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
                    className="size-8"
                    onClick={onCleanup}
                  >
                    <Trash2 className="size-4" />
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
              'text-sm leading-snug line-clamp-2',
              !article.isRead && 'font-semibold'
            )}
          >
            {article.title}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
        <p className={cn('text-xs text-muted-foreground line-clamp-2', !article.isRead && 'ml-4')}>
          {summary}
        </p>
      )}
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground mt-1', !article.isRead && 'ml-4')}>
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
