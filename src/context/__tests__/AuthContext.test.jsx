import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthContext'
import { useAuth } from '../useAuth'
import RecoverPassword from '../../pages/RecoverPassword'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}))

const unsubscribe = vi.fn()
let onAuthChange

beforeEach(() => {
  vi.clearAllMocks()
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
  supabase.auth.onAuthStateChange.mockImplementation((callback) => {
    onAuthChange = callback
    return { data: { subscription: { unsubscribe } } }
  })
})

function SessionStatus() {
  const { user, loading } = useAuth()
  return <p>{loading ? 'Loading session' : user?.id ?? 'Signed out'}</p>
}

it('shares restored sessions and auth changes with the public hook', async () => {
  const { unmount } = render(<AuthProvider><SessionStatus /></AuthProvider>)
  expect(await screen.findByText('u1')).toBeInTheDocument()
  act(() => onAuthChange('SIGNED_OUT', null))
  expect(screen.getByText('Signed out')).toBeInTheDocument()
  unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('lets password recovery consume the real provider without a context error', async () => {
  render(
    <MemoryRouter initialEntries={['/recover-password?mode=reset']}>
      <AuthProvider><RecoverPassword /></AuthProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
