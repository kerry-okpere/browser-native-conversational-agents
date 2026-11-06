import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 2006 },
  preview: { port: 2006 },
  build: {
    rollupOptions: {
      // The app, plus the live codelab that GitHub Pages publishes.
      input: { main: 'index.html', live: 'codelab/live/index.html' },
    },
  },
});
