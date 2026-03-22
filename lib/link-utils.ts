// URL detection and parsing utilities

export interface LinkSegment {
  type: 'text' | 'link'
  content: string
  url?: string
}

/**
 * URL regex pattern that matches common URL formats
 */
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/gi

/**
 * Parse text and extract URLs, returning segments of text and links
 */
export function parseTextWithLinks(text: string): LinkSegment[] {
  if (!text)
    return []

  const segments: LinkSegment[] = []
  let lastIndex = 0

  // Reset regex state
  URL_REGEX.lastIndex = 0

  // Find all URLs in the text
  for (let match = URL_REGEX.exec(text); match; match = URL_REGEX.exec(text)) {
    const url = match[0]
    const startIndex = match.index

    // Add text before the URL
    if (startIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex, startIndex),
      })
    }

    // Add the URL
    segments.push({
      type: 'link',
      content: url,
      url,
    })

    lastIndex = startIndex + url.length
  }

  // Add remaining text after the last URL
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(lastIndex),
    })
  }

  // If no URLs were found, return the entire text as one segment
  if (segments.length === 0) {
    segments.push({
      type: 'text',
      content: text,
    })
  }

  return segments
}

/**
 * Extract domain from URL for display
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.startsWith('www.')
      ? urlObj.hostname.slice(4)
      : urlObj.hostname
  }
  catch {
    return url
  }
}

/**
 * Check if URL is an image
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
  const lowercaseUrl = url.toLowerCase()
  return imageExtensions.some(ext => lowercaseUrl.includes(ext))
}
