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

async function getShareData(): Promise<SharedData | null> {
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

async function clearShareData(): Promise<void> {
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
      // Check URL for share flag
      const urlParams = new URLSearchParams(window.location.search)
      const hasShared = urlParams.get("shared") === "true"
      
      if (hasShared) {
        // Remove the query parameter from URL
        window.history.replaceState({}, "", "/")
        
        // Get shared data from IndexedDB
        const data = await getShareData()
        if (data) {
          setSharedData(data)
          
          // Convert base64 files back to File objects
          const files = data.files.map((f) => 
            base64ToFile(f.data, f.name, f.type)
          )
          setSharedFiles(files)
          
          // Combine text, title, and URL
          const textParts = [data.title, data.text, data.url].filter(Boolean)
          setSharedText(textParts.join("\n"))
          
          // Clear the stored data
          await clearShareData()
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
