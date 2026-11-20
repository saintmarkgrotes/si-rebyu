import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext } from './themeContextObject'
import { AuthContext } from './authContextObject'
import { canUseStrawberryTheme } from '../lib/themeAccess'

const STORAGE_KEY = 'si-rebyu-theme' // keep in sync with the script in index.html
const PALETTE_KEY = 'si-rebyu-palette' // 'mono' | 'strawberry'; keep in sync with index.html
const PALETTE_OK_KEY = 'si-rebyu-palette-ok' // '1' while an eligible user is signed in
const DARK_QUERY = '(prefers-color-scheme: dark)'

const readPreference = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    /* storage unavailable — fall through */
  }
  return 'system'
}

const readPalette = () => {
  try {
    return localStorage.getItem(PALETTE_KEY) === 'mono' ? 'mono' : 'strawberry'
  } catch {
    return 'strawberry'
  }
}

export const ThemeProvider = ({ children }) => {
  // Read the auth context directly (not useAuth) so ThemeProvider still works
  // without an AuthProvider, e.g. in isolated component tests.
  const auth = useContext(AuthContext)
  const canUseStrawberry = canUseStrawberryTheme(auth?.user)
  const authSettled = auth ? !auth.loading : true

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

  // paletteChoice: what an eligible user picked. Defaults to strawberry for them.
  const [paletteChoice, setPaletteChoice] = useState(readPalette)
  // palette: what is actually shown. Everyone who is not eligible gets 'mono'.
  const palette = canUseStrawberry ? paletteChoice : 'mono'

  useEffect(() => {
    document.documentElement.dataset.palette = palette
  }, [palette])

  // Remember eligibility so index.html only pre-applies strawberry for eligible
  // users. Wait for the session to load so a reload doesn't briefly clear it.
  useEffect(() => {
    if (!authSettled) return
    try {
      if (canUseStrawberry) localStorage.setItem(PALETTE_OK_KEY, '1')
      else localStorage.removeItem(PALETTE_OK_KEY)
    } catch {
      /* ignore */
    }
  }, [authSettled, canUseStrawberry])

  const setPalette = useCallback(
    (next) => {
      if (next !== 'mono' && !canUseStrawberry) return
      const value = next === 'mono' ? 'mono' : 'strawberry'
      setPaletteChoice(value)
      try {
        localStorage.setItem(PALETTE_KEY, value)
      } catch {
        /* ignore */
      }
    },
    [canUseStrawberry]
  )

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
    () => ({
      preference,
      resolved,
      setTheme,
      toggleTheme,
      palette,
      setPalette,
      canUseStrawberry,
    }),
    [preference, resolved, setTheme, toggleTheme, palette, setPalette, canUseStrawberry]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}