import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import MyBorrows from './MyBorrows'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const item = {
  id: 5,
  status: 'BORROWING',
  borrowDate: '2026-10-10T00:00:00.000Z',
  dueDate: new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 5)).toISOString(),
  renewCount: 0,
  returnPending: false,
  book: { id: 4, title: 'Clean Code', author: 'Martin' },
}
const renderPage = () => render(<MemoryRouter><MyBorrows /></MemoryRouter>)

describe('MyBorrows', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { items: [item] } })
    api.post.mockResolvedValue({ data: { message: 'Đã gửi yêu cầu trả, vui lòng mang sách đến thư viện' } })
  })

  it('lists borrowed books', async () => {
    renderPage()
    expect(await screen.findByText('Clean Code')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /Đang mượn/ })).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    api.get.mockResolvedValue({ data: { items: [] } })
    renderPage()
    expect(await screen.findByText('Không có đơn mượn nào')).toBeInTheDocument()
  })

  it('shows days remaining and the renew button', async () => {
    renderPage()
    expect(await screen.findByText('Còn 5 ngày')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gia hạn' })).toBeInTheDocument()
  })

  it('hides renew once renewed or overdue', async () => {
    api.get.mockResolvedValue({ data: { items: [{ ...item, renewCount: 1 }, { ...item, id: 6, dueDate: '2020-01-01T00:00:00.000Z' }] } })
    renderPage()
    await screen.findAllByText('Clean Code')
    expect(screen.queryByRole('button', { name: 'Gia hạn' })).not.toBeInTheDocument()
  })

  it('renews a borrow and reloads', async () => {
    api.post.mockResolvedValue({ data: { message: 'Đã gia hạn thêm 7 ngày' } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Gia hạn' }))
    expect(api.post).toHaveBeenCalledWith('/borrows/5/renew')
    expect(await screen.findByText('Đã gia hạn thêm 7 ngày')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('shows the reject reason for rejected borrows', async () => {
    api.get.mockResolvedValue({ data: { items: [{ ...item, status: 'REJECTED', rejectReason: 'Hết sách', borrowDate: null, dueDate: null }] } })
    renderPage()
    expect(await screen.findByText('Lý do: Hết sách')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xin trả sách' })).not.toBeInTheDocument()
  })

  it('filters by status', async () => {
    renderPage()
    await userEvent.selectOptions(await screen.findByLabelText('Trạng thái'), 'RETURNED')
    expect(api.get).toHaveBeenLastCalledWith('/borrows/mine', { params: { status: 'RETURNED' } })
  })

  it('hides the button once a return request is pending', async () => {
    api.get.mockResolvedValue({ data: { items: [{ ...item, returnPending: true }] } })
    renderPage()
    expect(await screen.findByText('Đã gửi yêu cầu trả')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xin trả sách' })).not.toBeInTheDocument()
  })

  it('does nothing when the modal is cancelled', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Xin trả sách' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the return request after confirming and reloads', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Xin trả sách' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(api.post).toHaveBeenCalledWith('/borrows/5/return-requests')
    expect(await screen.findByText(/Đã gửi yêu cầu trả, vui lòng mang sách/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('shows the server error and reloads on 409', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { message: 'Bạn đã gửi yêu cầu trả cho sách này' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Xin trả sách' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByText('Bạn đã gửi yêu cầu trả cho sách này')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
