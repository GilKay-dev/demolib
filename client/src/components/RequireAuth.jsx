import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'

// Chưa đăng nhập thì về /login và nhớ trang đang muốn vào; sai vai trò thì về trang chủ
export default function RequireAuth({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}
