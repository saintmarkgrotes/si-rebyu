import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getStudySet, getStudySetFlashcards, submitReview } from '../lib/flashcards'
import { startStudySession, endStudySession } from '../lib/studySessions'
import { applyRating, buildQueue, currentCard } from '../lib/studyQueue'
import NavHeader from '../components/NavHeader'
import Card from '../components/Card'
import Flashcard from '../components/flashcards/Flashcard'
import RatingButtons from '../components/flashcards/RatingButtons'
import SessionSummary from '../components/flashcards/SessionSummary'

const FlashcardStudy = () => {
  const { studySetId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [studySet, setStudySet] = useState(null)
  const [total, setTotal] = useState(0)
  const [queue, setQueue] = useState(null) // null while loading
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const sessionRef = useRef(null) // the session row; a ref because it's read on unmount, not rendered

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [set, cards] = await Promise.all([getStudySet(studySetId), getStudySetFlashcards(studySetId)])
        const session = await startStudySession(user.id, set.document_id, { mode: 'flashcards', studySetId })
        if (!active) return
        setStudySet(set)
        setTotal(cards.length)
        setQueue(buildQueue(cards))
        sessionRef.current = session
      } catch (err) {
        if (active) setError(err.message || 'Could not load this study set.')
      }
    }
    load()
    return () => {
      active = false
      if (sessionRef.current) endStudySession(sessionRef.current.id).catch(() => {})
    }
  }, [studySetId, user.id])

  const card = useMemo(() => (queue ? currentCard(queue) : null), [queue])

  const handleRate = async (rating) => {
    if (!card || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await submitReview({ ...card, user_id: user.id }, rating, sessionRef.current?.id)
      const result = applyRating(queue, card.id, rating)
      setQueue(result.queue)
      if (result.completed) {
        setStats((prev) => ({
          reviewed: prev.reviewed + 1,
          correct: prev.correct + (result.everAgain ? 0 : 1),
        }))
      }
      setRevealed(false)
    } catch (err) {
      setError(err.message || 'Could not save that rating. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDone = async () => {
    if (sessionRef.current) {
      await endStudySession(sessionRef.current.id).catch(() => {})
      sessionRef.current = null
    }
    navigate('/documents')
  }

  const remaining = queue?.length ?? 0
  const position = Math.min(total, total - remaining + 1)

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">{studySet?.title || 'Flashcards'}</h1>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        {queue === null && !error && <p className="mt-8 text-sm text-muted">Loading…</p>}

        {queue !== null && total === 0 && (
          <Card className="mt-8 text-center">
            <p className="text-sm text-muted">This study set has no flashcards yet.</p>
          </Card>
        )}

        {queue !== null && total > 0 && card && (
          <div className="mt-8 flex flex-col gap-6">
            <p className="text-sm text-muted">
              Card {position} of {total}
            </p>
            <Flashcard front={card.front} back={card.back} revealed={revealed} onReveal={() => setRevealed(true)} />
            {revealed ? (
              <RatingButtons onRate={handleRate} disabled={submitting} />
            ) : (
              <p className="text-center text-xs text-muted">Show the answer, then rate how well you knew it.</p>
            )}
          </div>
        )}

        {queue !== null && total > 0 && !card && (
          <div className="mt-8">
            <SessionSummary reviewed={stats.reviewed} correct={stats.correct} onDone={handleDone} />
          </div>
        )}
      </main>
    </div>
  )
}

export default FlashcardStudy
