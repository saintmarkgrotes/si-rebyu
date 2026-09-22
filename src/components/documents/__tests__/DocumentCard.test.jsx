import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DocumentCard from '../DocumentCard'

const NOW = Date.parse('2026-01-15T12:00:00Z')
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString()

const readyDoc = {
  id: 'd1', title: 'Networking.pdf', status: 'ready', page_count: 24, file_type: 'pdf',
  created_at: minsAgo(60), updated_at: minsAgo(1),
}

const handlers = () => ({
  onGenerate: vi.fn(), onRetry: vi.fn(), onDelete: vi.fn(), onDeleteSet: vi.fn(),
})

const renderCard = (props) => render(<DocumentCard {...props} />, { wrapper: MemoryRouter })

describe('DocumentCard', () => {
  it('a ready document shows page count, Generate, and Delete, with no Retry', () => {
    renderCard({ doc: readyDoc, studySets: [], now: NOW, ...handlers() })
    expect(screen.getByText('Networking.pdf')).toBeInTheDocument()
    expect(screen.getByText(/24 pages/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('a pptx document is described in slides, not pages', () => {
    renderCard({ doc: { ...readyDoc, file_type: 'pptx', page_count: 10 }, studySets: [], now: NOW, ...handlers() })
    expect(screen.getByText(/10 slides/)).toBeInTheDocument()
  })

  it('clicking Generate calls onGenerate with the document', async () => {
    const user = userEvent.setup()
    const h = handlers()
    renderCard({ doc: readyDoc, studySets: [], now: NOW, ...h })
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(h.onGenerate).toHaveBeenCalledWith(readyDoc)
  })

  it('a still-processing document has no Generate or Retry button', () => {
    const doc = { ...readyDoc, status: 'processing', processing_stage: 'extracting', updated_at: minsAgo(1) }
    renderCard({ doc, studySets: [], now: NOW, ...handlers() })
    expect(screen.getByText(/Reading document…/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('a failed document shows its error and offers Retry', async () => {
    const user = userEvent.setup()
    const h = handlers()
    const doc = { ...readyDoc, status: 'failed', error_message: 'This PDF is password-protected.' }
    renderCard({ doc, studySets: [], now: NOW, ...h })
    expect(screen.getByText('This PDF is password-protected.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Retry ${doc.title}` }))
    expect(h.onRetry).toHaveBeenCalledWith(doc)
  })

  it('a job silent past the stale window offers Retry even without status failed', () => {
    const doc = { ...readyDoc, status: 'processing', processing_stage: 'extracting', updated_at: minsAgo(30) }
    renderCard({ doc, studySets: [], now: NOW, ...handlers() })
    expect(screen.getByText(/Stopped responding/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Retry ${doc.title}` })).toBeInTheDocument()
  })

  it('deleting a document calls onDelete', async () => {
    const user = userEvent.setup()
    const h = handlers()
    renderCard({ doc: readyDoc, studySets: [], now: NOW, ...h })
    await user.click(screen.getByRole('button', { name: `Delete ${readyDoc.title}` }))
    expect(h.onDelete).toHaveBeenCalledWith(readyDoc)
  })

  it('shows a summed total across multiple ready study sets, ignoring one still generating', () => {
    const sets = [
      { id: 's1', document_id: 'd1', title: 'Set A', status: 'ready', flashcard_count: 10, question_count: 5, updated_at: minsAgo(1) },
      { id: 's2', document_id: 'd1', title: 'Set B', status: 'ready', flashcard_count: 3, question_count: 0, updated_at: minsAgo(1) },
      { id: 's3', document_id: 'd1', title: 'Set C', status: 'generating', stage: 'generating', progress_done: 2, progress_total: 8, updated_at: minsAgo(1) },
    ]
    renderCard({ doc: readyDoc, studySets: sets, now: NOW, ...handlers() })
    expect(screen.getByText(/13 flashcards and 5 questions/)).toBeInTheDocument()
    expect(screen.getByText('Generating (2 of 8)…')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('a generating study set has no delete button; a finished one does', async () => {
    const user = userEvent.setup()
    const h = handlers()
    const sets = [
      { id: 's1', document_id: 'd1', title: 'Running', status: 'generating', stage: 'analyzing', updated_at: minsAgo(1) },
      { id: 's2', document_id: 'd1', title: 'Done', status: 'ready', flashcard_count: 1, question_count: 1, updated_at: minsAgo(1) },
    ]
    renderCard({ doc: readyDoc, studySets: sets, now: NOW, ...h })
    expect(screen.queryByRole('button', { name: 'Delete study set Running' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete study set Done' }))
    expect(h.onDeleteSet).toHaveBeenCalledWith(sets[1])
  })

  it('shows warnings on a ready study set and an error on a failed one', () => {
    const sets = [
      { id: 's1', document_id: 'd1', title: 'Partial', status: 'ready', flashcard_count: 4, question_count: 0, warnings: ['Created 4 of 10 flashcards.'], updated_at: minsAgo(1) },
      { id: 's2', document_id: 'd1', title: 'Broken', status: 'failed', error_message: 'The AI daily limit has been reached.', updated_at: minsAgo(1) },
    ]
    renderCard({ doc: readyDoc, studySets: sets, now: NOW, ...handlers() })
    expect(screen.getByText('Created 4 of 10 flashcards.')).toBeInTheDocument()
    expect(screen.getByText(/The AI daily limit has been reached\./)).toBeInTheDocument()
  })
})

describe('DocumentCard: Study link', () => {
  it('a ready study set with flashcards links to its study page', () => {
    const sets = [
      { id: 's1', document_id: 'd1', title: 'Week 1', status: 'ready', flashcard_count: 10, question_count: 5, updated_at: minsAgo(1) },
    ]
    renderCard({ doc: readyDoc, studySets: sets, now: NOW, ...handlers() })
    expect(screen.getByRole('link', { name: 'Study' })).toHaveAttribute('href', '/study/s1')
  })

  it('a study set with no flashcards (questions-only) has no Study link', () => {
    const sets = [
      { id: 's1', document_id: 'd1', title: 'Quiz only', status: 'ready', flashcard_count: 0, question_count: 10, updated_at: minsAgo(1) },
    ]
    renderCard({ doc: readyDoc, studySets: sets, now: NOW, ...handlers() })
    expect(screen.queryByRole('link', { name: 'Study' })).not.toBeInTheDocument()
  })

  it('a study set still generating has no Study link yet', () => {
    const sets = [
      { id: 's1', document_id: 'd1', title: 'Running', status: 'generating', stage: 'generating', updated_at: minsAgo(1) },
    ]
    renderCard({ doc: readyDoc, studySets: sets, now: NOW, ...handlers() })
    expect(screen.queryByRole('link', { name: 'Study' })).not.toBeInTheDocument()
  })
})
