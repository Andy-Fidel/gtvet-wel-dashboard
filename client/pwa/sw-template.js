const BUILD_ID = '__BUILD_ID__'
const PRECACHE_URLS = /*__PRECACHE_URLS__*/[]
const PRECACHE_CACHE = `gtvets-precache-${BUILD_ID}`
const RUNTIME_CACHE = `gtvets-runtime-${BUILD_ID}`
const GTVETS_CACHE_PREFIXES = ['gtvets-precache-', 'gtvets-runtime-', 'gtvets-app-shell-']

const offlineResponse = () => new Response(
  JSON.stringify({ message: 'You are offline. Reconnect and try again.' }),
  { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/json; charset=utf-8' } },
)

const isCacheable = response => response?.ok && response.type !== 'opaque'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PRECACHE_CACHE).then(cache => cache.addAll(PRECACHE_URLS)))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(key => GTVETS_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
      .filter(key => ![PRECACHE_CACHE, RUNTIME_CACHE].includes(key))
      .map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

const cached = request => caches.match(request, { ignoreSearch: false })

const cacheFirst = async request => {
  const match = await cached(request)
  if (match) return match
  try {
    const response = await fetch(request)
    if (isCacheable(response)) {
      const cache = await caches.open(RUNTIME_CACHE)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return offlineResponse()
  }
}

const staleWhileRevalidate = async (request, event) => {
  const match = await cached(request)
  const network = fetch(request).then(async response => {
    if (isCacheable(response)) {
      const cache = await caches.open(RUNTIME_CACHE)
      await cache.put(request, response.clone())
    }
    return response
  })
  if (match) {
    event.waitUntil(network.catch(() => undefined))
    return match
  }
  try { return await network } catch { return offlineResponse() }
}

const navigationResponse = async request => {
  try {
    const response = await fetch(request)
    if (isCacheable(response)) {
      const cache = await caches.open(RUNTIME_CACHE)
      await cache.put('/index.html', response.clone())
    }
    return response
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || offlineResponse()
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('range')) return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request))
    return
  }

  // User-scoped API data must never be written to a shared browser cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(offlineResponse))
    return
  }

  if (url.pathname.startsWith('/assets/') || PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request, event))
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('push', event => {
  let notification = {
    title: 'GTVETS WEL',
    body: 'You have a new notification.',
    url: '/notifications',
  }

  try {
    if (event.data) notification = { ...notification, ...event.data.json() }
  } catch {
    if (event.data) notification.body = event.data.text()
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visibleWindow = windows.find(client => client.visibilityState === 'visible')

    if (visibleWindow) {
      visibleWindow.postMessage({ type: 'PUSH_NOTIFICATION_RECEIVED', notification })
      return
    }

    await self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      tag: notification.id || undefined,
      renotify: Boolean(notification.id),
      data: notification,
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const notification = event.notification.data || {}
  const targetUrl = new URL(notification.url || '/notifications', self.location.origin)
  const safeUrl = targetUrl.origin === self.location.origin ? targetUrl.href : `${self.location.origin}/notifications`

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows[0]
    if (client) {
      await client.navigate(safeUrl)
      await client.focus()
      client.postMessage({ type: 'PUSH_NOTIFICATION_CLICKED', notification })
      return
    }
    const newWindowUrl = new URL(safeUrl)
    if (notification.id) newWindowUrl.searchParams.set('pushNotification', notification.id)
    await self.clients.openWindow(newWindowUrl.href)
  })())
})
