import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const login = vi.fn()
const navigate = vi.fn()
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ login }) }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  Link: ({ children }) => <a>{children}</a>,
}))
import { LoginPage } from '../LoginPage.jsx'

beforeEach(() => vi.clearAllMocks())

describe('LoginPage', () => {
  it('submits email and password and navigates on success', async () => {
    login.mockResolvedValue(undefined)
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw123456' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.com', 'pw123456'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/scrape'))
  })

  it('shows an error message when login fails', async () => {
    login.mockRejectedValue(new Error('Incorrect email or password'))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(screen.getByText('Incorrect email or password')).toBeInTheDocument())
  })
})
