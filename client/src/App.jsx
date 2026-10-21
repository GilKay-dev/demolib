import { Link, Route, Routes } from 'react-router'
import RequireAuth from './components/RequireAuth'
import { useAuth } from './context/AuthContext'
import BookCreate from './pages/BookCreate'
import Categories from './pages/Categories'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Register from './pages/Register'

const linkClass = 'mt-4 mr-4 inline-block text-blue-700 underline'

function Home() {
  const { user, logout } = useAuth()
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-bold text-slate-900">Thư viện mượn trả sách</h1>
      {user ? (
        <>
          <p className="mt-2 text-slate-700">Xin chào, {user.name}</p>
          {user.role === 'READER' && <Link to="/profile" className={linkClass}>Hồ sơ cá nhân</Link>}
          {user.role === 'LIBRARIAN' && (
            <>
              <Link to="/categories" className={linkClass}>Thể loại sách</Link>
              <Link to="/books/new" className={linkClass}>Thêm sách mới</Link>
            </>
          )}
          <button type="button" onClick={logout} className={`${linkClass} cursor-pointer`}>Đăng xuất</button>
        </>
      ) : (
        <>
          <Link to="/login" className={linkClass}>Đăng nhập</Link>
          <Link to="/register" className={linkClass}>Đăng ký</Link>
        </>
      )}
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/books/new"
        element={
          <RequireAuth roles={['LIBRARIAN']}>
            <BookCreate />
          </RequireAuth>
        }
      />
      <Route
        path="/categories"
        element={
          <RequireAuth roles={['LIBRARIAN']}>
            <Categories />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth roles={['READER']}>
            <Profile />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
