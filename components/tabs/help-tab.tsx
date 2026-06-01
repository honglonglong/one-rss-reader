// HelpTab: 使用说明 Tab
'use client'
import { Separator } from '../ui/separator'
import { ScrollArea } from '../ui/scroll-area'

export default function HelpTab() {
  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-4 text-sm p-1">
        <div>
          <p className="text-lg font-semibold mb-2">📥订阅管理</p>
          <ul className="space-y-2">
            <li className="pl-6">
              <p className="font-medium">添加与管理订阅</p>
              <p className="text-xs text-muted-foreground">RSS 图标添加订阅，三点菜单编辑 / 删除 / 移入分组，↻ 图标刷新全部订阅。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">智能刷新</p>
              <p className="text-xs text-muted-foreground">每个订阅的刷新将根据新文章的频率智能错开，以避免对服务器造成过大压力。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">OPML 导入 / 导出</p>
              <p className="text-xs text-muted-foreground">在设置面板 OPML 标签页批量导入或导出订阅列表（.opml 格式），方便迁移与备份。</p>
            </li>
          </ul>
        </div>

        <Separator />

        <div>
          <p className="text-lg font-semibold mb-2">📖阅读体验</p>
          <ul className="space-y-2">
            <li className="pl-6">
              <p className="font-medium">文章阅读</p>
              <p className="text-xs text-muted-foreground">点击文章自动标记已读，眼睛图标切换隐藏 / 显示已读，列表显示估算阅读时间。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">全屏阅读</p>
              <p className="text-xs text-muted-foreground">阅读器右上角方形按钮可全屏展开，按 ESC 退出。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">收藏</p>
              <p className="text-xs text-muted-foreground">书签图标收藏文章，收藏内容离线可读且不自动清理。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">阅读设置</p>
              <p className="text-xs text-muted-foreground">阅读器右上角齿轮图标可调整主题（亮色 / 暗色 / 米黄）、字体大小、行距、最大阅读宽度。界面字体大小在本设置面板调整。</p>
            </li>
          </ul>
        </div>

        <Separator />

        <div>
          <p className="text-lg font-semibold mb-2">✏️标注与导出</p>
          <ul className="space-y-2">
            <li className="pl-6">
              <p className="font-medium">标记与笔记</p>
              <p className="text-xs text-muted-foreground">阅读时选中文字可高亮（5 种颜色）或添加笔记，所有标记在「标记与笔记」面板汇总查看。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">导出 Markdown</p>
              <p className="text-xs text-muted-foreground">阅读器内可将文章（含标注）一键导出为 .md 文件，适合导入 Obsidian 等笔记工具。</p>
            </li>
          </ul>
        </div>

        <Separator />

        <div>
          <p className="text-lg font-semibold mb-2">☁️数据与同步</p>
          <ul className="space-y-2">
            <li className="pl-6">
              <p className="font-medium">隐私安全</p>
              <p className="text-xs text-muted-foreground">无服务器，所有数据存储在本地浏览器（IndexedDB），完全由你掌控，不上传到任何第三方。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">同步与备份</p>
              <p className="text-xs text-muted-foreground">在设置面板同步标签页下载本地备份 JSON；或配置 GitHub Gist / WebDAV / S3 云同步。云同步为精简模式，只同步最近 90 天的文章状态，保持文件体积小。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">离线阅读</p>
              <p className="text-xs text-muted-foreground">PWA 应用，可安装到主屏幕，已收藏文章支持完全离线访问。</p>
            </li>
            <li className="pl-6">
              <p className="font-medium">自动清理</p>
              <p className="text-xs text-muted-foreground">30 天前的已读文章每天自动清理；也可点击文章列表右上角垃圾桶立即清理。</p>
            </li>
          </ul>
        </div>
      </div>
    </ScrollArea>
  )
}
