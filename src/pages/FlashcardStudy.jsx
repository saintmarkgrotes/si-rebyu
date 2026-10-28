import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getStudySet, getStudySetFlashcards } from '../lib/flashcards'
import { startStudySession } from '../lib/studySessions'
import FlashcardSession from '../components/flashcards/FlashcardSession'

const FlashcardStudy = () => {
  const { studySetId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const loadSession = async () => {
    const [set, cards] = await Promise.all([getStudySet(studySetId), getStudySetFlashcards(studySetId)])
    const session = await startStudySession(user.id, set.document_id, { mode: 'flashcards', studySetId })
    return { title: set.title, cards, session }
  }

  return (
    // key: force a full remount (and a fresh loadSession call) if the user navigates from one
    // study set's deck straight to another's without an intervening page.
    <FlashcardSession
      key={studySetId}
      loadSession={loadSession}
      defaultTitle="Flashcards"
      emptyMessage="This study set has no flashcards yet."
      loadErrorMessage="Could not load this study set."
      onDone={() => navigate('/documents')}
    />
  )
}

export default FlashcardStudy
