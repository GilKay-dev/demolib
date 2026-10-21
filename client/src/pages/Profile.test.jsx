import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { api } from '../lib/api'
import Profile from './Profile'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
  setToken: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}))

const profile = {
  id: 5,
  email: 'a@b.com',
  name: 'An',
  phone: null,
  address: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  borrowCount: 3,
  totalFine: 50000,
}

const renderProfile = () =>
  render(
    <AuthProvider>
      <Profile />
    </AuthProvider>,
  )

describe('Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.get.mockResolvedValue({ data: profile })
  })

  it('shows the profile, stats, and "Chưa cập nhật" for empty phone/address', async () => {
    renderProfile()
    expect(await screen.findByText('a@b.com')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa cập nhật')).toHaveLength(2)
    expect(screen.getByText('02/01/2026')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/50\.000/)).toBeInTheDocument()
  })

  it('shows an error when the profile cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('x'))
    renderProfile()
    expect(await screen.findByText('Không thể tải hồ sơ, vui lòng thử lại')).toBeInTheDocument()
  })

  describe('edit', () => {
    async function openEdit(user) {
      renderProfile()
      await user.click(await screen.findByRole('button', { name: 'Cập nhật thông tin' }))
    }

    it('validates fields and does not call the API', async () => {
      const user = userEvent.setup()
      await openEdit(user)
      await user.clear(screen.getByLabelText('Tên'))
      await user.type(screen.getByLabelText('Số điện thoại'), '123')
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(await screen.findByText('Tên không được để trống')).toBeInTheDocument()
      expect(screen.getByText(/Số điện thoại không hợp lệ/)).toBeInTheDocument()
      expect(screen.getByText('Địa chỉ không được để trống')).toBeInTheDocument()
      expect(api.put).not.toHaveBeenCalled()
    })

    it('saves, returns to the view and updates the displayed name', async () => {
      api.put.mockResolvedValue({
        data: { message: 'Cập nhật thành công', user: { ...profile, name: 'Bình', phone: '0912345678', address: 'HN' } },
      })
      const user = userEvent.setup()
      await openEdit(user)
      await user.clear(screen.getByLabelText('Tên'))
      await user.type(screen.getByLabelText('Tên'), 'Bình')
      await user.type(screen.getByLabelText('Số điện thoại'), '0912345678')
      await user.type(screen.getByLabelText('Địa chỉ'), 'HN')
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(await screen.findByText('Cập nhật thành công')).toBeInTheDocument()
      expect(api.put).toHaveBeenCalledWith('/me', { name: 'Bình', phone: '0912345678', address: 'HN' })
      expect(screen.getByText('Bình')).toBeInTheDocument()
    })

    it('cancel restores the view without calling the API', async () => {
      const user = userEvent.setup()
      await openEdit(user)
      await user.type(screen.getByLabelText('Tên'), 'zzz')
      await user.click(screen.getByRole('button', { name: 'Hủy' }))
      expect(screen.getByText('An')).toBeInTheDocument()
      expect(api.put).not.toHaveBeenCalled()
    })
  })

  describe('change password', () => {
    async function openPassword(user) {
      renderProfile()
      await user.click(await screen.findByRole('button', { name: 'Đổi mật khẩu' }))
    }
    const fill = async (user, cur = 'password1', next = 'newpassword2', confirm = 'newpassword2') => {
      await user.type(screen.getByLabelText('Mật khẩu hiện tại'), cur)
      await user.type(screen.getByLabelText('Mật khẩu mới'), next)
      await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), confirm)
      await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    }

    it('rejects a new password equal to the current one or a mismatched confirmation', async () => {
      const user = userEvent.setup()
      await openPassword(user)
      await fill(user, 'password1', 'password1', 'other1234')
      expect(await screen.findByText('Mật khẩu mới phải khác mật khẩu cũ')).toBeInTheDocument()
      expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
      expect(api.put).not.toHaveBeenCalled()
    })

    it('shows the server error when the current password is wrong', async () => {
      api.put.mockRejectedValue({
        response: { status: 400, data: { errors: { currentPassword: 'Mật khẩu hiện tại không đúng' } } },
      })
      const user = userEvent.setup()
      await openPassword(user)
      await fill(user)
      expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument()
    })

    it('confirms success', async () => {
      api.put.mockResolvedValue({ data: { message: 'Đổi mật khẩu thành công' } })
      const user = userEvent.setup()
      await openPassword(user)
      await fill(user)
      expect(await screen.findByText('Đổi mật khẩu thành công')).toBeInTheDocument()
      await waitFor(() =>
        expect(api.put).toHaveBeenCalledWith('/me/password', {
          currentPassword: 'password1',
          newPassword: 'newpassword2',
          confirmPassword: 'newpassword2',
        }),
      )
    })
  })
})
