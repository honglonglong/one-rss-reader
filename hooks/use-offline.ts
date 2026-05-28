'use client'

import { useState, useEffect, useRef } from 'react'

export function useOffline() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    // Check initial state
    setIsOffline(!navigator.onLine)

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOffline
}

export function useServiceWorker() {
  const [isReady, setIsReady] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Reload as soon as the new SW takes control — fired after skipWaiting().
    // Using this event (rather than reloading immediately after postMessage) is
    // more reliable on Safari because the SW may not have activated yet by the
    // time postMessage returns.
    const handleControllerChange = () => {
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    // Include the build timestamp in the SW URL. The browser fetches the SW
    // on every registration call and compares content byte-for-byte, but
    // using a versioned URL also forces a network fetch (no cache hit) so
    // deployments are reliably detected even behind aggressive CDN caches.
    const swUrl = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_TIME ?? '1'}`
    navigator.serviceWorker.register(swUrl).then((registration) => {
      registrationRef.current = registration
      setIsReady(true)

      const markUpdateAvailable = (worker: ServiceWorker) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true)
          }
        })
      }

      // Catch a SW that is already waiting (e.g. page was refreshed after a
      // new SW installed but before the user clicked "Update").
      if (registration.waiting) {
        setUpdateAvailable(true)
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          markUpdateAvailable(newWorker)
        }
      })

      // Nudge Safari to check for updates whenever the user switches back to
      // the app tab / PWA window. Safari PWAs don't run background tasks so
      // without this the SW might never know a new version is available.
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {/* network unavailable — ignore */})
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const update = () => {
    const registration = registrationRef.current
    // Prefer posting to the waiting worker directly. Posting to
    // navigator.serviceWorker.controller silently fails on Safari when the
    // controlling SW is the *old* worker and the new one is still waiting.
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    } else if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
    }
    // Actual reload is triggered by the 'controllerchange' listener above.
  }

  return { isReady, updateAvailable, update }
}
