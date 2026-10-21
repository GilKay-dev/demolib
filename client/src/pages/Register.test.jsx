import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import Register from './Register'

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }))

async function fill(user, { email = 'a@b.com', name = 'An', password = 'password1', confirm = 'password1' } = {}) {
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (name) await user.type(screen.getByLabelText('Tên'), name)
  if (password) await user.type(screen.getByLabelText('Mật khẩu'), password)
  if (confirm) await user.type(screen.getByLabelText('Xác nhận mật khẩu'), confirm)
  await user.click(screen.getByRole('button', { name: 'Đăng ký' }))
}

describe('Register', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the error out of the input label and links it with aria-describedby', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await fill(user, { email: 'abc' })
    const input = await screen.findByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Email không hợp lệ')
  })

  it('re-validates the confirmation when the password changes', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await fill(user)
    expect(api.post).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText('Mật khẩu'), 'x')
    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
  })

  it('shows an error for a field the form does not have', async () => {
    api.post.mockRejectedValue({ response: { data: { errors: { role: 'Trường không hợp lệ' } } } })
    const user = userEvent.setup()
    render(<Register />)
    await fill(user)
    expect(await screen.findByText('Trường không hợp lệ')).toBeInTheDocument()
  })

  it('shows validation errors and does not call the API', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await fill(user, { email: 'abc', name: '', password: 'short', confirm: 'other' })
    expect(await screen.findByText('Email không hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('Tên không được để trống')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu phải từ 8 đến 16 ký tự')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the pending-activation message on success', async () => {
    api.post.mockResolvedValue({ data: { message: 'Đăng ký thành công, vui lòng chờ quản lý viên kích hoạt' } })
    const user = userEvent.setup()
    render(<Register />)
    await fill(user)
    expect(await screen.findByRole('status')).toHaveTextContent('Đăng ký thành công')
  })

  it('maps a 409 duplicate email to the email field', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { errors: { email: 'Email đã được sử dụng' } } } })
    const user = userEvent.setup()
    render(<Register />)
    await fill(user)
    await waitFor(() => expect(screen.getByText('Email đã được sử dụng')).toBeInTheDocument())
  })
})
