import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import BorrowPanel from './BorrowPanel'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const renderPanel = () =>
  render(
    <MemoryRouter>
      <BorrowPanel bookId={7} />
    </MemoryRouter>,
  )

describe('BorrowPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { eligible: true } })
  })

  it('checks eligibility for the book and enables the button', async () => {
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Mượn sách' })).toBeEnabled()
    expect(api.get).toHaveBeenCalledWith('/borrows/eligibility', { params: { bookId: 7 } })
  })

  it('disables the button and shows the reason when not eligible', async () => {
    api.get.mockResolvedValue({ data: { eligible: false, message: 'Sách đã hết, không thể mượn' } })
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Mượn sách' })).toBeDisabled()
    expect(screen.getByText('Sách đã hết, không thể mượn')).toBeInTheDocument()
  })

  it('links to the fines page for an unpaid fine', async () => {
    api.get.mockResolvedValue({ data: { eligible: false, message: 'Bạn còn khoản phạt chưa thanh toán', link: '/fines' } })
    renderPanel()
    expect(await screen.findByRole('link', { name: 'Xem khoản phạt' })).toHaveAttribute('href', '/fines')
  })

  it('submits the default 14 days', async () => {
    api.post.mockResolvedValue({ data: { message: 'Đã gửi yêu cầu mượn, chờ nhân viên xác nhận' } })
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Mượn sách' }))
    expect(screen.getByLabelText('Thời hạn mượn (ngày)')).toHaveValue(14)
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }))
    expect(api.post).toHaveBeenCalledWith('/borrows', { bookId: 7, days: 14 })
    expect(await screen.findByText('Đã gửi yêu cầu mượn, chờ nhân viên xác nhận')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mượn sách' })).toBeDisabled()
  })

  it.each(['0', '31', '2.5'])('rejects %s days without calling the API', async (value) => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Mượn sách' }))
    const input = screen.getByLabelText('Thời hạn mượn (ngày)')
    await userEvent.clear(input)
    await userEvent.type(input, value)
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }))
    expect(await screen.findByText('Thời hạn từ 1 đến 30 ngày')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps the dialog open', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Đã đạt tối đa 5 sách mượn' } } })
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Mượn sách' }))
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }))
    expect(await screen.findByText('Đã đạt tối đa 5 sách mượn')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the dialog on cancel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Mượn sách' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
