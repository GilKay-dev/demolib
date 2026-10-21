import { Link, Route, Routes } from 'react-router'
import Register from './pages/Register'

function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-bold text-slate-900">Thư viện mượn trả sách</h1>
      <Link to="/register" className="mt-4 inline-block text-blue-700 underline">Đăng ký</Link>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
    </Routes>
  )
}

export default App
