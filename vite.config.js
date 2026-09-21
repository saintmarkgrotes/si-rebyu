import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    // In dev, forward /api to the FastAPI backend so no CORS setup is needed locally.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
