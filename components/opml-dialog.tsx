'use client'

import { useState, useRef } from 'react'
import { Upload, Download, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFeeds } from '@/hooks/use-feeds'
import { parseOPML, downloadOPML } from '@/lib/opml'
import { toast } from 'sonner'
import type { OPMLOutline } from '@/lib/types'

interface OPMLDialogProps {
  trigger?: React.ReactNode
  asPanel?: boolean
}

export function OPMLDialog({ trigger, asPanel }: OPMLDialogProps) {
  const [open, setOpen] = useState(false)
  const [importItems, setImportItems] = useState<OPMLOutline[]>([])
  const [importResults, setImportResults] = useState<{ url: string; success: boolean; error?: string }[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { feeds, subscribe } = useFeeds()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const items = parseOPML(text)
      setImportItems(items)
      setImportResults([])
      toast.success(`解析成功，共 ${items.length} 个订阅源`)
    } catch (error) {
      toast.error('OPML 文件解析失败')
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (importItems.length === 0) return

    setIsImporting(true)
    setImportResults([])

    const results: { url: string; success: boolean; error?: string }[] = []

    for (const item of importItems) {
      try {
        await subscribe(item.xmlUrl)
        results.push({ url: item.xmlUrl, success: true })
      } catch (error) {
        results.push({
          url: item.xmlUrl,
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        })
      }
      setImportResults([...results])
    }

    setIsImporting(false)

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    if (failCount === 0) {
      toast.success(`成功导入 ${successCount} 个订阅`)
    } else {
      toast.warning(`导入完成: ${successCount} 成功, ${failCount} 失败`)
    }
  }

  const handleExport = () => {
    if (feeds.length === 0) {
      toast.error('暂无订阅可导出')
      return
    }
    downloadOPML(feeds)
    toast.success('OPML 导出成功')
  }

  const content = (
    <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import" className="gap-2">
              <Upload className="size-4" />
              导入
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <Download className="size-4" />
              导出
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="flex flex-col gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full h-24 border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  点击选择 OPML 文件
                </span>
              </div>
            </Button>

            {importItems.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground">
                  共 {importItems.length} 个订阅源
                </div>
                <ScrollArea className="h-48 rounded-md border">
                  <div className="p-2 flex flex-col gap-1">
                    {importItems.map((item, i) => {
                      const result = importResults.find((r) => r.url === item.xmlUrl)
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted"
                        >
                          {result ? (
                            result.success ? (
                              <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="size-4 text-destructive shrink-0" />
                            )
                          ) : isImporting ? (
                            <Loader2 className="size-4 animate-spin shrink-0" />
                          ) : (
                            <FileText className="size-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate">{item.title}</span>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || importResults.length === importItems.length}
                >
                  {isImporting && <Loader2 className="size-4 animate-spin mr-2" />}
                  {importResults.length === importItems.length
                    ? '导入完成'
                    : isImporting
                    ? '导入中...'
                    : '开始导入'}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="export" className="flex flex-col gap-4">
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium mb-1">当前订阅</div>
              <div className="text-2xl font-bold">{feeds.length}</div>
              <div className="text-xs text-muted-foreground mt-1">
                个 RSS 订阅源
              </div>
            </div>

            {feeds.length > 0 && (
              <ScrollArea className="h-32 rounded-md border">
                <div className="p-2 flex flex-col gap-1">
                  {feeds.map((feed) => (
                    <div
                      key={feed.id}
                      className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted"
                    >
                      {feed.favicon ? (
                        <img src={feed.favicon} alt="" className="size-4 rounded" />
                      ) : (
                        <FileText className="size-4 text-muted-foreground" />
                      )}
                      <span className="truncate">{feed.title}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <Button onClick={handleExport} disabled={feeds.length === 0}>
              <Download className="size-4 mr-2" />
              导出 OPML
            </Button>
          </TabsContent>
        </Tabs>
  )

  if (asPanel) {
    return content
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="size-4" />
            OPML
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>OPML 导入/导出</DialogTitle>
          <DialogDescription>
            导入或导出你的订阅列表
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
