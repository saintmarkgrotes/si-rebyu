import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getDocumentsForTopic, getDueFlashcardCount, getDueFlashcards, getOverallAccuracy, getStudyStreak,
  getTopicsStudiedCount, getWeakTopics,
} from './progress'

const chain = (result) => {
  const obj = {
    select: vi.fn(() => obj), not: vi.fn(() => obj), lte: vi.fn(() => obj), eq: vi.fn(() => obj),
    order: vi.fn(() => obj), limit: vi.fn(() => obj),
    then: (resolve) => Promise.resolve(result).then(resolve),
  }
  return obj
}

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from './supabase'

beforeEach(() => vi.clearAllMocks())

describe('getStudyStreak', () => {
  it('computes the streak from session dates', async () => {
    const now = new Date()
    supabase.from.mockReturnValue(chain({ data: [{ started_at: now.toISOString() }], error: null }))
    expect(await getStudyStreak()).toBe(1)
  })

  it('throws the Supabase error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    await expect(getStudyStreak()).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('getOverallAccuracy', () => {
  it('summarizes correct vs total, excluding null (ungraded) attempts via the query itself', async () => {
    const c = chain({ data: [{ is_correct: true }, { is_correct: true }, { is_correct: false }], error: null })
    supabase.from.mockReturnValue(c)
    expect(await getOverallAccuracy()).toEqual({ correct: 2, total: 3, percent: 67 })
    expect(c.not).toHaveBeenCalledWith('is_correct', 'is', null)
  })

  it('percent is null with no attempts yet', async () => {
    supabase.from.mockReturnValue(chain({ data: [], error: null }))
    expect(await getOverallAccuracy()).toEqual({ correct: 0, total: 0, percent: null })
  })
})

describe('getWeakTopics', () => {
  it('reads the topic name through the questions/topics join', async () => {
    const rows = [
      { is_correct: true, questions: { topic_id: 't1', topics: { name: 'VLAN' } } },
      { is_correct: false, questions: { topic_id: 't1', topics: { name: 'VLAN' } } },
      { is_correct: false, questions: { topic_id: 't1', topics: { name: 'VLAN' } } },
    ]
    supabase.from.mockReturnValue(chain({ data: rows, error: null }))
    expect(await getWeakTopics()).toEqual([{ topic: 'VLAN', correct: 1, total: 3, percent: 33 }])
  })

  it('a question with no topic is grouped under General', async () => {
    const rows = [{ is_correct: true, questions: { topic_id: null, topics: null } }]
    supabase.from.mockReturnValue(chain({ data: rows, error: null }))
    expect(await getWeakTopics(1)).toEqual([{ topic: 'General', correct: 1, total: 1, percent: 100 }])
  })
})

describe('getTopicsStudiedCount', () => {
  it('counts distinct topics across both quiz attempts and flashcard reviews', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'question_attempts') {
        return chain({ data: [{ questions: { topic_id: 't1' } }, { questions: { topic_id: 't2' } }], error: null })
      }
      return chain({ data: [{ flashcards: { topic_id: 't2' } }, { flashcards: { topic_id: 't3' } }], error: null })
    })
    expect(await getTopicsStudiedCount()).toBe(3) // t1, t2, t3 — t2 counted once despite appearing twice
  })

  it('ignores rows with no linked topic', async () => {
    supabase.from.mockImplementation(() => chain({ data: [{ questions: {} }, { flashcards: {} }], error: null }))
    expect(await getTopicsStudiedCount()).toBe(0)
  })

  it('throws if either query fails', async () => {
    supabase.from.mockImplementation((table) =>
      table === 'question_attempts' ? chain({ data: null, error: { message: 'denied' } }) : chain({ data: [], error: null }),
    )
    await expect(getTopicsStudiedCount()).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('getDueFlashcardCount', () => {
  it('filters to cards due now or earlier and returns the count', async () => {
    const c = chain({ count: 7, error: null })
    supabase.from.mockReturnValue(c)
    expect(await getDueFlashcardCount()).toBe(7)
    expect(c.lte).toHaveBeenCalledWith('due_at', expect.any(String))
  })

  it('is 0 rather than null/undefined when nothing is due', async () => {
    supabase.from.mockReturnValue(chain({ count: null, error: null }))
    expect(await getDueFlashcardCount()).toBe(0)
  })
})

describe('getDueFlashcards', () => {
  const setup = (cards, weakRows) => {
    supabase.from.mockImplementation((table) =>
      table === 'flashcards' ? chain({ data: cards, error: null }) : chain({ data: weakRows, error: null }),
    )
  }

  it('orders soonest/most-overdue first, within weak topics first, and applies the given limit', async () => {
    let flashcardsChain
    supabase.from.mockImplementation((table) => {
      if (table === 'flashcards') {
        flashcardsChain = chain({
          data: [
            { id: 'strong', topics: { name: 'Strong' } },
            { id: 'weak', topics: { name: 'Weak' } },
          ],
          error: null,
        })
        return flashcardsChain
      }
      return chain({
        data: [{ is_correct: false }, { is_correct: false }, { is_correct: false }].map((a) => ({
          ...a, questions: { topic_id: 't', topics: { name: 'Weak' } },
        })),
        error: null,
      })
    })
    const result = await getDueFlashcards(10)
    expect(flashcardsChain.order).toHaveBeenCalledWith('due_at', { ascending: true })
    expect(flashcardsChain.limit).toHaveBeenCalledWith(10)
    expect(result.map((c) => c.id)).toEqual(['weak', 'strong'])
  })

  it('throws the Supabase error from the flashcards query', async () => {
    setup(null, [])
    supabase.from.mockImplementation((table) =>
      table === 'flashcards' ? chain({ data: null, error: { message: 'denied' } }) : chain({ data: [], error: null }),
    )
    await expect(getDueFlashcards()).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('getDocumentsForTopic', () => {
  it('returns only ready documents linked to the topic', async () => {
    const rows = [
      { documents: { id: 'd1', title: 'Networking', status: 'ready' } },
      { documents: { id: 'd2', title: 'Old one', status: 'processing' } },
      { documents: null },
    ]
    const c = chain({ data: rows, error: null })
    supabase.from.mockReturnValue(c)
    const result = await getDocumentsForTopic('VLAN')
    expect(c.eq).toHaveBeenCalledWith('topics.name', 'VLAN')
    expect(result).toEqual([{ id: 'd1', title: 'Networking', status: 'ready' }])
  })

  it('throws the Supabase error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    await expect(getDocumentsForTopic('VLAN')).rejects.toMatchObject({ message: 'denied' })
  })
})
