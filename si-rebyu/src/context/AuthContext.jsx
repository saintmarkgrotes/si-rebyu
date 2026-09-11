import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

// Minimal mock auth: swap the body of login() for a real API call later.
// It just needs to resolve/throw — everything else already wired up.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user')
    return saved ? JSON.parse(saved) : null
  })

  async function login(email, password) {
    if (!email || !password) {
      throw new Error('Enter your email and password.')
    }
    // Simulate a network call. Replace with a real request when ready.
    await new Promise((resolve) => setTimeout(resolve, 500))

    const nextUser = { email }
    localStorage.setItem('auth_user', JSON.stringify(nextUser))
    setUser(nextUser)
    return nextUser
  }

  function logout() {
    localStorage.removeItem('auth_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
