import { describe, expect, it } from 'vitest'
import {
  countsSummary,
  DEFAULT_OPTIONS,
  documentState,
  estimateText,
  formatDuration,
  isStale,
  orderTypes,
  pluralize,
  studySetState,
  sumCounts,
  toPayload,
  validateOptions,
} from './generation'

const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString()

describe('pluralize', () => {
  it('handles singular and plural', () => {
    expect(pluralize(1, 'page')).toBe('1 page')
    expect(pluralize(2, 'page')).toBe('2 pages')
    expect(pluralize(0, 'page')).toBe('0 pages')
  })
})

describe('orderTypes', () => {
  it('returns the canonical order regardless of input order', () => {
    expect(orderTypes(['scenario', 'multiple_choice', 'true_false'])).toEqual([
      'multiple_choice',
      'true_false',
      'scenario',
    ])
  })

  it('drops unknown values', () => {
    expect(orderTypes(['multiple_choice', 'bogus'])).toEqual(['multiple_choice'])
  })
})

describe('validateOptions', () => {
  it('rejects zero flashcards and zero questions', () => {
    expect(validateOptions({ flashcards: 0, questions: 0, questionTypes: [] })).toMatch(/at least one/i)
  })

  it('rejects questions with no question types', () => {
    expect(validateOptions({ flashcards: 0, questions: 10, questionTypes: [] })).toMatch(/question type/i)
  })

  it('accepts flashcards only, with no question types', () => {
    expect(validateOptions({ flashcards: 10, questions: 0, questionTypes: [] })).toBe('')
  })

  it('accepts a normal selection', () => {
    expect(validateOptions({ flashcards: 20, questions: 20, questionTypes: ['multiple_choice'] })).toBe('')
  })
})

describe('toPayload', () => {
  it('maps to the backend shape in canonical type order', () => {
    expect(
      toPayload({
        flashcards: 20,
        questions: 10,
        questionTypes: ['true_false', 'multiple_choice'],
        difficulty: 'mixed',
        topics: ['VLAN'],
      }),
    ).toEqual({
      flashcards: 20,
      questions: 10,
      question_types: ['multiple_choice', 'true_false'],
      difficulty: 'mixed',
      topics: ['VLAN'],
    })
  })

  it('sends no question types when questions is 0, even if some are ticked', () => {
    const payload = toPayload({ ...DEFAULT_OPTIONS, flashcards: 10, questions: 0 })
    expect(payload.question_types).toEqual([])
  })

  it('only includes title when given and trims it', () => {
    expect(toPayload(DEFAULT_OPTIONS).title).toBeUndefined()
    expect(toPayload(DEFAULT_OPTIONS, '  ').title).toBeUndefined()
    expect(toPayload(DEFAULT_OPTIONS, '  Midterm  ').title).toBe('Midterm')
  })
})

describe('isStale', () => {
  it('is stale when updated_at is old, missing, or invalid', () => {
    expect(isStale({ updated_at: iso(20) }, 15)).toBe(true)
    expect(isStale({ updated_at: iso(5) }, 15)).toBe(false)
    expect(isStale({}, 15)).toBe(true)
    expect(isStale({ updated_at: 'not a date' }, 15)).toBe(true)
  })
})

describe('documentState', () => {
  it('ready and failed are unambiguous regardless of timestamps', () => {
    expect(documentState({ status: 'ready', updated_at: iso(999) }).kind).toBe('ready')
    const failed = documentState({ status: 'failed', updated_at: iso(0) })
    expect(failed).toMatchObject({ kind: 'failed', canRetry: true })
  })

  it('freshly queued (no stage yet) reads as reading, not stuck', () => {
    const state = documentState({ status: 'processing', processing_stage: null, updated_at: iso(0) })
    expect(state).toMatchObject({ kind: 'reading', canRetry: false })
  })

  it('a queued job that never started offers retry', () => {
    const state = documentState({ status: 'processing', processing_stage: null, updated_at: iso(5) })
    expect(state).toMatchObject({ kind: 'waiting', canRetry: true })
  })

  it('a document mid-extraction is reading, not retryable', () => {
    const state = documentState({ status: 'processing', processing_stage: 'extracting', updated_at: iso(1) })
    expect(state).toMatchObject({ kind: 'reading', canRetry: false })
  })

  it('a document being saved is shown distinctly', () => {
    const state = documentState({ status: 'processing', processing_stage: 'saving', updated_at: iso(1) })
    expect(state).toMatchObject({ kind: 'saving', canRetry: false })
  })

  it('a job silent past the stale window offers retry', () => {
    const state = documentState({ status: 'processing', processing_stage: 'extracting', updated_at: iso(20) })
    expect(state).toMatchObject({ kind: 'stalled', canRetry: true })
  })
})

describe('studySetState', () => {
  it('ready and failed are unambiguous', () => {
    expect(studySetState({ status: 'ready', updated_at: iso(999) })).toMatchObject({ kind: 'ready', percent: 100 })
    expect(studySetState({ status: 'failed', updated_at: iso(0) })).toMatchObject({ kind: 'failed', percent: 0 })
  })

  it('progresses through analyzing, generating (with percent), and saving', () => {
    expect(studySetState({ status: 'generating', stage: 'analyzing', updated_at: iso(0) }).kind).toBe('analyzing')
    const generating = studySetState({
      status: 'generating',
      stage: 'generating',
      progress_done: 3,
      progress_total: 12,
      updated_at: iso(0),
    })
    expect(generating).toMatchObject({ kind: 'generating', percent: 25 })
    expect(generating.label).toContain('3 of 12')
    expect(studySetState({ status: 'generating', stage: 'saving', updated_at: iso(0) })).toMatchObject({
      kind: 'saving',
      percent: 100,
    })
  })

  it('never divides by zero when progress_total is 0', () => {
    const state = studySetState({ status: 'generating', stage: 'generating', progress_total: 0, updated_at: iso(0) })
    expect(state.percent).toBe(0)
    expect(Number.isFinite(state.percent)).toBe(true)
  })

  it('a job silent past its own stale window is reported distinctly', () => {
    const state = studySetState({ status: 'generating', stage: 'generating', updated_at: iso(45) })
    expect(state.kind).toBe('stalled')
  })
})

describe('formatDuration', () => {
  it('reads naturally at every scale', () => {
    expect(formatDuration(5)).toBe('5 seconds')
    expect(formatDuration(0)).toBe('1 seconds')
    expect(formatDuration(60)).toBe('a minute')
    expect(formatDuration(150)).toBe('3 minutes')
  })
})

describe('estimateText', () => {
  it('combines request count and duration into one sentence', () => {
    expect(estimateText({ planned_requests: 1, estimated_seconds: 5 })).toBe(
      'This will use about 1 AI request and take around 5 seconds.',
    )
    expect(estimateText({ planned_requests: 4, estimated_seconds: 90 })).toContain('4 AI requests')
  })
})

describe('sumCounts and countsSummary', () => {
  it('only counts ready study sets', () => {
    const sets = [
      { status: 'ready', flashcard_count: 10, question_count: 5 },
      { status: 'generating', flashcard_count: 999, question_count: 999 },
      { status: 'ready', flashcard_count: 3, question_count: 0 },
    ]
    expect(sumCounts(sets)).toEqual({ flashcards: 13, questions: 5 })
  })

  it('summary reads naturally with one, both, or neither present', () => {
    expect(countsSummary({ flashcards: 20, questions: 20 })).toBe('20 flashcards and 20 questions')
    expect(countsSummary({ flashcards: 1, questions: 0 })).toBe('1 flashcard')
    expect(countsSummary({ flashcards: 0, questions: 0 })).toBe('')
  })
})
