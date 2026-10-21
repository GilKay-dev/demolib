import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import MyFines from './MyFines'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const fine = {
  id: 3,
  type: 'LATE',
  levelName: 'Trả muộn',
  amount: 5000,
  note: null,
  status: 'UNPAID',
  finedDate: '2026-10-20',
  rejectReason: null,
  book: { id: 4, title: 'Clean Code' },
}
const renderPage = () => render(<MemoryRouter><MyFines /></MemoryRouter>)

describe('MyFines', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { items: [fine], totalUnpaid: 5000 } })
    api.post.mockResolvedValue({ data: { message: 'Đã gửi xác nhận thanh toán' } })
  })

  it('lists fines with reason, amount and status', async () => {
    renderPage()
    expect(await screen.findByText(/Trả muộn — Clean Code/)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Chưa thanh toán' })).toBeInTheDocument()
    expect(screen.getByText(/Tổng chưa thanh toán/)).toHaveTextContent('5.000')
  })

  it('shows an empty state', async () => {
    api.get.mockResolvedValue({ data: { items: [], totalUnpaid: 0 } })
    renderPage()
    expect(await screen.findByText('Không có khoản phạt nào')).toBeInTheDocument()
  })

  it('only offers payment for unpaid or rejected fines and shows the reject reason', async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          { ...fine, id: 1, status: 'PENDING' },
          { ...fine, id: 2, status: 'PAID' },
          { ...fine, id: 4, status: 'REJECTED', rejectReason: 'Sai số tiền' },
        ],
        totalUnpaid: 0,
      },
    })
    renderPage()
    expect(await screen.findByText('Lý do: Sai số tiền')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Đã thanh toán' })).toHaveLength(1)
  })

  it('asks for confirmation, submits and reloads', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Đã thanh toán' }))
    expect(api.post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(api.post).toHaveBeenCalledWith('/fines/3/mark-paid')
    expect(await screen.findByText('Đã gửi xác nhận thanh toán')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('cancelling the dialog sends nothing', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Đã thanh toán' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the server error when payment fails', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Phiếu phạt không ở trạng thái có thể thanh toán' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Đã thanh toán' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByText('Phiếu phạt không ở trạng thái có thể thanh toán')).toBeInTheDocument()
  })

  it('shows a load error', async () => {
    api.get.mockRejectedValue(new Error('x'))
    renderPage()
    expect(await screen.findByText('Không thể tải danh sách, vui lòng thử lại')).toBeInTheDocument()
  })
})
