import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FlashcardStudy from './FlashcardStudy'
import { getStudySet, getStudySetFlashcards, submitReview } from '../lib/flashcards'
import { startStudySession, endStudySession } from '../lib/studySessions'

vi.mock('../lib/flashcards')
vi.mock('../lib/studySessions')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

const card = (id, front) => ({
  id, front, back: `Back of ${front}`, interval_days: 0, ease: 2.5, repetitions: 0, lapses: 0,
  times_reviewed: 0, times_correct: 0,
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/study/set-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/study/:studySetId" element={<FlashcardStudy />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  getStudySet.mockResolvedValue({ id: 'set-1', title: 'Week 1', document_id: 'doc-1' })
  startStudySession.mockResolvedValue({ id: 'session-1' })
  endStudySession.mockResolvedValue({})
  submitReview.mockImplementation(async (c) => ({ ...c }))
})

describe('FlashcardStudy', () => {
  it('starts a flashcards-mode session for the right document and study set', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'What is a VLAN?')])
    renderPage()
    await screen.findByText('What is a VLAN?')
    expect(startStudySession).toHaveBeenCalledWith('u1', 'doc-1', { mode: 'flashcards', studySetId: 'set-1' })
  })

  it('shows the front, hides the back, then reveals it on click', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'What is a VLAN?')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('What is a VLAN?')
    expect(screen.queryByText('Back of What is a VLAN?')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Rate this card' })).not.toBeInTheDocument()
    await user.click(screen.getByText('What is a VLAN?'))
    expect(screen.getByText('Back of What is a VLAN?')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Rate this card' })).toBeInTheDocument()
  })

  it('rating a card saves the review and advances to the next card', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'Card one'), card('c2', 'Card two')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Card one')
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument()
    await user.click(screen.getByText('Card one'))
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(submitReview).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'good', 'session-1')
    expect(await screen.findByText('Card two')).toBeInTheDocument()
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument()
  })

  it('rating Again brings the card back later instead of finishing the session', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'Card one'), card('c2', 'Card two')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Card one')
    await user.click(screen.getByText('Card one'))
    await user.click(screen.getByRole('button', { name: 'Again' }))
    expect(await screen.findByText('Card two')).toBeInTheDocument()
    await user.click(screen.getByText('Card two'))
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(await screen.findByText('Card one')).toBeInTheDocument() // it came back around
  })

  it('shows a summary with accuracy once every card is done, and ends the session', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'Card one'), card('c2', 'Card two')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Card one')
    await user.click(screen.getByText('Card one'))
    await user.click(screen.getByRole('button', { name: 'Again' })) // missed once
    await screen.findByText('Card two')
    await user.click(screen.getByText('Card two'))
    await user.click(screen.getByRole('button', { name: 'Good' }))
    await screen.findByText('Card one') // it's back
    await user.click(screen.getByText('Card one'))
    await user.click(screen.getByRole('button', { name: 'Good' })) // now it finishes
    expect(await screen.findByText('Session complete')).toBeInTheDocument()
    expect(screen.getByText(/reviewed 2 cards/i)).toBeInTheDocument()
    expect(screen.getByText(/50% right the first time/i)).toBeInTheDocument()

    const user2 = user
    await user2.click(screen.getByRole('button', { name: 'Back to documents' }))
    expect(navigateSpy).toHaveBeenCalledWith('/documents')
    await waitFor(() => expect(endStudySession).toHaveBeenCalledWith('session-1'))
  })

  it('an empty study set says so instead of showing a card', async () => {
    getStudySetFlashcards.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no flashcards yet/i)).toBeInTheDocument()
  })

  it('shows a readable error if the study set cannot be loaded (e.g. not yours)', async () => {
    getStudySet.mockRejectedValue(new Error('Row not found'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Row not found')
  })

  it('a failed review shows an error and does not advance the card', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'Card one')])
    submitReview.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Card one')
    await user.click(screen.getByText('Card one'))
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
    expect(screen.getByText('Card one')).toBeInTheDocument() // still on the same card
  })

  it('ends the session on unmount even if the user never reaches the summary', async () => {
    getStudySetFlashcards.mockResolvedValue([card('c1', 'Card one')])
    const { unmount } = renderPage()
    await screen.findByText('Card one')
    unmount()
    expect(endStudySession).toHaveBeenCalledWith('session-1')
  })
})
