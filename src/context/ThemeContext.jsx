import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext } from './themeContextObject'

const STORAGE_KEY = 'si-rebyu-theme' // keep in sync with the script in index.html
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    /* storage unavailable — fall through */
  }
  return 'system'
}

export function ThemeProvider({ children }) {
  // preference: what the user chose ('light' | 'dark' | 'system')
  const [preference, setPreference] = useState(readPreference)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches
  )

  // follow the OS setting live while preference is 'system'
  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY)
    const onChange = (e) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // resolved: what is actually shown ('light' | 'dark')
  const resolved =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setTheme = useCallback((next) => {
    setPreference(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  // Toggle the theme. If an origin element is given (the toggle button), the new
  // theme is revealed as a circle radiating from its centre out to the whole page,
  // using the View Transitions API. Falls back to an instant swap where the API is
  // unavailable or the user prefers reduced motion.
  const toggleTheme = useCallback(
    (originEl) => {
      const next = resolved === 'dark' ? 'light' : 'dark'

      const canAnimate =
        originEl instanceof Element &&
        typeof document.startViewTransition === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (!canAnimate) {
        setTheme(next)
        return
      }

      const rect = originEl.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      // radius needed to reach the farthest corner of the viewport
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      )

      const transition = document.startViewTransition(() => {
        // The DOM must be in its final state by the time this callback returns,
        // so commit the React update and apply the class synchronously.
        flushSync(() => setTheme(next))
        document.documentElement.classList.toggle('dark', next === 'dark')
      })

      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 600,
              easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          )
        })
        .catch(() => {
          /* transition skipped — theme already applied */
        })
    },
    [resolved, setTheme]
  )

  const value = useMemo(
    () => ({ preference, resolved, setTheme, toggleTheme }),
    [preference, resolved, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}