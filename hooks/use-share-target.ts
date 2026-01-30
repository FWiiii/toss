"use client"

import { useEffect, useState, useCallback } from "react"

export type SharedData = {
  title: string
  text: string
  url: string
  files: Array<{
    name: string
    type: string
    size: number
    data: string // base64
  }>
  timestamp: number
}

const DB_NAME = "toss-share-db"
const STORE_NAME = "shared-data"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
      }
    }
  })
}

async function getShareDataFromDB(): Promise<SharedData | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => {
        const results = request.result
        if (results && results.length > 0) {
          resolve(results[0] as SharedData)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

async function clearShareDataFromDB(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch {
    // Ignore errors
  }
}

// Convert base64 to File
function base64ToFile(base64: string, name: string, type: string): File {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new File([bytes], name, { type })
}

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
