// Derive cache name from the build version baked into this SW's URL (?v=...).
// On every new deploy the URL changes, so the browser installs a new SW and
// the activate event below cleans up any stale caches from previous versions.
const _buildVersion = new URL(self.location.href).searchParams.get('v') || '1'
const CACHE_NAME = `rss-reader-${_buildVersion}`
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  // Do NOT call self.skipWaiting() here — let the new SW wait until the user
  // explicitly confirms the update (via SKIP_WAITING message below). This
  // prevents the app from auto-reloading on every tab switch after a deploy.
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// Fetch event - cache first for the app shell and static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip cross-origin requests except for RSS proxy
  if (url.origin !== self.location.origin && !url.pathname.includes('/api/')) {
    return
  }

  // For API requests, use network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )
    return
  }

  // For page navigations, always go to the network first so a reload after an
  // update reliably gets the new HTML — falling back to cache only offline.
  // (Cache-first here previously caused reloads to intermittently keep
  // serving stale HTML, which broke "upgrade and restart" on iOS.)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => caches.match(request).then((cachedResponse) => cachedResponse || caches.match('/')))
    )
    return
  }

  // For static assets, use cache first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Update cache in background
        fetch(request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response)
          })
        })
        return cachedResponse
      }

      return fetch(request).then((response) => {
        const responseClone = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone)
        })
        return response
      })
    })
  )
})

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
