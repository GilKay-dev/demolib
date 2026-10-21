import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import BorrowPanel from '../components/BorrowPanel'
import { useAuth } from '../context/AuthContext'

const STATUS_LABELS = { BORROWING: 'Đang mượn', OVERDUE: 'Quá hạn', RETURNED: 'Đã trả' }

// Ngày từ server là dạng date (ISO lúc 00:00 UTC): cắt chuỗi để không bị lệch múi giờ
const formatDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

export default function BookDetail() {
  const { id } = useParams()
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const navigate = useNavigate()
  const user = useAuth()?.user
  const isLibrarian = user?.role === 'LIBRARIAN'

  const remove = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/books/${id}`)
      navigate('/books')
    } catch (err) {
      setDeleteError(err.response?.data?.message ?? 'Không thể xóa sách, vui lòng thử lại')
      setConfirming(false)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    let ignore = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('')
    setNotFound(false)
    setBook(null)
    api
      .get(`/books/${id}`)
      .then(({ data }) => !ignore && setBook(data))
      .catch((err) => {
        if (ignore) return
        if (err.response?.status === 404) setNotFound(true)
        else setError('Không thể tải chi tiết sách, vui lòng thử lại')
      })
    return () => {
      ignore = true
    }
  }, [id, attempt])

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="mb-4"><Link to="/books" className="text-blue-700 underline">← Danh sách sách</Link></p>

      {notFound && <p role="alert" className="text-red-600">Không tìm thấy sách</p>}
      {error && (
        <div>
          <p role="alert" className="text-red-600">{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 rounded border border-slate-300 px-4 py-2">
            Thử lại
          </button>
        </div>
      )}
      {!error && !notFound && !book && <p>Đang tải...</p>}

      {book && (
        <>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">{book.title}</h1>
          <dl className="mb-6 grid grid-cols-[10rem_1fr] gap-y-2">
            <dt className="text-slate-600">Tác giả</dt>
            <dd>{book.author}</dd>
            <dt className="text-slate-600">ISBN</dt>
            <dd>{book.isbn || 'Chưa có'}</dd>
            <dt className="text-slate-600">Năm xuất bản</dt>
            <dd>{book.publishYear}</dd>
            <dt className="text-slate-600">Thể loại</dt>
            <dd>{book.category.name}</dd>
            <dt className="text-slate-600">Đang có</dt>
            <dd>{book.availableQuantity}</dd>
            <dt className="text-slate-600">Đang mượn</dt>
            <dd>{book.borrowedQuantity}</dd>
            <dt className="text-slate-600">Mô tả</dt>
            <dd className="whitespace-pre-line">{book.description}</dd>
          </dl>

          {!user && (
            <p className="mb-6">
              <Link to="/login" state={{ from: `/books/${book.id}` }} className="text-blue-700 underline">
                Đăng nhập để mượn sách
              </Link>
            </p>
          )}
          {user?.role === 'READER' && <BorrowPanel bookId={book.id} />}

          {isLibrarian && (
            <div className="mb-6">
              <div className="flex gap-3">
                <Link to={`/books/${book.id}/edit`} className="rounded border border-slate-300 px-4 py-2">Sửa</Link>
                {!confirming && (
                  <button type="button" onClick={() => setConfirming(true)} className="rounded border border-red-300 px-4 py-2 text-red-700">
                    Xóa
                  </button>
                )}
              </div>
              {confirming && (
                <div role="alertdialog" aria-label="Xác nhận xóa sách" className="mt-3 rounded border border-red-300 bg-red-50 p-3">
                  <p>Bạn có chắc muốn xóa sách "{book.title}"?</p>
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={remove} disabled={deleting} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
                      Xác nhận xóa
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="rounded border border-slate-300 px-4 py-2">
                      Hủy
                    </button>
                  </div>
                </div>
              )}
              {deleteError && <p role="alert" className="mt-2 text-red-600">{deleteError}</p>}
            </div>
          )}

          {book.borrowHistory && (
            <section aria-labelledby="history">
              <h2 id="history" className="mb-2 text-lg font-semibold text-slate-900">Lịch sử mượn</h2>
              {book.borrowHistory.length === 0 ? (
                <p role="status">Chưa có lượt mượn nào</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-300 text-sm text-slate-600">
                      <th className="py-2 pr-3">Độc giả</th>
                      <th className="py-2 pr-3">Ngày mượn</th>
                      <th className="py-2 pr-3">Ngày hết hạn</th>
                      <th className="py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.borrowHistory.map((b) => (
                      <tr key={b.id} className="border-b border-slate-200">
                        <td className="py-2 pr-3">{b.reader.name}</td>
                        <td className="py-2 pr-3">{formatDate(b.borrowDate)}</td>
                        <td className="py-2 pr-3">{formatDate(b.dueDate)}</td>
                        <td className="py-2">{STATUS_LABELS[b.status] ?? b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
