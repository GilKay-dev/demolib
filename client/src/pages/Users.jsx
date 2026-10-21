import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { inputClass } from '../lib/form'

const ROLES = [
  ['READER', 'Reader'],
  ['LIBRARIAN', 'Librarian'],
  ['ADMIN', 'Admin'],
]
const STATUS_LABEL = { ACTIVE: 'Kích hoạt', DISABLED: 'Vô hiệu hóa', PENDING: 'Chờ kích hoạt' }
const roleLabel = (role) => ROLES.find(([value]) => value === role)?.[1] ?? role
const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')

export default function Users() {
  const [form, setForm] = useState({ q: '', role: '' })
  const [filters, setFilters] = useState({ q: '', role: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const params = { page, ...(filters.q && { q: filters.q }), ...(filters.role && { role: filters.role }) }
      const { data } = await api.get('/users', { params })
      setResult(data)
      setError('')
    } catch {
      setError('Không thể tải danh sách người dùng, vui lòng thử lại')
    }
  }, [page, filters])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const search = (e) => {
    e.preventDefault()
    setNotice('')
    setPage(1)
    setFilters({ q: form.q.trim(), role: form.role })
  }

  const toggle = async (user) => {
    if (busyId) return
    const status = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    setBusyId(user.id)
    setNotice('')
    try {
      const { data } = await api.patch(`/users/${user.id}/status`, { status })
      setResult((r) => ({ ...r, items: r.items.map((u) => (u.id === data.id ? data : u)) }))
      setNotice(status === 'ACTIVE' ? `Đã kích hoạt tài khoản ${data.email}` : `Đã vô hiệu hóa tài khoản ${data.email}`)
    } catch (err) {
      if (err.response?.status === 404) {
        setNotice('Người dùng không còn tồn tại, đã tải lại danh sách')
        load()
      } else {
        setError(err.response?.data?.message ?? 'Không thể cập nhật, vui lòng thử lại')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Quản lý người dùng</h1>
      <form onSubmit={search} className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="user-q" className="text-sm text-slate-700">Tìm theo email/tên</label>
          <input id="user-q" className={inputClass} value={form.q} onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="user-role" className="text-sm text-slate-700">Vai trò</label>
          <select id="user-role" className={inputClass} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="">Tất cả</option>
            {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">Tìm kiếm</button>
      </form>
      {notice && <p role="status" className="mb-4 rounded bg-green-50 p-3 text-green-800">{notice}</p>}
      {error && (
        <div>
          <p role="alert" className="text-red-600">{error}</p>
          <button type="button" onClick={load} className="mt-2 rounded border border-slate-300 px-4 py-2">Thử lại</button>
        </div>
      )}
      {!error && !result && <p>Đang tải...</p>}
      {result && (
        <>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-300 text-sm text-slate-600">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Tên</th>
                <th className="py-2 pr-4">Vai trò</th>
                <th className="py-2 pr-4">Ngày tham gia</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((u) => (
                <tr key={u.id} className="border-b border-slate-200">
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{u.name}</td>
                  <td className="py-2 pr-4">{roleLabel(u.role)}</td>
                  <td className="py-2 pr-4">{formatDate(u.createdAt)}</td>
                  <td className="py-2 pr-4">{STATUS_LABEL[u.status]}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => toggle(u)}
                      disabled={busyId === u.id}
                      aria-label={`${u.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt'} ${u.email}`}
                      className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                    >
                      {u.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                    </button>
                  </td>
                </tr>
              ))}
              {result.items.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-slate-600">Không tìm thấy người dùng nào</td></tr>
              )}
            </tbody>
          </table>
          {result.totalPages > 1 && (
            <nav aria-label="Phân trang" className="mt-4 flex items-center gap-2">
              <button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Trước</button>
              <span>Trang {result.page}/{result.totalPages}</span>
              <button type="button" disabled={result.page >= result.totalPages} onClick={() => setPage(result.page + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Sau</button>
            </nav>
          )}
        </>
      )}
    </main>
  )
}
