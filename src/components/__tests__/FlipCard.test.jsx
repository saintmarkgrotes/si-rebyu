import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import FlipCard from '../FlipCard'

it('reverses direction when clicked again before the first animation finishes', async () => {
  const user = userEvent.setup()
  const onFlipChange = vi.fn()
  render(<FlipCard front="Question" back="Answer" onFlipChange={onFlipChange} />)
  await user.dblClick(screen.getByRole('button'))
  expect(onFlipChange.mock.calls).toEqual([[true], [false]])
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
})

it('follows parent-controlled resets before the next keyboard flip', async () => {
  const user = userEvent.setup()
  const onFlipChange = vi.fn()
  const { rerender } = render(<FlipCard flipped={false} onFlipChange={onFlipChange} />)
  rerender(<FlipCard flipped onFlipChange={onFlipChange} />)
  screen.getByRole('button').focus()
  await user.keyboard('{Enter}')
  expect(onFlipChange).toHaveBeenLastCalledWith(false)
  rerender(<FlipCard flipped={false} onFlipChange={onFlipChange} />)
  await user.keyboard('{Enter}')
  expect(onFlipChange).toHaveBeenLastCalledWith(true)
})
