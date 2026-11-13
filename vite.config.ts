import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  server: { port: 2006 },
  preview: { port: 2006 },
  plugins: [
    // The LiteRT-LM runtime (WebAssembly) is served from this site rather than a CDN.
    viteStaticCopy({ targets: [{ src: 'node_modules/@litert-lm/core/wasm/*', dest: 'litert-lm', rename: { stripBase: true } }] }),
    // Offline: a service worker keeps the app's files after the first visit, and keeps the
    // runtime and the fonts the first time they load. The models already keep themselves.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Browser Native Conversational Agents',
        short_name: 'Voice agent',
        description: 'A voice agent that runs entirely in the browser.',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: null, // the exported codelab pages are not part of this build
        runtimeCaching: [
          { urlPattern: /\/litert-lm\/|\.wasm$/, handler: 'CacheFirst', options: { cacheName: 'runtime' } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts' } },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      // The app, plus the live codelab that GitHub Pages publishes.
      input: { main: 'index.html', live: 'codelab/live/index.html' },
    },
  },
});
