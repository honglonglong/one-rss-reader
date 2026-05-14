'use client'

import { useState, useEffect } from 'react'

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

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Include the build timestamp in the SW URL. The browser fetches the SW
      // on every registration call and compares content byte-for-byte, but
      // using a versioned URL also forces a network fetch (no cache hit) so
      // deployments are reliably detected even behind aggressive CDN caches.
      const swUrl = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_TIME ?? '1'}`
      navigator.serviceWorker.register(swUrl).then((registration) => {
        setIsReady(true)

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true)
              }
            })
          }
        })
      })
    }
  }, [])

  const update = () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }

  return { isReady, updateAvailable, update }
}
