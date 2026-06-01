'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'articleListFontSize'
const DEFAULT_SIZE = 14
const MIN_SIZE = 10
const MAX_SIZE = 22
const EVENT_NAME = 'listFontSizeChange'

function clamp(value: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value))
}

function readFromStorage(): number {
  if (typeof window === 'undefined') return DEFAULT_SIZE
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const parsed = parseFloat(saved)
    if (!isNaN(parsed)) return clamp(parsed)
  }
  return DEFAULT_SIZE
}

export function useListFontSize() {
  const [listFontSize, setListFontSize] = useState<number>(DEFAULT_SIZE)

  useEffect(() => {
    setListFontSize(readFromStorage())

    const handler = (e: Event) => {
      const size = (e as CustomEvent<number>).detail
      setListFontSize(size)
    }
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
  }, [])

  const updateListFontSize = (size: number) => {
    const clamped = clamp(Math.round(size * 10) / 10)
    localStorage.setItem(STORAGE_KEY, String(clamped))
    window.dispatchEvent(new CustomEvent<number>(EVENT_NAME, { detail: clamped }))
  }

  return { listFontSize, updateListFontSize }
}
