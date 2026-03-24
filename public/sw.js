const STATIC_CACHE_NAME = 'toss-static-v3'
const APP_SHELL_URLS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
]

function isStaticAssetPath(pathname) {
  return pathname.startsWith('/_next/static/')
    || pathname.endsWith('.css')
    || pathname.endsWith('.js')
    || pathname.endsWith('.svg')
    || pathname.endsWith('.png')
    || pathname.endsWith('.webp')
    || pathname.endsWith('.woff2')
}

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_URLS)
    }),
  )
  globalThis.skipWaiting()
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== STATIC_CACHE_NAME)
          .map(cacheName => caches.delete(cacheName)),
      )
    }),
  )
  globalThis.clients.claim()
})

globalThis.addEventListener('fetch', (event) => {
  const { request } = event
  const requestUrl = new URL(request.url)

  if (request.method !== 'GET') {
    return
  }

  if (requestUrl.origin !== globalThis.location.origin) {
    return
  }

  // Share payloads are short-lived and should always come from the network.
  if (requestUrl.pathname.startsWith('/share')) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const shouldCacheNavigation = requestUrl.pathname === '/'
        && requestUrl.searchParams.get('shared') !== 'true'
        && !requestUrl.searchParams.has('share_id')
        && requestUrl.searchParams.get('share_error') !== 'true'

      try {
        const networkResponse = await fetch(request)
        if (shouldCacheNavigation && networkResponse.ok) {
          const cache = await caches.open(STATIC_CACHE_NAME)
          await cache.put('/', networkResponse.clone())
        }
        return networkResponse
      }
      catch {
        const cache = await caches.open(STATIC_CACHE_NAME)
        return (await cache.match('/'))
          || (await cache.match('/offline.html'))
          || (await cache.match('/'))
      }
    })())
    return
  }

  if (isStaticAssetPath(requestUrl.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE_NAME)
      const cachedResponse = await cache.match(request)
      const networkPromise = fetch(request).then(async (networkResponse) => {
        if (networkResponse.ok) {
          await cache.put(request, networkResponse.clone())
        }
        return networkResponse
      })

      return cachedResponse || networkPromise
    })())
    return
  }

  // Default: network first, but do not persist arbitrary API responses.
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(STATIC_CACHE_NAME)
      return (await cache.match(request)) || Response.error()
    }),
  )
})
