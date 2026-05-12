import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Noto_Serif_SC } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif',
})

export const metadata: Metadata = {
  title: 'RSS Reader - 离线阅读器',
  description: '一个支持离线阅读、高亮批注、Markdown 导出的 RSS 阅读器',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RSS Reader',
  },
  icons: {
    icon: '/icons/icon-512.jpg',
    apple: '/icons/icon-512.jpg',
  },
}

export const viewport: Viewport = {
  themeColor: '#18181b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
