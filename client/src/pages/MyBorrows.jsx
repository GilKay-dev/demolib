import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')
const STATUS_LABEL = { BORROWING: 'Đang mượn', OVERDUE: 'Quá hạn' }

// 2.4.1: sách đang mượn của độc giả; "Xin trả sách" qua modal xác nhận (2.3.3 sẽ mở rộng thành lịch sử đầy đủ)
export default function MyBorrows() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/borrows/mine')
      setItems(data.items)
    } catch {
      setError('Không thể tải danh sách, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      const { data } = await api.post(`/borrows/${confirming.id}/return-requests`)
      setMessage(data.message)
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Không thể gửi yêu cầu, vui lòng thử lại')
    } finally {
      setConfirming(null)
      setBusy(false)
      await load()
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <p className="mb-4"><Link to="/" className="text-blue-700 underline">← Trang chủ</Link></p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Sách đang mượn</h1>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {actionError && <p role="alert" className="mb-2 text-red-600">{actionError}</p>}
      {message && <p role="status" className="mb-2 text-green-700">{message}</p>}
      {!error && !items && <p>Đang tải...</p>}
      {items?.length === 0 && <p>Bạn chưa có sách nào đang mượn</p>}

      {items?.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-300 text-sm text-slate-600">
              <th className="py-2 pr-3">Sách</th>
              <th className="py-2 pr-3">Ngày mượn</th>
              <th className="py-2 pr-3">Hạn trả</th>
              <th className="py-2 pr-3">Trạng thái</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-b border-slate-200">
                <td className="py-2 pr-3">{b.book.title}</td>
                <td className="py-2 pr-3">{formatDate(b.borrowDate)}</td>
                <td className="py-2 pr-3">{formatDate(b.dueDate)}</td>
                <td className="py-2 pr-3">{STATUS_LABEL[b.status]}</td>
                <td className="py-2">
                  {b.returnPending ? (
                    <span className="text-slate-600">Đã gửi yêu cầu trả</span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(b)} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                      Xin trả sách
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận trả sách" className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="max-w-md rounded bg-white p-6 shadow">
            <p className="mb-4">
              Gửi yêu cầu trả sách “{confirming.book.title}”? Bạn cần mang sách tới thư viện để nhân viên xác nhận.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="rounded border border-slate-300 px-3 py-1">
                Hủy
              </button>
              <button type="button" onClick={submit} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
