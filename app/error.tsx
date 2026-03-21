"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEV_ERROR_DETAILS, STATUS_TONES } from "@/lib/design-tokens"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Page error:", error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${STATUS_TONES.danger.iconSurface}`}>
          <AlertTriangle className={`h-10 w-10 ${STATUS_TONES.danger.icon}`} />
        </div>
        
        <h1 className="text-2xl font-bold text-foreground mb-2">页面加载出错</h1>
        <p className="text-muted-foreground mb-6">
          抱歉，页面加载时遇到了问题。请尝试刷新页面或返回首页。
        </p>

        {process.env.NODE_ENV === "development" && error && (
          <details className="mb-6 text-left">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground mb-2">
              错误详情
            </summary>
            <pre className={`${DEV_ERROR_DETAILS.standard} ${STATUS_TONES.danger.inline}`}>
              {error.message}
              {error.stack && (
                <>
                  {"\n\n"}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}

        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
          >
            <Home className="w-4 h-4 mr-2" />
            返回首页
          </Button>
          <Button onClick={() => reset()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            重试
          </Button>
        </div>
      </div>
    </div>
  )
}
