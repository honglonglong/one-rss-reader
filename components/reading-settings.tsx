'use client'

import { Settings, Sun, Moon, Type, Minus, Plus } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useReadingSettings } from '@/hooks/use-reading-settings'

export function ReadingSettings() {
  const { settings, updateSettings } = useReadingSettings()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 lg:size-8">
          <Settings className="size-8 lg:size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">主题</Label>
            <ToggleGroup
              type="single"
              value={settings.theme}
              onValueChange={(value) => {
                if (value) updateSettings({ theme: value as 'light' | 'dark' | 'sepia' })
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="light" className="gap-1">
                <Sun className="size-3" />
                亮色
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" className="gap-1">
                <Moon className="size-3" />
                暗色
              </ToggleGroupItem>
              <ToggleGroupItem value="sepia" className="gap-1">
                <div className="size-3 rounded-full bg-amber-100 border border-amber-200" />
                米黄
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">字体</Label>
            <ToggleGroup
              type="single"
              value={settings.fontFamily}
              onValueChange={(value) => {
                if (value) updateSettings({ fontFamily: value as 'sans' | 'serif' })
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="sans" className="font-sans">
                无衬线
              </ToggleGroupItem>
              <ToggleGroupItem value="serif" className="font-serif">
                衬线
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">字号</Label>
              <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                onClick={() => updateSettings({ fontSize: Math.max(14, settings.fontSize - 2) })}
              >
                <Minus className="size-3" />
              </Button>
              <Slider
                value={[settings.fontSize]}
                min={14}
                max={24}
                step={2}
                onValueChange={([value]) => updateSettings({ fontSize: value })}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                onClick={() => updateSettings({ fontSize: Math.min(24, settings.fontSize + 2) })}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">行高</Label>
              <span className="text-xs text-muted-foreground">{settings.lineHeight}</span>
            </div>
            <Slider
              value={[settings.lineHeight]}
              min={1.4}
              max={2.2}
              step={0.1}
              onValueChange={([value]) => updateSettings({ lineHeight: value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">最大宽度</Label>
              <span className="text-xs text-muted-foreground">{settings.maxWidth}px</span>
            </div>
            <Slider
              value={[settings.maxWidth]}
              min={480}
              max={900}
              step={20}
              onValueChange={([value]) => updateSettings({ maxWidth: value })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
