import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Review from './Review'
import { getDueFlashcards } from '../lib/progress'
import { startStudySession } from '../lib/studySessions'

vi.mock('../lib/progress')
vi.mock('../lib/studySessions')
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../components/flashcards/FlashcardSession', () => ({ default: vi.fn(() => null) }))
import FlashcardSession from '../components/flashcards/FlashcardSession'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

beforeEach(() => {
  vi.clearAllMocks()
  getDueFlashcards.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
  startStudySession.mockResolvedValue({ id: 'session-1' })
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <Review />
    </MemoryRouter>,
  )

describe('Review (wrapper)', () => {
  it('passes a cross-document loadSession with no document or study set tie', async () => {
    renderPage()
    const props = FlashcardSession.mock.calls[0][0]
    expect(props.defaultTitle).toBe('Review')
    expect(props.emptyMessage).toMatch(/no cards are due/i)

    const result = await props.loadSession()
    expect(getDueFlashcards).toHaveBeenCalled()
    expect(startStudySession).toHaveBeenCalledWith('u1', null, { mode: 'review' })
    expect(result).toEqual({ title: 'Review', cards: [{ id: 'c1' }, { id: 'c2' }], session: { id: 'session-1' } })
  })

  it('onDone navigates to /dashboard', () => {
    renderPage()
    FlashcardSession.mock.calls[0][0].onDone()
    expect(navigateSpy).toHaveBeenCalledWith('/dashboard')
  })
})
