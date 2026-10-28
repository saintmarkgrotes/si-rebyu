
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],

  // Path alias for shadcn/ui and React Bits
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  test: {
    // This suite uses node:test and runs separately via test:database.
    exclude: [...configDefaults.exclude, 'scripts/database.test.js'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key'
    },
  },

  server: {
    // Forward /api to the FastAPI backend.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
