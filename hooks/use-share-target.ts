'use client'

import type { SharedData } from '@/lib/utils'
import { useCallback, useEffect, useState } from 'react'
import {
  base64ToFile,
  clearShareDataFromDB,
  getShareDataFromDB,

} from '@/lib/utils'

export type { SharedData }

// Helper to convert file data array to File objects
interface FileData { name: string, type: string, data: string }
function convertFilesFromData(files: FileData[]): File[] {
  return files.filter(f => f.data).map(f => base64ToFile(f.data, f.name, f.type))
}

interface RemoteFileData {
  name: string
  size: number
  type: string
  url: string
}

async function fetchRemoteFiles(files: RemoteFileData[]): Promise<File[]> {
  const blobs = await Promise.all(
    files.map(async (file) => {
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch shared file: ${file.name}`)
      }

      return {
        blob: await response.blob(),
        ...file,
      }
    }),
  )

  return blobs.map(file => new File([file.blob], file.name, { type: file.blob.type || file.type }))
}

// Helper to combine text parts
function combineTextParts(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join('\n')
}

export function useShareTarget() {
  const [sharedData, setSharedData] = useState<SharedData | null>(null)
  const [sharedFiles, setSharedFiles] = useState<File[]>([])
  const [sharedText, setSharedText] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkForSharedData() {
      const urlParams = new URLSearchParams(window.location.search)
      const hasShared = urlParams.get('shared') === 'true'
      const shareId = urlParams.get('share_id')

      if (!hasShared) {
        setIsLoading(false)
        return
      }

      // Remove the query parameters from URL
      window.history.replaceState({}, '', '/')

      let foundData = false

      // Method 1: Try to get data from IndexedDB (Service Worker method)
      const dbData = await getShareDataFromDB()
      if (dbData) {
        setSharedData(dbData)
        setSharedFiles(convertFilesFromData(dbData.files))
        setSharedText(combineTextParts(dbData.title, dbData.text, dbData.url))
        await clearShareDataFromDB()
        foundData = true
      }

      // Method 2: Try to get data from API endpoint (Server method)
      if (!foundData && shareId) {
        try {
          const response = await fetch(`/share?id=${shareId}`)
          if (response.ok) {
            const data = await response.json() as {
              files: RemoteFileData[]
              title: string
              text: string
              url: string
            }

            if (data.files.length > 0) {
              const files = await fetchRemoteFiles(data.files)
              setSharedFiles(files)
              foundData = true
            }

            const text = combineTextParts(data.title, data.text, data.url)
            if (text) {
              setSharedText(text)
              foundData = true
            }

            void fetch(`/share?id=${shareId}`, { method: 'DELETE' })
          }
        }
        catch (e) {
          console.error('Error fetching share data:', e)
        }
      }

      setIsLoading(false)
    }

    checkForSharedData()
  }, [])

  const clearSharedData = useCallback(() => {
    setSharedData(null)
    setSharedFiles([])
    setSharedText('')
  }, [])

  return {
    sharedData,
    sharedFiles,
    sharedText,
    isLoading,
    hasSharedContent: sharedFiles.length > 0 || sharedText.length > 0,
    clearSharedData,
  }
}
