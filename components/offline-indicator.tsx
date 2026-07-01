'use client'

import { WifiOff } from 'lucide-react'
import { useOffline } from '@/hooks/use-offline'

export function OfflineIndicator() {
  const isOffline = useOffline()

  if (!isOffline) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 shadow-lg bg-amber-500 text-amber-950">
      <WifiOff className="size-4" />
      <span className="text-sm font-medium">离线模式，仅浏览本地内容</span>
    </div>
  )
}
