import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDueFlashcards } from '../lib/progress'
import { startStudySession } from '../lib/studySessions'
import FlashcardSession from '../components/flashcards/FlashcardSession'

// The cross-document review queue: every card due right now, from any document, in one session.
const Review = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const loadSession = async () => {
    const cards = await getDueFlashcards()
    const session = await startStudySession(user.id, null, { mode: 'review' })
    return { title: 'Review', cards, session }
  }

  return (
    <FlashcardSession
      loadSession={loadSession}
      defaultTitle="Review"
      emptyMessage="No cards are due for review right now. Nice work — check back later."
      loadErrorMessage="Could not load your review queue."
      onDone={() => navigate('/dashboard')}
    />
  )
}

export default Review
