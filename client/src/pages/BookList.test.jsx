import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import BookList from './BookList'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))

const book = (id, over = {}) => ({
  id,
  title: `Sách ${id}`,
  author: `Tác giả ${id}`,
  publishYear: 2000 + id,
  category: { id: 3, name: 'Công nghệ' },
  availableQuantity: 4,
  borrowedQuantity: 2,
  ...over,
})
const page1 = { items: [book(1), book(2)], page: 1, pageSize: 10, total: 25, totalPages: 3 }

function Url() {
  const { search } = useLocation()
  return <output data-testid="url">{search}</output>
}

const lastBooksCall = () => api.get.mock.calls.filter(([url]) => url === '/books').at(-1)[1].params

async function renderAt(url = '/books') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <BookList />
      <Url />
    </MemoryRouter>,
  )
  await screen.findByRole('table')
}

describe('BookList', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockImplementation(async (url) =>
      url === '/categories'
        ? { data: [{ id: 3, name: 'Công nghệ' }, { id: 4, name: 'Văn học' }] }
        : { data: page1 },
    )
  })

  it('lists the books with all the PRD columns and paging info', async () => {
    await renderAt()
    expect(screen.getByText('Sách 1')).toBeInTheDocument()
    expect(screen.getByText('Tác giả 1')).toBeInTheDocument()
    expect(screen.getByText('2001')).toBeInTheDocument()
    expect(screen.getAllByText('Công nghệ').length).toBeGreaterThan(0)
    expect(screen.getByText('Trang 1 / 3 (25 sách)')).toBeInTheDocument()
    expect(lastBooksCall()).toEqual({ sort: 'name', page: 1 })
  })

  it('reads q, category, sort and page from the URL', async () => {
    await renderAt('/books?q=code&categoryId=4&sort=year&page=2')
    expect(lastBooksCall()).toEqual({ q: 'code', categoryId: '4', sort: 'year', page: 2 })
    expect(screen.getByLabelText('Tìm theo tên sách hoặc tác giả')).toHaveValue('code')
    expect(screen.getByLabelText('Sắp xếp')).toHaveValue('year')
  })

  it('falls back to defaults for a bad sort or page in the URL', async () => {
    await renderAt('/books?sort=bogus&page=abc')
    expect(lastBooksCall()).toEqual({ sort: 'name', page: 1 })
  })

  it('debounces the search box, then updates the URL and resets to page 1', async () => {
    api.get.mockImplementation(async (url) =>
      url === '/categories' ? { data: [] } : { data: { ...page1, page: 2 } },
    )
    const user = userEvent.setup()
    await renderAt('/books?page=2')
    await user.type(screen.getByLabelText('Tìm theo tên sách hoặc tác giả'), 'abc')
    const callsBefore = api.get.mock.calls.filter(([u]) => u === '/books').length
    expect(callsBefore).toBe(1) // chưa gọi lại trong lúc đang gõ
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('?q=abc'))
    expect(screen.getByTestId('url')).not.toHaveTextContent('page')
    await waitFor(() => expect(lastBooksCall()).toEqual({ q: 'abc', sort: 'name', page: 1 }))
  })

  it('keeps what the user keeps typing after the debounced URL update', async () => {
    const user = userEvent.setup()
    await renderAt()
    const box = screen.getByLabelText('Tìm theo tên sách hoặc tác giả')
    await user.type(box, 'abc')
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('?q=abc'))
    await user.type(box, 'd')
    expect(box).toHaveValue('abcd')
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('?q=abcd'))
    expect(box).toHaveValue('abcd')
  })

  it('disables paging and marks the table busy while a page is loading', async () => {
    const user = userEvent.setup()
    await renderAt()
    let release
    api.get.mockImplementation(async (url) => {
      if (url === '/categories') return { data: [] }
      await new Promise((r) => { release = r })
      return { data: { ...page1, page: 2 } }
    })
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled())
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')
  })

  it('drops the previous results when a reload fails, so stale rows are not shown', async () => {
    const user = userEvent.setup()
    await renderAt()
    api.get.mockImplementation(async (url) => {
      if (url === '/categories') return { data: [] }
      throw new Error('x')
    })
    await user.selectOptions(screen.getByLabelText('Sắp xếp'), 'year')
    expect(await screen.findByText('Không thể tải danh sách sách, vui lòng thử lại')).toBeInTheDocument()
    expect(screen.queryByText('Sách 1')).not.toBeInTheDocument()
  })

  it('filters by category and resets the page', async () => {
    const user = userEvent.setup()
    await renderAt('/books?page=2')
    await user.selectOptions(screen.getByLabelText('Thể loại'), '4')
    await waitFor(() => expect(lastBooksCall()).toEqual({ categoryId: '4', sort: 'name', page: 1 }))
  })

  it('changes the sort order', async () => {
    const user = userEvent.setup()
    await renderAt()
    await user.selectOptions(screen.getByLabelText('Sắp xếp'), 'popular')
    await waitFor(() => expect(lastBooksCall()).toMatchObject({ sort: 'popular', page: 1 }))
  })

  it('pages forward and back, disabling the ends', async () => {
    const user = userEvent.setup()
    await renderAt()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    api.get.mockImplementation(async (url) =>
      url === '/categories' ? { data: [] } : { data: { ...page1, page: 3 } },
    )
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(lastBooksCall().page).toBe(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled())
  })

  it('syncs the URL when the server moves to the last page with data', async () => {
    api.get.mockImplementation(async (url) =>
      url === '/categories' ? { data: [] } : { data: { ...page1, page: 3 } },
    )
    await renderAt('/books?page=99')
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('page=3'))
  })

  it('shows an empty state', async () => {
    api.get.mockImplementation(async (url) =>
      url === '/categories' ? { data: [] } : { data: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 } },
    )
    render(
      <MemoryRouter initialEntries={['/books?q=zzz']}>
        <BookList />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Không tìm thấy sách phù hợp')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    let fail = true
    api.get.mockImplementation(async (url) => {
      if (url === '/categories') return { data: [] }
      if (fail) throw new Error('x')
      return { data: page1 }
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/books']}>
        <BookList />
      </MemoryRouter>,
    )
    await screen.findByText('Không thể tải danh sách sách, vui lòng thử lại')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Sách 1')).toBeInTheDocument()
  })

  it('still lists books when the category filter fails to load', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/categories') throw new Error('x')
      return { data: page1 }
    })
    await renderAt()
    expect(screen.getByText('Sách 1')).toBeInTheDocument()
  })
})
