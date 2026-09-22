import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest doesn't expose globals here, so unmount rendered components after each test ourselves.
afterEach(cleanup)

// jsdom doesn't implement matchMedia; ThemeContext (used by NavHeader) needs it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}
