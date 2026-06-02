import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './AuthPage.css'

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signup(email, password)
      navigate('/scrape')
    } catch (err) {
      setError(err.message || 'Signup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1 className="auth-title">Sign up</h1>
        <label className="auth-label" htmlFor="email">Email</label>
        <input id="email" className="auth-input" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label className="auth-label" htmlFor="password">Password</label>
        <input id="password" className="auth-input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="auth-switch">Have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  )
}
