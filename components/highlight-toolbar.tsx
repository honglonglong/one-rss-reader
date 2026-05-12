'use client'

import { useEffect, useState, useRef } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { HighlightColor } from '@/lib/types'

const COLORS: { value: HighlightColor; bg: string; hover: string }[] = [
  { value: 'yellow', bg: 'bg-yellow-300', hover: 'hover:bg-yellow-400' },
  { value: 'green', bg: 'bg-green-300', hover: 'hover:bg-green-400' },
  { value: 'blue', bg: 'bg-blue-300', hover: 'hover:bg-blue-400' },
  { value: 'pink', bg: 'bg-pink-300', hover: 'hover:bg-pink-400' },
  { value: 'purple', bg: 'bg-purple-300', hover: 'hover:bg-purple-400' },
]

interface HighlightToolbarProps {
  position: { x: number; y: number } | null
  selectedText: string
  onHighlight: (color: HighlightColor, note?: string) => void
  onClose: () => void
}

export function HighlightToolbar({
  position,
  selectedText,
  onHighlight,
  onClose,
}: HighlightToolbarProps) {
  const [showNote, setShowNote] = useState(false)
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow')
  const [note, setNote] = useState('')
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close while the note popover is open
      if (showNote) return
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (position) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [position, showNote, onClose])

  const handleColorClick = (color: HighlightColor) => {
    setSelectedColor(color)
    if (!showNote) {
      onHighlight(color)
      onClose()
    }
  }

  const handleAddNote = () => {
    onHighlight(selectedColor, note.trim() || undefined)
    setNote('')
    setShowNote(false)
    onClose()
  }

  if (!position || !selectedText) return null

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-1 rounded-lg bg-popover p-1 shadow-lg border border-border"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      {COLORS.map((color) => (
        <button
          key={color.value}
          className={cn(
            'size-6 rounded-full transition-transform hover:scale-110',
            color.bg,
            color.hover,
            selectedColor === color.value && showNote && 'ring-2 ring-foreground ring-offset-2'
          )}
          onClick={() => handleColorClick(color.value)}
        />
      ))}
      
      <div className="w-px h-5 bg-border mx-1" />
      
      <Popover open={showNote} onOpenChange={setShowNote}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6">
            <MessageSquarePlus className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="center" side="top">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {"\"" + selectedText.slice(0, 50) + (selectedText.length > 50 ? '...' : '') + "\""}
            </p>
            <div className="flex gap-1">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  className={cn(
                    'size-5 rounded-full transition-transform hover:scale-110',
                    color.bg,
                    color.hover,
                    selectedColor === color.value && 'ring-2 ring-foreground ring-offset-1'
                  )}
                  onClick={() => setSelectedColor(color.value)}
                />
              ))}
            </div>
            <Input
              placeholder="添加批注..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddNote()
              }}
            />
            <Button size="sm" onClick={handleAddNote}>
              保存
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
