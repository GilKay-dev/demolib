import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { inputClass } from '../lib/form'

const SORTS = [
  ['name', 'Tên (A-Z)'],
  ['year', 'Năm xuất bản (mới nhất)'],
  ['popular', 'Lượt mượn (phổ biến nhất)'],
]
const DEBOUNCE_MS = 300

export default function BookList() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const categoryId = params.get('categoryId') ?? ''
  const sort = SORTS.some(([value]) => value === params.get('sort')) ? params.get('sort') : 'name'
  const page = /^\d+$/.test(params.get('page') ?? '') ? Math.max(1, Number(params.get('page'))) : 1

  const [search, setSearch] = useState(q)
  const [categories, setCategories] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  // Đổi bộ lọc/từ khóa/sắp xếp thì về trang 1; giữ nguyên các tham số khác trong URL
  const update = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value == null || (key === 'page' && value === 1)) next.delete(key)
          else next.set(key, String(value))
        }
        if (!('page' in changes)) next.delete('page')
        return next
      },
      { replace: true },
    )

  // Ô tìm kiếm: debounce trước khi cập nhật URL
  useEffect(() => {
    if (search.trim() === q) return
    const timer = setTimeout(() => update({ q: search.trim() }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // URL đổi từ bên ngoài (back/forward): đồng bộ lại ô tìm kiếm
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(q)
  }, [q])

  useEffect(() => {
    let ignore = false
    api
      .get('/categories')
      .then(({ data }) => !ignore && setCategories(data))
      .catch(() => {}) // bộ lọc thể loại là phụ: lỗi thì vẫn xem được danh sách
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('')
    const query = { sort, page, ...(q && { q }), ...(categoryId && { categoryId }) }
    api
      .get('/books', { params: query })
      .then(({ data }) => {
        if (ignore) return
        setResult(data)
        // Server đưa về trang cuối có dữ liệu: cập nhật URL cho khớp
        if (data.page !== page) update({ page: data.page })
      })
      .catch(() => !ignore && setError('Không thể tải danh sách sách, vui lòng thử lại'))
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, sort, page, attempt])

  const items = result?.items ?? []

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Danh sách sách</h1>

      <div className="mb-6 flex flex-wrap gap-3">
        <div>
          <label htmlFor="search" className="sr-only">Tìm theo tên sách hoặc tác giả</label>
          <input
            id="search"
            type="search"
            placeholder="Tìm theo tên sách hoặc tác giả"
            maxLength={100}
            className={`${inputClass} mt-0 w-72`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="category" className="sr-only">Thể loại</label>
          <select
            id="category"
            className={`${inputClass} mt-0 w-48`}
            value={categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
          >
            <option value="">Tất cả thể loại</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">Sắp xếp</label>
          <select id="sort" className={`${inputClass} mt-0 w-64`} value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div>
          <p role="alert" className="text-red-600">{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 rounded border border-slate-300 px-4 py-2">
            Thử lại
          </button>
        </div>
      )}
      {!error && !result && <p>Đang tải...</p>}
      {!error && result && items.length === 0 && <p role="status">Không tìm thấy sách phù hợp</p>}
      {!error && items.length > 0 && (
        <>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-300 text-sm text-slate-600">
                <th className="py-2 pr-3">Tên sách</th>
                <th className="py-2 pr-3">Tác giả</th>
                <th className="py-2 pr-3">Năm XB</th>
                <th className="py-2 pr-3">Thể loại</th>
                <th className="py-2 pr-3 text-center">Có sẵn</th>
                <th className="py-2 text-center">Đang mượn</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3 font-medium">{b.title}</td>
                  <td className="py-2 pr-3">{b.author}</td>
                  <td className="py-2 pr-3">{b.publishYear}</td>
                  <td className="py-2 pr-3">{b.category.name}</td>
                  <td className="py-2 pr-3 text-center">{b.availableQuantity}</td>
                  <td className="py-2 text-center">{b.borrowedQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={result.page <= 1}
              onClick={() => update({ page: result.page - 1 })}
              className="rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
            >
              Trang trước
            </button>
            <span>Trang {result.page} / {result.totalPages} ({result.total} sách)</span>
            <button
              type="button"
              disabled={result.page >= result.totalPages}
              onClick={() => update({ page: result.page + 1 })}
              className="rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
            >
              Trang sau
            </button>
          </nav>
        </>
      )}
      <p className="mt-6"><Link to="/" className="text-blue-700 underline">Về trang chủ</Link></p>
    </main>
  )
}
