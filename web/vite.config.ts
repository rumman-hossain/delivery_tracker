/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const appName = loadEnv(mode, process.cwd(), 'VITE_').VITE_APP_NAME || 'Routekeeper'
  return {
  plugins: [
    react(),
    { name: 'app-name', transformIndexHtml: (html: string) => html.replace('%APP_NAME%', appName) },
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: appName,
        short_name: appName,
        description: 'Route delivery tracking for drivers and dispatch',
        theme_color: '#eff1f4',
        background_color: '#eff1f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/MapView-*.js', '**/firestore-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/firestore-.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'admin-chunks' },
          },
          {
            urlPattern: /\/map\/.*\.(pmtiles|json|pbf|png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('@firebase/firestore') || id.includes('firebase/firestore')
            ? 'firestore'
            : undefined,
      },
    },
  },

  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
    env: {
      VITE_FIREBASE_API_KEY: 'test',
      VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'test',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-photos',
      VITE_FIREBASE_APP_ID: 'test',
      VITE_TIMEZONE: 'Asia/Tokyo',
    },
  },
  }
})
