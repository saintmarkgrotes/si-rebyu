import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Flashcard from '../Flashcard'

describe('Flashcard', () => {
  it('shows only the front and a hint before reveal', () => {
    render(<Flashcard front="What is a VLAN?" back="A logical network." revealed={false} onReveal={vi.fn()} />)
    expect(screen.getByText('What is a VLAN?')).toBeInTheDocument()
    expect(screen.queryByText('A logical network.')).not.toBeInTheDocument()
    expect(screen.getByText(/click to show/i)).toBeInTheDocument()
  })

  it('shows both sides once revealed, with no hint', () => {
    render(<Flashcard front="What is a VLAN?" back="A logical network." revealed onReveal={vi.fn()} />)
    expect(screen.getByText('What is a VLAN?')).toBeInTheDocument()
    expect(screen.getByText('A logical network.')).toBeInTheDocument()
    expect(screen.queryByText(/click to show/i)).not.toBeInTheDocument()
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
    expect(onReveal).toHaveBeenCalledTimes(2)
  })

  it('clicking or pressing keys after reveal does nothing further', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(<Flashcard front="Q" back="A" revealed onReveal={onReveal} />)
    await user.click(screen.getByRole('button'))
    expect(onReveal).not.toHaveBeenCalled()
  })
})
