'use client'

import { useState, useEffect } from 'react'
import { Rss, Loader2, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFeeds } from '@/hooks/use-feeds'
import { getAllGroups } from '@/lib/db'
import { toast } from 'sonner'

interface AddFeedDialogProps {
  trigger?: React.ReactNode
}

export function AddFeedDialog({ trigger }: AddFeedDialogProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [group, setGroup] = useState<string>('')
  const [newGroup, setNewGroup] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [existingGroups, setExistingGroups] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { subscribe } = useFeeds()

  useEffect(() => {
    if (open) {
      getAllGroups().then(setExistingGroups)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsLoading(true)
    try {
      const selectedGroup = showNewGroup ? newGroup.trim() : group
      const feed = await subscribe(url.trim(), selectedGroup || undefined)
      toast.success(`已订阅: ${feed.title}`)
      setUrl('')
      setGroup('')
      setNewGroup('')
      setShowNewGroup(false)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '订阅失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-2">
            <Rss className="size-4" />
            添加订阅
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加 RSS 订阅</DialogTitle>
          <DialogDescription>
            输入 RSS 订阅源的 URL 地址
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="url">RSS 地址</Label>
            <Input
              id="url"
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              type="url"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <Label>分组（可选）</Label>
            {showNewGroup ? (
              <div className="flex gap-2">
                <Input
                  placeholder="输入新分组名称"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setShowNewGroup(false)
                    setNewGroup('')
                  }}
                >
                  <Plus className="size-4 rotate-45" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={group} onValueChange={setGroup}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择分组" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">无分组</SelectItem>
                    {existingGroups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNewGroup(true)}
                  title="新建分组"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={isLoading || !url.trim()}>
              {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
              订阅
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
