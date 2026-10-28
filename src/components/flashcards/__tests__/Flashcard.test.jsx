import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Flashcard from '../Flashcard'

describe('Flashcard', () => {
  it('shows only the front and a hint before reveal', () => {
    render(<Flashcard front="What is a VLAN?" back="A logical network." revealed={false} onReveal={vi.fn()} />)
    expect(screen.getByText('What is a VLAN?')).toBeInTheDocument()
    expect(screen.getByText('A logical network.').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(/click to show/i)).toBeInTheDocument()
  })

  it('shows only the answer face once revealed', () => {
    render(<Flashcard front="What is a VLAN?" back="A logical network." revealed onReveal={vi.fn()} />)
    expect(screen.getByText('What is a VLAN?').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('A logical network.').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByRole('button', { name: 'Show question' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the card before reveal calls onReveal', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(<Flashcard front="Q" back="A" revealed={false} onReveal={onReveal} />)
    await user.click(screen.getByRole('button'))
    expect(onReveal).toHaveBeenCalledTimes(1)
  })

  it('Space and Enter also reveal the card', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(<Flashcard front="Q" back="A" revealed={false} onReveal={onReveal} />)
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onReveal).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    expect(onReveal).toHaveBeenLastCalledWith(false)
  })

  it('clicking the answer flips back to the question', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(<Flashcard front="Q" back="A" revealed onReveal={onReveal} />)
    await user.click(screen.getByRole('button'))
    expect(onReveal).toHaveBeenCalledWith(false)
  })
})
