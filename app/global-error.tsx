'use client'

import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { DEV_ERROR_DETAILS, STATUS_TONES } from '@/lib/design-tokens'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body className="bg-background text-foreground font-sans antialiased">
        <div className="bg-background min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${STATUS_TONES.danger.iconSurface}`}>
              <AlertTriangle className={`h-10 w-10 ${STATUS_TONES.danger.icon}`} />
            </div>

            <h1 className="text-2xl font-bold mb-2">应用出现严重错误</h1>
            <p className="text-muted-foreground mb-6">
              抱歉，应用遇到了一个意外问题。请尝试刷新页面或返回首页。
            </p>

            {process.env.NODE_ENV === 'development' && error && (
              <details className="mb-6 text-left">
                <summary className="text-muted-foreground hover:text-foreground mb-2 cursor-pointer text-sm">
                  错误详情
                </summary>
                <pre className={`${DEV_ERROR_DETAILS.standard} ${STATUS_TONES.danger.inline}`}>
                  {error.message}
                  {error.stack && (
                    <>
                      {'\n\n'}
                      {error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => window.location.href = '/'}
              >
                <Home className="w-4 h-4 mr-2" />
                返回首页
              </Button>
              <Button
                onClick={() => reset()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重试
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
