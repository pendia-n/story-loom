const CACHE_NAME = 'story-loom-shell-v4'
const SHELL = ['/', '/manifest.webmanifest', '/story.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }
  if (!/\.(?:js|css|png|svg|woff2?|webmanifest)$/.test(url.pathname)) return
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    // Clone synchronously, before the browser can consume the returned response body.
    // This intentionally caches only static public assets, never pages or private media.
    if (response.ok && response.type === 'basic') {
      let cacheCopy
      try { cacheCopy = response.clone() } catch { return response }
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy)).catch(() => undefined))
    }
    return response
  })))
})
