'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import GlobalFontTab from './tabs/global-font-tab'
import OPMLTab from './tabs/opml-tab'
import SyncTab from './tabs/sync-tab'
import HelpTab from './tabs/help-tab'

export type SettingsTab = 'global-font' | 'import-export' | 'sync' | 'help'

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: SettingsTab
}

export default function SettingsPanel({ open, onOpenChange, defaultTab = 'global-font' }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>(defaultTab)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-full sm:max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">应用设置面板</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="global-font">界面字体</TabsTrigger>
            <TabsTrigger value="import-export">OPML</TabsTrigger>
            <TabsTrigger value="sync">同步</TabsTrigger>
            <TabsTrigger value="help">帮助</TabsTrigger>
          </TabsList>
          <TabsContent value="global-font"><GlobalFontTab /></TabsContent>
          <TabsContent value="import-export"><OPMLTab /></TabsContent>
          <TabsContent value="sync"><SyncTab /></TabsContent>
          <TabsContent value="help"><HelpTab /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
