import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RatingButtons from '../RatingButtons'

describe('RatingButtons', () => {
  it('shows all four ratings in order', () => {
    render(<RatingButtons onRate={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Rate this card' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Again', 'Hard', 'Good', 'Easy',
    ])
  })

  it('clicking a rating calls onRate with its value', async () => {
    const user = userEvent.setup()
    const onRate = vi.fn()
    render(<RatingButtons onRate={onRate} />)
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(onRate).toHaveBeenCalledWith('good')
  })

  it('is disabled while a rating is being submitted', () => {
    render(<RatingButtons onRate={vi.fn()} disabled />)
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }
  })
})
