import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import BookEdit from './BookEdit'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }))

const book = {
  id: 7,
  title: 'Clean Code',
  author: 'Martin',
  isbn: '9780306406157',
  publishYear: 2008,
  description: 'Mô tả',
  category: { id: 3, name: 'Công nghệ' },
  availableQuantity: 3,
  borrowedQuantity: 2,
}
const categories = [
  { id: 3, name: 'Công nghệ' },
  { id: 4, name: 'Văn học' },
]

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/books/7/edit']}>
      <Routes>
        <Route path="/books/:id/edit" element={<BookEdit />} />
        <Route path="/books/:id" element={<p>Trang chi tiết</p>} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByLabelText('Tên sách')
}

describe('BookEdit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockImplementation(async (url) => ({ data: url === '/categories' ? categories : book }))
  })

  it('prefills the form, with quantity = available + borrowed', async () => {
    await renderPage()
    expect(screen.getByLabelText('Tên sách')).toHaveValue('Clean Code')
    expect(screen.getByLabelText('ISBN (nếu có)')).toHaveValue('9780306406157')
    expect(screen.getByLabelText('Thể loại')).toHaveValue('3')
    expect(screen.getByLabelText('Số lượng bản sách')).toHaveValue(5)
  })

  it('saves and returns to the detail page', async () => {
    const user = userEvent.setup()
    api.put.mockResolvedValue({ data: {} })
    await renderPage()
    await user.clear(screen.getByLabelText('Tên sách'))
    await user.type(screen.getByLabelText('Tên sách'), 'Clean Code 2')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Trang chi tiết')).toBeInTheDocument()
    expect(api.put).toHaveBeenCalledWith('/books/7', expect.objectContaining({ title: 'Clean Code 2', quantity: '5' }))
  })

  it('blocks a quantity below the borrowed count without calling the API', async () => {
    const user = userEvent.setup()
    await renderPage()
    await user.clear(screen.getByLabelText('Số lượng bản sách'))
    await user.type(screen.getByLabelText('Số lượng bản sách'), '1')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText(/không được nhỏ hơn số sách đang mượn \(2\)/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('shows server field errors (duplicate ISBN)', async () => {
    const user = userEvent.setup()
    api.put.mockRejectedValue({ response: { status: 409, data: { message: 'ISBN đã tồn tại', errors: { isbn: 'ISBN đã tồn tại' } } } })
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('ISBN đã tồn tại')).toBeInTheDocument()
  })

  it('shows not found for a missing book', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    render(
      <MemoryRouter initialEntries={['/books/7/edit']}>
        <Routes>
          <Route path="/books/:id/edit" element={<BookEdit />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Không tìm thấy sách')).toBeInTheDocument()
  })
})
