import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import ReturnRequests from './ReturnRequests'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const item = (over = {}) => ({
  id: 5,
  createdAt: '2026-10-20T03:00:00.000Z',
  daysLate: 0,
  borrow: {
    id: 8,
    borrowDate: '2026-10-01',
    dueDate: '2026-10-15',
    reader: { id: 9, name: 'An' },
    book: { id: 4, title: 'Clean Code', author: 'Martin' },
  },
  ...over,
})
const fineLevels = [{ id: 1, name: 'Hư nhẹ', amount: '20000' }]
const renderPage = () => render(<MemoryRouter><ReturnRequests /></MemoryRouter>)
const open = async () => userEvent.click(await screen.findByRole('button', { name: 'Xác nhận trả' }))
const pick = (label, value) => userEvent.selectOptions(screen.getByLabelText(label), value)
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))

describe('ReturnRequests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { items: [item()], fineLevels } })
    api.post.mockResolvedValue({ data: { totalFine: 0 } })
  })

  it('lists pending requests', async () => {
    renderPage()
    expect(await screen.findByText('Clean Code')).toBeInTheDocument()
    expect(screen.getByText('An')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    api.get.mockResolvedValue({ data: { items: [], fineLevels } })
    renderPage()
    expect(await screen.findByText('Không có yêu cầu trả chờ xác nhận')).toBeInTheDocument()
  })

  it('requires a condition', async () => {
    renderPage()
    await open()
    await submit()
    expect(await screen.findByText('Bắt buộc chọn tình trạng')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('confirms a normal return and reloads', async () => {
    renderPage()
    await open()
    await pick('Tình trạng sách', 'NORMAL')
    expect(screen.queryByLabelText('Ghi chú')).not.toBeInTheDocument()
    await submit()
    expect(api.post).toHaveBeenCalledWith('/return-requests/5/confirm', { condition: 'NORMAL' })
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Đã xác nhận trả sách')).toBeInTheDocument()
  })

  it('requires fine level and note for damaged books', async () => {
    renderPage()
    await open()
    await pick('Tình trạng sách', 'DAMAGED')
    await submit()
    expect(await screen.findByText('Bắt buộc chọn mức phạt')).toBeInTheDocument()
    expect(screen.getByText('Bắt buộc nhập ghi chú')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sends level and trimmed note for a lost book and shows the total fine', async () => {
    api.post.mockResolvedValue({ data: { totalFine: 20000 } })
    renderPage()
    await open()
    await pick('Tình trạng sách', 'LOST')
    await pick('Mức phạt', '1')
    await userEvent.type(screen.getByLabelText('Ghi chú'), '  mất sách ')
    await submit()
    expect(api.post).toHaveBeenCalledWith('/return-requests/5/confirm', { condition: 'LOST', conditionFineLevelId: 1, note: 'mất sách' })
    expect(await screen.findByText(/tổng tiền phạt/)).toBeInTheDocument()
  })

  it('requires a late fine level when overdue and sends it', async () => {
    api.get.mockResolvedValue({ data: { items: [item({ daysLate: 3 })], fineLevels } })
    renderPage()
    await open()
    expect(screen.getByText('Trả muộn 3 ngày')).toBeInTheDocument()
    await pick('Tình trạng sách', 'NORMAL')
    await submit()
    expect(await screen.findByText('Bắt buộc chọn mức phạt trả muộn')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    await pick('Mức phạt trả muộn', '1')
    await submit()
    expect(api.post).toHaveBeenCalledWith('/return-requests/5/confirm', { condition: 'NORMAL', lateFineLevelId: 1 })
  })

  it('warns when no fine levels are configured', async () => {
    api.get.mockResolvedValue({ data: { items: [item({ daysLate: 1 })], fineLevels: [] } })
    renderPage()
    await open()
    expect(screen.getByText(/Chưa có mức phạt/)).toBeInTheDocument()
  })

  it('shows the server error and reloads on 409', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { message: 'Yêu cầu đã được xử lý bởi người khác, vui lòng tải lại danh sách' } } })
    renderPage()
    await open()
    await pick('Tình trạng sách', 'NORMAL')
    await submit()
    expect(await screen.findByText(/đã được xử lý bởi người khác/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
