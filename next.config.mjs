/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    // Injected at build time; changes on every deploy so the SW URL changes
    // and the browser detects a new service worker version automatically.
    NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
  },
}

export default nextConfig
