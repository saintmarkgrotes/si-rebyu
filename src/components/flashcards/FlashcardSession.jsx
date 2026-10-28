import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/useAuth'
import { submitReview } from '../../lib/flashcards'
import { endStudySession } from '../../lib/studySessions'
import { applyRating, buildQueue, currentCard } from '../../lib/studyQueue'
import NavHeader from '../NavHeader'
import Card from '../Card'
import Flashcard from './Flashcard'
import RatingButtons from './RatingButtons'
import SessionSummary from './SessionSummary'

// The shared flashcard viewer: reveal, rate, track progress, end the session. Used both by studying
// one study set's deck and by the cross-document Review queue — they differ only in where the cards
// and the session come from, which `loadSession` supplies.
//
// `loadSession()` resolves to { title, cards, session }, with the study_sessions row already started.
const FlashcardSession = ({ loadSession, defaultTitle, emptyMessage, loadErrorMessage, onDone, doneLabel = 'Back to documents' }) => {
  const { user } = useAuth()

  const [title, setTitle] = useState(defaultTitle)
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
        const { title: loadedTitle, cards, session } = await loadSession()
        if (!active) return
        setTitle(loadedTitle)
        setTotal(cards.length)
        setQueue(buildQueue(cards))
        sessionRef.current = session
      } catch (err) {
        if (active) setError(err.message || loadErrorMessage)
      }
    }
    load()
    return () => {
      active = false
      if (sessionRef.current) endStudySession(sessionRef.current.id).catch(() => {})
    }
    // loadSession and onDone are freshly created by the caller on every render; only re-run this
    // effect for an actual new session (the caller remounts with a `key` when that happens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    onDone()
  }

  const remaining = queue?.length ?? 0
  const position = Math.min(total, total - remaining + 1)

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>

        {error && (
          <div className="mt-4">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={handleDone}
              className="mt-2 text-sm text-ink underline-offset-2 hover:underline"
            >
              {doneLabel}
            </button>
          </div>
        )}

        {queue === null && !error && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

        {queue !== null && total === 0 && (
          <Card className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </Card>
        )}

        {queue !== null && total > 0 && card && (
          <div className="mt-8 flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Card {position} of {total}
            </p>
            <Flashcard key={card.id} front={card.front} back={card.back} revealed={revealed} onReveal={setRevealed} />
            {revealed ? (
              <RatingButtons onRate={handleRate} disabled={submitting} />
            ) : (
              <p className="text-center text-xs text-muted-foreground">Show the answer, then rate how well you knew it.</p>
            )}
          </div>
        )}

        {queue !== null && total > 0 && !card && (
          <div className="mt-8">
            <SessionSummary reviewed={stats.reviewed} correct={stats.correct} onDone={handleDone} doneLabel={doneLabel} />
          </div>
        )}
      </main>
    </div>
  )
}

export default FlashcardSession
