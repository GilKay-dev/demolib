import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import DetailReports from './DetailReports'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))

const range = { from: '2026-10-01', to: '2026-10-31' }
const books = {
  range,
  items: [{ id: 1, title: 'Dế Mèn', author: 'Tô Hoài', total: 5, available: 3, borrowed: 2, lost: 0, damaged: 1, borrowCount: 4 }],
}

describe('DetailReports', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: books })
  })

  it('loads the book report for the current month by default', async () => {
    render(<DetailReports />)
    expect(await screen.findByText('Dế Mèn')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/reports/books', { params: { period: 'month' } })
  })

  it('switches report type and shows fine revenue', async () => {
    api.get.mockResolvedValueOnce({ data: books }).mockResolvedValueOnce({
      data: {
        range,
        revenue: { total: 150000, count: 3 },
        items: [{ readerId: 2, name: 'An', email: 'a@x.com', fineCount: 1, amount: 50000 }],
      },
    })
    render(<DetailReports />)
    await screen.findByText('Dế Mèn')
    await userEvent.click(screen.getByRole('tab', { name: 'Phạt' }))
    expect(await screen.findByText('An')).toBeInTheDocument()
    expect(screen.getByText(/Doanh thu phạt đã thu: 150\.000/)).toBeInTheDocument()
    expect(api.get).toHaveBeenLastCalledWith('/reports/fines', { params: { period: 'month' } })
  })

  it('sends groupBy for the borrow report', async () => {
    api.get.mockResolvedValue({ data: { range, groupBy: 'day', totals: { borrowed: 0, returned: 0 }, items: [] } })
    render(<DetailReports />)
    await userEvent.click(screen.getByRole('tab', { name: 'Mượn trả' }))
    await screen.findByText('Không có dữ liệu trong khoảng thời gian này')
    await userEvent.selectOptions(screen.getByLabelText('Gom theo'), 'month')
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/reports/borrows', { params: { period: 'month', groupBy: 'month' } }),
    )
  })

  it('blocks a custom range with start after end', async () => {
    render(<DetailReports />)
    await screen.findByText('Dế Mèn')
    await userEvent.selectOptions(screen.getByLabelText('Khoảng thời gian'), 'custom')
    await userEvent.type(screen.getByLabelText('Từ ngày'), '2026-10-10')
    await userEvent.type(screen.getByLabelText('Đến ngày'), '2026-10-01')
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn ngày bắt đầu và kết thúc hợp lệ')
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeDisabled()
    expect(api.get).not.toHaveBeenCalledWith('/reports/books', { params: { from: '2026-10-10', to: '2026-10-01' } })
  })

  it('shows an error with retry', async () => {
    api.get.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ data: books })
    render(<DetailReports />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải báo cáo')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Dế Mèn')).toBeInTheDocument()
  })

  it('requests CSV as a blob', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    render(<DetailReports />)
    await screen.findByText('Dế Mèn')
    api.get.mockResolvedValueOnce({ data: new Blob(['x']) })
    await userEvent.click(screen.getByRole('button', { name: 'Xuất CSV' }))
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/reports/books', { params: { period: 'month', format: 'csv' }, responseType: 'blob' }),
    )
  })
})
