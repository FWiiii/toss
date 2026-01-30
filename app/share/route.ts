import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const title = formData.get('title')?.toString() || ''
    const text = formData.get('text')?.toString() || ''
    const url = formData.get('url')?.toString() || ''
    const files = formData.getAll('files') as File[]
    
    // Build share data for URL params (for text content only)
    const params = new URLSearchParams()
    
    if (title) params.set('share_title', title)
    if (text) params.set('share_text', text)
    if (url) params.set('share_url', url)
    
    // For files, we need to store them temporarily
    // Since we can't easily pass files through URL, we'll use a different approach
    if (files.length > 0 && files[0].size > 0) {
      // Store file info in a cookie (just metadata, not the actual file)
      const fileInfos = await Promise.all(
        files.filter(f => f.size > 0).map(async (file) => {
          // Convert file to base64 for small files (< 1MB)
          if (file.size < 1024 * 1024) {
            const arrayBuffer = await file.arrayBuffer()
            const base64 = Buffer.from(arrayBuffer).toString('base64')
            return {
              name: file.name,
              type: file.type,
              size: file.size,
              data: base64
            }
          }
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            data: null // Too large to store in cookie
          }
        })
      )
      
      // Store in cookie (with size limit check)
      const fileData = JSON.stringify(fileInfos)
      if (fileData.length < 4000) { // Cookie size limit
        const cookieStore = await cookies()
        cookieStore.set('share_files', fileData, {
          maxAge: 60, // 1 minute expiry
          path: '/',
          httpOnly: false, // Allow client-side access
          sameSite: 'lax'
        })
      }
      params.set('has_files', 'true')
    }
    
    params.set('shared', 'true')
    
    // Redirect to home page with share params
    return NextResponse.redirect(new URL(`/?${params.toString()}`, request.url), 303)
  } catch (error) {
    console.error('Share target error:', error)
    return NextResponse.redirect(new URL('/?share_error=true', request.url), 303)
  }
}

// Handle GET requests (in case someone navigates directly)
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/', request.url), 302)
}
