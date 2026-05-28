import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },  
  // jsdom and @mozilla/readability use CJS/ESM-mixed deps that Turbopack cannot
  // bundle. Mark them as external so Node.js loads them natively at runtime.
  serverExternalPackages: ['jsdom', '@mozilla/readability'],
  env: {
    // Injected at build time; changes on every deploy so the SW URL changes
    // and the browser detects a new service worker version automatically.
    NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
}

export default nextConfig
