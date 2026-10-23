import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import Dashboard from './Dashboard'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))

const data = {
  books: { available: 30, borrowed: 12, lost: 2, damaged: 1 },
  readers: { active: 20, disabled: 3 },
  borrowsToday: 4,
  topBooks: [{ id: 5, title: 'Dế Mèn', author: 'Tô Hoài', borrowCount: 9 }],
  overdue: {
    total: 1,
    items: [
      { borrowId: 8, reader: { id: 2, name: 'An', email: 'a@x.com' }, book: { id: 5, title: 'Sách trễ' }, dueDate: '2026-10-01', daysLate: 3 },
    ],
  },
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )

describe('Dashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data })
  })

  it('shows book, reader and borrow totals', async () => {
    renderPage()
    expect(await screen.findByText('Có sẵn')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('Độc giả hoạt động').nextSibling).toHaveTextContent('20')
    expect(screen.getByText('Đơn mượn hôm nay').nextSibling).toHaveTextContent('4')
    expect(api.get).toHaveBeenCalledWith('/reports/dashboard')
  })

  it('lists popular books and overdue readers', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: 'Dế Mèn' })).toHaveAttribute('href', '/books/5')
    expect(screen.getByText(/9 lượt mượn/)).toBeInTheDocument()
    expect(screen.getByText('An (a@x.com)')).toBeInTheDocument()
    expect(screen.getByText('3 ngày')).toBeInTheDocument()
  })

  it('shows empty messages when there is nothing to list', async () => {
    api.get.mockResolvedValue({ data: { ...data, topBooks: [], overdue: { total: 0, items: [] } } })
    renderPage()
    expect(await screen.findByText('Chưa có lượt mượn nào')).toBeInTheDocument()
    expect(screen.getByText('Không có độc giả nào quá hạn')).toBeInTheDocument()
  })

  it('shows an error with retry when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('x'))
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Có sẵn')).toBeInTheDocument()
  })
})
