import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { getDocumentsForTopic } from '../lib/progress'
import { ThemeProvider } from '../context/ThemeContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Documents from './Documents'
import { getDocuments, deleteDocument } from '../lib/documents'
import { getStudySets, deleteStudySet, getDocumentTopics, startGeneration, estimateGeneration } from '../lib/studySets'
import { apiFetch } from '../lib/api'

vi.mock('../lib/documents')
vi.mock('../lib/studySets')
vi.mock('../lib/api')
vi.mock('../lib/progress')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const now = () => new Date().toISOString()

const readyDoc = (over = {}) => ({
  id: 'd1', title: 'Networking.pdf', status: 'ready', page_count: 24, file_type: 'pdf',
  created_at: now(), updated_at: now(), ...over,
})

const Wrapper = ({ children }) => (
  <MemoryRouter>
    <ThemeProvider>{children}</ThemeProvider>
  </MemoryRouter>
)

const renderPage = () => render(<Documents />, { wrapper: Wrapper })

const renderWithTopic = (topic) => {
  const WithTopic = ({ children }) => (
    <MemoryRouter initialEntries={[`/documents?topic=${encodeURIComponent(topic)}`]}>
      <ThemeProvider>{children}</ThemeProvider>
    </MemoryRouter>
  )
  return render(<Documents />, { wrapper: WithTopic })
}

beforeEach(() => {
  vi.resetAllMocks()
  window.confirm = vi.fn(() => true)
  getDocuments.mockResolvedValue([])
  getStudySets.mockResolvedValue([])
  getDocumentTopics.mockResolvedValue([])
  estimateGeneration.mockResolvedValue({ planned_requests: 2, estimated_seconds: 10 })
  apiFetch.mockResolvedValue({ started: true, status: 'processing' })
  getDocumentsForTopic.mockResolvedValue([])
})

describe('Documents page', () => {
  it('shows an empty state when there are no documents', async () => {
    renderPage()
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument()
  })

  it('lists a document with its study set', async () => {
    getDocuments.mockResolvedValue([readyDoc()])
    getStudySets.mockResolvedValue([
      { id: 's1', document_id: 'd1', title: 'Week 1', status: 'ready', flashcard_count: 5, question_count: 5, updated_at: now() },
    ])
    renderPage()
    expect(await screen.findByText('Networking.pdf')).toBeInTheDocument()
    expect(screen.getByText('Week 1')).toBeInTheDocument()
  })

  it('clicking Generate on a document opens the modal for that document', async () => {
    getDocuments.mockResolvedValue([readyDoc(), readyDoc({ id: 'd2', title: 'Other.pdf' })])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Networking.pdf')
    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Generate study material' })
    expect(within(dialog).getByText(/Networking\.pdf/)).toBeInTheDocument()
  })

  it('starting a generation closes the modal and refreshes the study sets', async () => {
    getDocuments.mockResolvedValue([readyDoc()])
    getStudySets.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 's1', document_id: 'd1', title: 'New set', status: 'generating', stage: 'analyzing', updated_at: now() },
    ])
    startGeneration.mockResolvedValue({ study_set_id: 's1' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Generate' }))
    const dialog = await screen.findByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Generate' })
    await waitFor(() => expect(submit).not.toBeDisabled())
    await user.click(submit)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('New set')).toBeInTheDocument()
  })

  it('deleting a document also removes its study sets from the list', async () => {
    getDocuments.mockResolvedValue([readyDoc()])
    getStudySets.mockResolvedValue([
      { id: 's1', document_id: 'd1', title: 'Week 1', status: 'ready', flashcard_count: 1, question_count: 1, updated_at: now() },
    ])
    deleteDocument.mockResolvedValue()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Week 1')
    await user.click(screen.getByRole('button', { name: 'Delete Networking.pdf' }))
    await waitFor(() => expect(screen.queryByText('Networking.pdf')).not.toBeInTheDocument())
    expect(screen.queryByText('Week 1')).not.toBeInTheDocument()
  })

  it('deleting a study set calls the API and removes only that set', async () => {
    getDocuments.mockResolvedValue([readyDoc()])
    getStudySets.mockResolvedValue([
      { id: 's1', document_id: 'd1', title: 'Keep me', status: 'ready', flashcard_count: 1, question_count: 1, updated_at: now() },
      { id: 's2', document_id: 'd1', title: 'Remove me', status: 'ready', flashcard_count: 2, question_count: 2, updated_at: now() },
    ])
    deleteStudySet.mockResolvedValue()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Remove me')
    await user.click(screen.getByRole('button', { name: 'Delete study set Remove me' }))
    expect(deleteStudySet).toHaveBeenCalledWith('s2')
    await waitFor(() => expect(screen.queryByText('Remove me')).not.toBeInTheDocument())
    expect(screen.getByText('Keep me')).toBeInTheDocument()
  })

  it('retrying a failed document calls the process endpoint and shows the refreshed list', async () => {
    getDocuments
      .mockResolvedValueOnce([readyDoc({ status: 'failed', error_message: 'Bad file' })])
      .mockResolvedValueOnce([readyDoc({ status: 'processing', processing_stage: 'extracting' })])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bad file')
    await user.click(screen.getByRole('button', { name: 'Retry Networking.pdf' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/documents/d1/process', { method: 'POST' }))
    expect(await screen.findByText(/Reading document…/)).toBeInTheDocument()
  })
})

describe('Documents page: topic filter', () => {
  it('with no topic in the URL, all documents show and no banner appears', async () => {
    getDocuments.mockResolvedValue([readyDoc({ id: 'd1', title: 'A.pdf' }), readyDoc({ id: 'd2', title: 'B.pdf' })])
    renderPage()
    expect(await screen.findByText('A.pdf')).toBeInTheDocument()
    expect(screen.getByText('B.pdf')).toBeInTheDocument()
    expect(getDocumentsForTopic).not.toHaveBeenCalled()
  })

  it('with a topic in the URL, only matching documents show, with a banner and clear link', async () => {
    getDocuments.mockResolvedValue([readyDoc({ id: 'd1', title: 'A.pdf' }), readyDoc({ id: 'd2', title: 'B.pdf' })])
    getDocumentsForTopic.mockResolvedValue([{ id: 'd1', title: 'A.pdf', status: 'ready' }])
    renderWithTopic('VLAN')
    expect(await screen.findByText('A.pdf')).toBeInTheDocument()
    expect(screen.queryByText('B.pdf')).not.toBeInTheDocument()
    expect(getDocumentsForTopic).toHaveBeenCalledWith('VLAN')
    expect(screen.getByText('VLAN')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear filter' })).toHaveAttribute('href', '/documents')
  })

  it('says so when no document matches the topic', async () => {
    getDocuments.mockResolvedValue([readyDoc({ id: 'd1', title: 'A.pdf' })])
    getDocumentsForTopic.mockResolvedValue([])
    renderWithTopic('Obscure topic')
    expect(await screen.findByText(/No documents found about "Obscure topic"/)).toBeInTheDocument()
  })

  it('opening Generate while filtered passes the topic through to the modal', async () => {
    getDocuments.mockResolvedValue([readyDoc({ id: 'd1', title: 'A.pdf' })])
    getDocumentsForTopic.mockResolvedValue([{ id: 'd1', title: 'A.pdf', status: 'ready' }])
    getDocumentTopics.mockResolvedValue(['VLAN', 'Trunking'])
    const user = userEvent.setup()
    renderWithTopic('VLAN')
    await user.click(await screen.findByRole('button', { name: 'Generate' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('checkbox', { name: 'VLAN' })).toBeChecked()
  })

  it('a failed topic lookup shows an error but does not crash the page', async () => {
    getDocuments.mockResolvedValue([readyDoc({ id: 'd1', title: 'A.pdf' })])
    getDocumentsForTopic.mockRejectedValue(new Error('Row level security denied'))
    renderWithTopic('VLAN')
    expect(await screen.findByText('Row level security denied')).toBeInTheDocument()
  })

  it('a failed topic lookup falls back to the full document list instead of loading forever', async () => {
    getDocuments.mockResolvedValue([readyDoc({ id: 'd1', title: 'A.pdf' }), readyDoc({ id: 'd2', title: 'B.pdf' })])
    getDocumentsForTopic.mockRejectedValue(new Error('offline'))
    renderWithTopic('VLAN')
    expect(await screen.findByText('A.pdf')).toBeInTheDocument()
    expect(screen.getByText('B.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Loading your documents…')).not.toBeInTheDocument()
  })
})
