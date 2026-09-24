import { supabase } from './supabase'
import { accuracyPercent, computeStreak, groupTopicAccuracy, prioritizeDueCards } from './progressStats'

// Every reader here relies on RLS to scope rows to the signed-in user — none of these take a userId.

export const getStudyStreak = async () => {
  const { data, error } = await supabase.from('study_sessions').select('started_at')
  if (error) throw error
  return computeStreak(data.map((s) => s.started_at))
}

// Quiz accuracy across every attempt ever recorded, not just the most recent quiz.
export const getOverallAccuracy = async () => {
  const { data, error } = await supabase.from('question_attempts').select('is_correct').not('is_correct', 'is', null)
  if (error) throw error
  const correct = data.filter((a) => a.is_correct).length
  return { correct, total: data.length, percent: accuracyPercent(correct, data.length) }
}

export const getWeakTopics = async (minAttempts = 3) => {
  const { data, error } = await supabase
    .from('question_attempts')
    .select('is_correct, questions(topic_id, topics(name))')
    .not('is_correct', 'is', null)
  if (error) throw error
  const attempts = data.map((a) => ({ topic: a.questions?.topics?.name, isCorrect: a.is_correct }))
  return groupTopicAccuracy(attempts, { minAttempts })
}

// Topics with genuine activity (at least one quiz attempt or flashcard review), as opposed to every
// topic a document happens to mention. A topic the student has never actually studied isn't "studied".
export const getTopicsStudiedCount = async () => {
  const [attempts, reviews] = await Promise.all([
    supabase.from('question_attempts').select('questions(topic_id)'),
    supabase.from('flashcard_reviews').select('flashcards(topic_id)'),
  ])
  if (attempts.error) throw attempts.error
  if (reviews.error) throw reviews.error
  const ids = new Set()
  for (const a of attempts.data) if (a.questions?.topic_id) ids.add(a.questions.topic_id)
  for (const r of reviews.data) if (r.flashcards?.topic_id) ids.add(r.flashcards.topic_id)
  return ids.size
}

export const getDueFlashcardCount = async () => {
  const { count, error } = await supabase
    .from('flashcards')
    .select('*', { count: 'exact', head: true })
    .lte('due_at', new Date().toISOString())
  if (error) throw error
  return count ?? 0
}

// Cards due right now, across every document — the actual queue for the cross-document Review page.
// Weak-topic cards are worked first (Review.jsx doesn't need to know this happens), then the rest
// by how overdue they are. Capped so one review session stays a reasonable length.
export const getDueFlashcards = async (limit = 50) => {
  const [{ data, error }, weakTopics] = await Promise.all([
    supabase
      .from('flashcards')
      .select('*, topics(name)')
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(limit),
    getWeakTopics(),
  ])
  if (error) throw error
  return prioritizeDueCards(data, weakTopics.map((t) => t.topic))
}

// Documents that touch on a given topic — used to point "study more about X" at the right place.
export const getDocumentsForTopic = async (topicName) => {
  const { data, error } = await supabase
    .from('document_topics')
    .select('documents(id, title, status)')
    .eq('topics.name', topicName)
    .not('documents', 'is', null)
  if (error) throw error
  return data.map((row) => row.documents).filter((d) => d && d.status === 'ready')
}
