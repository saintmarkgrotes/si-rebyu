import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
  server: {
    // In dev, forward /api to the FastAPI backend so no CORS setup is needed locally.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
