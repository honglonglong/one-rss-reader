'use client'

import { useEffect } from 'react'
import { useUnreadCounts } from '@/hooks/use-articles'

export function useAppBadge() {
  const counts = useUnreadCounts()

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

    if (total > 0) {
      navigator.setAppBadge(total)
    } else {
      navigator.clearAppBadge()
    }
  }, [counts])
}
