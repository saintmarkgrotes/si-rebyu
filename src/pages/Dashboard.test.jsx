import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { getStudySets } from '../lib/studySets'
import {
  getDueFlashcardCount, getOverallAccuracy, getStudyStreak, getTopicsStudiedCount, getWeakTopics,
} from '../lib/progress'
import { getTasks } from '../lib/tasks'
import { ThemeProvider } from '../context/ThemeContext'

vi.mock('../lib/studySets')
vi.mock('../lib/progress')
vi.mock('../lib/tasks')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'a@x.io' } }) }))

const renderPage = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <Dashboard />
      </ThemeProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  getStudyStreak.mockResolvedValue(4)
  getOverallAccuracy.mockResolvedValue({ correct: 6, total: 8, percent: 75 })
  getTopicsStudiedCount.mockResolvedValue(3)
  getDueFlashcardCount.mockResolvedValue(12)
  getStudySets.mockResolvedValue([
    { id: 's1', title: 'Week 1', flashcard_count: 10, question_count: 5, status: 'ready' },
  ])
  getWeakTopics.mockResolvedValue([{ topic: 'VLAN', correct: 1, total: 3, percent: 33 }])
  getTasks.mockResolvedValue([])
})

describe('Dashboard', () => {
  it('greets the user by email', async () => {
    renderPage()
    expect(await screen.findByText(/Welcome back, a@x.io/)).toBeInTheDocument()
  })

  it('shows the due-review count, streak, accuracy and topics studied', async () => {
    renderPage()
    expect(await screen.findByText('12 cards')).toBeInTheDocument()
    expect(screen.getByText('4 days')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows weak topics and recent study sets', async () => {
    renderPage()
    expect(await screen.findByText('VLAN')).toBeInTheDocument()
    expect(screen.getByText('Week 1')).toBeInTheDocument()
  })

  it('only shows the 5 most recent study sets', async () => {
    getStudySets.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Set ${i}`, flashcard_count: 1, question_count: 0 })),
    )
    renderPage()
    await screen.findByText('Set 0')
    expect(screen.queryByText('Set 5')).not.toBeInTheDocument()
  })

  it('a single-day streak reads "1 day", not "1 days"', async () => {
    getStudyStreak.mockResolvedValue(1)
    renderPage()
    expect(await screen.findByText('1 day')).toBeInTheDocument()
  })

  it('shows an error if a stat fails to load, without crashing the page', async () => {
    getWeakTopics.mockRejectedValue(new Error('Row level security denied'))
    renderPage()
    expect(await screen.findByText('Row level security denied')).toBeInTheDocument()
  })
})
