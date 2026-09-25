import { supabase } from './supabase'
import { friendlyRowError } from './errors'
import { nextReviewState, reviewLogEntry } from './sm2'

export const getStudySet = async (studySetId) => {
  const { data, error } = await supabase.from('study_sets').select('*').eq('id', studySetId).single()
  if (error) {
    throw new Error(
      friendlyRowError(
        error,
        'This study set could not be found. It may have been deleted, or you may not have access to it.',
        'Could not load this study set.',
      ),
    )
  }
  return data
}

// Overdue cards first, so a session naturally works through what's due before anything new.
export const getStudySetFlashcards = async (studySetId) => {
  const { data, error } = await supabase
    .from('flashcards')
    .select('*')
    .eq('study_set_id', studySetId)
    .order('due_at', { ascending: true })
  if (error) throw error
  return data
}

// Updates the card's schedule and appends to its review history. Two calls, not one transaction —
// same pattern as endStudySession — but in this order, so a failed log never leaves scheduling stale.
export const submitReview = async (card, rating, sessionId) => {
  const nextState = nextReviewState(card, rating)

  const { data, error } = await supabase
    .from('flashcards')
    .update(nextState)
    .eq('id', card.id)
    .select()
    .single()
  if (error) throw error

  const { error: logError } = await supabase
    .from('flashcard_reviews')
    .insert({ ...reviewLogEntry(card, rating, nextState), user_id: card.user_id, session_id: sessionId })
  if (logError) throw logError

  return data
}
