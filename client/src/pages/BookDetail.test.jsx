import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import BookDetail from './BookDetail'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), delete: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

const book = {
  id: 7,
  title: 'Clean Code',
  author: 'Robert C. Martin',
  isbn: '9780306406157',
  publishYear: 2008,
  description: 'A handbook',
  category: { id: 3, name: 'Công nghệ' },
  availableQuantity: 3,
  borrowedQuantity: 2,
}

function renderAt(url = '/books/7') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/books/:id" element={<BookDetail />} />
        <Route path="/books" element={<p>Danh sách</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BookDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuth.mockReturnValue({ user: null })
  })

  it('shows the PRD fields without a history section for non-staff', async () => {
    api.get.mockResolvedValue({ data: book })
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Clean Code' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/books/7')
    for (const text of ['Robert C. Martin', '9780306406157', '2008', 'Công nghệ', '3', '2', 'A handbook']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.queryByText('Lịch sử mượn')).not.toBeInTheDocument()
  })

  it('offers guests a login link', async () => {
    api.get.mockResolvedValue({ data: book })
    renderAt()
    expect(await screen.findByRole('link', { name: 'Đăng nhập để mượn sách' })).toBeInTheDocument()
  })

  it('shows the borrow button to readers', async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'READER' } })
    api.get.mockImplementation(async (url) => ({ data: url === '/borrows/eligibility' ? { eligible: true } : book }))
    renderAt()
    expect(await screen.findByRole('button', { name: 'Mượn sách' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đăng nhập để mượn sách' })).not.toBeInTheDocument()
  })

  it('shows no borrow controls to librarians', async () => {
    useAuth.mockReturnValue({ user: { id: 2, role: 'LIBRARIAN' } })
    api.get.mockResolvedValue({ data: { ...book, borrowHistory: [] } })
    renderAt()
    await screen.findByRole('heading', { name: 'Clean Code' })
    expect(screen.queryByRole('button', { name: 'Mượn sách' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đăng nhập để mượn sách' })).not.toBeInTheDocument()
  })

  it('shows the borrow history for staff', async () => {
    api.get.mockResolvedValue({
      data: {
        ...book,
        borrowHistory: [
          { id: 5, reader: { id: 9, name: 'An' }, borrowDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-15T00:00:00.000Z', status: 'BORROWING' },
        ],
      },
    })
    renderAt()
    expect(await screen.findByText('Lịch sử mượn')).toBeInTheDocument()
    expect(screen.getByText('An')).toBeInTheDocument()
    expect(screen.getByText('01/10/2026')).toBeInTheDocument()
    expect(screen.getByText('15/10/2026')).toBeInTheDocument()
    expect(screen.getByText('Đang mượn', { selector: 'td' })).toBeInTheDocument()
  })

  it('shows an empty state when staff see a book nobody borrowed', async () => {
    api.get.mockResolvedValue({ data: { ...book, borrowHistory: [] } })
    renderAt()
    expect(await screen.findByText('Chưa có lượt mượn nào')).toBeInTheDocument()
  })

  it('shows not-found for a 404', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    renderAt('/books/99')
    expect(await screen.findByText('Không tìm thấy sách')).toBeInTheDocument()
  })

  it('shows an error and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: book })
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải chi tiết sách')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('heading', { name: 'Clean Code' })).toBeInTheDocument()
  })

  it('hides edit/delete for non-librarians', async () => {
    useAuth.mockReturnValue({ user: { role: 'READER' } })
    api.get.mockResolvedValue({ data: book })
    renderAt()
    await screen.findByRole('heading', { name: 'Clean Code' })
    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument()
  })

  it('lets a librarian edit, and delete only after confirming', async () => {
    useAuth.mockReturnValue({ user: { role: 'LIBRARIAN' } })
    api.get.mockResolvedValue({ data: book })
    api.delete.mockResolvedValue({ data: {} })
    const user = userEvent.setup()
    renderAt()
    expect(await screen.findByRole('link', { name: 'Sửa' })).toHaveAttribute('href', '/books/7/edit')
    await user.click(screen.getByRole('button', { name: 'Xóa' }))
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xóa' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }))
    expect(await screen.findByText('Danh sách')).toBeInTheDocument()
    expect(api.delete).toHaveBeenCalledWith('/books/7')
  })

  it('shows the server message when deletion is blocked by active borrows', async () => {
    useAuth.mockReturnValue({ user: { role: 'LIBRARIAN' } })
    api.get.mockResolvedValue({ data: book })
    api.delete.mockRejectedValue({ response: { status: 409, data: { message: 'Không thể xóa sách đang có đơn mượn hoạt động' } } })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Xóa' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('đơn mượn hoạt động')
    expect(screen.getByRole('heading', { name: 'Clean Code' })).toBeInTheDocument()
  })
})
