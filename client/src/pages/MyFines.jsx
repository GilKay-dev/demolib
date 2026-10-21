import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const formatMoney = (n) => `${n.toLocaleString('vi-VN')} ₫`
const STATUS_LABEL = {
  UNPAID: 'Chưa thanh toán',
  PENDING: 'Chờ xác nhận',
  PAID: 'Đã thanh toán',
  REJECTED: 'Bị từ chối',
}
const TYPE_LABEL = { LATE: 'Trả muộn', DAMAGED: 'Sách hư hỏng', LOST: 'Mất sách' }

// 2.5.2: phiếu phạt của độc giả; chuyển khoản xong thì bấm "Đã thanh toán" để chờ nhân viên xác nhận
export default function MyFines() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.get('/fines/mine', { params: status ? { status } : {} })
      setData(res.data)
    } catch {
      setError('Không thể tải danh sách, vui lòng thử lại')
    }
  }, [status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      const res = await api.post(`/fines/${confirming.id}/mark-paid`)
      setMessage(res.data.message)
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Không thể gửi xác nhận, vui lòng thử lại')
    } finally {
      setConfirming(null)
      setBusy(false)
      await load()
    }
  }

  const items = data?.items
  const canPay = (f) => f.status === 'UNPAID' || f.status === 'REJECTED'

  return (
    <main className="mx-auto max-w-5xl p-8">
      <p className="mb-4"><Link to="/" className="text-blue-700 underline">← Trang chủ</Link></p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Khoản phạt của tôi</h1>

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
      {!error && !data && <p>Đang tải...</p>}
      {data && <p className="mb-2">Tổng chưa thanh toán: <strong>{formatMoney(data.totalUnpaid)}</strong></p>}
      {items?.length === 0 && <p>Không có khoản phạt nào</p>}

      {items?.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-300 text-sm text-slate-600">
              <th className="py-2 pr-3">Nguyên nhân</th>
              <th className="py-2 pr-3">Số tiền</th>
              <th className="py-2 pr-3">Ngày phạt</th>
              <th className="py-2 pr-3">Trạng thái</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">
                  {TYPE_LABEL[f.type]} — {f.book.title}
                  <div className="text-sm text-slate-600">{f.levelName}</div>
                  {f.note && <div className="text-sm text-slate-600">Ghi chú: {f.note}</div>}
                </td>
                <td className="py-2 pr-3">{formatMoney(f.amount)}</td>
                <td className="py-2 pr-3">{formatDate(f.finedDate)}</td>
                <td className="py-2 pr-3">
                  {STATUS_LABEL[f.status]}
                  {f.status === 'REJECTED' && <div className="text-sm text-red-600">Lý do: {f.rejectReason}</div>}
                </td>
                <td className="py-2">
                  {canPay(f) && (
                    <button type="button" onClick={() => setConfirming(f)} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                      Đã thanh toán
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận thanh toán" className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="max-w-md rounded bg-white p-6 shadow">
            <p className="mb-4">
              Bạn đã chuyển khoản {formatMoney(confirming.amount)} cho khoản phạt “{TYPE_LABEL[confirming.type]}”? Nhân viên thư viện sẽ kiểm tra và xác nhận.
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
