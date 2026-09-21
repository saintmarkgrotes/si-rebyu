import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { uploadDocument, getDocuments, deleteDocument } from '../lib/documents'
import { apiFetch } from '../lib/api'
import Card from '../components/Card'
import Button from '../components/Button'
import NavHeader from '../components/NavHeader'

const ACCEPTED_TYPES = ['.pdf', '.docx', '.pptx']
const MAX_SIZE_MB = 20

const Documents = () => {
  const { user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
  let active = true

  const loadDocuments = async () => {
    try {
      const docs = await getDocuments()
      if (active) setDocuments(docs)
    } catch (err) {
      if (active) setError(err.message || 'Could not load your documents.')
    } finally {
      if (active) setLoading(false)
    }
  }

  loadDocuments()

    return () => {
      active = false
    }
  }, [])

  // while any document is still being processed, refresh the list every few seconds
  useEffect(() => {
    if (!documents.some((d) => d.status === 'processing')) return undefined
    const timer = setInterval(async () => {
      try {
        setDocuments(await getDocuments())
      } catch {
        // keep showing the last list; try again on the next tick
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [documents])

  const validateFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ACCEPTED_TYPES.includes(ext)) {
      return 'Only PDF, Word or PowerPoint files (.pdf, .docx, .pptx) are allowed.'
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File is too large. Max size is ${MAX_SIZE_MB}MB.`
    }
    return null
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    setError('')
    try {
      const doc = await uploadDocument(file, user.id)
      setDocuments((prev) => [doc, ...prev])
      // ask the backend to read the file; the row's status updates as it works
      apiFetch(`/documents/${doc.id}/process`, { method: 'POST' }).catch((err) => {
        setError(err.message || 'Could not start processing this document.')
      })
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.title}"? This can't be undone.`)) return
    try {
      await deleteDocument(doc.id, doc.storage_path)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      setError(err.message || 'Could not delete this document.')
    }
  }

  const handleRetry = async (doc) => {
    setError('')
    try {
      await apiFetch(`/documents/${doc.id}/process`, { method: 'POST' })
      setDocuments(await getDocuments())
    } catch (err) {
      setError(err.message || 'Could not retry this document.')
    }
  }

  const statusLabel = {
    processing: 'Reading document…',
    ready: 'Ready',
    failed: 'Failed to process',
  }

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">Your documents</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a PDF, Word or PowerPoint file to generate study questions from it.
        </p>

        <Card className="mt-6">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Upload a file</span>
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileChange}
              disabled={uploading}
              className="text-sm text-ink file:mr-4 file:rounded-md file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-paper hover:file:bg-ink-hover disabled:opacity-50"
            />
          </label>
          {uploading && <p className="mt-3 text-sm text-muted">Uploading…</p>}
        </Card>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="mt-8">
          {loading ? (
            <p className="text-sm text-muted">Loading your documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted">
              No documents yet. Upload one above to get started.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <Card className="flex items-center justify-between p-4!">
                    <div>
                      <p className="text-sm font-medium text-ink">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {statusLabel[doc.status] || doc.status} ·{' '}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.status === 'failed' && doc.error_message && (
                        <p className="mt-1 text-xs text-danger">{doc.error_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {doc.status === 'failed' && (
                        <Button variant="ghost" onClick={() => handleRetry(doc)}>
                          Retry
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => handleDelete(doc)}>
                        Delete
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

export default Documents