'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Rss, List, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedList } from '@/components/feed-list'
import { ArticleList } from '@/components/article-list'
import { ArticleReader } from '@/components/article-reader'
import { HighlightsPanel } from '@/components/highlights-panel'
import { OfflineIndicator } from '@/components/offline-indicator'
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile'
import { useAppBadge } from '@/hooks/use-app-badge'
import { useMarkArticleRead } from '@/hooks/use-articles'
import { cleanupOldReadArticles, getDB } from '@/lib/db'
import type { Article } from '@/lib/types'
import { SyncProvider } from '@/components/sync-provider'
import SettingsPanel, { SettingsPanelContent } from '@/components/settings-panel'
import { SplashScreen } from '@/components/splash-screen'

const FEED_LIST_WIDTH_KEY = 'feedListWidth'
const FEED_LIST_MIN_WIDTH = 160
const FEED_LIST_MAX_WIDTH = 480
const FEED_LIST_DEFAULT_WIDTH = 240

type View = 'all' | 'feed' | 'saved' | 'highlights'

export default function Home() {
  return (
    <SyncProvider>
      <HomeInner />
    </SyncProvider>
  )
}

// useMarkArticleRead()（内部依赖 useSyncContext）需要在 SyncProvider 之内调用，故拆出这一层
function HomeInner() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  useAppBadge()

  const [isAppReady, setIsAppReady] = useState(false)
  useEffect(() => {
    getDB().then(() => setIsAppReady(true))
  }, [])

  // Auto-cleanup old read articles once per day
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem('lastCleanupDate') !== today) {
      cleanupOldReadArticles().then(() => {
        localStorage.setItem('lastCleanupDate', today)
      })
    }
  }, [])

  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [view, setView] = useState<View>('all')
  // 每次点击左侧导航项（含重复点击当前项）自增，作为“重新应用已读过滤”的显式信号
  const [articleListRefreshKey, setArticleListRefreshKey] = useState(0)
  const [feedErrors, setFeedErrors] = useState<Map<string, string>>(new Map())
  // 打开阅读器那一刻的文章列表快照（用于上一篇/下一篇导航），不随之后的已读过滤而增删
  const currentListArticlesRef = useRef<Article[]>([])
  const [navSnapshot, setNavSnapshot] = useState<Article[]>([])
  const [navIndex, setNavIndex] = useState(-1)
  const markArticleRead = useMarkArticleRead()
  const [mobileView, setMobileView] = useState<'feeds' | 'articles' | 'reader' | 'settings'>('feeds')
  const [isReaderExpanded, setIsReaderExpanded] = useState(false)
  const [feedListWidth, setFeedListWidth] = useState<number>(FEED_LIST_DEFAULT_WIDTH)
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Restore persisted width after mount to avoid SSR/client hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem(FEED_LIST_WIDTH_KEY)
    if (saved) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed)) setFeedListWidth(parsed)
    }
  }, [])

  // ESC 键退出全屏阅读
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isReaderExpanded) {
        setIsReaderExpanded(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isReaderExpanded])

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    // Pointer Events unify mouse/touch/pen so the same handler works for iPad drag
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = feedListWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (e: PointerEvent) => {
      if (!isResizingRef.current) return
      const delta = e.clientX - startXRef.current
      const newWidth = Math.min(FEED_LIST_MAX_WIDTH, Math.max(FEED_LIST_MIN_WIDTH, startWidthRef.current + delta))
      setFeedListWidth(newWidth)
    }

    const endResize = () => {
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setFeedListWidth(w => {
        localStorage.setItem(FEED_LIST_WIDTH_KEY, String(w))
        return w
      })
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', endResize)
      window.removeEventListener('pointercancel', endResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', endResize)
    window.addEventListener('pointercancel', endResize)
  }, [feedListWidth])

  const handleSelectFeed = (feedId: string | null) => {
    setSelectedFeedId(feedId)
    setView(feedId ? 'feed' : 'all')
    setSelectedArticle(null)
    setIsReaderExpanded(false)
    setMobileView('articles')
    setArticleListRefreshKey((k) => k + 1)
  }

  const handleSetFeedError = useCallback((feedId: string, message: string) => {
    setFeedErrors((prev) => new Map([...prev, [feedId, message]]))
  }, [])

  const handleClearFeedError = useCallback((feedId: string) => {
    setFeedErrors((prev) => {
      if (!prev.has(feedId)) return prev
      const next = new Map(prev)
      next.delete(feedId)
      return next
    })
  }, [])

  const handleSelectSaved = () => {
    setSelectedFeedId(null)
    setView('saved')
    setSelectedArticle(null)
    setIsReaderExpanded(false)
    setMobileView('articles')
    setArticleListRefreshKey((k) => k + 1)
  }

  const handleSelectHighlights = () => {
    setSelectedFeedId(null)
    setView('highlights')
    setSelectedArticle(null)
    setIsReaderExpanded(false)
    setMobileView('articles')
    setArticleListRefreshKey((k) => k + 1)
    // Highlights 面板没有关联的文章列表，避免残留的旧列表引用污染导航快照
    currentListArticlesRef.current = []
  }

  const handleSelectArticle = (article: Article) => {
    const list = currentListArticlesRef.current
    const idx = list.findIndex((a) => a.id === article.id)
    if (idx === -1) {
      setNavSnapshot([article])
      setNavIndex(0)
    } else {
      setNavSnapshot(list)
      setNavIndex(idx)
    }
    setSelectedArticle(article)
    setMobileView('reader')
  }

  const handleCloseArticle = () => {
    setSelectedArticle(null)
    setIsReaderExpanded(false)
    setMobileView('articles')
  }

  const handleToggleExpand = () => {
    setIsReaderExpanded(!isReaderExpanded)
  }

  const handleNavigate = async (direction: 1 | -1) => {
    const targetIndex = navIndex + direction
    if (targetIndex < 0 || targetIndex >= navSnapshot.length) return
    const target = navSnapshot[targetIndex]
    if (!target.isRead) {
      await markArticleRead(target.id)
      setNavSnapshot((prev) =>
        prev.map((a, i) => (i === targetIndex ? { ...a, isRead: true, readAt: Date.now() } : a))
      )
    }
    setSelectedArticle(target)
    setNavIndex(targetIndex)
  }

  const hasPrevArticle = navIndex > 0
  const hasNextArticle = navIndex >= 0 && navIndex < navSnapshot.length - 1

  // Mobile layout — bottom navigation
  if (isMobile) {
    const mobileNavItems = [
      { id: 'feeds' as const, icon: Rss, label: '订阅' },
      { id: 'articles' as const, icon: List, label: '文章' },
      { id: 'settings' as const, icon: Settings, label: '设置' },
    ]
    return (
      <>
      <div className="h-dvh flex flex-col bg-background">
        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {mobileView === 'feeds' && (
            <FeedList
              selectedFeedId={selectedFeedId}
              onSelectFeed={handleSelectFeed}
              onSelectSaved={handleSelectSaved}
              onSelectHighlights={handleSelectHighlights}
              view={view}
              feedErrors={feedErrors}
              onSetFeedError={handleSetFeedError}
              onClearFeedError={handleClearFeedError}
            />
          )}
          {mobileView === 'articles' && view === 'highlights' && (
            <HighlightsPanel onOpenArticle={handleSelectArticle} />
          )}
          {mobileView === 'articles' && view !== 'highlights' && (
            <ArticleList
              feedId={selectedFeedId}
              view={view}
              selectedArticleId={null}
              onSelectArticle={handleSelectArticle}
              refreshKey={articleListRefreshKey}
              onArticlesChange={(list) => { currentListArticlesRef.current = list }}
            />
          )}
          {mobileView === 'reader' && (
            <ArticleReader
              article={selectedArticle}
              onClose={handleCloseArticle}
              onNavigatePrev={() => handleNavigate(-1)}
              onNavigateNext={() => handleNavigate(1)}
              hasPrev={hasPrevArticle}
              hasNext={hasNextArticle}
            />
          )}
          {mobileView === 'settings' && (
            <div className="h-full overflow-y-auto p-4">
              <h2 className="font-semibold text-lg mb-4">设置</h2>
              <SettingsPanelContent />
            </div>
          )}
        </div>

        {/* Bottom navigation */}
        <nav className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="flex">
            {mobileNavItems.map(({ id, icon: Icon, label }) => {
              const active = mobileView === id
              return (
                <button
                  key={id}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 text-xs transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setMobileView(id)}
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              )
            })}
          </div>
        </nav>

        <OfflineIndicator />
      </div>
      <SplashScreen isVisible={!isAppReady} />
      </>
    )
  }

  // Tablet layout — two columns, full-screen reader overlay
  if (isTablet) {
    return (
      <>
      <div className="h-dvh flex bg-background overflow-hidden relative">
        {/* Left: Feed list */}
        <div className="shrink-0 h-full overflow-hidden" style={{ width: feedListWidth }}>
          <FeedList
            selectedFeedId={selectedFeedId}
            onSelectFeed={handleSelectFeed}
            onSelectSaved={handleSelectSaved}
            onSelectHighlights={handleSelectHighlights}
            view={view}
            feedErrors={feedErrors}
            onSetFeedError={handleSetFeedError}
            onClearFeedError={handleClearFeedError}
          />
        </div>

        {/* Resize handle */}
        <div
          className="h-full w-1 shrink-0 cursor-col-resize touch-none hover:bg-primary/40 active:bg-primary/60 transition-colors"
          onPointerDown={handleResizeStart}
        />

        {/* Right: Article list or Highlights */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {view === 'highlights' ? (
            <HighlightsPanel onOpenArticle={handleSelectArticle} />
          ) : (
            <ArticleList
              feedId={selectedFeedId}
              view={view}
              selectedArticleId={selectedArticle?.id || null}
              onSelectArticle={handleSelectArticle}
              refreshKey={articleListRefreshKey}
              onArticlesChange={(list) => { currentListArticlesRef.current = list }}
            />
          )}
        </div>

        {/* Full-screen reader overlay */}
        {selectedArticle && (
          <div className="absolute inset-0 z-50 bg-background animate-in slide-in-from-right duration-300">
            <ArticleReader
              article={selectedArticle}
              onClose={handleCloseArticle}
              onNavigatePrev={() => handleNavigate(-1)}
              onNavigateNext={() => handleNavigate(1)}
              hasPrev={hasPrevArticle}
              hasNext={hasNextArticle}
            />
          </div>
        )}

        <OfflineIndicator />
      </div>
      <SplashScreen isVisible={!isAppReady} />
      </>
    )
  }

  // Desktop layout - three columns with expandable reader
  return (
    <>
    <div className="h-dvh flex bg-background overflow-hidden">
      {/* Sidebar - feeds */}
      <div
        className={cn(
          'h-full shrink-0 transition-[width] duration-300 overflow-hidden',
          isReaderExpanded ? 'w-0' : ''
        )}
        style={isReaderExpanded ? undefined : { width: feedListWidth }}
      >
        <FeedList
          selectedFeedId={selectedFeedId}
          onSelectFeed={handleSelectFeed}
          onSelectSaved={handleSelectSaved}
          onSelectHighlights={handleSelectHighlights}
          view={view}
          feedErrors={feedErrors}
          onSetFeedError={handleSetFeedError}
          onClearFeedError={handleClearFeedError}
        />
      </div>

      {/* Resize handle */}
      {!isReaderExpanded && (
        <div
          className="h-full w-1 shrink-0 cursor-col-resize touch-none hover:bg-primary/40 active:bg-primary/60 transition-colors"
          onPointerDown={handleResizeStart}
        />
      )}

      {/* Middle - article list */}
      <div
        className={cn(
          'h-full shrink-0 transition-all duration-300 overflow-hidden',
          isReaderExpanded ? 'w-0' : 'w-80'
        )}
      >
        {view === 'highlights' ? (
          <HighlightsPanel onOpenArticle={handleSelectArticle} />
        ) : (
          <ArticleList
            feedId={selectedFeedId}
            view={view}
            selectedArticleId={selectedArticle?.id || null}
            onSelectArticle={handleSelectArticle}
            refreshKey={articleListRefreshKey}
            onArticlesChange={(list) => { currentListArticlesRef.current = list }}
          />
        )}
      </div>

      {/* Right - reader */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ArticleReader
          article={selectedArticle}
          isExpanded={isReaderExpanded}
          onToggleExpand={selectedArticle ? handleToggleExpand : undefined}
        />
      </div>

      <OfflineIndicator />
    </div>
    <SplashScreen isVisible={!isAppReady} />
    </>
  )
}
