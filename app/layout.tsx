import React from "react"
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Toss - 跨设备传输',
  description: '简单快速的跨设备文件和文本传输工具',
  generator: 'H',
  other: {
    // Prevent Dark Reader from mutating SSR DOM before hydration.
    "darkreader-lock": "",
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Toss',
  },
  icons: {
    icon: [
      { url: '/logo.svg', sizes: '192x192', type: 'image/svg' },
      { url: '/logo.svg', sizes: '512x512', type: 'image/svg' },
    ],
    apple: '/logo.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#171717',
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
