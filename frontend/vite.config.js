import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /api/* to Django backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Do NOT rewrite — keep /api prefix as Django expects it
      },
      // Proxy /ws/* to Django Channels (WebSocket)
      '/ws': {
        target: 'ws://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    }
  }
})
