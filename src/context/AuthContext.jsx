import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // restore session on page load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // keep in sync across tabs / token refresh / sign-out
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  const login = async (email, password) => {
    if (!email || !password) {
      throw new Error('Enter your email and password.')
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw new Error(error.message)
    setUser(data.user)
    return data.user
  }

  const signup = async (email, password) => {
    if (!email || !password) {
      throw new Error('Enter your email and password.')
    }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    return data.user
  }

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}