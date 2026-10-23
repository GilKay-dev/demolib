import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import Users from './Users'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

const user = (over = {}) => ({ id: 2, email: 'an@x.com', name: 'An', role: 'READER', status: 'ACTIVE', createdAt: '2026-10-01T00:00:00.000Z', ...over })
const page = (items, over = {}) => ({ data: { items, page: 1, pageSize: 10, total: items.length, totalPages: 1, ...over } })

describe('Users', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue(page([user(), user({ id: 3, email: 'bo@x.com', name: 'Bo', role: 'LIBRARIAN', status: 'PENDING' })]))
  })

  it('lists users with role and status labels', async () => {
    render(<Users />)
    expect(await screen.findByText('an@x.com')).toBeInTheDocument()
    expect(screen.getByLabelText('Vai trò của bo@x.com')).toHaveValue('LIBRARIAN')
    expect(screen.getByText('Chờ kích hoạt')).toBeInTheDocument()
  })

  it('assigns a new role', async () => {
    api.patch.mockResolvedValue({ data: user({ role: 'LIBRARIAN' }) })
    render(<Users />)
    const u = userEvent.setup()
    await u.selectOptions(await screen.findByLabelText('Vai trò của an@x.com'), 'LIBRARIAN')
    expect(api.patch).toHaveBeenCalledWith('/users/2/role', { role: 'LIBRARIAN' })
    expect(await screen.findByRole('status')).toHaveTextContent('Đã đổi vai trò của an@x.com thành Librarian')
    expect(screen.getByLabelText('Vai trò của an@x.com')).toHaveValue('LIBRARIAN')
  })

  it('shows the server message when the role change is refused', async () => {
    api.patch.mockRejectedValue({ response: { status: 409, data: { message: 'Bạn không thể đổi vai trò của chính mình' } } })
    render(<Users />)
    const u = userEvent.setup()
    await u.selectOptions(await screen.findByLabelText('Vai trò của an@x.com'), 'ADMIN')
    expect(await screen.findByRole('alert')).toHaveTextContent('đổi vai trò của chính mình')
  })

  it('does not offer a role picker for the signed-in admin', async () => {
    useAuth.mockReturnValue({ user: { id: 2 } })
    render(<Users />)
    await screen.findByText('an@x.com')
    expect(screen.queryByLabelText('Vai trò của an@x.com')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Vai trò của bo@x.com')).toBeInTheDocument()
  })

  it('searches by text and role, resetting to page 1', async () => {
    render(<Users />)
    await screen.findByText('an@x.com')
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Tìm theo email/tên'), ' an ')
    await u.selectOptions(screen.getByLabelText('Vai trò'), 'READER')
    await u.click(screen.getByRole('button', { name: 'Tìm kiếm' }))
    expect(api.get).toHaveBeenLastCalledWith('/users', { params: { page: 1, q: 'an', role: 'READER' } })
  })

  it('disables an active account', async () => {
    api.patch.mockResolvedValue({ data: user({ status: 'DISABLED' }) })
    render(<Users />)
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Vô hiệu hóa an@x.com' }))
    expect(api.patch).toHaveBeenCalledWith('/users/2/status', { status: 'DISABLED' })
    expect(await screen.findByRole('status')).toHaveTextContent('Đã vô hiệu hóa tài khoản an@x.com')
    expect(screen.getByRole('button', { name: 'Kích hoạt an@x.com' })).toBeInTheDocument()
  })

  it('activates a pending account', async () => {
    api.patch.mockResolvedValue({ data: user({ id: 3, email: 'bo@x.com', status: 'ACTIVE' }) })
    render(<Users />)
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Kích hoạt bo@x.com' }))
    expect(api.patch).toHaveBeenCalledWith('/users/3/status', { status: 'ACTIVE' })
  })

  it('shows the server message when the update is refused', async () => {
    api.patch.mockRejectedValue({ response: { status: 409, data: { message: 'Bạn không thể vô hiệu hóa chính tài khoản của mình' } } })
    render(<Users />)
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Vô hiệu hóa an@x.com' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('chính tài khoản của mình')
  })

  it('paginates', async () => {
    api.get.mockResolvedValue(page([user()], { totalPages: 2 }))
    render(<Users />)
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Sau' }))
    expect(api.get).toHaveBeenLastCalledWith('/users', { params: { page: 2 } })
  })

  it('shows an error with retry when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('x'))
    render(<Users />)
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('an@x.com')).toBeInTheDocument()
  })
})
