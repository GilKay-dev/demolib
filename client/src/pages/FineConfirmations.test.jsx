import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import FineConfirmations from './FineConfirmations'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const item = {
  id: 5,
  type: 'LATE',
  levelName: 'Trả muộn',
  amount: 20000,
  note: null,
  finedDate: '2026-10-20',
  markedPaidAt: '2026-10-21T03:00:00.000Z',
  reader: { id: 9, name: 'An', email: 'an@x.com' },
  book: { id: 4, title: 'Clean Code' },
}
const renderPage = () => render(<MemoryRouter><FineConfirmations /></MemoryRouter>)

describe('FineConfirmations', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { items: [item] } })
    api.post.mockResolvedValue({ data: {} })
  })

  it('lists pending fines', async () => {
    renderPage()
    expect(await screen.findByText('Clean Code')).toBeInTheDocument()
    expect(screen.getByText('An')).toBeInTheDocument()
    expect(screen.getByText('20.000đ')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    api.get.mockResolvedValue({ data: { items: [] } })
    renderPage()
    expect(await screen.findByText('Không có phiếu phạt chờ xác nhận')).toBeInTheDocument()
  })

  it('confirms payment and reloads', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Đã thanh toán' }))
    expect(api.post).toHaveBeenCalledWith('/fines/5/confirm')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('requires a reason to reject', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
    await userEvent.click(screen.getByRole('button', { name: 'Gửi từ chối' }))
    expect(await screen.findByText('Lý do từ chối là bắt buộc')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejects with a reason', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
    await userEvent.type(screen.getByLabelText('Lý do từ chối'), 'Sai số tiền')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi từ chối' }))
    expect(api.post).toHaveBeenCalledWith('/fines/5/reject', { reason: 'Sai số tiền' })
  })

  it('shows the server message and reloads on conflict', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { message: 'Phiếu phạt đã được xử lý' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Đã thanh toán' }))
    expect(await screen.findByText('Phiếu phạt đã được xử lý')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
