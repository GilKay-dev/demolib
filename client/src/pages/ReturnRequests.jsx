import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')
const formatMoney = (n) => `${Number(n).toLocaleString('vi-VN')}đ`
const CONDITIONS = [
  { value: 'NORMAL', label: 'Bình thường' },
  { value: 'DAMAGED', label: 'Hư hỏng' },
  { value: 'LOST', label: 'Mất' },
]
const emptyForm = { condition: '', conditionFineLevelId: '', note: '', lateFineLevelId: '' }

// 2.4.2: danh sách yêu cầu trả chờ xác nhận; nhân viên kiểm tra tình trạng sách rồi xác nhận
export default function ReturnRequests() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.get('/return-requests')
      setData(res.data)
    } catch {
      setError('Không thể tải danh sách, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const start = (id) => {
    setConfirming(id)
    setForm(emptyForm)
    setErrors({})
    setActionError('')
    setSuccess('')
  }
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const validate = (item) => {
    const e = {}
    const damagedOrLost = form.condition === 'DAMAGED' || form.condition === 'LOST'
    if (!form.condition) e.condition = 'Bắt buộc chọn tình trạng'
    if (item.daysLate > 0 && !form.lateFineLevelId) e.lateFineLevelId = 'Bắt buộc chọn mức phạt trả muộn'
    if (damagedOrLost && !form.conditionFineLevelId) e.conditionFineLevelId = 'Bắt buộc chọn mức phạt'
    if (damagedOrLost && !form.note.trim()) e.note = 'Bắt buộc nhập ghi chú'
    if (form.note.trim().length > 500) e.note = 'Ghi chú tối đa 500 ký tự'
    return e
  }

  const submit = async (item) => {
    const found = validate(item)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const body = { condition: form.condition }
    if (form.condition !== 'NORMAL') {
      body.conditionFineLevelId = Number(form.conditionFineLevelId)
      body.note = form.note.trim()
    }
    if (item.daysLate > 0) body.lateFineLevelId = Number(form.lateFineLevelId)

    setBusy(true)
    setActionError('')
    try {
      const res = await api.post(`/return-requests/${item.id}/confirm`, body)
      setConfirming(null)
      setSuccess(res.data?.totalFine > 0 ? `Đã xác nhận trả sách, tổng tiền phạt ${formatMoney(res.data.totalFine)}` : 'Đã xác nhận trả sách')
      await load()
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Không thể xử lý yêu cầu, vui lòng thử lại')
      if (err.response?.status === 409 || err.response?.status === 404) {
        setConfirming(null)
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  const levels = data?.fineLevels ?? []
  const levelOptions = (
    <>
      <option value="">-- Chọn mức phạt --</option>
      {levels.map((l) => (
        <option key={l.id} value={l.id}>{`${l.name} (${formatMoney(l.amount)})`}</option>
      ))}
    </>
  )
  const inputClass = 'w-full rounded border border-slate-300 px-2 py-1'
  const fieldError = (key, id) => errors[key] && <p id={id} role="alert" className="text-red-600">{errors[key]}</p>

  const renderForm = (item) => {
    const damagedOrLost = form.condition === 'DAMAGED' || form.condition === 'LOST'
    const needsLevel = item.daysLate > 0 || damagedOrLost
    return (
      <div className="max-w-sm space-y-2">
        {item.daysLate > 0 && (
          <div>
            <p className="text-sm text-red-700">Trả muộn {item.daysLate} ngày</p>
            <label htmlFor={`late-${item.id}`} className="block text-sm">Mức phạt trả muộn</label>
            <select id={`late-${item.id}`} value={form.lateFineLevelId} onChange={set('lateFineLevelId')} className={inputClass}>
              {levelOptions}
            </select>
            {fieldError('lateFineLevelId')}
          </div>
        )}
        <div>
          <label htmlFor={`cond-${item.id}`} className="block text-sm">Tình trạng sách</label>
          <select id={`cond-${item.id}`} value={form.condition} onChange={set('condition')} className={inputClass}>
            <option value="">-- Chọn tình trạng --</option>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          {fieldError('condition')}
        </div>
        {damagedOrLost && (
          <>
            <div>
              <label htmlFor={`level-${item.id}`} className="block text-sm">Mức phạt</label>
              <select id={`level-${item.id}`} value={form.conditionFineLevelId} onChange={set('conditionFineLevelId')} className={inputClass}>
                {levelOptions}
              </select>
              {fieldError('conditionFineLevelId')}
            </div>
            <div>
              <label htmlFor={`note-${item.id}`} className="block text-sm">Ghi chú</label>
              <textarea id={`note-${item.id}`} value={form.note} onChange={set('note')} rows={3} className={inputClass} />
              {fieldError('note')}
            </div>
          </>
        )}
        {needsLevel && levels.length === 0 && (
          <p role="status" className="text-sm text-amber-700">Chưa có mức phạt, liên hệ quản lý viên (2.5.1)</p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => submit(item)} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
            Xác nhận
          </button>
          <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="rounded border border-slate-300 px-3 py-1">
            Hủy
          </button>
        </div>
      </div>
    )
  }

  const items = data?.items

  return (
    <main className="mx-auto max-w-5xl p-8">
      <p className="mb-4"><Link to="/" className="text-blue-700 underline">← Trang chủ</Link></p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Yêu cầu trả sách chờ xác nhận</h1>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {actionError && <p role="alert" className="mb-2 text-red-600">{actionError}</p>}
      {success && <p role="status" className="mb-2 text-green-700">{success}</p>}
      {!error && !items && <p>Đang tải...</p>}
      {items?.length === 0 && <p role="status">Không có yêu cầu trả chờ xác nhận</p>}

      {items?.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-300 text-sm text-slate-600">
              <th className="py-2 pr-3">Độc giả</th>
              <th className="py-2 pr-3">Sách</th>
              <th className="py-2 pr-3">Ngày mượn</th>
              <th className="py-2 pr-3">Hạn trả</th>
              <th className="py-2 pr-3">Ngày gửi</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">{r.borrow.reader.name}</td>
                <td className="py-2 pr-3">{r.borrow.book.title}</td>
                <td className="py-2 pr-3">{formatDate(r.borrow.borrowDate)}</td>
                <td className="py-2 pr-3">
                  {formatDate(r.borrow.dueDate)}
                  {r.daysLate > 0 && <span className="block text-sm text-red-700">Trễ {r.daysLate} ngày</span>}
                </td>
                <td className="py-2 pr-3">{formatDate(r.createdAt)}</td>
                <td className="py-2">
                  {confirming === r.id ? (
                    renderForm(r)
                  ) : (
                    <button type="button" onClick={() => start(r.id)} disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
                      Xác nhận trả
                    </button>
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
