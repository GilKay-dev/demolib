import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import FineLevels from './FineLevels'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const list = [
  { id: 1, name: 'Hư nhẹ', amount: 50000, effectiveDate: '2026-10-01' },
  { id: 2, name: 'Mất sách', amount: 200000, effectiveDate: '2026-10-02' },
]

const failure = (status, data) => ({ response: { status, data } })

async function renderPage() {
  render(<FineLevels />)
  await screen.findByLabelText('Tên mức phạt Hư nhẹ')
}

describe('FineLevels', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: list })
  })

  it('lists levels in an editable table', async () => {
    await renderPage()
    expect(screen.getByLabelText('Số tiền Hư nhẹ')).toHaveValue('50000')
    expect(screen.getByLabelText('Ngày phạt Mất sách')).toHaveValue('2026-10-02')
  })

  it('shows an error with retry when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('x'))
    render(<FineLevels />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByLabelText('Tên mức phạt Hư nhẹ')).toBeInTheDocument()
  })

  it('saves an inline edit on Enter', async () => {
    api.put.mockResolvedValue({ data: { ...list[0], amount: 70000 } })
    await renderPage()
    const user = userEvent.setup()
    const amount = screen.getByLabelText('Số tiền Hư nhẹ')
    await user.clear(amount)
    await user.type(amount, '70000{Enter}')
    expect(api.put).toHaveBeenCalledWith('/fine-levels/1', { name: 'Hư nhẹ', amount: 70000, effectiveDate: '2026-10-01' })
    expect(await screen.findByRole('status')).toHaveTextContent('Lưu thành công')
  })

  it('does not call the API for invalid edits and restores on Escape', async () => {
    await renderPage()
    const user = userEvent.setup()
    const amount = screen.getByLabelText('Số tiền Hư nhẹ')
    await user.clear(amount)
    await user.type(amount, '0{Enter}')
    expect(await screen.findByText('Số tiền phải lớn hơn 0')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
    await user.click(amount)
    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('Số tiền Hư nhẹ')).toHaveValue('50000')
    expect(screen.queryByText('Số tiền phải lớn hơn 0')).not.toBeInTheDocument()
  })

  it('shows the server message when the new name is taken', async () => {
    api.put.mockRejectedValue(failure(409, { errors: { name: 'Mức phạt đã tồn tại' } }))
    await renderPage()
    const user = userEvent.setup()
    const name = screen.getByLabelText('Tên mức phạt Hư nhẹ')
    await user.clear(name)
    await user.type(name, 'Mất sách{Enter}')
    expect(await screen.findByText('Mức phạt đã tồn tại')).toBeInTheDocument()
  })

  it('validates the add form before calling the API', async () => {
    await renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Thêm mức phạt' }))
    await user.type(screen.getByLabelText('Tên mức phạt mới'), 'a'.repeat(26))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(screen.getByText('Tên mức phạt tối đa 25 ký tự')).toBeInTheDocument()
    expect(screen.getByText('Số tiền phải là số')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('adds a level and keeps the table sorted by amount', async () => {
    api.post.mockResolvedValue({ data: { id: 3, name: 'Trễ hạn', amount: 10000, effectiveDate: '2026-10-22' } })
    await renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Thêm mức phạt' }))
    await user.type(screen.getByLabelText('Tên mức phạt mới'), 'Trễ hạn')
    await user.type(screen.getByLabelText('Số tiền'), '10000')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(api.post).toHaveBeenCalledWith('/fine-levels', expect.objectContaining({ name: 'Trễ hạn', amount: 10000 }))
    expect(await screen.findByRole('status')).toHaveTextContent('Thêm mức phạt thành công')
    expect(screen.getAllByRole('row')[1]).toContainElement(screen.getByLabelText('Tên mức phạt Trễ hạn'))
  })

  it('deletes only after confirmation', async () => {
    api.delete.mockResolvedValue({ data: { message: 'Xóa mức phạt thành công' } })
    await renderPage()
    const user = userEvent.setup()
    await user.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Xóa' }))
    await user.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Xóa' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(api.delete).toHaveBeenCalledWith('/fine-levels/1')
    expect(await screen.findByRole('status')).toHaveTextContent('Xóa mức phạt thành công')
    expect(screen.queryByLabelText('Tên mức phạt Hư nhẹ')).not.toBeInTheDocument()
  })

  it('reloads the table when the level to delete no longer exists', async () => {
    api.delete.mockRejectedValue(failure(404, { message: 'Mức phạt không tồn tại' }))
    await renderPage()
    const user = userEvent.setup()
    await user.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Xóa' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('status')).toHaveTextContent('không còn tồn tại')
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
