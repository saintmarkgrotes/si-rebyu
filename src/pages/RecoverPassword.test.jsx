import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import RecoverPassword from './RecoverPassword'
import { supabase } from '../lib/supabase'

const auth = { user: null, loading: false }
vi.mock('../context/useAuth', () => ({ useAuth: () => auth }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { resetPasswordForEmail: vi.fn(), updateUser: vi.fn() } } }))
const show = (path = '/recover-password') => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/recover-password" element={<RecoverPassword />} /><Route path="/settings" element={<div>Settings page</div>} />
</Routes></MemoryRouter>)
beforeEach(() => { vi.clearAllMocks(); auth.user = null; supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null }); supabase.auth.updateUser.mockResolvedValue({ error: null }) })
it('sends recovery links back to the deployed origin without revealing account existence', async () => {
  const user = userEvent.setup(); show()
  await user.type(screen.getByLabelText('Email'), 'me@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('me@example.test', { redirectTo: `${window.location.origin}/recover-password?mode=reset` })
  expect(await screen.findByRole('status')).toHaveTextContent('If this email has an account')
})
it('rejects an expired recovery link', () => {
  show('/recover-password?mode=reset')
  expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('missing or expired')
})
it('updates the password for the recovered session', async () => {
  auth.user = { id: 'u1' }; const user = userEvent.setup(); show('/recover-password?mode=reset')
  await user.type(screen.getByLabelText('New password'), 'new-password')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password')
  await user.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByText('Settings page')).toBeInTheDocument()
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
})
