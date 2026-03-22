'use client'

import { useEffect, useState } from 'react'

const JOIN_CODE_REGEX = /^[A-Z0-9]{6}$/i

function readJoinCodeFromLocation() {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const code = params.get('join')
  return code && JOIN_CODE_REGEX.test(code) ? code.toUpperCase() : null
}

/**
 * Hook to extract and manage room join code from URL
 * Handles ?join=XXXXXX parameter
 */
export function useJoinCode() {
  const [joinCode, setJoinCode] = useState<string | null>(() => readJoinCodeFromLocation())

  useEffect(() => {
    if (typeof window === 'undefined' || !joinCode)
      return

    // Clean up URL without reload
    const newUrl = window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [joinCode])

  const clearJoinCode = () => setJoinCode(null)

  return { joinCode, clearJoinCode }
}
