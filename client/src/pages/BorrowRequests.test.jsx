import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import BorrowRequests from './BorrowRequests'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const item = {
  id: 5,
  requestedDays: 14,
  createdAt: '2026-10-20T03:00:00.000Z',
  reader: { id: 9, name: 'An' },
  book: { id: 4, title: 'Clean Code', author: 'Martin', availableQuantity: 2 },
}
const renderPage = () => render(<MemoryRouter><BorrowRequests /></MemoryRouter>)

describe('BorrowRequests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { items: [item] } })
    api.post.mockResolvedValue({ data: {} })
  })

  it('lists pending requests', async () => {
    renderPage()
    expect(await screen.findByText('Clean Code')).toBeInTheDocument()
    expect(screen.getByText('An')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    api.get.mockResolvedValue({ data: { items: [] } })
    renderPage()
    expect(await screen.findByText('Không có đơn chờ xác nhận')).toBeInTheDocument()
  })

  it('confirms a request and reloads', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }))
    expect(api.post).toHaveBeenCalledWith('/borrows/5/confirm')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('requires a reason to reject', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
    await userEvent.click(screen.getByRole('button', { name: 'Gửi từ chối' }))
    expect(await screen.findByText('Lý do từ chối là bắt buộc')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejects with the reason', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
    await userEvent.type(screen.getByLabelText('Lý do từ chối'), 'Hết sách')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi từ chối' }))
    expect(api.post).toHaveBeenCalledWith('/borrows/5/reject', { reason: 'Hết sách' })
  })

  it('shows the server error and reloads on 409', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { message: 'Đơn đã được xử lý bởi người khác, vui lòng tải lại danh sách' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByText(/đã được xử lý bởi người khác/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
