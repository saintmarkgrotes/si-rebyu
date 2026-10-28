import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { uploadDocument, getDocuments, deleteDocument } from '../lib/documents'
import { apiFetch } from '../lib/api'
import { getStudySets, deleteStudySet } from '../lib/studySets'
import { getDocumentsForTopic } from '../lib/progress'
import { DOCUMENT_STALE_MINUTES, STUDY_SET_STALE_MINUTES, isStale } from '../lib/generation'
import Card from '../components/Card'
import NavHeader from '../components/NavHeader'
import DocumentCard from '../components/documents/DocumentCard'
import GenerateModal from '../components/documents/GenerateModal'

const ACCEPTED_TYPES = ['.pdf', '.docx', '.pptx']
const MAX_SIZE_MB = 20

const Documents = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const topicFilter = searchParams.get('topic')
  const [documents, setDocuments] = useState([])
  const [topicDocIds, setTopicDocIds] = useState(null) // null = no filter active, or still loading it
  const [topicFilterFailed, setTopicFilterFailed] = useState(false)
  const [studySets, setStudySets] = useState([])
  const [generateFor, setGenerateFor] = useState(null) // the document whose settings modal is open
  const [now, setNow] = useState(() => Date.now()) // refreshed on every poll, used to spot dead jobs
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

  const loadStudySets = async () => {
    try {
      const sets = await getStudySets()
      if (active) setStudySets(sets)
    } catch (err) {
      if (active) setError(err.message || 'Could not load your study sets.')
    }
  }

  loadDocuments()
  loadStudySets()

    return () => {
      active = false
    }
  }, [])

  // Note: if the filter changes from one topic straight to another without the page remounting in
  // between, the old topic's results can flash briefly before the new ones load. In practice this
  // page is only ever reached with one topic at a time (from a Dashboard link), so it isn't a real path.
  useEffect(() => {
    if (!topicFilter) return undefined
    let active = true
    getDocumentsForTopic(topicFilter)
      .then((docs) => active && setTopicDocIds(new Set(docs.map((d) => d.id))))
      .catch((err) => {
        if (!active) return
        // Fail open: show every document rather than leaving the page stuck on "loading" forever.
        // The error banner still explains that the filter itself couldn't be applied.
        setError(err.message || 'Could not filter by topic.')
        setTopicFilterFailed(true)
      })
    return () => {
      active = false
    }
  }, [topicFilter])

  // While a document is being read or a study set is being generated, refresh every few seconds.
  // Jobs that have gone quiet for a long time are not waited for (the card offers Retry / Delete instead).
  const busy =
    documents.some((d) => d.status === 'processing' && !isStale(d, DOCUMENT_STALE_MINUTES, now)) ||
    studySets.some((s) => s.status === 'generating' && !isStale(s, STUDY_SET_STALE_MINUTES, now))

  useEffect(() => {
    if (!busy) return undefined
    const timer = setInterval(async () => {
      try {
        const [docs, sets] = await Promise.all([getDocuments(), getStudySets()])
        setDocuments(docs)
        setStudySets(sets)
        setNow(Date.now())
      } catch {
        // keep showing the last lists; try again on the next tick
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [busy])

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
      setStudySets((prev) => prev.filter((s) => s.document_id !== doc.id)) // the database removes them too
    } catch (err) {
      setError(err.message || 'Could not delete this document.')
    }
  }

  const handleDeleteSet = async (set) => {
    if (!confirm(`Delete "${set.title}"? Its flashcards and questions will be removed.`)) return
    try {
      await deleteStudySet(set.id)
      setStudySets((prev) => prev.filter((s) => s.id !== set.id))
    } catch (err) {
      setError(err.message || 'Could not delete this study set.')
    }
  }

  // The backend accepted the request; show the new set (it appears with its progress bar) and close the modal.
  const handleStarted = async () => {
    setGenerateFor(null)
    try {
      setStudySets(await getStudySets())
      setNow(Date.now())
    } catch {
      // the next poll will pick it up
    }
  }

  const handleRetry = async (doc) => {
    setError('')
    try {
      await apiFetch(`/documents/${doc.id}/process`, { method: 'POST' })
      setDocuments(await getDocuments())
      setNow(Date.now())
    } catch (err) {
      setError(err.message || 'Could not retry this document.')
    }
  }

  // topicDocIds can be left over from a previous filter; it only applies while a filter is active
  // and actually succeeded. A failed lookup falls back to the full list (see the effect above).
  const visibleDocuments =
    topicFilter && topicDocIds && !topicFilterFailed ? documents.filter((d) => topicDocIds.has(d.id)) : documents

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">Your documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a PDF, Word or PowerPoint file, then generate flashcards and questions from it.
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
          {uploading && <p className="mt-3 text-sm text-muted-foreground">Uploading…</p>}
        </Card>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        {topicFilter && (
          <p className="mt-4 text-sm text-muted-foreground">
            Showing documents about <span className="text-ink">{topicFilter}</span> ·{' '}
            <Link to="/documents" className="underline-offset-2 hover:underline">
              Clear filter
            </Link>
          </p>
        )}

        <div className="mt-8">
          {loading || (topicFilter && topicDocIds === null && !topicFilterFailed) ? (
            <p className="text-sm text-muted-foreground">Loading your documents…</p>
          ) : visibleDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {topicFilter
                ? `No documents found about "${topicFilter}".`
                : 'No documents yet. Upload one above to get started.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleDocuments.map((doc) => (
                <li key={doc.id}>
                  <DocumentCard
                    doc={doc}
                    studySets={studySets.filter((s) => s.document_id === doc.id)}
                    now={now}
                    onGenerate={setGenerateFor}
                    onRetry={handleRetry}
                    onDelete={handleDelete}
                    onDeleteSet={handleDeleteSet}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <GenerateModal
        open={generateFor !== null}
        doc={generateFor}
        onClose={() => setGenerateFor(null)}
        onStarted={handleStarted}
        initialTopic={topicFilter}
      />
    </div>
  )
}

export default Documents