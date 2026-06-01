'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Rss,
  Trash2,
  RefreshCw,
  Bookmark,
  Home,
  MoreHorizontal,
  Loader2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  Edit2,
  StickyNote,
  Pencil,
  AlertCircle,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
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
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useFeeds } from '@/hooks/use-feeds'
import { useUnreadCounts } from '@/hooks/use-articles'
import { useServiceWorker } from '@/hooks/use-offline'
import { useListFontSize } from '@/hooks/use-list-font-size'
import { AddFeedDialog } from './add-feed-dialog'
import SettingsPanel from './settings-panel'
import { getAllGroups } from '@/lib/db'
import { toast } from 'sonner'
import type { Feed, FeedGroup } from '@/lib/types'

interface FeedListProps {
  selectedFeedId: string | null
  onSelectFeed: (feedId: string | null) => void
  onSelectSaved: () => void
  onSelectHighlights: () => void
  view: 'all' | 'feed' | 'saved' | 'highlights'
}

interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

/** Returns true if version string `a` is strictly greater than `b` (semver). */
function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

export function FeedList({ selectedFeedId, onSelectFeed, onSelectSaved, onSelectHighlights, view }: FeedListProps) {
  const { feeds, unsubscribe, refresh, setFeedGroup, editFeed, isLoading } = useFeeds()
  const unreadCounts = useUnreadCounts()
  const { update } = useServiceWorker()
  const { listFontSize } = useListFontSize()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Feed | null>(null)
  const [editTarget, setEditTarget] = useState<Feed | null>(null)
  const [refreshingFeedIds, setRefreshingFeedIds] = useState<Set<string>>(new Set())
  const [feedErrors, setFeedErrors] = useState<Map<string, string>>(new Map())
  const isRefreshing = refreshingFeedIds.size > 0
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__ungrouped__']))
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [updateChangelog, setUpdateChangelog] = useState<ChangelogEntry[]>([])

  const handleRefreshClick = async () => {
    setIsCheckingUpdate(true)
    try {
      // Use a timestamp query param to bypass the old SW's cache-first strategy.
      // `cache: 'no-store'` alone is insufficient because the SW intercepts
      // before the browser HTTP cache; a unique URL forces a network fetch.
      const res = await fetch(`/changelog.json?_=${Date.now()}`)
      const entries: ChangelogEntry[] = await res.json()
      const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
      if (entries.length > 0 && semverGt(entries[0].version, currentVersion)) {
        setUpdateChangelog(entries.filter((e) => semverGt(e.version, currentVersion)))
        setShowUpdateDialog(true)
      } else {
        toast.success('已是最新版本')
      }
    } catch {
      toast.error('检查更新失败，请检查网络连接')
    } finally {
      setIsCheckingUpdate(false)
    }
  }
  const [existingGroups, setExistingGroups] = useState<string[]>([])

  // 按分组整理订阅
  const groupedFeeds = useMemo(() => {
    const groups: FeedGroup[] = []
    const ungrouped: Feed[] = []
    const groupMap = new Map<string, Feed[]>()

    feeds.forEach((feed) => {
      if (feed.group) {
        const existing = groupMap.get(feed.group) || []
        existing.push(feed)
        groupMap.set(feed.group, existing)
      } else {
        ungrouped.push(feed)
      }
    })

    // 先添加分组
    groupMap.forEach((groupFeeds, name) => {
      groups.push({ name, feeds: groupFeeds })
    })

    // 排序分组
    groups.sort((a, b) => a.name.localeCompare(b.name))

    // 未分组的放最后
    if (ungrouped.length > 0) {
      groups.push({ name: '__ungrouped__', feeds: ungrouped })
    }

    return groups
  }, [feeds])

  const handleRefresh = async () => {
    const feedsSnapshot = [...feeds]
    if (feedsSnapshot.length === 0) return
    const queue = [...feedsSnapshot]
    let failCount = 0
    const worker = async () => {
      while (queue.length > 0) {
        const feed = queue.shift()!
        setRefreshingFeedIds((prev) => new Set([...prev, feed.id]))
        try {
          await refresh(feed.id)
          setFeedErrors((prev) => { const n = new Map(prev); n.delete(feed.id); return n })
        } catch (error) {
          failCount++
          const msg = error instanceof Error ? error.message : '刷新失败'
          setFeedErrors((prev) => new Map([...prev, [feed.id, msg]]))
        } finally {
          setRefreshingFeedIds((prev) => {
            const next = new Set(prev)
            next.delete(feed.id)
            return next
          })
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(2, feedsSnapshot.length) }, () => worker())
    )
    if (failCount === 0) {
      toast.success('已刷新所有订阅')
    } else if (failCount < feedsSnapshot.length) {
      toast.warning(`${failCount} 个订阅刷新失败`)
    } else {
      toast.error('所有订阅刷新失败')
    }
  }

  const handleRefreshRef = useRef<() => Promise<void>>(handleRefresh)
  handleRefreshRef.current = handleRefresh

  useEffect(() => {
    const id = setInterval(() => { handleRefreshRef.current() }, 3_600_000)
    return () => clearInterval(id)
  }, [])

  const handleSelectFeedItem = (feedId: string) => {
    onSelectFeed(feedId)
    setRefreshingFeedIds((prev) => new Set([...prev, feedId]))
    refresh(feedId)
      .then((didRefresh) => {
        setFeedErrors((prev) => { const n = new Map(prev); n.delete(feedId); return n })
        if (didRefresh) toast.success('已刷新')
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : '刷新失败'
        setFeedErrors((prev) => new Map([...prev, [feedId, msg]]))
        toast.error('刷新失败')
      })
      .finally(() =>
        setRefreshingFeedIds((prev) => {
          const next = new Set(prev)
          next.delete(feedId)
          return next
        })
      )
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await unsubscribe(deleteTarget.id)
      toast.success(`已取消订阅: ${deleteTarget.title}`)
      if (selectedFeedId === deleteTarget.id) {
        onSelectFeed(null)
      }
    } catch (error) {
      toast.error('取消订阅失败')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleMoveToGroup = async (feed: Feed, newGroup: string | undefined) => {
    await setFeedGroup(feed.id, newGroup)
    toast.success(newGroup ? `已移动到「${newGroup}」` : '已移出分组')
  }

  const handleEditSave = async (id: string, updates: Partial<Pick<Feed, 'title' | 'url' | 'group'>>) => {
    await editFeed(id, updates)
    toast.success('已更新订阅')
    setEditTarget(null)
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  const loadGroups = async () => {
    const groups = await getAllGroups()
    setExistingGroups(groups)
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <h2 className="font-semibold text-sidebar-foreground">订阅</h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 lg:size-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('size-5 lg:size-4', isRefreshing && 'animate-spin')} />
          </Button>
          <AddFeedDialog
            trigger={
              <Button variant="ghost" size="icon" className="size-10 lg:size-8">
                <Plus className="size-5 lg:size-4" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex size-10 lg:size-8"
            title="设置"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-5 lg:size-4" />
          </Button>
          <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2" style={{ fontSize: `${listFontSize}px` }}>
          <Button
            variant={view === 'all' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2 mb-1 text-[1em]"
            onClick={() => onSelectFeed(null)}
          >
            <Home className="size-4" />
            所有文章
          </Button>
          <Button
            variant={view === 'highlights' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2 mb-1 text-[1em]"
            onClick={onSelectHighlights}
          >
            <StickyNote className="size-4" />
            标记与笔记
          </Button>
          <Button
            variant={view === 'saved' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2 mb-2 text-[1em]"
            onClick={onSelectSaved}
          >
            <Bookmark className="size-4" />
            收藏
          </Button>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : feeds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-[1em]">
              <p>暂无订阅</p>
              <p className="mt-1">点击上方按钮添加</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {groupedFeeds.map((group) => (
                <FeedGroupItem
                  key={group.name}
                  group={group}
                  isExpanded={expandedGroups.has(group.name)}
                  onToggle={() => toggleGroup(group.name)}
                  selectedFeedId={selectedFeedId}
                  view={view}
                  onSelectFeed={handleSelectFeedItem}
                  onDelete={setDeleteTarget}
                  onMoveToGroup={handleMoveToGroup}
                  existingGroups={existingGroups}
                  onLoadGroups={loadGroups}
                  onEdit={setEditTarget}
                  unreadCounts={unreadCounts}
                  refreshingFeedIds={refreshingFeedIds}
                  feedErrors={feedErrors}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="px-4 py-2 border-t border-sidebar-border shrink-0 flex items-center gap-1">
        <p className="text-xs text-muted-foreground/60">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        <button
          onClick={handleRefreshClick}
          disabled={isCheckingUpdate}
          className="p-1.5 text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors disabled:opacity-50"
          title="检查更新"
        >
          {isCheckingUpdate
            ? <Loader2 className="size-3 animate-spin" />
            : <RefreshCw className="size-3" />}
        </button>
      </div>

      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>发现新版本</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-4 py-2">
            {updateChangelog.length > 0 ? (
              updateChangelog.map((entry) => (
                <div key={entry.version}>
                  <p className="text-sm font-medium mb-1">v{entry.version} <span className="text-xs text-muted-foreground font-normal">{entry.date}</span></p>
                  <ul className="text-sm text-muted-foreground space-y-0.5 list-disc list-inside">
                    {entry.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">有新版本可用，升级后应用将重新加载。</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>取消</Button>
            <Button onClick={() => { setShowUpdateDialog(false); update(); window.location.reload() }}>升级并重启</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消订阅</AlertDialogTitle>
            <AlertDialogDescription>
              确定要取消订阅「{deleteTarget?.title}」吗？相关文章也将被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editTarget && (
        <EditFeedDialog
          feed={editTarget}
          existingGroups={existingGroups}
          onSave={(updates) => handleEditSave(editTarget.id, updates)}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

interface FeedGroupItemProps {
  group: FeedGroup
  isExpanded: boolean
  onToggle: () => void
  selectedFeedId: string | null
  view: string
  onSelectFeed: (feedId: string) => void
  onDelete: (feed: Feed) => void
  onMoveToGroup: (feed: Feed, group: string | undefined) => void
  existingGroups: string[]
  onLoadGroups: () => void
  onEdit: (feed: Feed) => void
  unreadCounts: Record<string, number>
  refreshingFeedIds: Set<string>
  feedErrors: Map<string, string>
}

function FeedGroupItem({
  group,
  isExpanded,
  onToggle,
  selectedFeedId,
  view,
  onSelectFeed,
  onDelete,
  onMoveToGroup,
  existingGroups,
  onLoadGroups,
  onEdit,
  unreadCounts,
  refreshingFeedIds,
  feedErrors,
}: FeedGroupItemProps) {
  const isUngrouped = group.name === '__ungrouped__'

  if (isUngrouped) {
    return (
      <>
        {group.feeds.map((feed) => (
          <FeedItem
            key={feed.id}
            feed={feed}
            isSelected={selectedFeedId === feed.id && view === 'feed'}
            onSelect={() => onSelectFeed(feed.id)}
            onDelete={() => onDelete(feed)}
            onMoveToGroup={(g) => onMoveToGroup(feed, g)}
            existingGroups={existingGroups}
            onLoadGroups={onLoadGroups}              onEdit={() => onEdit(feed)}          unreadCount={unreadCounts[feed.id] || 0}
            isRefreshing={refreshingFeedIds.has(feed.id)}
            errorMessage={feedErrors.get(feed.id)}
          />
        ))}
      </>
    )
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent text-[1em] text-sidebar-foreground">
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-4 text-muted-foreground" />
          ) : (
            <Folder className="size-4 text-muted-foreground" />
          )}
          <span className="flex-1 text-left truncate">{group.name}</span>
          {(() => {
            const total = group.feeds.reduce((sum, f) => sum + (unreadCounts[f.id] || 0), 0)
            return total > 0 ? (
              <span className="min-w-[1.25rem] rounded-full bg-primary px-1 py-0.5 text-center text-[10px] font-medium leading-none text-primary-foreground">
                {total > 99 ? '99+' : total}
              </span>
            ) : (
              <span className="text-[0.75em] text-muted-foreground">{group.feeds.length}</span>
            )
          })()}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
          {group.feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              isSelected={selectedFeedId === feed.id && view === 'feed'}
              onSelect={() => onSelectFeed(feed.id)}
              onDelete={() => onDelete(feed)}
              onMoveToGroup={(g) => onMoveToGroup(feed, g)}
              existingGroups={existingGroups}
              onLoadGroups={onLoadGroups}
              onEdit={() => onEdit(feed)}
              unreadCount={unreadCounts[feed.id] || 0}
              isRefreshing={refreshingFeedIds.has(feed.id)}
              errorMessage={feedErrors.get(feed.id)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface FeedItemProps {
  feed: Feed
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onMoveToGroup: (group: string | undefined) => void
  existingGroups: string[]
  onLoadGroups: () => void
  onEdit: () => void
  unreadCount: number
  isRefreshing?: boolean
  errorMessage?: string
}

function FeedItem({
  feed,
  isSelected,
  onSelect,
  onDelete,
  onMoveToGroup,
  existingGroups,
  onLoadGroups,
  onEdit,
  unreadCount,
  isRefreshing,
  errorMessage,
}: FeedItemProps) {
  const [newGroupInput, setNewGroupInput] = useState('')
  const [showNewGroupInput, setShowNewGroupInput] = useState(false)
  const [faviconError, setFaviconError] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-sidebar-accent',
        isSelected && 'bg-sidebar-accent'
      )}
      onClick={onSelect}
    >
      {isRefreshing ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
      ) : errorMessage ? (
        <AlertCircle className="size-4 text-destructive shrink-0" />
      ) : feed.favicon && !faviconError ? (
        <img
          src={feed.favicon}
          alt=""
          className="size-4 rounded-sm object-cover shrink-0"
          onError={() => setFaviconError(true)}
        />
      ) : (
        <Rss className="size-4 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 truncate text-[1em] text-sidebar-foreground">
        {feed.title}
      </span>
      {unreadCount > 0 && (
        <span className="ml-auto mr-1 min-w-[1.25rem] rounded-full bg-primary px-1 py-0.5 text-center text-[10px] font-medium leading-none text-primary-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      <DropdownMenu onOpenChange={(open) => open && onLoadGroups()}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 lg:size-6 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {errorMessage && (
            <>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowErrorDialog(true)}
              >
                <AlertCircle className="size-4 mr-2" />
                查看错误详情
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4 mr-2" />
            编辑订阅
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4 mr-2" />
            取消订阅
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {errorMessage && showErrorDialog && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowErrorDialog(false) }}>
          <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="size-4" />
                刷新失败
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground break-all">{errorMessage}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowErrorDialog(false)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

interface EditFeedDialogProps {
  feed: Feed
  existingGroups: string[]
  onSave: (updates: Partial<Pick<Feed, 'title' | 'url' | 'group'>>) => void
  onClose: () => void
}

function EditFeedDialog({ feed, existingGroups, onSave, onClose }: EditFeedDialogProps) {
  const [title, setTitle] = useState(feed.title)
  const [url, setUrl] = useState(feed.url)
  const [group, setGroup] = useState(feed.group || '')
  const [newGroupInput, setNewGroupInput] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)

  const handleSave = () => {
    const trimmedTitle = title.trim()
    const trimmedUrl = url.trim()
    if (!trimmedTitle || !trimmedUrl) return
    const finalGroup = showNewGroup
      ? newGroupInput.trim() || undefined
      : group || undefined
    onSave({ title: trimmedTitle, url: trimmedUrl, group: finalGroup })
  }

  const allGroups = Array.from(new Set([...existingGroups, ...(feed.group ? [feed.group] : [])]))

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑订阅</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-title">标题</Label>
            <Input
              id="feed-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="订阅标题"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-url">订阅 URL</Label>
            <Input
              id="feed-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>分组</Label>
            {!showNewGroup ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  <option value="">无分组</option>
                  {allGroups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => { setShowNewGroup(true); setGroup('') }}>
                  新建分组
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="新分组名称"
                  value={newGroupInput}
                  onChange={(e) => setNewGroupInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setShowNewGroup(false)}
                />
                <Button variant="outline" size="sm" onClick={() => setShowNewGroup(false)}>
                  取消
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={!title.trim() || !url.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
