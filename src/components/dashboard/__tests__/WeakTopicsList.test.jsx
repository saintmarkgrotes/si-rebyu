import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import WeakTopicsList from '../WeakTopicsList'

const renderList = (topics) => render(<WeakTopicsList topics={topics} />, { wrapper: MemoryRouter })

describe('WeakTopicsList', () => {
  it('shows loading state for null', () => {
    renderList(null)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an encouraging empty state with no weak topics', () => {
    renderList([])
    expect(screen.getByText(/take a few quizzes/i)).toBeInTheDocument()
  })

  it('lists each topic with its accuracy', () => {
    renderList([{ topic: 'VLAN', correct: 1, total: 3, percent: 33 }])
    expect(screen.getByText('VLAN')).toBeInTheDocument()
    expect(screen.getByText('33% (1/3)')).toBeInTheDocument()
  })

  it('links each topic to a filtered Documents view', () => {
    renderList([{ topic: 'VLAN', correct: 1, total: 3, percent: 33 }])
    expect(screen.getByRole('link', { name: 'VLAN' })).toHaveAttribute('href', '/documents?topic=VLAN')
  })

  it('encodes topic names that need it in the URL', () => {
    renderList([{ topic: 'Q&A basics', correct: 1, total: 3, percent: 33 }])
    expect(screen.getByRole('link', { name: 'Q&A basics' })).toHaveAttribute('href', '/documents?topic=Q%26A%20basics')
  })
})
