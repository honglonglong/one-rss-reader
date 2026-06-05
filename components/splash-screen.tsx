'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface SplashScreenProps {
  isVisible: boolean
}

export function SplashScreen({ isVisible }: SplashScreenProps) {
  const [shouldRender, setShouldRender] = useState(true)

  useEffect(() => {
    if (isVisible) setShouldRender(true)
  }, [isVisible])

  if (!shouldRender) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onTransitionEnd={() => {
        if (!isVisible) setShouldRender(false)
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt="One Reader"
        width={80}
        height={80}
        className="rounded-2xl"
      />
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">One Reader</h1>
        <p className="text-sm text-muted-foreground">一个阅读器</p>
      </div>
      <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}
