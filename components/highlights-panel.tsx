'use client'

import { useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Trash2, ExternalLink, Edit2, Check, X, Loader2, StickyNote, RotateCcw, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useAllHighlightsWithArticles, useTrashHighlights, type HighlightWithArticle } from '@/hooks/use-highlights'
import { toast } from 'sonner'
import type { Article, HighlightColor } from '@/lib/types'

interface HighlightsPanelProps {
  onOpenArticle: (article: Article) => void
}

const colorMap: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-200 dark:bg-yellow-800/50',
  green: 'bg-green-200 dark:bg-green-800/50',
  blue: 'bg-blue-200 dark:bg-blue-800/50',
  pink: 'bg-pink-200 dark:bg-pink-800/50',
  purple: 'bg-purple-200 dark:bg-purple-800/50',
}

export function HighlightsPanel({ onOpenArticle }: HighlightsPanelProps) {
  const { highlightsWithArticles, isLoading, editHighlight, removeHighlight } =
    useAllHighlightsWithArticles()
  const { trashItems, isLoading: trashLoading, restore, permanentlyDelete, emptyAllTrash } =
    useTrashHighlights()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [activeTab, setActiveTab] = useState<'active' | 'trash'>('active')
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)

  // Group highlights by article, sorted by most recent highlight
  const groupedByArticle = useMemo(() => {
    const groups = new Map<
      string,
      { article: Article | undefined; highlights: HighlightWithArticle[] }
    >()
    for (const item of highlightsWithArticles) {
      const key = item.articleId
      if (!groups.has(key)) {
        groups.set(key, { article: item.article, highlights: [] })
      }
      groups.get(key)!.highlights.push(item)
    }
    return Array.from(groups.values()).sort((a, b) => {
      const aDate = a.highlights[a.highlights.length - 1]?.createdAt ?? 0
      const bDate = b.highlights[b.highlights.length - 1]?.createdAt ?? 0
      return bDate - aDate
    })
  }, [highlightsWithArticles])

  const handleStartEdit = (h: HighlightWithArticle) => {
    setEditingId(h.id)
    setEditNote(h.note || '')
  }

  const handleSaveEdit = async (h: HighlightWithArticle) => {
    await editHighlight(h.id, { note: editNote.trim() || undefined })
    setEditingId(null)
    toast.success('笔记已保存')
  }

  const handleDelete = async (id: string) => {
    await removeHighlight(id)
    toast.success('已移至废纸篓')
  }

  const handleRestore = async (id: string) => {
    await restore(id)
    toast.success('已恢复标记')
  }

  const handlePermanentlyDelete = async (id: string) => {
    await permanentlyDelete(id)
    toast.success('已永久删除')
  }

  const handleEmptyTrash = async () => {
    await emptyAllTrash()
    setConfirmEmptyTrash(false)
    toast.success('废纸篓已清空')
  }

  if (isLoading || trashLoading) {
    return (
      <div className="flex h-full items-center justify-center border-r border-border">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="border-b border-border px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">标记与笔记</h2>
          {activeTab === 'trash' && trashItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive px-2"
              onClick={() => setConfirmEmptyTrash(true)}
            >
              <Trash className="size-3 mr-1" />
              清空废纸篓
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <button
            className={cn(
              'px-3 py-1.5 text-sm rounded-t-md border-b-2 transition-colors',
              activeTab === 'active'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('active')}
          >
            标记
            {highlightsWithArticles.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{highlightsWithArticles.length}</span>
            )}
          </button>
          <button
            className={cn(
              'px-3 py-1.5 text-sm rounded-t-md border-b-2 transition-colors',
              activeTab === 'trash'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('trash')}
          >
            废纸篓
            {trashItems.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{trashItems.length}</span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'active' && highlightsWithArticles.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <StickyNote className="mx-auto mb-2 size-8 opacity-40" />
            <p className="text-sm">暂无标记与笔记</p>
            <p className="mt-1 text-xs">在文章中选中文字可添加标记</p>
          </div>
        </div>
      )}

      {activeTab === 'active' && highlightsWithArticles.length > 0 && (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-3">
            {groupedByArticle.map(({ article, highlights }) => (
              <div
                key={highlights[0].articleId}
                className="overflow-hidden rounded-lg border border-border"
              >
                {/* Article header */}
                <div className="flex items-start justify-between gap-2 bg-muted/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">
                      {article?.feedTitle ?? '未知来源'}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">
                      {article?.title ?? '未知文章'}
                    </p>
                  </div>
                  {article && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 size-7 shrink-0"
                      onClick={() => onOpenArticle(article)}
                      title="打开文章"
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  )}
                </div>

                {/* Highlights */}
                <div className="divide-y divide-border">
                  {highlights.map((h) => (
                    <div key={h.id} className="p-3">
                      <div className={cn('mb-2 rounded px-2 py-1 text-sm', colorMap[h.color])}>
                        {h.text}
                      </div>

                      {editingId === h.id ? (
                        <div className="flex flex-col gap-1.5">
                          <Textarea
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="添加笔记..."
                            className="min-h-[60px] resize-none text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                handleSaveEdit(h)
                              }
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setEditingId(null)}
                              title="取消"
                            >
                              <X className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleSaveEdit(h)}
                              title="保存 (Ctrl+Enter)"
                            >
                              <Check className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {h.note && (
                            <p className="mb-2 text-xs italic text-muted-foreground">
                              &ldquo;{h.note}&rdquo;
                            </p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(h.createdAt, { addSuffix: true, locale: zhCN })}
                            </span>
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() => handleStartEdit(h)}
                                title={h.note ? '编辑笔记' : '添加笔记'}
                              >
                                <Edit2 className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(h.id)}
                                title="移至废纸篓"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Trash tab content */}
      {activeTab === 'trash' && trashItems.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Trash className="mx-auto mb-2 size-8 opacity-40" />
            <p className="text-sm">废纸篓为空</p>
          </div>
        </div>
      )}

      {activeTab === 'trash' && trashItems.length > 0 && (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-3">
            {trashItems.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-3 opacity-75">
                <p className="mb-1 text-xs text-muted-foreground truncate">
                  {h.article?.title ?? '未知文章'}
                </p>
                <div className={cn('mb-2 rounded px-2 py-1 text-sm', colorMap[h.color])}>
                  {h.text}
                </div>
                {h.note && (
                  <p className="mb-2 text-xs italic text-muted-foreground">
                    &ldquo;{h.note}&rdquo;
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {h.deletedAt
                      ? formatDistanceToNow(h.deletedAt, { addSuffix: true, locale: zhCN })
                      : ''}
                  </span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => handleRestore(h.id)}
                      title="恢复标记"
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive hover:text-destructive"
                      onClick={() => handlePermanentlyDelete(h.id)}
                      title="永久删除"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <AlertDialog open={confirmEmptyTrash} onOpenChange={setConfirmEmptyTrash}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空废纸篓</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除废纸篓中的 {trashItems.length} 条标记，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleEmptyTrash}
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
