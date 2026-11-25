import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../context/ThemeContext'
import Documents from './Documents'
import { getDocuments, uploadDocument } from '../lib/documents'
import { getStudySets } from '../lib/studySets'
import { apiFetch } from '../lib/api'
import { pickFromGoogleDrive } from '../lib/googleDrive'

vi.mock('../lib/documents')
vi.mock('../lib/studySets')
vi.mock('../lib/api')
vi.mock('../lib/progress')
vi.mock('../lib/googleDrive', () => ({ isDriveConfigured: true, pickFromGoogleDrive: vi.fn() }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const Wrapper = ({ children }) => (
  <MemoryRouter>
    <ThemeProvider>{children}</ThemeProvider>
  </MemoryRouter>
)

const renderPage = () => render(<Documents />, { wrapper: Wrapper })

// The upload sources live behind the "Add document" (+) menu.
const chooseGoogleDrive = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /add document/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /google drive/i }))
}

beforeEach(() => {
  vi.resetAllMocks()
  getDocuments.mockResolvedValue([])
  getStudySets.mockResolvedValue([])
  apiFetch.mockResolvedValue({ started: true, status: 'processing' })
})

describe('Import from Google Drive', () => {
  it('uploads the picked Drive file and starts processing it', async () => {
    const file = new File(['x'], 'Lecture.pdf', { type: 'application/pdf' })
    pickFromGoogleDrive.mockResolvedValue(file)
    uploadDocument.mockResolvedValue({ id: 'd9', title: 'Lecture.pdf', status: 'processing', file_type: 'pdf' })

    renderPage()
    await chooseGoogleDrive()

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith(file, 'u1'))
    expect(apiFetch).toHaveBeenCalledWith('/documents/d9/process', { method: 'POST' })
  })

  it('does nothing when the picker is cancelled', async () => {
    pickFromGoogleDrive.mockResolvedValue(null)
    renderPage()
    await chooseGoogleDrive()
    await waitFor(() => expect(pickFromGoogleDrive).toHaveBeenCalled())
    expect(uploadDocument).not.toHaveBeenCalled()
  })

  it('shows the error when Drive fails', async () => {
    pickFromGoogleDrive.mockRejectedValue(new Error('Google Drive access was not granted.'))
    renderPage()
    await chooseGoogleDrive()
    expect(await screen.findByText('Google Drive access was not granted.')).toBeInTheDocument()
  })
})