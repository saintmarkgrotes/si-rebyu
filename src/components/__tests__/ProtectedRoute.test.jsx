import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import ProtectedRoute from '../ProtectedRoute'

const LoginStub = () => {
  const location = useLocation()
  return <div>Login page (from: {location.state?.from?.pathname || 'none'})</div>
}

const mockAuth = vi.fn()
vi.mock('../../context/useAuth', () => ({ useAuth: () => mockAuth() }))

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/quiz/:id"
          element={
            <ProtectedRoute>
              <div>Quiz page</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>,
  )

describe('ProtectedRoute', () => {
  it('renders its children for a signed-in user', () => {
    mockAuth.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/quiz/set-1')
    expect(screen.getByText('Quiz page')).toBeInTheDocument()
  })

  it('redirects to login for a signed-out visitor, remembering where they were headed', () => {
    mockAuth.mockReturnValue({ user: null, loading: false })
    renderAt('/quiz/set-1')
    expect(screen.getByText('Login page (from: /quiz/set-1)')).toBeInTheDocument()
  })

  it('renders nothing while auth is still loading', () => {
    mockAuth.mockReturnValue({ user: null, loading: true })
    const { container } = renderAt('/quiz/set-1')
    expect(container).toBeEmptyDOMElement()
  })
})
