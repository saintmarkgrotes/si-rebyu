import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import Modal from '../Modal'

it('keeps keyboard focus inside the dialog and restores the opener', async () => {
  const user = userEvent.setup()
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const close = vi.fn()
  const view = render(<Modal open onClose={close} title="Options"><button>Last action</button></Modal>)
  const first = screen.getByRole('button', { name: 'Close' }); const last = screen.getByRole('button', { name: 'Last action' })
  expect(first).toHaveFocus()
  await user.tab({ shift: true }); expect(last).toHaveFocus()
  await user.tab(); expect(first).toHaveFocus()
  await user.keyboard('{Escape}'); expect(close).toHaveBeenCalledOnce()
  view.unmount(); expect(opener).toHaveFocus(); opener.remove()
})

it('preserves focus across rerenders, skips disabled actions, and restores focus on close', async () => {
  const user = userEvent.setup()
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const content = <><button>Action</button><button disabled>Unavailable</button></>
  const view = render(<Modal open onClose={vi.fn()} title="Options">{content}</Modal>)

  try {
    const first = screen.getByRole('button', { name: 'Close' })
    const action = screen.getByRole('button', { name: 'Action' })
    await user.tab()
    expect(action).toHaveFocus()

    view.rerender(<Modal open onClose={vi.fn()} title="Options">{content}</Modal>)
    expect(action).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab({ shift: true })
    expect(action).toHaveFocus()

    view.rerender(<Modal open={false} onClose={vi.fn()} title="Options">{content}</Modal>)
    expect(opener).toHaveFocus()
  } finally {
    view.unmount()
    opener.remove()
  }
})
