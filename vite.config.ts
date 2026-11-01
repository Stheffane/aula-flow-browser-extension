import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // O documento offscreen não é referenciado pelo manifest, então entra como input extra.
    rollupOptions: { input: { offscreen: 'src/offscreen/index.html' } },
  },
  server: { cors: { origin: [/chrome-extension:\/\//] } },
})
