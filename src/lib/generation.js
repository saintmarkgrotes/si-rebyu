// Pure helpers for the "Generate study material" flow: options, validation, labels and progress.
// Nothing here touches the network or React, so it is easy to test.

export const COUNT_CHOICES = [0, 10, 20, 30, 50]

export const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'mixed', label: 'Mixed' },
]

export const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'identification', label: 'Identification' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'scenario', label: 'Scenario' },
]

export const DEFAULT_OPTIONS = {
  flashcards: 20,
  questions: 20,
  questionTypes: ['multiple_choice', 'true_false', 'identification'],
  difficulty: 'mixed',
  topics: [], // empty = all topics
}

// The server treats a job as dead after these many minutes without progress (see the backend jobs).
export const DOCUMENT_STALE_MINUTES = 15
export const STUDY_SET_STALE_MINUTES = 30
// A fresh upload should start processing within seconds; if not, the server is probably waking up.
const START_GRACE_MINUTES = 0.5

export const pluralize = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Keep question types in a stable order however the user ticked them.
export const orderTypes = (types) => QUESTION_TYPES.map((t) => t.value).filter((v) => types.includes(v))

export const validateOptions = (options) => {
  if (options.flashcards + options.questions === 0) return 'Choose at least one flashcard or question.'
  if (options.questions > 0 && options.questionTypes.length === 0) return 'Choose at least one question type.'
  return ''
}

// Shape sent to the backend (snake_case, matching its GenerationOptions model).
export const toPayload = (options, title = '') => {
  const body = {
    flashcards: options.flashcards,
    questions: options.questions,
    question_types: options.questions > 0 ? orderTypes(options.questionTypes) : [],
    difficulty: options.difficulty,
    topics: options.topics,
  }
  const name = title.trim()
  if (name) body.title = name
  return body
}

export const isStale = (row, minutes, now = Date.now()) => {
  const updated = Date.parse(row?.updated_at)
  return Number.isNaN(updated) || now - updated > minutes * 60 * 1000
}

// What to show for a document, and whether the user can retry it.
export const documentState = (doc, now = Date.now()) => {
  if (doc.status === 'ready') return { kind: 'ready', label: 'Ready', canRetry: false }
  if (doc.status === 'failed') return { kind: 'failed', label: 'Failed to process', canRetry: true }
  if (doc.processing_stage == null) {
    if (isStale(doc, START_GRACE_MINUTES, now)) return { kind: 'waiting', label: 'Waiting to start…', canRetry: true }
    return { kind: 'reading', label: 'Reading document…', canRetry: false }
  }
  if (isStale(doc, DOCUMENT_STALE_MINUTES, now)) return { kind: 'stalled', label: 'Stopped responding', canRetry: true }
  if (doc.processing_stage === 'saving') return { kind: 'saving', label: 'Saving…', canRetry: false }
  return { kind: 'reading', label: 'Reading document…', canRetry: false }
}

// Stage and progress of a study set: Analyzing -> Generating (n of m) -> Saving -> Complete.
export const studySetState = (set, now = Date.now()) => {
  if (set.status === 'ready') return { kind: 'ready', label: 'Complete', percent: 100 }
  if (set.status === 'failed') return { kind: 'failed', label: 'Failed', percent: 0 }
  if (isStale(set, STUDY_SET_STALE_MINUTES, now)) return { kind: 'stalled', label: 'Stopped responding', percent: 0 }
  const total = set.progress_total || 0
  const done = set.progress_done || 0
  if (set.stage === 'saving') return { kind: 'saving', label: 'Saving…', percent: 100 }
  if (set.stage === 'generating') {
    return {
      kind: 'generating',
      label: total ? `Generating (${done} of ${total})…` : 'Generating…',
      percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
    }
  }
  return { kind: 'analyzing', label: 'Analyzing…', percent: 0 }
}

export const formatDuration = (seconds) => {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}

export const estimateText = (estimate) =>
  `This will use about ${pluralize(estimate.planned_requests, 'AI request')} and take around ${formatDuration(estimate.estimated_seconds)}.`

// Only finished study sets count toward what a document "has".
export const sumCounts = (sets) =>
  sets
    .filter((s) => s.status === 'ready')
    .reduce(
      (total, s) => ({
        flashcards: total.flashcards + (s.flashcard_count || 0),
        questions: total.questions + (s.question_count || 0),
      }),
      { flashcards: 0, questions: 0 },
    )

export const countsSummary = ({ flashcards, questions }) => {
  const parts = []
  if (flashcards) parts.push(pluralize(flashcards, 'flashcard'))
  if (questions) parts.push(pluralize(questions, 'question'))
  return parts.join(' and ')
}
