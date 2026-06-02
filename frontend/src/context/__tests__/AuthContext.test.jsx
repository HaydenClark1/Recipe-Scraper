import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../api/client.js', () => ({
  getToken: vi.fn().mockResolvedValue(null),
  setToken: vi.fn().mockResolvedValue(undefined),
  clearToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../api/auth.js', () => ({
  login: vi.fn(),
  signup: vi.fn(),
}))

import * as client from '../../api/client.js'
import * as authApi from '../../api/auth.js'
import { AuthProvider, useAuth } from '../AuthContext.jsx'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

beforeEach(() => {
  vi.clearAllMocks()
  client.getToken.mockResolvedValue(null)
})

describe('AuthContext', () => {
  it('starts unauthenticated when no token stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('login stores token and sets user', async () => {
    authApi.login.mockResolvedValue({ token: 'tok', user: { id: 1, email: 'a@b.com' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.login('a@b.com', 'pw') })
    expect(client.setToken).toHaveBeenCalledWith('tok')
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({ id: 1, email: 'a@b.com' })
  })

  it('logout clears token and user', async () => {
    authApi.login.mockResolvedValue({ token: 'tok', user: { id: 1, email: 'a@b.com' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.login('a@b.com', 'pw') })
    await act(async () => { await result.current.logout() })
    expect(client.clearToken).toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
