'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOffline, useServiceWorker } from '@/hooks/use-offline'
import { cn } from '@/lib/utils'

export function OfflineIndicator() {
  const isOffline = useOffline()
  const { updateAvailable, update } = useServiceWorker()

  if (!isOffline && !updateAvailable) return null

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 shadow-lg',
        isOffline ? 'bg-amber-500 text-amber-950' : 'bg-primary text-primary-foreground'
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="size-4" />
          <span className="text-sm font-medium">离线模式</span>
        </>
      ) : updateAvailable ? (
        <>
          <span className="text-sm font-medium">有新版本可用</span>
          <Button
            variant="secondary"
            size="sm"
            className="h-6 gap-1"
            onClick={update}
          >
            <RefreshCw className="size-3" />
            更新
          </Button>
        </>
      ) : null}
    </div>
  )
}
