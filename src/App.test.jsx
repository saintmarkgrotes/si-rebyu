import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

afterEach(() => window.history.replaceState({}, '', '/'))

it('routes recovery links to the password reset form with the real auth provider', async () => {
  window.history.replaceState({}, '', '/recover-password?mode=reset')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('routes recovery requests to the email form', async () => {
  window.history.replaceState({}, '', '/recover-password')
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Send reset link' })).toBeEnabled()
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
})
