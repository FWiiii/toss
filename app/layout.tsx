import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import * as React from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { VIEWPORT_THEME_COLORS } from '@/lib/design-tokens'
import './globals.css'

export const metadata: Metadata = {
  title: 'Toss - 跨设备传输',
  description: '简单快速的跨设备文件和文本传输工具',
  generator: 'H',
  other: {
    // Prevent Dark Reader from mutating SSR DOM before hydration.
    'darkreader-lock': '',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Toss',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [...VIEWPORT_THEME_COLORS],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
