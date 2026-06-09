'use client'

import { useEffect, useRef, useState } from 'react'
import { CloudCheck } from 'lucide-react'

const CLOUD_SYNC_SUCCESS_EVENT = 'cloud-sync-success'
const VISIBLE_MS = 1100
const EXIT_MS = 180

export function showCloudSyncSuccessIndicator() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CLOUD_SYNC_SUCCESS_EVENT))
}

export function CloudSyncSuccessIndicator() {
  const [isMounted, setIsMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const clearTimers = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }

    const handleShow = () => {
      clearTimers()
      setIsMounted(true)
      frameRef.current = window.requestAnimationFrame(() => {
        setIsVisible(true)
      })
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        exitTimerRef.current = setTimeout(() => {
          setIsMounted(false)
        }, EXIT_MS)
      }, VISIBLE_MS)
    }

    window.addEventListener(CLOUD_SYNC_SUCCESS_EVENT, handleShow)

    return () => {
      window.removeEventListener(CLOUD_SYNC_SUCCESS_EVENT, handleShow)
      clearTimers()
    }
  }, [])

  if (!isMounted) return null

  return (
    <div
      className={[
        'pointer-events-none fixed left-1/2 top-5 z-[110] -translate-x-1/2 transition-all duration-200 ease-out',
        isVisible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-95 opacity-0',
      ].join(' ')}
      aria-hidden="true"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/80 bg-white/95 text-emerald-600 shadow-lg shadow-emerald-500/20 ring-1 ring-white/70 backdrop-blur-sm dark:border-emerald-400/20 dark:bg-emerald-950/85 dark:text-emerald-300 dark:ring-emerald-400/10">
        <CloudCheck className="size-5" strokeWidth={2.25} />
      </div>
    </div>
  )
}
