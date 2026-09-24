import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatCard from '../StatCard'

describe('StatCard', () => {
  it('shows the label and value', () => {
    render(<StatCard label="Study streak" value={5} suffix=" days" />)
    expect(screen.getByText('Study streak')).toBeInTheDocument()
    expect(screen.getByText('5 days')).toBeInTheDocument()
  })

  it('shows an em dash for null or undefined instead of blank/0/null', () => {
    render(<StatCard label="Accuracy" value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows a real 0 as 0, not as the em dash', () => {
    render(<StatCard label="Accuracy" value={0} suffix="%" />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
