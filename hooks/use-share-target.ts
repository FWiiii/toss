'use client'

import type { PendingTransferFile } from '@/lib/pending-transfer-file'
import type { SharedData } from '@/lib/utils'
import { useCallback, useEffect, useState } from 'react'
import {
  createRemotePendingTransferFile,
  createStoredPendingTransferFile,
} from '@/lib/pending-transfer-file'
import {
  clearShareDataFromDB,
  getShareDataFromDB,
} from '@/lib/utils'

export type { SharedData }

interface FileData { data: string, name: string, size: number, type: string }

interface RemoteFileData {
  name: string
  size: number
  type: string
  url: string
}

async function fetchRemoteFile(file: RemoteFileData): Promise<File> {
  const response = await fetch(file.url)
  if (!response.ok) {
    throw new Error(`Failed to fetch shared file: ${file.name}`)
  }

  const blob = await response.blob()
  return new File([blob], file.name, { type: blob.type || file.type })
}

// Helper to combine text parts
function combineTextParts(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join('\n')
}

export function useShareTarget() {
  const [sharedData, setSharedData] = useState<SharedData | null>(null)
  const [sharedFiles, setSharedFiles] = useState<PendingTransferFile[]>([])
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
        setSharedFiles(
          dbData.files
            .filter(file => file.data)
            .map(file => createStoredPendingTransferFile(file as FileData)),
        )
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
              setSharedFiles(
                data.files.map(file => createRemotePendingTransferFile({
                  id: `${shareId}:${file.name}:${file.size}`,
                  name: file.name,
                  resolveFile: () => fetchRemoteFile(file),
                  size: file.size,
                  type: file.type,
                })),
              )
              foundData = true
            }

            const text = combineTextParts(data.title, data.text, data.url)
            if (text) {
              setSharedText(text)
              foundData = true
            }
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
