import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const toggleTheme = useCallback(
    () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setTheme]
  )

  const value = useMemo(
    () => ({ preference, resolved, setTheme, toggleTheme }),
    [preference, resolved, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
