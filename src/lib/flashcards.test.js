import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getStudySet, getStudySetFlashcards, submitReview } from './flashcards'

const chain = (result) => {
  const obj = {
    select: vi.fn(() => obj), eq: vi.fn(() => obj), order: vi.fn(() => obj),
    single: vi.fn(() => Promise.resolve(result)), update: vi.fn(() => obj), insert: vi.fn(() => obj),
    then: (resolve) => Promise.resolve(result).then(resolve),
  }
  return obj
}

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from './supabase'

beforeEach(() => vi.clearAllMocks())

describe('getStudySet', () => {
  it('returns the row on success', async () => {
    supabase.from.mockReturnValue(chain({ data: { id: 's1', title: 'Week 1' }, error: null }))
    expect(await getStudySet('s1')).toEqual({ id: 's1', title: 'Week 1' })
  })

  it("throws the Supabase error (e.g. RLS denies access to someone else's set)", async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'not found' } }))
    await expect(getStudySet('other')).rejects.toMatchObject({ message: 'not found' })
  })
})

describe('getStudySetFlashcards', () => {
  it('orders by due date so overdue cards come first', async () => {
    const c = chain({ data: [{ id: 'a' }], error: null })
    supabase.from.mockReturnValue(c)
    await getStudySetFlashcards('s1')
    expect(c.order).toHaveBeenCalledWith('due_at', { ascending: true })
    expect(c.eq).toHaveBeenCalledWith('study_set_id', 's1')
  })
})

describe('submitReview', () => {
  const card = { id: 'card-1', interval_days: 0, ease: 2.5, repetitions: 0, lapses: 0, times_reviewed: 0, times_correct: 0 }

  it('updates the flashcard and logs the review, in that order, with a consistent ease', async () => {
    const calls = []
    supabase.from.mockImplementation((table) => {
      calls.push(table)
      if (table === 'flashcards') return chain({ data: { ...card, ease: 2.5 }, error: null })
      return chain({ data: null, error: null })
    })
    await submitReview(card, 'good', 'session-1')
    expect(calls).toEqual(['flashcards', 'flashcard_reviews'])
  })

  it('propagates an error from updating the flashcard and never logs the review', async () => {
    const calls = []
    supabase.from.mockImplementation((table) => {
      calls.push(table)
      return chain({ data: null, error: { message: 'network down' } })
    })
    await expect(submitReview(card, 'good', 'session-1')).rejects.toMatchObject({ message: 'network down' })
    expect(calls).toEqual(['flashcards'])
  })

  it('rejects an unknown rating before touching the database', async () => {
    await expect(submitReview(card, 'meh', 'session-1')).rejects.toThrow(/unknown rating/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('getStudySet: not-found errors read clearly', () => {
  it('turns a PostgREST "no row" error into a friendly not-found message', async () => {
    supabase.from.mockReturnValue(
      chain({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }),
    )
    await expect(getStudySet('missing')).rejects.toMatchObject({
      message: 'This study set could not be found. It may have been deleted, or you may not have access to it.',
    })
  })

  it('leaves an unrelated error message untouched', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'Your session has expired.' } }))
    await expect(getStudySet('s1')).rejects.toMatchObject({ message: 'Your session has expired.' })
  })
})
