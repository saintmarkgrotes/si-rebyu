import { supabase } from './supabase'

// Types the app can grade itself, by comparing the typed/selected answer to correct_answer.
// short_answer, and a scenario with no fixed choices, have no single right wording to compare
// against, so the student is shown the model answer and says for themselves whether they had it.
const AUTO_GRADED = new Set(['multiple_choice', 'true_false', 'identification'])

// Recall first (a term has to come from memory), then open answers, then anything that offers
// choices. This matters here specifically: with several question types generated from the same
// short passage, an early multiple-choice or true/false question can accidentally hand a student
// the exact term a later identification question is asking for. Ordering recall first avoids that,
// without having to change what the AI generates.
const TYPE_ORDER = ['identification', 'short_answer', 'scenario', 'true_false', 'multiple_choice']

export const isAutoGraded = (question) => AUTO_GRADED.has(question.question_type) || Boolean(question.options)

const normalize = (s) => (s ?? '').trim().replace(/\s+/g, ' ')

// Returns true/false for anything with one exact right answer, or null when only the student
// themselves can judge whether a free-form answer was correct.
export const gradeAnswer = (question, answer) => {
  if (!isAutoGraded(question)) return null
  if (question.question_type === 'identification') {
    return normalize(answer).toLowerCase() === normalize(question.correct_answer).toLowerCase()
  }
  return normalize(answer) === normalize(question.correct_answer)
}

// A stable sort: only order between types changes, never the order of questions of the same type.
export const orderForQuiz = (questions) =>
  [...questions].sort((a, b) => TYPE_ORDER.indexOf(a.question_type) - TYPE_ORDER.indexOf(b.question_type))

export const getStudySetQuestions = async (studySetId) => {
  const { data, error } = await supabase
    .from('questions')
    .select('*, topics(name)')
    .eq('study_set_id', studySetId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export const submitAttempt = async (sessionId, questionId, userAnswer, isCorrect) => {
  const { error } = await supabase
    .from('question_attempts')
    .insert({ session_id: sessionId, question_id: questionId, user_answer: userAnswer, is_correct: isCorrect })
  if (error) throw error
}

// Per-topic accuracy from a finished quiz's results, for the results screen. Questions with no
// topic are grouped under "General" rather than dropped, so every question is still accounted for.
export const topicBreakdown = (results) => {
  const byTopic = new Map()
  for (const r of results) {
    const name = r.question.topics?.name || 'General'
    const entry = byTopic.get(name) || { topic: name, correct: 0, total: 0 }
    entry.total += 1
    if (r.isCorrect) entry.correct += 1
    byTopic.set(name, entry)
  }
  return [...byTopic.values()]
    .map((t) => ({ ...t, percent: Math.round((t.correct / t.total) * 100) }))
    .sort((a, b) => a.percent - b.percent) // weakest topics first, so they're the ones seen first
}
