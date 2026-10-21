import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import Categories from './Categories'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const list = [
  { id: 1, name: 'Khoa học', bookCount: 2 },
  { id: 2, name: 'Thiếu nhi', bookCount: 0 },
]

const failure = (status, data) => ({ response: { status, data } })
const nameInput = (name) => screen.getByLabelText(`Tên thể loại ${name}`)

async function renderPage() {
  render(<Categories />)
  await screen.findByLabelText('Tên thể loại Khoa học')
}

describe('Categories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: list })
  })

  it('lists categories with book counts and disables delete when books exist', async () => {
    await renderPage()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('2')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('button', { name: 'Xóa' })).toBeDisabled()
    expect(within(rows[1]).getByRole('button', { name: 'Xóa' })).toBeEnabled()
  })

  it('shows an error with retry when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('x'))
    render(<Categories />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByLabelText('Tên thể loại Khoa học')).toBeInTheDocument()
  })

  describe('add', () => {
    it('validates the name and does not call the API', async () => {
      const user = userEvent.setup()
      await renderPage()
      await user.click(screen.getByRole('button', { name: 'Thêm thể loại sách' }))
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(await screen.findByText('Tên thể loại không được để trống')).toBeInTheDocument()
      await user.type(screen.getByLabelText('Tên thể loại mới'), 'a'.repeat(51))
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(await screen.findByText('Tên thể loại tối đa 50 ký tự')).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('adds a row on success', async () => {
      api.post.mockResolvedValue({ data: { id: 3, name: 'Lịch sử', bookCount: 0 } })
      const user = userEvent.setup()
      await renderPage()
      await user.click(screen.getByRole('button', { name: 'Thêm thể loại sách' }))
      await user.type(screen.getByLabelText('Tên thể loại mới'), 'Lịch sử')
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(await screen.findByLabelText('Tên thể loại Lịch sử')).toBeInTheDocument()
      expect(api.post).toHaveBeenCalledWith('/categories', { name: 'Lịch sử' })
    })

    it('shows the duplicate-name error from the server', async () => {
      api.post.mockRejectedValue(failure(409, { errors: { name: 'Thể loại đã tồn tại' } }))
      const user = userEvent.setup()
      await renderPage()
      await user.click(screen.getByRole('button', { name: 'Thêm thể loại sách' }))
      await user.type(screen.getByLabelText('Tên thể loại mới'), 'khoa học')
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(await screen.findByText('Thể loại đã tồn tại')).toBeInTheDocument()
    })
  })

  describe('inline edit', () => {
    it('saves on Enter', async () => {
      api.put.mockResolvedValue({ data: { id: 2, name: 'Trẻ em', bookCount: 0 } })
      const user = userEvent.setup()
      await renderPage()
      await user.clear(nameInput('Thiếu nhi'))
      await user.type(nameInput('Thiếu nhi'), 'Trẻ em{Enter}')
      expect(await screen.findByText('Lưu thành công')).toBeInTheDocument()
      expect(api.put).toHaveBeenCalledWith('/categories/2', { name: 'Trẻ em' })
    })

    it('does not call the API when the value is unchanged', async () => {
      const user = userEvent.setup()
      await renderPage()
      await user.click(nameInput('Thiếu nhi'))
      await user.tab()
      expect(api.put).not.toHaveBeenCalled()
    })

    it('Esc restores the old value without calling the API', async () => {
      const user = userEvent.setup()
      await renderPage()
      await user.type(nameInput('Thiếu nhi'), 'zzz{Escape}')
      expect(nameInput('Thiếu nhi')).toHaveValue('Thiếu nhi')
      expect(api.put).not.toHaveBeenCalled()
    })

    it('sends the trimmed name and shows it back in the input', async () => {
      api.put.mockResolvedValue({ data: { id: 2, name: 'Văn học', bookCount: 0 } })
      const user = userEvent.setup()
      await renderPage()
      await user.clear(nameInput('Thiếu nhi'))
      await user.type(nameInput('Thiếu nhi'), '  Văn học  {Enter}')
      expect(await screen.findByLabelText('Tên thể loại Văn học')).toHaveValue('Văn học')
      expect(api.put).toHaveBeenCalledWith('/categories/2', { name: 'Văn học' })
    })

    it('ignores a second commit while a save is in flight', async () => {
      let resolve
      api.put.mockReturnValue(new Promise((r) => { resolve = r }))
      const user = userEvent.setup()
      await renderPage()
      await user.type(nameInput('Thiếu nhi'), 'x{Enter}')
      await user.click(nameInput('Thiếu nhi'))
      await user.type(nameInput('Thiếu nhi'), 'y')
      await user.tab()
      expect(api.put).toHaveBeenCalledTimes(1)
      resolve({ data: { id: 2, name: 'Thiếu nhix', bookCount: 0 } })
    })

    it('shows validation and server errors at the cell and keeps the typed value', async () => {
      api.put.mockRejectedValue(failure(409, { errors: { name: 'Thể loại đã tồn tại' } }))
      const user = userEvent.setup()
      await renderPage()
      await user.clear(nameInput('Thiếu nhi'))
      await user.tab()
      expect(await screen.findByText('Tên thể loại không được để trống')).toBeInTheDocument()
      expect(api.put).not.toHaveBeenCalled()
      await user.type(nameInput('Thiếu nhi'), 'Khoa học{Enter}')
      expect(await screen.findByText('Thể loại đã tồn tại')).toBeInTheDocument()
    })

    it('reloads the table when the category no longer exists', async () => {
      api.put.mockRejectedValue(failure(404, { message: 'Thể loại không tồn tại' }))
      const user = userEvent.setup()
      await renderPage()
      await user.type(nameInput('Thiếu nhi'), 'x{Enter}')
      expect(await screen.findByText(/không còn tồn tại/)).toBeInTheDocument()
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    })
  })

  describe('delete', () => {
    it('asks for confirmation, and cancel changes nothing', async () => {
      const user = userEvent.setup()
      await renderPage()
      await user.click(within(screen.getAllByRole('row')[2]).getByRole('button', { name: 'Xóa' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Thiếu nhi')
      await user.click(screen.getByRole('button', { name: 'Hủy' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('removes the row after confirmation', async () => {
      api.delete.mockResolvedValue({ data: { message: 'Xóa thể loại thành công' } })
      const user = userEvent.setup()
      await renderPage()
      await user.click(within(screen.getAllByRole('row')[2]).getByRole('button', { name: 'Xóa' }))
      await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
      expect(await screen.findByText('Xóa thể loại thành công')).toBeInTheDocument()
      expect(api.delete).toHaveBeenCalledWith('/categories/2')
      expect(screen.queryByLabelText('Tên thể loại Thiếu nhi')).not.toBeInTheDocument()
    })

    it('shows the server guard message on 409 and keeps the dialog open', async () => {
      api.delete.mockRejectedValue(failure(409, { message: 'Không thể xóa: còn 1 sách thuộc thể loại này' }))
      const user = userEvent.setup()
      await renderPage()
      await user.click(within(screen.getAllByRole('row')[2]).getByRole('button', { name: 'Xóa' }))
      await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
      expect(await screen.findByText('Không thể xóa: còn 1 sách thuộc thể loại này')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
