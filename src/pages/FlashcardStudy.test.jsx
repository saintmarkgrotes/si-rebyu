import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FlashcardStudy from './FlashcardStudy'
import { getStudySet, getStudySetFlashcards } from '../lib/flashcards'
import { startStudySession } from '../lib/studySessions'

vi.mock('../lib/flashcards')
vi.mock('../lib/studySessions')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../components/flashcards/FlashcardSession', () => ({ default: vi.fn(() => null) }))
import FlashcardSession from '../components/flashcards/FlashcardSession'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

beforeEach(() => {
  vi.clearAllMocks()
  getStudySet.mockResolvedValue({ id: 'set-1', title: 'Week 1', document_id: 'doc-1' })
  getStudySetFlashcards.mockResolvedValue([{ id: 'c1' }])
  startStudySession.mockResolvedValue({ id: 'session-1' })
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/study/set-1']}>
      <Routes>
        <Route path="/study/:studySetId" element={<FlashcardStudy />} />
      </Routes>
    </MemoryRouter>,
  )

describe('FlashcardStudy (wrapper)', () => {
  it('passes a study-set-specific loadSession, title and empty message', async () => {
    renderPage()
    const props = FlashcardSession.mock.calls[0][0]
    expect(props.defaultTitle).toBe('Flashcards')
    expect(props.emptyMessage).toMatch(/no flashcards yet/i)

    const result = await props.loadSession()
    expect(getStudySet).toHaveBeenCalledWith('set-1')
    expect(getStudySetFlashcards).toHaveBeenCalledWith('set-1')
    expect(startStudySession).toHaveBeenCalledWith('u1', 'doc-1', { mode: 'flashcards', studySetId: 'set-1' })
    expect(result).toEqual({ title: 'Week 1', cards: [{ id: 'c1' }], session: { id: 'session-1' } })
  })

  it('onDone navigates to /documents', () => {
    renderPage()
    FlashcardSession.mock.calls[0][0].onDone()
    expect(navigateSpy).toHaveBeenCalledWith('/documents')
  })
})
