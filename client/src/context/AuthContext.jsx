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
    setAuth({ token, user })
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setAuth(null)
  }, [])

  // Sau khi sửa hồ sơ: cập nhật user trong Context (updater thuần, lưu trữ nằm ở effect bên dưới)
  const updateUser = useCallback((patch) => {
    setAuth((prev) => (prev ? { ...prev, user: { ...prev.user, ...patch } } : prev))
  }, [])

  // Đồng bộ phiên đăng nhập vào localStorage mỗi khi thay đổi
  useEffect(() => {
    try {
      if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage unavailable: session lasts until reload
    }
  }, [auth])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(() => {})
  }, [logout])

  const user = auth?.user ?? null
  const value = useMemo(() => ({ user, login, logout, updateUser }), [user, login, logout, updateUser])

  return <AuthContext value={value}>{children}</AuthContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
