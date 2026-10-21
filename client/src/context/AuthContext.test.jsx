import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setToken, setUnauthorizedHandler } from '../lib/api'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../lib/api', () => ({ setToken: vi.fn(), setUnauthorizedHandler: vi.fn() }))

const jwtWithExp = (exp) => `h.${btoa(JSON.stringify({ exp }))}.s`
const inFuture = () => Math.floor(Date.now() / 1000) + 3600

function Who() {
  const { user } = useAuth()
  return <p>{user ? user.name : 'anonymous'}</p>
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Who />
    </AuthProvider>,
  )

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('restores a saved session with an unexpired token', () => {
    const token = jwtWithExp(inFuture())
    localStorage.setItem('auth', JSON.stringify({ token, user: { name: 'An' } }))
    renderProvider()
    expect(screen.getByText('An')).toBeInTheDocument()
    expect(setToken).toHaveBeenCalledWith(token)
  })

  it('drops a saved session whose token has expired', () => {
    const token = jwtWithExp(Math.floor(Date.now() / 1000) - 10)
    localStorage.setItem('auth', JSON.stringify({ token, user: { name: 'An' } }))
    renderProvider()
    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(localStorage.getItem('auth')).toBeNull()
    expect(setToken).not.toHaveBeenCalled()
  })

  it('logs out when the API reports 401', () => {
    localStorage.setItem('auth', JSON.stringify({ token: jwtWithExp(inFuture()), user: { name: 'An' } }))
    renderProvider()
    const handler = setUnauthorizedHandler.mock.calls[0][0]
    act(() => handler())
    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(localStorage.getItem('auth')).toBeNull()
    expect(setToken).toHaveBeenLastCalledWith(null)
  })
})
