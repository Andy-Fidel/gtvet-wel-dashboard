const APP_SHELL_CACHE = 'gtvets-app-shell-v1'
const RUNTIME_CACHE = 'gtvets-runtime-v1'

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/gtvets-logo-300.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

const shouldHandleApiRequest = (url) => {
  if (!url.pathname.startsWith('/api/')) return false
  if (url.pathname.startsWith('/api/auth/')) return false
  return true
}

const offlineResponse = (message = 'Offline') =>
  new Response(message, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })

const networkFirst = async (request, cacheName, fallbackRequest) => {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cachedResponse = await cache.match(request)
    if (cachedResponse) return cachedResponse
    if (fallbackRequest) {
      const fallbackResponse = await caches.match(fallbackRequest)
      if (fallbackResponse) return fallbackResponse
    }
    return offlineResponse(error instanceof Error ? error.message : 'Offline')
  }
}

const staleWhileRevalidate = async (request, cacheName, event) => {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })

  if (cachedResponse) {
    if (event) {
      event.waitUntil(eventWaitUntilSafe(networkPromise))
    }
    return cachedResponse
  }

  try {
    return await networkPromise
  } catch {
    return offlineResponse()
  }
}

const eventWaitUntilSafe = (promise) => promise.catch(() => undefined)

const networkOnly = async (request) => {
  try {
    return await fetch(request)
  } catch (error) {
    return offlineResponse(error instanceof Error ? error.message : 'Offline')
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, '/'))
    return
  }

  if (shouldHandleApiRequest(url)) {
    event.respondWith(networkOnly(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, event))
})
