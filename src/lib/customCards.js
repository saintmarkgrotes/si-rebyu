import { supabase } from './supabase'
import { friendlyRowError } from './errors'

const normalize = (s) => (s ?? '').trim().replace(/\s+/g, ' ')

export const MIN_CHOICES = 2
export const MAX_CHOICES = 6

// ---------- drafts (what the editors work with) ----------

export const blankFlashcardDraft = () => ({ front: '', back: '', topicName: '' })

export const draftFromFlashcard = (card) => ({
  front: card.front,
  back: card.back,
  topicName: card.topics?.name ?? '',
})

export const blankQuestionDraft = (type = 'multiple_choice') => ({
  question_type: type,
  question_text: '',
  hasChoices: type === 'multiple_choice',
  choices: ['', '', '', ''],
  correctIndex: 0,
  answerText: type === 'true_false' ? 'True' : '',
  explanation: '',
  topicName: '',
})

export const draftFromQuestion = (q) => {
  const hasOptions = Array.isArray(q.options) && q.question_type !== 'true_false'
  const choices = hasOptions ? q.options : ['', '', '', '']
  const found = choices.findIndex((c) => normalize(c) === normalize(q.correct_answer))
  let answerText = q.correct_answer ?? ''
  if (q.question_type === 'true_false') {
    answerText = normalize(answerText).toLowerCase() === 'false' ? 'False' : 'True'
  }
  return {
    question_type: q.question_type,
    question_text: q.question_text,
    hasChoices: q.question_type === 'multiple_choice' || hasOptions,
    choices,
    correctIndex: found === -1 ? 0 : found,
    answerText,
    explanation: q.explanation ?? '',
    topicName: q.topics?.name ?? '',
  }
}

// Drops blank choices and keeps track of where the correct one ended up.
export const cleanChoices = (draft) => {
  const kept = []
  let correctIndex = -1
  draft.choices.forEach((choice, i) => {
    const text = choice.trim()
    if (!text) return
    if (i === draft.correctIndex) correctIndex = kept.length
    kept.push(text)
  })
  return { choices: kept, correctIndex }
}

// ---------- validation (returns '' when fine, otherwise a message to show) ----------

export const validateFlashcardDraft = (draft) => {
  if (!draft.front.trim()) return 'The front of the card is empty.'
  if (!draft.back.trim()) return 'The back of the card is empty.'
  return ''
}

export const validateQuestionDraft = (draft) => {
  if (!draft.question_text.trim()) return 'Write the question first.'
  if (draft.question_type === 'true_false') {
    return ['True', 'False'].includes(draft.answerText) ? '' : 'Choose True or False as the correct answer.'
  }
  if (draft.hasChoices) {
    const { choices, correctIndex } = cleanChoices(draft)
    if (choices.length < MIN_CHOICES) return 'Add at least two choices.'
    const unique = new Set(choices.map((c) => normalize(c).toLowerCase()))
    if (unique.size !== choices.length) return 'Each choice must be different.'
    if (correctIndex === -1) return 'Select one of the filled-in choices as the correct answer.'
    return ''
  }
  return draft.answerText.trim() ? '' : 'Enter the correct answer.'
}

// The correct answer is always derived from the selected choice, so editing the wording of a
// choice can never leave correct_answer pointing at text that no longer exists.
export const questionRowFromDraft = (draft) => {
  const base = {
    question_type: draft.question_type,
    question_text: draft.question_text.trim(),
    explanation: draft.explanation.trim() || null,
  }
  if (draft.question_type === 'true_false') return { ...base, options: null, correct_answer: draft.answerText }
  if (draft.hasChoices) {
    const { choices, correctIndex } = cleanChoices(draft)
    return { ...base, options: choices, correct_answer: choices[correctIndex] }
  }
  return { ...base, options: null, correct_answer: draft.answerText.trim() }
}

// ---------- database ----------

export const getSetContent = async (setId) => {
  const [setRes, cardsRes, questionsRes] = await Promise.all([
    supabase.from('study_sets').select('*').eq('id', setId).single(),
    supabase.from('flashcards').select('*, topics(name)').eq('study_set_id', setId).order('created_at', { ascending: true }),
    supabase.from('questions').select('*, topics(name)').eq('study_set_id', setId).order('created_at', { ascending: true }),
  ])
  if (setRes.error) {
    throw new Error(
      friendlyRowError(
        setRes.error,
        'This study set could not be found. It may have been deleted, or you may not have access to it.',
        'Could not load this study set.',
      ),
    )
  }
  if (cardsRes.error) throw cardsRes.error
  if (questionsRes.error) throw questionsRes.error
  return { set: setRes.data, cards: cardsRes.data, questions: questionsRes.data }
}

export const createCustomSet = async (userId, title) => {
  const { data, error } = await supabase
    .from('study_sets')
    .insert({ user_id: userId, document_id: null, title: title.trim(), status: 'ready', settings: { custom: true } })
    .select()
    .single()
  if (error) throw error
  return data
}

export const renameStudySet = async (setId, title) => {
  const { error } = await supabase.from('study_sets').update({ title: title.trim() }).eq('id', setId)
  if (error) throw error
}

// The topic is optional; it ties the card into the weak-topics stats on the dashboard.
const getOrCreateTopic = async (userId, name) => {
  const clean = (name ?? '').trim()
  if (!clean) return null
  const { data, error } = await supabase
    .from('topics')
    .upsert({ user_id: userId, name: clean }, { onConflict: 'user_id,name' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// study_sets.flashcard_count / question_count are stored columns, so recount after adding or deleting.
export const syncSetCounts = async (setId) => {
  const count = async (table) => {
    const { count: n, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('study_set_id', setId)
    if (error) throw error
    return n ?? 0
  }
  const [flashcard_count, question_count] = await Promise.all([count('flashcards'), count('questions')])
  const { error } = await supabase
    .from('study_sets')
    .update({ flashcard_count, question_count, updated_at: new Date().toISOString() })
    .eq('id', setId)
  if (error) throw error
}

export const addFlashcard = async (set, userId, draft) => {
  const topic_id = await getOrCreateTopic(userId, draft.topicName)
  const { error } = await supabase.from('flashcards').insert({
    user_id: userId,
    study_set_id: set.id,
    document_id: set.document_id, // null for custom sets, the set's document otherwise
    topic_id,
    front: draft.front.trim(),
    back: draft.back.trim(),
    source: { custom: true },
  })
  if (error) throw error
}

export const updateFlashcard = async (id, userId, draft) => {
  const topic_id = await getOrCreateTopic(userId, draft.topicName)
  const { error } = await supabase
    .from('flashcards')
    .update({ front: draft.front.trim(), back: draft.back.trim(), topic_id })
    .eq('id', id)
  if (error) throw error
}

export const deleteFlashcard = async (id) => {
  const { error } = await supabase.from('flashcards').delete().eq('id', id)
  if (error) throw error
}

export const addQuestion = async (set, userId, draft) => {
  const topic_id = await getOrCreateTopic(userId, draft.topicName)
  const { error } = await supabase.from('questions').insert({
    user_id: userId,
    study_set_id: set.id,
    document_id: set.document_id,
    topic_id,
    source: { custom: true },
    ...questionRowFromDraft(draft),
  })
  if (error) throw error
}

export const updateQuestion = async (id, userId, draft) => {
  const topic_id = await getOrCreateTopic(userId, draft.topicName)
  const { error } = await supabase
    .from('questions')
    .update({ topic_id, ...questionRowFromDraft(draft) })
    .eq('id', id)
  if (error) throw error
}

export const deleteQuestion = async (id) => {
  const { error } = await supabase.from('questions').delete().eq('id', id)
  if (error) throw error
}