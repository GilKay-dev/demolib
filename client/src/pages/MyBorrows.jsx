import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const STATUS_LABEL = {
  PENDING: 'Chờ xác nhận',
  BORROWING: 'Đang mượn',
  OVERDUE: 'Quá hạn',
  RETURNED: 'Đã trả',
  REJECTED: 'Bị từ chối',
}
const DAY_MS = 86400000

// Số ngày còn lại tới hạn trả (âm = đã quá hạn), tính theo ngày lịch
const daysLeft = (iso) => {
  const due = new Date(iso)
  const now = new Date()
  return Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS)
}

// 2.3.3 + 2.4.1: lịch sử mượn của độc giả, lọc theo trạng thái, gia hạn, "Xin trả sách" qua modal xác nhận
export default function MyBorrows() {
  const [items, setItems] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/borrows/mine', { params: status ? { status } : {} })
      setItems(data.items)
    } catch {
      setError('Không thể tải danh sách, vui lòng thử lại')
    }
  }, [status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const run = async (request, fallback) => {
    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      const { data } = await request()
      setMessage(data.message)
    } catch (err) {
      setActionError(err.response?.data?.message ?? fallback)
    } finally {
      setConfirming(null)
      setBusy(false)
      await load()
    }
  }

  const submit = () => run(() => api.post(`/borrows/${confirming.id}/return-requests`), 'Không thể gửi yêu cầu, vui lòng thử lại')
  const renew = (b) => run(() => api.post(`/borrows/${b.id}/renew`), 'Không thể gia hạn, vui lòng thử lại')

  const canRenew = (b) => b.status === 'BORROWING' && b.renewCount < 1 && daysLeft(b.dueDate) >= 0
  const canReturn = (b) => b.status === 'BORROWING' || b.status === 'OVERDUE'

  return (
    <main className="mx-auto max-w-5xl p-8">
      <p className="mb-4"><Link to="/" className="text-blue-700 underline">← Trang chủ</Link></p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Lịch sử mượn sách</h1>

      <label className="mb-4 flex items-center gap-2">
        <span>Trạng thái</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
          <option value="">Tất cả</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {actionError && <p role="alert" className="mb-2 text-red-600">{actionError}</p>}
      {message && <p role="status" className="mb-2 text-green-700">{message}</p>}
      {!error && !items && <p>Đang tải...</p>}
      {items?.length === 0 && <p>Không có đơn mượn nào</p>}

      {items?.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-300 text-sm text-slate-600">
              <th className="py-2 pr-3">Sách</th>
              <th className="py-2 pr-3">Ngày mượn</th>
              <th className="py-2 pr-3">Hạn trả / Ngày trả</th>
              <th className="py-2 pr-3">Trạng thái</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">
                  {b.book.title}
                  <div className="text-sm text-slate-600">{b.book.author}</div>
                </td>
                <td className="py-2 pr-3">{formatDate(b.borrowDate)}</td>
                <td className="py-2 pr-3">
                  {b.status === 'RETURNED' ? formatDate(b.returnDate) : formatDate(b.dueDate)}
                  {canReturn(b) && (
                    <div className="text-sm text-slate-600">
                      {daysLeft(b.dueDate) >= 0 ? `Còn ${daysLeft(b.dueDate)} ngày` : `Quá hạn ${-daysLeft(b.dueDate)} ngày`}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {STATUS_LABEL[b.status]}
                  {b.status === 'REJECTED' && <div className="text-sm text-red-600">Lý do: {b.rejectReason}</div>}
                </td>
                <td className="py-2">
                  {canReturn(b) && (
                    <div className="flex gap-2">
                      {b.returnPending ? (
                        <span className="text-slate-600">Đã gửi yêu cầu trả</span>
                      ) : (
                        <button type="button" onClick={() => setConfirming(b)} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                          Xin trả sách
                        </button>
                      )}
                      {canRenew(b) && (
                        <button type="button" onClick={() => renew(b)} disabled={busy} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">
                          Gia hạn
                        </button>
                      )}
                    </div>
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
