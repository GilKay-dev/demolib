import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { AuthProvider } from './context/AuthContext'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

const jwt = () => `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.s`
const signIn = (role) => localStorage.setItem('auth', JSON.stringify({ token: jwt(), user: { name: 'An', role } }))

describe('App', () => {
  beforeEach(() => localStorage.clear())

  it('renders the heading', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: /thư viện/i })).toBeInTheDocument()
  })

  it('redirects an anonymous visitor from /profile to the login page', () => {
    renderAt('/profile')
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument()
  })

  it('sends a non-reader away from /profile', () => {
    signIn('LIBRARIAN')
    renderAt('/profile')
    expect(screen.getByRole('heading', { name: /thư viện/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hồ sơ cá nhân' })).not.toBeInTheDocument()
  })

  it('shows the profile link and logout for a signed-in reader', () => {
    signIn('READER')
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Hồ sơ cá nhân' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument()
  })
})
