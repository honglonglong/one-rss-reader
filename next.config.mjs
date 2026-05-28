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
  // linkedom and @mozilla/readability are ESM packages; mark them external so
  // Turbopack lets Node.js load them natively instead of trying to bundle them.
  serverExternalPackages: ['linkedom', '@mozilla/readability'],
  env: {
    // Injected at build time; changes on every deploy so the SW URL changes
    // and the browser detects a new service worker version automatically.
    NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
}

export default nextConfig
