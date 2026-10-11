const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/

export function buildRoomUrl(code: string, configuredOrigin: string, currentOrigin: string, native: boolean): string | null {
  if (!ROOM_CODE_PATTERN.test(code))
    return null
  try {
    const origin = new URL(configuredOrigin || currentOrigin)
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
      return null
    if (native ? origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) : !['http:', 'https:'].includes(origin.protocol))
      return null
    origin.searchParams.set('join', code)
    return origin.href
  }
  catch {
    return null
  }
}
