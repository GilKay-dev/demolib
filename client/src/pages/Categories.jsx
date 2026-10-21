import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { inputClass } from '../lib/form'

const NAME_MAX = 50

function validateName(name) {
  if (name.trim() === '') return 'Tên thể loại không được để trống'
  if (name.trim().length > NAME_MAX) return `Tên thể loại tối đa ${NAME_MAX} ký tự`
  return ''
}

const serverMessage = (err, fallback) => err.response?.data?.errors?.name ?? err.response?.data?.message ?? fallback

// Ô tên sửa trực tiếp: Enter hoặc blur để lưu, Esc để hoàn tác
function CategoryRow({ category, onRenamed, onDelete, onStale }) {
  const [value, setValue] = useState(category.name)
  const [error, setError] = useState('')
  const cancelled = useRef(false)
  const saving = useRef(false)

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (saving.current) return // đang lưu: bỏ qua blur chồng để các PUT không về sai thứ tự
    const name = value.trim()
    if (name === category.name) {
      setValue(category.name)
      setError('')
      return
    }
    const invalid = validateName(name)
    if (invalid) return setError(invalid)
    saving.current = true
    try {
      const { data } = await api.put(`/categories/${category.id}`, { name })
      setError('')
      setValue(data.name)
      onRenamed(data)
    } catch (err) {
      if (err.response?.status === 404) return onStale()
      setError(serverMessage(err, 'Không thể lưu, vui lòng thử lại'))
    } finally {
      saving.current = false
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      cancelled.current = true
      setValue(category.name)
      setError('')
      e.currentTarget.blur()
    }
  }

  const errorId = `category-${category.id}-error`
  return (
    <tr className="border-b border-slate-200 align-top">
      <td className="py-2 pr-4">
        <input
          aria-label={`Tên thể loại ${category.name}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`${inputClass} mt-0`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {error && <span id={errorId} role="alert" className="mt-1 block text-sm text-red-600">{error}</span>}
      </td>
      <td className="py-2 pr-4 text-center">{category.bookCount}</td>
      <td className="py-2">
        <button
          type="button"
          disabled={category.bookCount > 0}
          title={category.bookCount > 0 ? 'Không thể xóa khi còn sách thuộc thể loại này' : undefined}
          onClick={() => onDelete(category)}
          className="rounded border border-red-300 px-3 py-1 text-red-700 disabled:opacity-40"
        >
          Xóa
        </button>
      </td>
    </tr>
  )
}

function AddForm({ onAdded, onCancel }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const invalid = validateName(name)
    if (invalid) return setError(invalid)
    setBusy(true)
    try {
      const { data } = await api.post('/categories', { name })
      onAdded(data)
    } catch (err) {
      setError(serverMessage(err, 'Không thể thêm thể loại, vui lòng thử lại'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mb-4 flex flex-wrap items-start gap-2">
      <div>
        <label htmlFor="new-category" className="sr-only">Tên thể loại mới</label>
        <input
          id="new-category"
          autoFocus
          placeholder="Tên thể loại"
          aria-invalid={!!error}
          aria-describedby={error ? 'new-category-error' : undefined}
          className={`${inputClass} mt-0`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <span id="new-category-error" role="alert" className="mt-1 block text-sm text-red-600">{error}</span>}
      </div>
      <button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Lưu</button>
      <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">Hủy</button>
    </form>
  )
}

function ConfirmDelete({ category, onConfirm, onCancel, busy, error }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded bg-white p-6">
        <p id="confirm-title" className="mb-4">Bạn chắc chắn muốn xóa thể loại “{category.name}”?</p>
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">Hủy</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Xác nhận</button>
        </div>
      </div>
    </div>
  )
}

export default function Categories() {
  const [categories, setCategories] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/categories/manage')
      setCategories(data)
      setLoadError('')
    } catch {
      setLoadError('Không thể tải danh sách thể loại, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const sorted = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'vi'))

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
      const { data } = await api.delete(`/categories/${target.id}`)
      setCategories((list) => list.filter((c) => c.id !== target.id))
      setNotice(data.message)
      closeDialog()
    } catch (err) {
      const status = err.response?.status
      if (status === 404) {
        closeDialog()
        setNotice('Thể loại không còn tồn tại, đã tải lại danh sách')
        load()
      } else {
        // 409: còn sách thuộc thể loại (BE kiểm tra lại dù FE đã vô hiệu hóa nút)
        setDeleteError(err.response?.data?.message ?? 'Không thể xóa, vui lòng thử lại')
        // Số sách đã thay đổi: tải lại bảng phía sau, giữ hộp thoại để người dùng đọc lý do
        if (status === 409) load()
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Quản lý thể loại sách</h1>
      {notice && <p role="status" className="mb-4 rounded bg-green-50 p-3 text-green-800">{notice}</p>}
      {loadError && (
        <div>
          <p role="alert" className="text-red-600">{loadError}</p>
          <button type="button" onClick={load} className="mt-2 rounded border border-slate-300 px-4 py-2">Thử lại</button>
        </div>
      )}
      {!loadError && !categories && <p>Đang tải...</p>}
      {categories && (
        <>
          {adding ? (
            <AddForm
              onAdded={(c) => {
                setCategories((list) => sorted([...list, c]))
                setNotice('Thêm thể loại thành công')
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" onClick={() => { setNotice(''); setAdding(true) }} className="mb-4 rounded bg-slate-900 px-4 py-2 text-white">
              Thêm thể loại sách
            </button>
          )}
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-300 text-sm text-slate-600">
                <th className="py-2 pr-4">Tên</th>
                <th className="py-2 pr-4 text-center">Số sách</th>
                <th className="py-2"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  onRenamed={(updated) => {
                    setCategories((list) => sorted(list.map((x) => (x.id === updated.id ? updated : x))))
                    setNotice('Lưu thành công')
                  }}
                  onDelete={(cat) => { setNotice(''); setTarget(cat) }}
                  onStale={() => {
                    setNotice('Thể loại không còn tồn tại, đã tải lại danh sách')
                    load()
                  }}
                />
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-slate-600">Chưa có thể loại nào</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
      {target && (
        <ConfirmDelete category={target} onConfirm={confirmDelete} onCancel={closeDialog} busy={deleting} error={deleteError} />
      )}
    </main>
  )
}
