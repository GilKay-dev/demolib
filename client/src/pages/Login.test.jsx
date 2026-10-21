import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { api } from '../lib/api'
import Login from './Login'

vi.mock('../lib/api', () => ({ api: { post: vi.fn(), defaults: { headers: { common: {} } } } }))

const navigate = vi.fn()
vi.mock('react-router', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }))

async function submit(user, { email = 'a@b.com', password = 'password1' } = {}) {
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Mật khẩu'), password)
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
}

const renderLogin = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  )

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows validation errors and does not call the API', async () => {
    const user = userEvent.setup()
    renderLogin()
    await submit(user, { email: 'abc', password: 'short' })
    expect(await screen.findByText('Email không hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu phải từ 8 đến 16 ký tự')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('stores the token and redirects on success', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', user: { id: 1, role: 'READER' } } })
    const user = userEvent.setup()
    renderLogin()
    await submit(user)
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'password1' })
    expect(JSON.parse(localStorage.getItem('auth')).token).toBe('jwt')
    expect(api.defaults.headers.common.Authorization).toBe('Bearer jwt')
  })

  it.each([
    [401, 'Email hoặc mật khẩu không đúng'],
    [403, 'Tài khoản đang chờ quản lý viên kích hoạt'],
  ])('shows the server message on %s', async (status, message) => {
    api.post.mockRejectedValue({ response: { status, data: { message } } })
    const user = userEvent.setup()
    renderLogin()
    await submit(user)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a generic error when the server is unreachable', async () => {
    api.post.mockRejectedValue(new Error('Network Error'))
    const user = userEvent.setup()
    renderLogin()
    await submit(user)
    expect(await screen.findByText('Không thể đăng nhập, vui lòng thử lại')).toBeInTheDocument()
  })
})
