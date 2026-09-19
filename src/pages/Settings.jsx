import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/useTheme'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'
import NavHeader from '../components/NavHeader'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (password.length < 6) {
      setError('Use at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setPassword('')
    setConfirm('')
    setSuccess('Password updated.')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="new-password"
        type="password"
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        id="confirm-password"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-muted">{success}</p>}
      <div>
        <Button type="submit" loading={saving}>
          Update password
        </Button>
      </div>
    </form>
  )
}

const Settings = () => {
  const { user } = useAuth()
  const { preference, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your appearance and account.</p>

        <Card className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Appearance</h2>
          <p className="mt-1 text-sm text-muted">
            Choose how si-rebyu looks. “System” follows your device setting.
          </p>
          <div role="radiogroup" aria-label="Theme" className="mt-4 flex gap-2">
            {THEME_OPTIONS.map((opt) => {
              const selected = preference === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(opt.value)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line text-ink hover:bg-subtle'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="mt-6">
          <h2 className="text-lg font-semibold text-ink">Account</h2>
          <p className="mt-1 text-sm text-muted">Signed in as {user?.email}</p>
          <div className="mt-6">
            <ChangePasswordForm />
          </div>
        </Card>
      </main>
    </div>
  )
}

export default Settings
