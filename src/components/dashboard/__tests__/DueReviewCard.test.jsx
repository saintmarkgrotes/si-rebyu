import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import DueReviewCard from '../DueReviewCard'

const renderCard = (count) => render(<DueReviewCard count={count} />, { wrapper: MemoryRouter })

describe('DueReviewCard', () => {
  it('links to /review when cards are due', () => {
    renderCard(12)
    expect(screen.getByText('12 cards')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start review' })).toHaveAttribute('href', '/review')
  })

  it('has no Start review link when nothing is due', () => {
    renderCard(0)
    expect(screen.getByText('0 cards')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Start review' })).not.toBeInTheDocument()
    expect(screen.getByText(/nothing due/i)).toBeInTheDocument()
  })

  it('shows a loading placeholder for null', () => {
    renderCard(null)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('a single due card reads naturally ("1 card")', () => {
    renderCard(1)
    expect(screen.getByText('1 card')).toBeInTheDocument()
  })
})
