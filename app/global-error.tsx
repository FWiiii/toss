"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global error:", error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased bg-neutral-950 text-neutral-50">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2">应用出现严重错误</h1>
            <p className="text-neutral-400 mb-6">
              抱歉，应用遇到了一个意外问题。请尝试刷新页面或返回首页。
            </p>

            {process.env.NODE_ENV === "development" && error && (
              <details className="mb-6 text-left">
                <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-300 mb-2">
                  错误详情
                </summary>
                <pre className="p-4 bg-neutral-900 rounded-lg text-xs overflow-auto max-h-40 text-red-400">
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
              <button
                onClick={() => window.location.href = "/"}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors text-sm"
              >
                <Home className="w-4 h-4 mr-2" />
                返回首页
              </button>
              <button
                onClick={() => reset()}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重试
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
