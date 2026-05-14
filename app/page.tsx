'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FeedList } from '@/components/feed-list'
import { ArticleList } from '@/components/article-list'
import { ArticleReader } from '@/components/article-reader'
import { HighlightsPanel } from '@/components/highlights-panel'
import { OfflineIndicator } from '@/components/offline-indicator'
import { useIsMobile } from '@/hooks/use-mobile'
import { cleanupOldReadArticles } from '@/lib/db'
import type { Article } from '@/lib/types'

type View = 'all' | 'feed' | 'saved' | 'highlights'

export default function Home() {
  const isMobile = useIsMobile()

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
  const [showSidebar, setShowSidebar] = useState(false)
  const [isReaderExpanded, setIsReaderExpanded] = useState(false)

  // Reset mobile sidebar when switching views
  useEffect(() => {
    if (isMobile) {
      setShowSidebar(false)
    }
  }, [selectedArticle, isMobile])

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

  const handleSelectFeed = (feedId: string | null) => {
    setSelectedFeedId(feedId)
    setView(feedId ? 'feed' : 'all')
    setSelectedArticle(null)
    setIsReaderExpanded(false)
  }

  const handleSelectSaved = () => {
    setSelectedFeedId(null)
    setView('saved')
    setSelectedArticle(null)
    setIsReaderExpanded(false)
  }

  const handleSelectHighlights = () => {
    setSelectedFeedId(null)
    setView('highlights')
    setSelectedArticle(null)
    setIsReaderExpanded(false)
  }

  const handleSelectArticle = (article: Article) => {
    setSelectedArticle(article)
  }

  const handleCloseArticle = () => {
    setSelectedArticle(null)
    setIsReaderExpanded(false)
  }

  const handleToggleExpand = () => {
    setIsReaderExpanded(!isReaderExpanded)
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="h-dvh flex flex-col bg-background">
        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
            <h1 className="font-semibold">RSS Reader</h1>
          </div>
        </header>

        {/* Mobile content */}
        <div className="flex-1 relative overflow-hidden">
          {/* Sidebar overlay */}
          {showSidebar && (
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm z-30"
              onClick={() => setShowSidebar(false)}
            />
          )}

          {/* Sidebar */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-72 z-40 transition-transform duration-200',
              showSidebar ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <FeedList
              selectedFeedId={selectedFeedId}
              onSelectFeed={(id) => {
                handleSelectFeed(id)
                setShowSidebar(false)
              }}
              onSelectSaved={() => {
                handleSelectSaved()
                setShowSidebar(false)
              }}
              onSelectHighlights={() => {
                handleSelectHighlights()
                setShowSidebar(false)
              }}
              view={view}
            />
          </div>

          {/* Main content */}
          {selectedArticle ? (
            <ArticleReader article={selectedArticle} onClose={handleCloseArticle} />
          ) : view === 'highlights' ? (
            <HighlightsPanel onOpenArticle={handleSelectArticle} />
          ) : (
            <ArticleList
              feedId={selectedFeedId}
              view={view}
              selectedArticleId={null}
              onSelectArticle={handleSelectArticle}
            />
          )}
        </div>

        <OfflineIndicator />
      </div>
    )
  }

  // Desktop layout - three columns with expandable reader
  return (
    <div className="h-dvh flex bg-background overflow-hidden">
      {/* Sidebar - feeds */}
      <div
        className={cn(
          'h-full shrink-0 transition-all duration-300 overflow-hidden',
          isReaderExpanded ? 'w-0' : 'w-60'
        )}
      >
        <FeedList
          selectedFeedId={selectedFeedId}
          onSelectFeed={handleSelectFeed}
          onSelectSaved={handleSelectSaved}
          onSelectHighlights={handleSelectHighlights}
          view={view}
        />
      </div>

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
  )
}
