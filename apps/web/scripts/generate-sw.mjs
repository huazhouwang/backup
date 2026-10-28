// Generates the service worker after `vite build`. It runs as a separate step because the
// SPA shell (index.html) is prerendered after Vite writes the client bundle, so a Vite
// plugin would build the precache manifest before index.html exists.
import { generateSW } from 'workbox-build'

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist/client',
  globPatterns: ['**/*.{html,js,css,woff2,png,svg,webmanifest}'],
  // Only the Latin font subsets are needed for the UI; CJK uses system fonts.
  globIgnores: [
    '**/*cyrillic*',
    '**/*vietnamese*',
    '**/*greek*',
    'sw.js',
    'workbox-*.js',
    'push-sw.js',
    // iOS reads launch screens when the app is added to the home screen, not from the cache.
    'splash/**',
  ],
  swDest: 'dist/client/sw.js',
  // Any in-app URL opens the app shell offline; API calls (Phase 2) go to the network.
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  // New versions wait until the user accepts the update prompt (never mid-feed).
  skipWaiting: false,
  sourcemap: false,
  // Push notifications for reminders (#41).
  importScripts: ['push-sw.js'],
  // Soothing sounds aren't precached (megabytes few people play); the player keeps the ones
  // played in this cache (features/sounds/player.ts), served from it with the ranges an
  // audio element asks for, so they play at night without a connection.
  runtimeCaching: [
    {
      urlPattern: /\/sounds\/[\w-]+\.m4a$/,
      handler: 'CacheFirst',
      options: { cacheName: 'sounds', rangeRequests: true, cacheableResponse: { statuses: [200] } },
    },
  ],
})

for (const warning of warnings) console.warn(warning)
console.log(`Service worker precaches ${count} files (${(size / 1024).toFixed(0)} KiB)`)
