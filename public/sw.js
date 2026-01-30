const CACHE_NAME = "toss-v2"
const urlsToCache = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/logo.svg",
]

// IndexedDB helper for share data
const DB_NAME = "toss-share-db"
const STORE_NAME = "shared-data"

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
      }
    }
  })
}

async function saveShareData(data) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    // Clear old data first
    store.clear()
    const request = store.add({ ...data, timestamp: Date.now() })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache)
    })
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  
  // Handle Share Target POST requests
  if (url.pathname === "/share" && event.request.method === "POST") {
    event.respondWith(handleShareTarget(event.request))
    return
  }

  // Skip non-GET requests
  if (event.request.method !== "GET") return

  // Network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseToCache = response.clone()
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request)
      })
  )
})

async function handleShareTarget(request) {
  try {
    const formData = await request.formData()
    
    const shareData = {
      title: formData.get("title") || "",
      text: formData.get("text") || "",
      url: formData.get("url") || "",
      files: []
    }
    
    // Process shared files
    const files = formData.getAll("files")
    for (const file of files) {
      if (file && file.size > 0) {
        // Convert file to base64 for storage
        const arrayBuffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        )
        shareData.files.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64
        })
      }
    }
    
    // Save share data to IndexedDB
    await saveShareData(shareData)
    
    // Redirect to main page with share flag
    return Response.redirect("/?shared=true", 303)
  } catch (error) {
    console.error("Share target error:", error)
    return Response.redirect("/?share_error=true", 303)
  }
}
