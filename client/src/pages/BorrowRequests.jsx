import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')

// 2.3.2: danh sách đơn mượn chờ xác nhận; xác nhận hoặc từ chối (bắt buộc lý do)
export default function BorrowRequests() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/borrows')
      setItems(data.items)
    } catch {
      setError('Không thể tải danh sách, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const startReject = (id) => {
    setRejecting(id)
    setReason('')
    setReasonError('')
  }

  const run = async (request) => {
    setBusy(true)
    setActionError('')
    try {
      await request()
      setRejecting(null)
      setReason('')
      await load()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Không thể xử lý đơn, vui lòng thử lại')
      if (err.response?.status === 409 || err.response?.status === 404) await load()
    } finally {
      setBusy(false)
    }
  }

  const submitReject = () => {
    const text = reason.trim()
    if (!text) return setReasonError('Lý do từ chối là bắt buộc')
    if (text.length > 255) return setReasonError('Lý do tối đa 255 ký tự')
    setReasonError('')
    run(() => api.post(`/borrows/${rejecting}/reject`, { reason: text }))
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <p className="mb-4"><Link to="/" className="text-blue-700 underline">← Trang chủ</Link></p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Đơn mượn chờ xác nhận</h1>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {actionError && <p role="alert" className="mb-2 text-red-600">{actionError}</p>}
      {!error && !items && <p>Đang tải...</p>}
      {items?.length === 0 && <p role="status">Không có đơn chờ xác nhận</p>}

      {items?.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-300 text-sm text-slate-600">
              <th className="py-2 pr-3">Độc giả</th>
              <th className="py-2 pr-3">Sách</th>
              <th className="py-2 pr-3">Số ngày</th>
              <th className="py-2 pr-3">Ngày gửi</th>
              <th className="py-2 pr-3">Có sẵn</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">{b.reader.name}</td>
                <td className="py-2 pr-3">{b.book.title}</td>
                <td className="py-2 pr-3">{b.requestedDays}</td>
                <td className="py-2 pr-3">{formatDate(b.createdAt)}</td>
                <td className="py-2 pr-3">{b.book.availableQuantity}</td>
                <td className="py-2">
                  {rejecting === b.id ? (
                    <div>
                      <label htmlFor={`reason-${b.id}`} className="block text-sm">Lý do từ chối</label>
                      <input
                        id={`reason-${b.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1"
                      />
                      {reasonError && <p role="alert" className="text-red-600">{reasonError}</p>}
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={submitReject} disabled={busy} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50">
                          Gửi từ chối
                        </button>
                        <button type="button" onClick={() => setRejecting(null)} disabled={busy} className="rounded border border-slate-300 px-3 py-1">
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => run(() => api.post(`/borrows/${b.id}/confirm`))} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                        Xác nhận
                      </button>
                      <button type="button" onClick={() => startReject(b.id)} disabled={busy} className="rounded border border-red-300 px-3 py-1 text-red-700">
                        Từ chối
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
