import { createContext, useContext, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)
const STORAGE_KEY = 'auth'

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.token) api.defaults.headers.common.Authorization = `Bearer ${saved.token}`
    return saved
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(load)

  const login = ({ token, user }) => {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
    } catch {
      // storage unavailable: session lasts until reload
    }
    setAuth({ token, user })
  }

  const logout = () => {
    delete api.defaults.headers.common.Authorization
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setAuth(null)
  }

  return <AuthContext value={{ user: auth?.user ?? null, login, logout }}>{children}</AuthContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
