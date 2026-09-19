import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev-only: lets the console call the API without CORS friction.
      '/api': {
        target: 'https://grbial.onrender.com/', changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '')
      },
    },
  },
})
