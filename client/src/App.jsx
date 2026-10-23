import { Link, Route, Routes } from 'react-router'
import RequireAuth from './components/RequireAuth'
import { useAuth } from './context/AuthContext'
import BookCreate from './pages/BookCreate'
import BookDetail from './pages/BookDetail'
import BookEdit from './pages/BookEdit'
import BookList from './pages/BookList'
import BorrowRequests from './pages/BorrowRequests'
import Categories from './pages/Categories'
import Dashboard from './pages/Dashboard'
import FineConfirmations from './pages/FineConfirmations'
import FineLevels from './pages/FineLevels'
import Login from './pages/Login'
import MyBorrows from './pages/MyBorrows'
import MyFines from './pages/MyFines'
import Profile from './pages/Profile'
import Register from './pages/Register'
import ReturnRequests from './pages/ReturnRequests'
import Users from './pages/Users'

const linkClass = 'mt-4 mr-4 inline-block text-blue-700 underline'

function Home() {
  const { user, logout } = useAuth()
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-bold text-slate-900">Thư viện mượn trả sách</h1>
      <Link to="/books" className={linkClass}>Danh sách sách</Link>
      {user ? (
        <>
          <p className="mt-2 text-slate-700">Xin chào, {user.name}</p>
          {user.role === 'READER' && (
            <>
              <Link to="/profile" className={linkClass}>Hồ sơ cá nhân</Link>
              <Link to="/my-borrows" className={linkClass}>Sách đang mượn</Link>
              <Link to="/fines" className={linkClass}>Khoản phạt</Link>
            </>
          )}
          {(user.role === 'LIBRARIAN' || user.role === 'ADMIN') && (
            <Link to="/dashboard" className={linkClass}>Báo cáo tổng quan</Link>
          )}
          {user.role === 'LIBRARIAN' && (
            <>
              <Link to="/categories" className={linkClass}>Thể loại sách</Link>
              <Link to="/books/new" className={linkClass}>Thêm sách mới</Link>
              <Link to="/borrow-requests" className={linkClass}>Đơn mượn chờ xác nhận</Link>
              <Link to="/return-requests" className={linkClass}>Yêu cầu trả chờ xác nhận</Link>
              <Link to="/fine-confirmations" className={linkClass}>Phiếu phạt chờ xác nhận</Link>
            </>
          )}
          {user.role === 'ADMIN' && (
            <>
              <Link to="/fine-levels" className={linkClass}>Mức phạt</Link>
              <Link to="/users" className={linkClass}>Quản lý người dùng</Link>
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
      <Route path="/books" element={<BookList />} />
      <Route path="/books/:id" element={<BookDetail />} />
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
        path="/books/:id/edit"
        element={
          <RequireAuth roles={['LIBRARIAN']}>
            <BookEdit />
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
        path="/borrow-requests"
        element={
          <RequireAuth roles={['LIBRARIAN']}>
            <BorrowRequests />
          </RequireAuth>
        }
      />
      <Route
        path="/return-requests"
        element={
          <RequireAuth roles={['LIBRARIAN']}>
            <ReturnRequests />
          </RequireAuth>
        }
      />
      <Route
        path="/fine-confirmations"
        element={
          <RequireAuth roles={['LIBRARIAN']}>
            <FineConfirmations />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireAuth roles={['LIBRARIAN', 'ADMIN']}>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/fine-levels"
        element={
          <RequireAuth roles={['ADMIN']}>
            <FineLevels />
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth roles={['ADMIN']}>
            <Users />
          </RequireAuth>
        }
      />
      <Route
        path="/my-borrows"
        element={
          <RequireAuth roles={['READER']}>
            <MyBorrows />
          </RequireAuth>
        }
      />
      <Route
        path="/fines"
        element={
          <RequireAuth roles={['READER']}>
            <MyFines />
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
