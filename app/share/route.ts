import { NextRequest, NextResponse } from 'next/server'

// Temporary in-memory storage for shared data (with auto-cleanup)
// Key: share_id, Value: { data, timestamp }
const shareStorage = new Map<string, { 
  title: string
  text: string
  url: string
  files: Array<{ name: string; type: string; size: number; data: string }>
  timestamp: number 
}>()

// Clean up old entries (older than 2 minutes)
function cleanupStorage() {
  const now = Date.now()
  for (const [key, value] of shareStorage.entries()) {
    if (now - value.timestamp > 2 * 60 * 1000) {
      shareStorage.delete(key)
    }
  }
}

// Generate a random ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

export async function POST(request: NextRequest) {
  try {
    // Clean up old entries periodically
    cleanupStorage()
    
    const formData = await request.formData()
    
    const title = formData.get('title')?.toString() || ''
    const text = formData.get('text')?.toString() || ''
    const url = formData.get('url')?.toString() || ''
    const files = formData.getAll('files') as File[]
    
    // Process files (limit to 50MB total)
    const fileInfos: Array<{ name: string; type: string; size: number; data: string }> = []
    let totalSize = 0
    const maxTotalSize = 50 * 1024 * 1024 // 50MB limit
    
    for (const file of files) {
      if (file && file.size > 0 && totalSize + file.size <= maxTotalSize) {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        fileInfos.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64
        })
        totalSize += file.size
      }
    }
    
    // Generate share ID and store data
    const shareId = generateId()
    shareStorage.set(shareId, {
      title,
      text,
      url,
      files: fileInfos,
      timestamp: Date.now()
    })
    
    // Redirect to home page with share ID
    return NextResponse.redirect(
      new URL(`/?shared=true&share_id=${shareId}`, request.url), 
      303
    )
  } catch (error) {
    console.error('Share target error:', error)
    return NextResponse.redirect(new URL('/?share_error=true', request.url), 303)
  }
}

// Handle GET requests to retrieve shared data
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const shareId = searchParams.get('id')
  
  if (!shareId) {
    return NextResponse.redirect(new URL('/', request.url), 302)
  }
  
  const data = shareStorage.get(shareId)
  if (!data) {
    return NextResponse.json({ error: 'Share data not found or expired' }, { status: 404 })
  }
  
  // Delete after retrieval (one-time use)
  shareStorage.delete(shareId)
  
  return NextResponse.json({
    title: data.title,
    text: data.text,
    url: data.url,
    files: data.files
  })
}
