import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GenerateModal from '../GenerateModal'
import { getDocumentTopics, estimateGeneration, startGeneration } from '../../../lib/studySets'

vi.mock('../../../lib/studySets')

const doc = { id: 'doc-1', title: 'Networking Notes.pdf' }

// The form debounces the estimate call; keep this above the debounce delay used in tests.
const DELAY = 10

beforeEach(() => {
  vi.clearAllMocks()
  getDocumentTopics.mockResolvedValue([])
  estimateGeneration.mockResolvedValue({ planned_requests: 3, estimated_seconds: 20 })
  startGeneration.mockResolvedValue({ study_set_id: 'set-1' })
})

const setup = (props = {}) => {
  const onStarted = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(
    <GenerateModal open doc={doc} onClose={onClose} onStarted={onStarted} estimateDelay={DELAY} {...props} />,
  )
  return { onStarted, onClose, user }
}

describe('GenerateModal', () => {
  it('is closed when open is false', () => {
    render(<GenerateModal open={false} doc={doc} onClose={vi.fn()} onStarted={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the estimate once the debounced call resolves, with the default options', async () => {
    setup()
    await waitFor(() => expect(estimateGeneration).toHaveBeenCalledWith('doc-1', {
      flashcards: 20,
      questions: 20,
      question_types: ['multiple_choice', 'true_false', 'identification'],
      difficulty: 'mixed',
      topics: [],
    }))
    expect(await screen.findByText(/about 3 AI requests.*20 seconds/)).toBeInTheDocument()
  })

  it('blocks submit and shows a message instead of an estimate when nothing is selected', async () => {
    const { user } = setup()
    // both counts start at 20; set flashcards to None first, then questions to None
    const flashGroup = screen.getByRole('group', { name: 'Flashcards' })
    const questionGroup = screen.getByRole('group', { name: 'Questions' })
    await user.click(within(flashGroup).getByRole('button', { name: 'None' }))
    await user.click(within(questionGroup).getByRole('button', { name: 'None' }))
    expect(await screen.findByText(/choose at least one flashcard or question/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('unchecking every question type blocks submit with a specific message', async () => {
    const { user } = setup()
    for (const label of ['Multiple choice', 'True/False', 'Identification']) {
      await user.click(screen.getByRole('checkbox', { name: label }))
    }
    expect(await screen.findByText(/choose at least one question type/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('setting questions to None disables the question-type checkboxes without blocking submit', async () => {
    const { user } = setup()
    const questionGroup = screen.getByRole('group', { name: 'Questions' })
    await user.click(within(questionGroup).getByRole('button', { name: 'None' }))
    expect(screen.getByRole('checkbox', { name: 'Multiple choice' })).toBeDisabled()
    await waitFor(() => expect(estimateGeneration).toHaveBeenCalled())
    const [, payload] = estimateGeneration.mock.calls.at(-1)
    expect(payload.question_types).toEqual([])
    expect(screen.getByRole('button', { name: 'Generate' })).not.toBeDisabled()
  })

  it('only the latest estimate response is shown when settings change quickly (race safety)', async () => {
    // The initial mount (default options) fires the first, slow request. Changing a setting fires
    // a second, fast request. The slow first one must not clobber the second when it finally resolves.
    let resolveFirst
    estimateGeneration
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce({ planned_requests: 9, estimated_seconds: 300 })
    const { user } = setup()
    await waitFor(() => expect(estimateGeneration).toHaveBeenCalledTimes(1))
    const difficultyGroup = screen.getByRole('group', { name: 'Difficulty' })
    await user.click(within(difficultyGroup).getByRole('button', { name: 'Easy' }))
    await waitFor(() => expect(estimateGeneration).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/9 AI requests/)).toBeInTheDocument()
    // the slow first call resolves last; it must not overwrite the current, already-shown result
    act(() => resolveFirst({ planned_requests: 1, estimated_seconds: 5 }))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText(/9 AI requests/)).toBeInTheDocument()
    expect(screen.queryByText(/1 AI request\b/)).not.toBeInTheDocument()
  })

  it('a blocking estimate error (e.g. 409) disables submit and shows the server message', async () => {
    const err = Object.assign(new Error('This document is still being processed.'), { status: 409 })
    estimateGeneration.mockRejectedValue(err)
    setup()
    expect(await screen.findByText('This document is still being processed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('a network-ish estimate error does not block submit', async () => {
    const err = Object.assign(new Error('offline'), { status: 0 })
    estimateGeneration.mockRejectedValue(err)
    setup()
    expect(await screen.findByText(/could not estimate the size/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).not.toBeDisabled()
  })

  it('submits the trimmed title and calls onStarted with the response', async () => {
    const { onStarted, user } = setup()
    await user.type(screen.getByLabelText('Name (optional)'), '  Midterm review  ')
    await waitFor(() => expect(estimateGeneration).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(startGeneration).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      title: 'Midterm review',
    })))
    expect(onStarted).toHaveBeenCalledWith({ study_set_id: 'set-1' })
  })

  it('shows the server error and stays open when starting fails', async () => {
    startGeneration.mockRejectedValue(new Error('The AI daily limit has been reached.'))
    const { onStarted, user } = setup()
    await waitFor(() => expect(estimateGeneration).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI daily limit has been reached.')
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('lists topics from the document and restricts generation to the ones picked', async () => {
    getDocumentTopics.mockResolvedValue(['VLAN', 'Trunking'])
    const { user } = setup()
    await user.click(await screen.findByRole('checkbox', { name: 'All topics' }))
    await user.click(screen.getByRole('checkbox', { name: 'VLAN' }))
    await waitFor(() => {
      const [, payload] = estimateGeneration.mock.calls.at(-1)
      expect(payload.topics).toEqual(['VLAN'])
    })
  })

  it('picking no specific topic (with All topics off) blocks submit', async () => {
    getDocumentTopics.mockResolvedValue(['VLAN'])
    const { user } = setup()
    await user.click(await screen.findByRole('checkbox', { name: 'All topics' }))
    expect(await screen.findByText(/choose at least one topic/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('cancel calls onClose without starting anything', async () => {
    const { onClose, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(startGeneration).not.toHaveBeenCalled()
  })
})
