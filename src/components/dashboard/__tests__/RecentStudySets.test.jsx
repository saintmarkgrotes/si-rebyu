import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import RecentStudySets from '../RecentStudySets'

const renderList = (studySets) => render(<RecentStudySets studySets={studySets} />, { wrapper: MemoryRouter })

describe('RecentStudySets', () => {
  it('shows loading state for null', () => {
    renderList(null)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an empty state when there are none yet', () => {
    renderList([])
    expect(screen.getByText(/generate study material/i)).toBeInTheDocument()
  })

  it('shows Study and Quiz links only when the set actually has that content', () => {
    const sets = [
      { id: 's1', title: 'Flashcards only', flashcard_count: 5, question_count: 0 },
      { id: 's2', title: 'Quiz only', flashcard_count: 0, question_count: 5 },
    ]
    renderList(sets)
    const row1 = screen.getByText('Flashcards only').closest('li')
    expect(row1.querySelector('a[href="/study/s1"]')).toBeTruthy()
    expect(row1.querySelector('a[href="/quiz/s1"]')).toBeFalsy()
    const row2 = screen.getByText('Quiz only').closest('li')
    expect(row2.querySelector('a[href="/quiz/s2"]')).toBeTruthy()
    expect(row2.querySelector('a[href="/study/s2"]')).toBeFalsy()
  })
})
