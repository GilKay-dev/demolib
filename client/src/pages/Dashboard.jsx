import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')

function Stat({ label, value }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/reports/dashboard')
      setData(res.data)
      setError('')
    } catch {
      setError('Không thể tải báo cáo, vui lòng thử lại')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Báo cáo tổng quan</h1>
      {error && (
        <div>
          <p role="alert" className="text-red-600">{error}</p>
          <button type="button" onClick={load} className="mt-2 rounded border border-slate-300 px-4 py-2">Thử lại</button>
        </div>
      )}
      {!error && !data && <p>Đang tải...</p>}
      {data && (
        <>
          <section aria-labelledby="dash-books" className="mb-6">
            <h2 id="dash-books" className="mb-2 text-lg font-semibold">Sách</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Có sẵn" value={data.books.available} />
              <Stat label="Đang mượn" value={data.books.borrowed} />
              <Stat label="Bị mất" value={data.books.lost} />
              <Stat label="Hư hỏng" value={data.books.damaged} />
            </div>
          </section>
          <section aria-labelledby="dash-readers" className="mb-6">
            <h2 id="dash-readers" className="mb-2 text-lg font-semibold">Độc giả và đơn mượn</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Độc giả hoạt động" value={data.readers.active} />
              <Stat label="Độc giả vô hiệu hóa" value={data.readers.disabled} />
              <Stat label="Đơn mượn hôm nay" value={data.borrowsToday} />
            </div>
          </section>
          <section aria-labelledby="dash-top" className="mb-6">
            <h2 id="dash-top" className="mb-2 text-lg font-semibold">Top 5 sách phổ biến nhất</h2>
            {data.topBooks.length === 0 ? (
              <p className="text-slate-600">Chưa có lượt mượn nào</p>
            ) : (
              <ol className="list-decimal pl-6">
                {data.topBooks.map((b) => (
                  <li key={b.id} className="py-1">
                    <Link to={`/books/${b.id}`} className="text-blue-700 underline">{b.title}</Link>
                    <span className="text-slate-600"> — {b.author} ({b.borrowCount} lượt mượn)</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-labelledby="dash-overdue">
            <h2 id="dash-overdue" className="mb-2 text-lg font-semibold">Độc giả nợ quá hạn ({data.overdue.total})</h2>
            {data.overdue.items.length === 0 ? (
              <p className="text-slate-600">Không có độc giả nào quá hạn</p>
            ) : (
              <>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-300 text-sm text-slate-600">
                      <th className="py-2 pr-4">Độc giả</th>
                      <th className="py-2 pr-4">Sách</th>
                      <th className="py-2 pr-4">Hạn trả</th>
                      <th className="py-2">Trễ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overdue.items.map((o) => (
                      <tr key={o.borrowId} className="border-b border-slate-200">
                        <td className="py-2 pr-4">{o.reader.name} ({o.reader.email})</td>
                        <td className="py-2 pr-4">{o.book.title}</td>
                        <td className="py-2 pr-4">{formatDate(o.dueDate)}</td>
                        <td className="py-2">{o.daysLate} ngày</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.overdue.total > data.overdue.items.length && (
                  <p className="mt-2 text-sm text-slate-600">Hiển thị {data.overdue.items.length}/{data.overdue.total} đơn quá hạn lâu nhất</p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}
