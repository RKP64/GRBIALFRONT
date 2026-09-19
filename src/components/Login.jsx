import { useState } from 'react'
import { api } from '../api'

const ORG_NAME = import.meta.env.VITE_ORG_NAME || 'KPMG'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    setError('')
    try {
      const result = await api.login(username.trim(), password)
      localStorage.setItem('kg_token', result.access_token)
      localStorage.setItem('kg_user', JSON.stringify(result.user))
      onLogin(result.user)
    } catch (err) {
      setError(err.message || 'Could not sign in.')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">{ORG_NAME}</div>
        <h1 className="login-title">Knowledge<span>Graph</span> Platform</h1>
        <p className="login-sub">Sign in to continue</p>

        {error && <div className="login-error">{error}</div>}

        <label className="login-label" htmlFor="login-user">Email</label>
        <input id="login-user" className="login-input" type="text"
               value={username} onChange={(e) => setUsername(e.target.value)}
               placeholder="you@kpmg.com" autoComplete="username" autoFocus />

        <label className="login-label" htmlFor="login-pass">Password</label>
        <input id="login-pass" className="login-input" type="password"
               value={password} onChange={(e) => setPassword(e.target.value)}
               placeholder="••••••••" autoComplete="current-password" />

        <button className="login-btn" type="submit"
                disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
