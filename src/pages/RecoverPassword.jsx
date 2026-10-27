import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import Card from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'

export default function RecoverPassword() {
  const [params] = useSearchParams()
  const updating = params.get('mode') === 'reset'
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setError(''); setMessage(''); setSaving(true)
    try {
      if (updating) {
        if (!user) throw new Error('This reset link has expired. Request a new link below.')
        if (password.length < 8) throw new Error('Use at least 8 characters.')
        if (password !== confirm) throw new Error('Passwords do not match.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        navigate('/settings', { replace: true })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/recover-password?mode=reset`,
        })
        if (error) throw error
        setMessage('If this email has an account, you will receive a password reset link.')
      }
    } catch (err) { setError(err.message || 'Could not reset your password. Please try again.') }
    finally { setSaving(false) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center"><h1 className="text-2xl font-semibold text-ink">{updating ? 'Choose a new password' : 'Reset password'}</h1></div>
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-5">
            {updating ? <>
              <Input id="new-password" type="password" label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <Input id="confirm-password" type="password" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </> : <Input id="email" type="email" label="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {message && <p role="status" className="text-sm text-muted">{message}</p>}
            {updating && !loading && !user && <p role="alert" className="text-sm text-danger">Your reset link is missing or expired. <Link to="/recover-password" className="underline">Request a new link</Link>.</p>}
            <Button type="submit" loading={saving} disabled={updating && (loading || !user)} className="w-full">{updating ? 'Update password' : 'Send reset link'}</Button>
            <Link to="/login" className="text-sm text-muted hover:text-ink">Back to sign in</Link>
          </form>
        </Card>
      </div>
    </div>
  )
}
