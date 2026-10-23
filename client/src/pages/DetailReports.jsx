import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

const PERIODS = [
  ['day', 'Hôm nay'],
  ['week', 'Tuần này'],
  ['month', 'Tháng này'],
  ['quarter', 'Quý này'],
  ['year', 'Năm nay'],
]
const GROUPS = [
  ['day', 'Ngày'],
  ['week', 'Tuần'],
  ['month', 'Tháng'],
  ['quarter', 'Quý'],
]
const formatDate = (iso) => new Date(iso).toLocaleDateString('vi-VN')
const money = (n) => `${Number(n).toLocaleString('vi-VN')} đ`

// Mỗi báo cáo: endpoint, cột hiển thị (label, hàm lấy giá trị)
const REPORTS = {
  books: {
    label: 'Sách',
    columns: [
      ['Tên sách', (r) => r.title],
      ['Tác giả', (r) => r.author],
      ['Tổng số', (r) => r.total],
      ['Có sẵn', (r) => r.available],
      ['Đang mượn', (r) => r.borrowed],
      ['Bị mất', (r) => r.lost],
      ['Hư hỏng', (r) => r.damaged],
      ['Số lần mượn', (r) => r.borrowCount],
    ],
  },
  borrows: {
    label: 'Mượn trả',
    columns: [
      ['Từ ngày', (r) => formatDate(r.bucket)],
      ['Lượt mượn', (r) => r.borrowed],
      ['Lượt trả', (r) => r.returned],
    ],
  },
  fines: {
    label: 'Phạt',
    columns: [
      ['Độc giả', (r) => r.name],
      ['Email', (r) => r.email],
      ['Số phiếu phạt', (r) => r.fineCount],
      ['Số tiền nợ', (r) => money(r.amount)],
    ],
  },
  replacements: {
    label: 'Sách mất/hư',
    columns: [
      ['Tên sách', (r) => r.title],
      ['Tác giả', (r) => r.author],
      ['Tình trạng', (r) => (r.condition === 'LOST' ? 'Mất' : 'Hư hỏng')],
      ['Ngày trả', (r) => formatDate(r.returnDate)],
      ['Độc giả', (r) => `${r.readerName} (${r.readerEmail})`],
    ],
  },
}

export default function DetailReports() {
  const [type, setType] = useState('books')
  const [period, setPeriod] = useState('month')
  const [groupBy, setGroupBy] = useState('day')
  const [custom, setCustom] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const rangeValid = !custom || (from && to && from <= to)

  const params = useCallback(
    (format) => ({
      ...(custom ? { from, to } : { period }),
      ...(type === 'borrows' ? { groupBy } : {}),
      ...(format ? { format } : {}),
    }),
    [custom, from, to, period, type, groupBy],
  )

  const load = useCallback(async () => {
    if (!rangeValid) return
    setData(null)
    try {
      const res = await api.get(`/reports/${type}`, { params: params() })
      setData(res.data)
      setError('')
    } catch {
      setError('Không thể tải báo cáo, vui lòng thử lại')
    }
  }, [type, params, rangeValid])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Tải CSV qua axios (cần header Authorization nên không dùng thẻ <a> trực tiếp)
  const exportCsv = async () => {
    try {
      const res = await api.get(`/reports/${type}`, { params: params('csv'), responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `bao-cao-${type}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setError('')
    } catch {
      setError('Không thể xuất CSV, vui lòng thử lại')
    }
  }

  const report = REPORTS[type]

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Báo cáo chi tiết</h1>

      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {Object.entries(REPORTS).map(([key, r]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={type === key}
            onClick={() => setType(key)}
            className={`rounded border px-4 py-2 ${type === key ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          Khoảng thời gian
          <select
            value={custom ? 'custom' : period}
            onChange={(e) => {
              const v = e.target.value
              setCustom(v === 'custom')
              if (v !== 'custom') setPeriod(v)
            }}
            className="rounded border border-slate-300 px-3 py-2"
          >
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
            <option value="custom">Tùy chọn...</option>
          </select>
        </label>
        {custom && (
          <>
            <label className="flex flex-col text-sm">
              Từ ngày
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex flex-col text-sm">
              Đến ngày
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
            </label>
          </>
        )}
        {type === 'borrows' && (
          <label className="flex flex-col text-sm">
            Gom theo
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded border border-slate-300 px-3 py-2">
              {GROUPS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={exportCsv}
          disabled={!rangeValid}
          className="rounded border border-slate-300 px-4 py-2 disabled:opacity-50"
        >
          Xuất CSV
        </button>
      </div>
      {custom && !rangeValid && (
        <p role="alert" className="mb-4 text-red-600">Chọn ngày bắt đầu và kết thúc hợp lệ (bắt đầu không sau kết thúc)</p>
      )}

      {error && (
        <div>
          <p role="alert" className="text-red-600">{error}</p>
          <button type="button" onClick={load} className="mt-2 rounded border border-slate-300 px-4 py-2">Thử lại</button>
        </div>
      )}
      {!error && rangeValid && !data && <p>Đang tải...</p>}
      {data && (
        <>
          <p className="mb-2 text-sm text-slate-600">
            Từ {formatDate(data.range.from)} đến {formatDate(data.range.to)}
            {data.totals && ` — ${data.totals.borrowed} lượt mượn, ${data.totals.returned} lượt trả`}
            {data.revenue && ` — Doanh thu phạt đã thu: ${money(data.revenue.total)} (${data.revenue.count} phiếu)`}
          </p>
          {data.items.length === 0 ? (
            <p className="text-slate-600">Không có dữ liệu trong khoảng thời gian này</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-300 text-sm text-slate-600">
                  {report.columns.map(([label]) => (
                    <th key={label} className="py-2 pr-4">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    {report.columns.map(([label, get]) => (
                      <td key={label} className="py-2 pr-4">{get(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  )
}
