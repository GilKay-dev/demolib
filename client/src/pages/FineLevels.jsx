import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { inputClass } from '../lib/form'

const NAME_MAX = 25
const AMOUNT_MAX = 999999999999

const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isValidDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Trả về { name, amount, effectiveDate } là lỗi theo từng trường (chuỗi rỗng = hợp lệ)
function validate({ name, amount, effectiveDate }) {
  const errors = {}
  if (name.trim() === '') errors.name = 'Tên mức phạt không được để trống'
  else if (name.trim().length > NAME_MAX) errors.name = `Tên mức phạt tối đa ${NAME_MAX} ký tự`
  const n = Number(amount)
  if (String(amount).trim() === '' || Number.isNaN(n)) errors.amount = 'Số tiền phải là số'
  else if (!Number.isInteger(n)) errors.amount = 'Số tiền phải là số nguyên'
  else if (n <= 0) errors.amount = 'Số tiền phải lớn hơn 0'
  else if (n > AMOUNT_MAX) errors.amount = 'Số tiền quá lớn'
  if (!isValidDate(effectiveDate)) errors.effectiveDate = 'Ngày không hợp lệ'
  return errors
}

const serverErrors = (err, fallback) => {
  const e = err.response?.data?.errors
  return e && Object.keys(e).length ? e : { form: err.response?.data?.message ?? fallback }
}

const money = (n) => `${n.toLocaleString('vi-VN')} ₫`
const byAmount = (a, b) => a.amount - b.amount || a.id - b.id

function ErrorText({ id, children }) {
  return children ? <span id={id} role="alert" className="mt-1 block text-sm text-red-600">{children}</span> : null
}

// Sửa trực tiếp: Enter hoặc blur ra khỏi hàng để lưu, Esc để hoàn tác
function LevelRow({ level, onSaved, onDelete, onStale }) {
  const initial = { name: level.name, amount: String(level.amount), effectiveDate: level.effectiveDate }
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const rowRef = useRef(null)
  const saving = useRef(false)
  const cancelled = useRef(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const reset = () => {
    setForm(initial)
    setErrors({})
  }

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (saving.current) return
    const next = { name: form.name.trim(), amount: form.amount.trim(), effectiveDate: form.effectiveDate }
    if (next.name === initial.name && next.amount === initial.amount && next.effectiveDate === initial.effectiveDate) {
      return reset()
    }
    const invalid = validate(next)
    if (Object.keys(invalid).length) return setErrors(invalid)
    saving.current = true
    try {
      const { data } = await api.put(`/fine-levels/${level.id}`, { ...next, amount: Number(next.amount) })
      setErrors({})
      setForm({ name: data.name, amount: String(data.amount), effectiveDate: data.effectiveDate })
      onSaved(data)
    } catch (err) {
      if (err.response?.status === 404) return onStale()
      setErrors(serverErrors(err, 'Không thể lưu, vui lòng thử lại'))
    } finally {
      saving.current = false
    }
  }

  // Chỉ lưu khi focus rời hẳn hàng, để chuyển giữa các ô trong hàng không gửi nhiều PUT
  const onBlur = (e) => {
    if (!rowRef.current?.contains(e.relatedTarget)) commit()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      cancelled.current = true
      reset()
      e.currentTarget.blur()
    }
  }

  const cell = (key, label, props = {}) => (
    <>
      <input
        aria-label={`${label} ${level.name}`}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `level-${level.id}-${key}-error` : undefined}
        className={`${inputClass} mt-0`}
        value={form[key]}
        onChange={set(key)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        {...props}
      />
      <ErrorText id={`level-${level.id}-${key}-error`}>{errors[key]}</ErrorText>
    </>
  )

  return (
    <tr ref={rowRef} className="border-b border-slate-200 align-top">
      <td className="py-2 pr-4">{cell('name', 'Tên mức phạt')}</td>
      <td className="py-2 pr-4">{cell('amount', 'Số tiền', { inputMode: 'numeric' })}</td>
      <td className="py-2 pr-4">{cell('effectiveDate', 'Ngày phạt', { type: 'date' })}</td>
      <td className="py-2">
        <button type="button" onClick={() => onDelete(level)} className="rounded border border-red-300 px-3 py-1 text-red-700">Xóa</button>
        <ErrorText>{errors.form}</ErrorText>
      </td>
    </tr>
  )
}

function AddForm({ onAdded, onCancel }) {
  const [form, setForm] = useState({ name: '', amount: '', effectiveDate: today() })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const invalid = validate(form)
    if (Object.keys(invalid).length) return setErrors(invalid)
    setBusy(true)
    try {
      const { data } = await api.post('/fine-levels', { ...form, name: form.name.trim(), amount: Number(form.amount) })
      onAdded(data)
    } catch (err) {
      setErrors(serverErrors(err, 'Không thể thêm mức phạt, vui lòng thử lại'))
    } finally {
      setBusy(false)
    }
  }

  const field = (key, label, props = {}) => (
    <div>
      <label htmlFor={`new-${key}`} className="sr-only">{label}</label>
      <input
        id={`new-${key}`}
        placeholder={label}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `new-${key}-error` : undefined}
        className={`${inputClass} mt-0`}
        value={form[key]}
        onChange={set(key)}
        {...props}
      />
      <ErrorText id={`new-${key}-error`}>{errors[key]}</ErrorText>
    </div>
  )

  return (
    <form onSubmit={submit} noValidate className="mb-4 flex flex-wrap items-start gap-2">
      {field('name', 'Tên mức phạt mới', { autoFocus: true })}
      {field('amount', 'Số tiền', { inputMode: 'numeric' })}
      {field('effectiveDate', 'Ngày phạt', { type: 'date' })}
      <button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Lưu</button>
      <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">Hủy</button>
      <ErrorText>{errors.form}</ErrorText>
    </form>
  )
}

function ConfirmDelete({ level, onConfirm, onCancel, busy, error }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded bg-white p-6">
        <p id="confirm-title" className="mb-2">Bạn chắc chắn muốn xóa mức phạt “{level.name}”?</p>
        <p className="mb-4 text-sm text-slate-600">Phiếu phạt đã tạo trước đó vẫn giữ nguyên tên và số tiền.</p>
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">Hủy</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Xác nhận</button>
        </div>
      </div>
    </div>
  )
}

export default function FineLevels() {
  const [levels, setLevels] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/fine-levels')
      setLevels(data)
      setLoadError('')
    } catch {
      setLoadError('Không thể tải danh sách mức phạt, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const closeDialog = () => {
    setTarget(null)
    setDeleteError('')
  }

  const confirmDelete = async () => {
    if (deleting) return
    setNotice('')
    setDeleting(true)
    setDeleteError('')
    try {
      const { data } = await api.delete(`/fine-levels/${target.id}`)
      setLevels((list) => list.filter((l) => l.id !== target.id))
      setNotice(data.message)
      closeDialog()
    } catch (err) {
      if (err.response?.status === 404) {
        closeDialog()
        setNotice('Mức phạt không còn tồn tại, đã tải lại danh sách')
        load()
      } else {
        setDeleteError(err.response?.data?.message ?? 'Không thể xóa, vui lòng thử lại')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Quản lý mức phạt</h1>
      {notice && <p role="status" className="mb-4 rounded bg-green-50 p-3 text-green-800">{notice}</p>}
      {loadError && (
        <div>
          <p role="alert" className="text-red-600">{loadError}</p>
          <button type="button" onClick={load} className="mt-2 rounded border border-slate-300 px-4 py-2">Thử lại</button>
        </div>
      )}
      {!loadError && !levels && <p>Đang tải...</p>}
      {levels && (
        <>
          {adding ? (
            <AddForm
              onAdded={(l) => {
                setLevels((list) => [...list, l].sort(byAmount))
                setNotice('Thêm mức phạt thành công')
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" onClick={() => { setNotice(''); setAdding(true) }} className="mb-4 rounded bg-slate-900 px-4 py-2 text-white">
              Thêm mức phạt
            </button>
          )}
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-300 text-sm text-slate-600">
                <th className="py-2 pr-4">Tên mức phạt</th>
                <th className="py-2 pr-4">Số tiền (₫)</th>
                <th className="py-2 pr-4">Ngày phạt</th>
                <th className="py-2"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <LevelRow
                  key={`${l.id}-${l.name}-${l.amount}-${l.effectiveDate}`}
                  level={l}
                  onSaved={(updated) => {
                    setLevels((list) => list.map((x) => (x.id === updated.id ? updated : x)).sort(byAmount))
                    setNotice(`Lưu thành công (${money(updated.amount)})`)
                  }}
                  onDelete={(lv) => { setNotice(''); setTarget(lv) }}
                  onStale={() => {
                    setNotice('Mức phạt không còn tồn tại, đã tải lại danh sách')
                    load()
                  }}
                />
              ))}
              {levels.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-slate-600">Chưa có mức phạt nào</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
      {target && (
        <ConfirmDelete level={target} onConfirm={confirmDelete} onCancel={closeDialog} busy={deleting} error={deleteError} />
      )}
    </main>
  )
}
