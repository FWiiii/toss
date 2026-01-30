"use client"

import { useEffect, useState, useCallback } from "react"
import { 
  base64ToFile, 
  getShareDataFromDB, 
  clearShareDataFromDB,
  type SharedData 
} from "@/lib/utils"

export type { SharedData }

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
        
        const files = dbData.files
          .filter(f => f.data) // Only files with data
          .map((f) => base64ToFile(f.data, f.name, f.type))
        setSharedFiles(files)
        
        const textParts = [dbData.title, dbData.text, dbData.url].filter(Boolean)
        setSharedText(textParts.join("\n"))
        
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
              files: Array<{ name: string; type: string; size: number; data: string }>
            }
            
            // Convert files
            const files = data.files
              .filter(f => f.data)
              .map(f => base64ToFile(f.data, f.name, f.type))
            
            if (files.length > 0) {
              setSharedFiles(files)
              foundData = true
            }
            
            // Combine text parts
            const textParts = [data.title, data.text, data.url].filter(Boolean)
            if (textParts.length > 0) {
              setSharedText(textParts.join("\n"))
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
