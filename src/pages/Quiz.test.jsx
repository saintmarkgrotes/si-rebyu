import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Quiz from './Quiz'
import { getStudySet } from '../lib/flashcards'
import { getStudySetQuestions, submitAttempt } from '../lib/quiz'
import { startStudySession, endStudySession } from '../lib/studySessions'
import { ThemeProvider } from '../context/ThemeContext'

vi.mock('../lib/flashcards')
vi.mock('../lib/quiz', async () => {
  const actual = await vi.importActual('../lib/quiz')
  return { ...actual, getStudySetQuestions: vi.fn(), submitAttempt: vi.fn() }
})
vi.mock('../lib/studySessions')
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

const mcq = (id, topic = 'VLAN') => ({
  id, question_type: 'multiple_choice', question_text: `MCQ ${id}`, options: ['A', 'B'],
  correct_answer: 'A', explanation: `Why ${id}`, source: null, topics: { name: topic },
})
const ident = (id) => ({
  id, question_type: 'identification', question_text: `ID ${id}`, correct_answer: 'DHCP',
  explanation: `Why ${id}`, source: null, options: null, topics: null,
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/quiz/set-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/quiz/:studySetId" element={<Quiz />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  getStudySet.mockResolvedValue({ id: 'set-1', title: 'Week 1 Quiz', document_id: 'doc-1' })
  startStudySession.mockResolvedValue({ id: 'session-1' })
  endStudySession.mockResolvedValue({})
  submitAttempt.mockResolvedValue()
})

describe('Quiz', () => {
  it('starts a quiz-mode session, and orders identification before multiple choice', async () => {
    getStudySetQuestions.mockResolvedValue([mcq('m1'), ident('i1')])
    renderPage()
    expect(await screen.findByText('ID i1')).toBeInTheDocument()
    expect(startStudySession).toHaveBeenCalledWith('u1', 'doc-1', { mode: 'quiz', studySetId: 'set-1' })
  })

  it('shows a running position count', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1'), ident('i2')])
    renderPage()
    expect(await screen.findByText('Question 1 of 2')).toBeInTheDocument()
  })

  it('answering saves an attempt and Next moves to the next question', async () => {
    getStudySetQuestions.mockResolvedValue([mcq('m1'), ident('i1')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ID i1')
    await user.type(screen.getByLabelText('Your answer'), 'DHCP')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(submitAttempt).toHaveBeenCalledWith('session-1', 'i1', 'DHCP', true)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('MCQ m1')).toBeInTheDocument()
  })

  it('the last question shows "See results" instead of "Next"', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ID i1')
    await user.type(screen.getByLabelText('Your answer'), 'DHCP')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(screen.getByRole('button', { name: 'See results' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('finishing the last question shows results with the right score', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1'), ident('i2')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ID i1')
    await user.type(screen.getByLabelText('Your answer'), 'DHCP') // correct
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('ID i2')
    await user.type(screen.getByLabelText('Your answer'), 'wrong') // incorrect
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'See results' }))
    expect(await screen.findByText('Score: 1 / 2')).toBeInTheDocument()
  })

  it('Try again restarts with a fresh session and no prior answers', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ID i1')
    await user.type(screen.getByLabelText('Your answer'), 'DHCP')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'See results' }))
    await screen.findByText('Score: 1 / 1')
    startStudySession.mockResolvedValue({ id: 'session-2' })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument()
    await waitFor(() => expect(startStudySession).toHaveBeenCalledTimes(2))
    expect(endStudySession).toHaveBeenCalledWith('session-1')
  })

  it('Back to documents ends the session and navigates away', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1')])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ID i1')
    await user.type(screen.getByLabelText('Your answer'), 'DHCP')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'See results' }))
    await user.click(await screen.findByRole('button', { name: 'Back to documents' }))
    expect(navigateSpy).toHaveBeenCalledWith('/documents')
    await waitFor(() => expect(endStudySession).toHaveBeenCalledWith('session-1'))
  })

  it('an empty study set says so', async () => {
    getStudySetQuestions.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no questions yet/i)).toBeInTheDocument()
  })

  it('shows a readable error if the quiz cannot be loaded', async () => {
    getStudySet.mockRejectedValue(new Error('Row not found'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Row not found')
  })

  it('a load failure offers a way back to Documents', async () => {
    getStudySet.mockRejectedValue(new Error('Row not found'))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Back to documents' }))
    expect(navigateSpy).toHaveBeenCalledWith('/documents')
  })

  it('a failed attempt log does not block moving to the next question', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1'), ident('i2')])
    submitAttempt.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('ID i1')
    await user.type(screen.getByLabelText('Your answer'), 'DHCP')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('ID i2')).toBeInTheDocument()
  })

  it('ends the session on unmount even if the quiz is never finished', async () => {
    getStudySetQuestions.mockResolvedValue([ident('i1')])
    const { unmount } = renderPage()
    await screen.findByText('ID i1')
    unmount()
    expect(endStudySession).toHaveBeenCalledWith('session-1')
  })
})
