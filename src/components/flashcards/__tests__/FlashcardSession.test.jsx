import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FlashcardSession from '../FlashcardSession'
import { submitReview } from '../../../lib/flashcards'
import { endStudySession } from '../../../lib/studySessions'
import { ThemeProvider } from '../../../context/ThemeContext'

vi.mock('../../../lib/flashcards')
vi.mock('../../../lib/studySessions')
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const card = (id, front) => ({
  id, front, back: `Back of ${front}`, interval_days: 0, ease: 2.5, repetitions: 0, lapses: 0,
  times_reviewed: 0, times_correct: 0,
})

const renderSession = (props = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <FlashcardSession
          loadSession={vi.fn().mockResolvedValue({ title: 'Week 1', cards: [card('c1', 'What is a VLAN?')], session: { id: 'session-1' } })}
          defaultTitle="Flashcards"
          emptyMessage="Nothing to study."
          loadErrorMessage="Could not load."
          onDone={vi.fn()}
          {...props}
        />
      </ThemeProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  endStudySession.mockResolvedValue({})
  submitReview.mockImplementation(async (c) => ({ ...c }))
})

describe('FlashcardSession', () => {
  it('shows the default title while loading, then the loaded title', async () => {
    let resolveLoad
    const loadSession = vi.fn(() => new Promise((r) => { resolveLoad = r }))
    renderSession({ loadSession, defaultTitle: 'Loading title' })
    expect(screen.getByText('Loading title')).toBeInTheDocument()
    resolveLoad({ title: 'Real title', cards: [card('c1', 'Q')], session: { id: 's1' } })
    expect(await screen.findByText('Real title')).toBeInTheDocument()
  })

  it('shows the front, hides the back, then reveals it on click', async () => {
    const user = userEvent.setup()
    renderSession()
    await screen.findByText('What is a VLAN?')
    expect(screen.queryByText('Back of What is a VLAN?')).not.toBeInTheDocument()
    await user.click(screen.getByText('What is a VLAN?'))
    expect(screen.getByText('Back of What is a VLAN?')).toBeInTheDocument()
  })

  it('rating a card saves the review and calls submitReview with the session id', async () => {
    const user = userEvent.setup()
    renderSession()
    await screen.findByText('What is a VLAN?')
    await user.click(screen.getByText('What is a VLAN?'))
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(submitReview).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'good', 'session-1')
  })

  it('finishing shows the summary and calls onDone, ending the session', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    renderSession({ onDone })
    await screen.findByText('What is a VLAN?')
    await user.click(screen.getByText('What is a VLAN?'))
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(await screen.findByText('Session complete')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to documents' }))
    expect(onDone).toHaveBeenCalled()
    await waitFor(() => expect(endStudySession).toHaveBeenCalledWith('session-1'))
  })

  it('an empty deck shows the given empty message', async () => {
    renderSession({ loadSession: vi.fn().mockResolvedValue({ title: 'Empty', cards: [], session: { id: 's1' } }) })
    expect(await screen.findByText('Nothing to study.')).toBeInTheDocument()
  })

  it('a failed load shows the given error message as a fallback', async () => {
    renderSession({ loadSession: vi.fn().mockRejectedValue(new Error('')), loadErrorMessage: 'Could not load.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load.')
  })

  it('a failed load prefers the thrown error message when there is one', async () => {
    renderSession({ loadSession: vi.fn().mockRejectedValue(new Error('Row not found')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Row not found')
  })

  it('ends the session on unmount even if never finished', async () => {
    const { unmount } = renderSession()
    await screen.findByText('What is a VLAN?')
    unmount()
    expect(endStudySession).toHaveBeenCalledWith('session-1')
  })
})
