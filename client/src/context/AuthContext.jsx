import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { setToken, setUnauthorizedHandler } from '../lib/api'

const AuthContext = createContext(null)
const STORAGE_KEY = 'auth'

function isExpired(token) {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof exp === 'number' && exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.token && !isExpired(saved.token)) {
      setToken(saved.token)
      return saved
    }
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable or corrupted: start logged out
  }
  return null
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(load)

  const login = useCallback(({ token, user }) => {
    setToken(token)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
    } catch {
      // storage unavailable: session lasts until reload
    }
    setAuth({ token, user })
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setAuth(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(() => {})
  }, [logout])

  const user = auth?.user ?? null
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])

  return <AuthContext value={value}>{children}</AuthContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
