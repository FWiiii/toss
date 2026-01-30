"use client"

import { useEffect, useState, useCallback } from "react"
import { 
  base64ToFile, 
  getShareDataFromDB, 
  clearShareDataFromDB,
  type SharedData 
} from "@/lib/utils"

export type { SharedData }

// Helper to convert file data array to File objects
type FileData = { name: string; type: string; data: string }
const convertFilesFromData = (files: FileData[]): File[] =>
  files.filter(f => f.data).map(f => base64ToFile(f.data, f.name, f.type))

// Helper to combine text parts
const combineTextParts = (...parts: (string | undefined | null)[]): string =>
  parts.filter(Boolean).join("\n")

export function useShareTarget() {
  const [sharedData, setSharedData] = useState<SharedData | null>(null)
  const [sharedFiles, setSharedFiles] = useState<File[]>([])
  const [sharedText, setSharedText] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkForSharedData() {
      const urlParams = new URLSearchParams(window.location.search)
      const hasShared = urlParams.get("shared") === "true"
      const shareId = urlParams.get("share_id")
      
      if (!hasShared) {
        setIsLoading(false)
        return
      }

      // Remove the query parameters from URL
      window.history.replaceState({}, "", "/")
      
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
              title: string
              text: string
              url: string
              files: FileData[]
            }
            
            const files = convertFilesFromData(data.files)
            if (files.length > 0) {
              setSharedFiles(files)
              foundData = true
            }
            
            const text = combineTextParts(data.title, data.text, data.url)
            if (text) {
              setSharedText(text)
              foundData = true
            }
          }
        } catch (e) {
          console.error("Error fetching share data:", e)
        }
      }
      
      setIsLoading(false)
    }
    
    checkForSharedData()
  }, [])

  const clearSharedData = useCallback(() => {
    setSharedData(null)
    setSharedFiles([])
    setSharedText("")
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
