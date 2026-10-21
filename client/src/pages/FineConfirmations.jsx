import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')
const formatMoney = (n) => `${Number(n).toLocaleString('vi-VN')}đ`
const TYPES = { LATE: 'Trả muộn', DAMAGED: 'Hư hỏng', LOST: 'Mất sách' }

// 2.5.3: phiếu phạt độc giả báo đã chuyển khoản; nhân viên xác nhận đã nhận tiền hoặc từ chối kèm lý do
export default function FineConfirmations() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.get('/fines')
      setItems(res.data.items)
    } catch {
      setError('Không thể tải danh sách, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const run = async (request, doneMessage) => {
    setBusy(true)
    setActionError('')
    setSuccess('')
    try {
      await request()
      setRejecting(null)
      setSuccess(doneMessage)
      await load()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Không thể xử lý phiếu phạt, vui lòng thử lại')
      if (err.response?.status === 409 || err.response?.status === 404) {
        setRejecting(null)
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  const confirm = (id) => run(() => api.post(`/fines/${id}/confirm`), 'Đã xác nhận thanh toán')

  const startReject = (id) => {
    setRejecting(id)
    setReason('')
    setReasonError('')
    setActionError('')
    setSuccess('')
  }

  const reject = (id) => {
    const text = reason.trim()
    if (!text) return setReasonError('Lý do từ chối là bắt buộc')
    if (text.length > 255) return setReasonError('Lý do tối đa 255 ký tự')
    setReasonError('')
    return run(() => api.post(`/fines/${id}/reject`, { reason: text }), 'Đã từ chối thanh toán')
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <p className="mb-4"><Link to="/" className="text-blue-700 underline">← Trang chủ</Link></p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Phiếu phạt chờ xác nhận thanh toán</h1>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {actionError && <p role="alert" className="mb-2 text-red-600">{actionError}</p>}
      {success && <p role="status" className="mb-2 text-green-700">{success}</p>}
      {!error && !items && <p>Đang tải...</p>}
      {items?.length === 0 && <p role="status">Không có phiếu phạt chờ xác nhận</p>}

      {items?.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-300 text-sm text-slate-600">
              <th className="py-2 pr-3">Độc giả</th>
              <th className="py-2 pr-3">Sách</th>
              <th className="py-2 pr-3">Loại phạt</th>
              <th className="py-2 pr-3">Số tiền</th>
              <th className="py-2 pr-3">Ngày phạt</th>
              <th className="py-2 pr-3">Ngày báo thanh toán</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">{f.reader.name}<span className="block text-sm text-slate-500">{f.reader.email}</span></td>
                <td className="py-2 pr-3">{f.book.title}</td>
                <td className="py-2 pr-3">
                  {TYPES[f.type] ?? f.type}
                  <span className="block text-sm text-slate-500">{f.levelName}</span>
                  {f.note && <span className="block text-sm text-slate-500">{f.note}</span>}
                </td>
                <td className="py-2 pr-3">{formatMoney(f.amount)}</td>
                <td className="py-2 pr-3">{formatDate(f.finedDate)}</td>
                <td className="py-2 pr-3">{f.markedPaidAt ? formatDate(f.markedPaidAt) : ''}</td>
                <td className="py-2">
                  {rejecting === f.id ? (
                    <div className="max-w-xs space-y-2">
                      <label htmlFor={`reason-${f.id}`} className="block text-sm">Lý do từ chối</label>
                      <textarea
                        id={`reason-${f.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        className="w-full rounded border border-slate-300 px-2 py-1"
                      />
                      {reasonError && <p role="alert" className="text-red-600">{reasonError}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => reject(f.id)} disabled={busy} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50">
                          Gửi từ chối
                        </button>
                        <button type="button" onClick={() => setRejecting(null)} disabled={busy} className="rounded border border-slate-300 px-3 py-1">
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => confirm(f.id)} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                        Đã thanh toán
                      </button>
                      <button type="button" onClick={() => startReject(f.id)} disabled={busy} className="rounded border border-red-700 px-3 py-1 text-red-700 disabled:opacity-50">
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
