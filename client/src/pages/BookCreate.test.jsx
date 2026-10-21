import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { isValidIsbn } from '../lib/isbn'
import BookCreate from './BookCreate'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const categories = [
  { id: 3, name: 'Công nghệ', bookCount: 0 },
  { id: 4, name: 'Văn học', bookCount: 1 },
]

async function renderPage() {
  render(
    <MemoryRouter>
      <BookCreate />
    </MemoryRouter>,
  )
  await screen.findByLabelText('Tên sách')
}

async function fillValid(user, over = {}) {
  const v = { title: 'Clean Code', author: 'Martin', year: '2008', isbn: '978-0-306-40615-7', desc: 'Mô tả', qty: '5', ...over }
  await user.type(screen.getByLabelText('Tên sách'), v.title)
  await user.type(screen.getByLabelText('Tác giả'), v.author)
  await user.type(screen.getByLabelText('Năm xuất bản'), v.year)
  if (v.isbn) await user.type(screen.getByLabelText('ISBN (nếu có)'), v.isbn)
  await user.selectOptions(screen.getByLabelText('Thể loại'), '3')
  await user.type(screen.getByLabelText('Mô tả'), v.desc)
  await user.type(screen.getByLabelText('Số lượng bản sách'), v.qty)
}

const submit = (user) => user.click(screen.getByRole('button', { name: 'Thêm sách' }))

describe('isbn util', () => {
  it.each(['9780306406157', '0-306-40615-2', '080442957x'])('accepts %s', (s) => expect(isValidIsbn(s)).toBe(true))
  it.each(['9780306406158', '123', ''])('rejects %j', (s) => expect(isValidIsbn(s)).toBe(false))
})

describe('BookCreate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: categories })
  })

  it('tells the librarian to create a category first when there is none', async () => {
    api.get.mockResolvedValue({ data: [] })
    render(
      <MemoryRouter>
        <BookCreate />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Đến trang Thể loại' })).toHaveAttribute('href', '/categories')
    expect(screen.queryByLabelText('Tên sách')).not.toBeInTheDocument()
  })

  it('shows an error with retry when categories fail to load', async () => {
    api.get.mockRejectedValueOnce(new Error('x'))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <BookCreate />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByLabelText('Tên sách')).toBeInTheDocument()
  })

  it('shows every validation error and does not call the API', async () => {
    const user = userEvent.setup()
    await renderPage()
    await submit(user)
    for (const text of [
      'Tên sách không được để trống',
      'Tác giả không được để trống',
      'Năm xuất bản không được để trống',
      'Vui lòng chọn thể loại',
      'Mô tả không được để trống',
      'Số lượng không được để trống',
    ]) {
      expect(await screen.findByText(text)).toBeInTheDocument()
    }
    expect(api.post).not.toHaveBeenCalled()
  })

  it.each([
    ['Năm xuất bản', '1899', /từ 1900 đến/],
    ['Số lượng bản sách', '0', 'Số lượng phải lớn hơn 0'],
    ['Số lượng bản sách', '2.5', 'Số lượng phải là số nguyên'],
    ['ISBN (nếu có)', '123', /ISBN không hợp lệ/],
  ])('rejects bad %s', async (label, value, message) => {
    const user = userEvent.setup()
    await renderPage()
    await user.type(screen.getByLabelText(label), value)
    await submit(user)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('submits, confirms and clears the form', async () => {
    api.post.mockResolvedValue({ data: { message: 'Thêm sách thành công', book: { id: 11, title: 'Clean Code' } } })
    const user = userEvent.setup()
    await renderPage()
    await fillValid(user)
    await submit(user)
    expect(await screen.findByText(/Thêm sách thành công: Clean Code/)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/books', {
      title: 'Clean Code',
      author: 'Martin',
      publishYear: '2008',
      isbn: '978-0-306-40615-7',
      categoryId: '3',
      description: 'Mô tả',
      quantity: '5',
    })
    expect(screen.getByLabelText('Tên sách')).toHaveValue('')
  })

  it('allows an empty ISBN', async () => {
    api.post.mockResolvedValue({ data: { book: { id: 1, title: 'T' } } })
    const user = userEvent.setup()
    await renderPage()
    await fillValid(user, { isbn: '' })
    await submit(user)
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('shows the duplicate ISBN error at the field and keeps the input', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { errors: { isbn: 'ISBN đã tồn tại' } } } })
    const user = userEvent.setup()
    await renderPage()
    await fillValid(user)
    await submit(user)
    expect(await screen.findByText('ISBN đã tồn tại')).toBeInTheDocument()
    expect(screen.getByLabelText('Tên sách')).toHaveValue('Clean Code')
  })

  it('shows a category error from the server and a generic one when offline', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { errors: { categoryId: 'Thể loại không tồn tại' } } } })
    const user = userEvent.setup()
    await renderPage()
    await fillValid(user)
    await submit(user)
    expect(await screen.findByText('Thể loại không tồn tại')).toBeInTheDocument()
    api.post.mockRejectedValueOnce(new Error('Network Error'))
    await submit(user)
    expect(await screen.findByText('Không thể thêm sách, vui lòng thử lại')).toBeInTheDocument()
  })
})
