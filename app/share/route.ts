import type { NextRequest } from 'next/server'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  cleanupExpiredSharePayloads,
  deleteSharePayload,
  persistSharePayload,
  readSharePayloadFile,
  readSharePayloadManifest,
} from '@/lib/share-storage'

// Generate a random ID
function generateId(): string {
  return randomUUID()
}

export async function POST(request: NextRequest) {
  try {
    const cleanupPromise = cleanupExpiredSharePayloads()
    const formDataPromise = request.formData()
    const [, formData] = await Promise.all([cleanupPromise, formDataPromise])

    const title = formData.get('title')?.toString() || ''
    const text = formData.get('text')?.toString() || ''
    const url = formData.get('url')?.toString() || ''
    const files = formData.getAll('files') as File[]

    // Process files (limit to 50MB total)
    const fileInfos: Array<{ name: string, type: string, data: Uint8Array }> = []
    let totalSize = 0
    const maxTotalSize = 50 * 1024 * 1024 // 50MB limit

    const acceptedFiles: File[] = []
    for (const file of files) {
      if (file && file.size > 0 && totalSize + file.size <= maxTotalSize) {
        acceptedFiles.push(file)
        totalSize += file.size
      }
    }

    const fileBuffers = await Promise.all(acceptedFiles.map(file => file.arrayBuffer()))
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i]
      const arrayBuffer = fileBuffers[i]
      fileInfos.push({
        data: new Uint8Array(arrayBuffer),
        name: file.name,
        type: file.type,
      })
    }

    // Generate share ID and store data on disk
    const shareId = generateId()
    await persistSharePayload({
      files: fileInfos,
      shareId,
      text,
      title,
      url,
    })

    // Redirect to home page with share ID
    return NextResponse.redirect(
      new URL(`/?shared=true&share_id=${shareId}`, request.url),
      303,
    )
  }
  catch (error) {
    console.error('Share target error:', error)
    return NextResponse.redirect(new URL('/?share_error=true', request.url), 303)
  }
}

// Handle GET requests to retrieve shared data
export async function GET(request: NextRequest) {
  await cleanupExpiredSharePayloads()

  const { searchParams } = new URL(request.url)
  const shareId = searchParams.get('id')
  const fileId = searchParams.get('file')

  if (!shareId) {
    return NextResponse.redirect(new URL('/', request.url), 302)
  }

  if (fileId) {
    const file = await readSharePayloadFile(shareId, fileId)

    if (!file) {
      return NextResponse.json({ error: 'Shared file not found or expired' }, { status: 404 })
    }

    return new NextResponse(Buffer.from(file.data), {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Content-Length': String(file.size),
        'Content-Type': file.type || 'application/octet-stream',
      },
    })
  }

  const data = await readSharePayloadManifest(shareId)
  if (!data) {
    return NextResponse.json({ error: 'Share data not found or expired' }, { status: 404 })
  }

  return NextResponse.json(
    {
      title: data.title,
      text: data.text,
      url: data.url,
      files: data.files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        url: `/share?id=${shareId}&file=${file.fileId}`,
      })),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const shareId = searchParams.get('id')

  if (!shareId) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await deleteSharePayload(shareId)
  return NextResponse.json({ ok: true })
}
