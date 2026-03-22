'use client'

import { useEffect, useState } from 'react'

const JOIN_CODE_REGEX = /^[A-Z0-9]{6}$/i

/**
 * Hook to extract and manage room join code from URL
 * Handles ?join=XXXXXX parameter
 */
export function useJoinCode() {
  const [joinCode, setJoinCode] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined')
      return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')

    if (code && JOIN_CODE_REGEX.test(code)) {
      setJoinCode(code.toUpperCase())

      // Clean up URL without reload
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  const clearJoinCode = () => setJoinCode(null)

  return { joinCode, clearJoinCode }
}
