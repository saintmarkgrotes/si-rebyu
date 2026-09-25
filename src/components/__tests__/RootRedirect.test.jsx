import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import RootRedirect from '../RootRedirect'

const mockAuth = vi.fn()
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth() }))

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('RootRedirect', () => {
  it('sends a signed-in user to the dashboard', () => {
    mockAuth.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('sends a signed-out visitor to login', () => {
    mockAuth.mockReturnValue({ user: null, loading: false })
    renderAt('/')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('renders nothing while auth is still loading, rather than guessing', () => {
    mockAuth.mockReturnValue({ user: null, loading: true })
    const { container } = renderAt('/')
    expect(container).toBeEmptyDOMElement()
  })

  it('an unmatched path behaves the same way as the bare root', () => {
    mockAuth.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/some/bad/typo')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })
})
