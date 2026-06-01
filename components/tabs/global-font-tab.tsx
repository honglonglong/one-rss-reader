// GlobalFontTab: 全局界面字体设置 Tab
'use client'
import { useState, useEffect } from 'react'
import { Slider } from '../ui/slider'
import { Button } from '../ui/button'

// 可根据需要调整默认值和范围
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 22
const FONT_SIZE_STEP = 1
const DEFAULT_FONT_SIZE = 16

// 这里假设用 localStorage 存储全局字体大小，实际可用 IndexedDB
function getGlobalFontSize(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT_SIZE
  const v = localStorage.getItem('globalFontSize')
  return v ? parseInt(v, 10) : DEFAULT_FONT_SIZE
}
function setGlobalFontSize(size: number) {
  if (typeof window === 'undefined') return
  localStorage.setItem('globalFontSize', String(size))
  document.documentElement.style.fontSize = `${size}px`
}

export default function GlobalFontTab() {
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)

  useEffect(() => {
    const size = getGlobalFontSize()
    setFontSize(size)
    document.documentElement.style.fontSize = `${size}px`
  }, [])

  const handleChange = (value: number[]) => {
    const size = value[0]
    setFontSize(size)
    setGlobalFontSize(size)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="font-medium mb-2">界面字体大小</div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => handleChange([Math.max(FONT_SIZE_MIN, fontSize - 1)])}>-</Button>
        <Slider min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={FONT_SIZE_STEP} value={[fontSize]} onValueChange={handleChange} className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => handleChange([Math.min(FONT_SIZE_MAX, fontSize + 1)])}>+</Button>
        <span className="w-10 text-center">{fontSize}px</span>
      </div>
      <div className="text-xs text-muted-foreground">此设置仅影响界面（如订阅列表、文章列表等），不影响文章阅读区。</div>
    </div>
  )
}
