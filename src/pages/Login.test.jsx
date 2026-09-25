import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

const mockAuth = { user: null, loading: false, login: vi.fn() }
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const renderAt = (path = '/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/quiz/:id" element={<div>Quiz page</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  mockAuth.user = null
  mockAuth.loading = false
  mockAuth.login = vi.fn().mockResolvedValue()
})

describe('Login', () => {
  it('shows the form for a signed-out visitor', () => {
    renderAt()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('an already signed-in user skips the form and lands on the dashboard', () => {
    mockAuth.user = { id: 'u1' }
    renderAt()
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('does not redirect while auth is still resolving, even if a session will turn out to exist', () => {
    mockAuth.user = null
    mockAuth.loading = true
    renderAt()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('submitting takes the user to /dashboard by default', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })

  it('shows the login error and does not navigate when login fails', async () => {
    mockAuth.login = vi.fn().mockRejectedValue(new Error('Invalid credentials'))
    const user = userEvent.setup()
    renderAt()
    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
