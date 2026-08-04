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
  // Guards against reloading twice (once from the fallback timer in update(),
  // once from this event) — whichever fires first wins.
  const hasReloadedRef = useRef(false)
  const reloadOnce = useRef(() => {
    if (hasReloadedRef.current) return
    hasReloadedRef.current = true
    window.location.reload()
  }).current

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Never register the SW in dev — it caches the app shell/bundle and only
    // swaps in a new version once the user confirms an update, so every dev
    // reload after a code change would keep serving stale JS otherwise.
    if (process.env.NODE_ENV !== 'production') return

    // Reload as soon as the new SW takes control — fired after skipWaiting().
    // Using this event (rather than reloading immediately after postMessage) is
    // more reliable on Safari because the SW may not have activated yet by the
    // time postMessage returns.
    const handleControllerChange = () => {
      reloadOnce()
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
    const sendSkipWaiting = (worker: ServiceWorker) => {
      worker.postMessage({ type: 'SKIP_WAITING' })
    }

    // Prefer posting to the waiting worker directly. Posting to
    // navigator.serviceWorker.controller silently fails on Safari when the
    // controlling SW is the *old* worker and the new one is still waiting.
    if (registration?.waiting) {
      sendSkipWaiting(registration.waiting)
    } else {
      // No worker is waiting yet — this happens when the currently running
      // page's own JS bundle is already stale (it can only register the new
      // SW URL once it reloads onto the new bundle), so a click on "upgrade"
      // may land before installation has even started. Force a fresh check
      // and post SKIP_WAITING as soon as a worker finishes installing,
      // instead of doing nothing (which previously made the reload below
      // just reload the same old, unchanged SW/cache).
      registration?.update().catch(() => {/* offline — nothing to install */})
      const onUpdateFound = () => {
        const newWorker = registration?.installing
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            sendSkipWaiting(newWorker)
          }
        })
      }
      registration?.addEventListener('updatefound', onUpdateFound)
    }

    // Actual reload is triggered by the 'controllerchange' listener above.
    // Fallback in case no new SW is ever found (e.g. this build's bundle is
    // already current) or 'controllerchange' never fires — without this the
    // page would appear stuck forever on a stale version after clicking
    // "upgrade".
    setTimeout(reloadOnce, 5000)
  }

  return { isReady, updateAvailable, update }
}
