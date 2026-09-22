import { describe, expect, it } from 'vitest'
import { nextReviewState, reviewLogEntry, RATINGS } from './sm2'

const NOW = new Date('2026-01-15T12:00:00Z')
const newCard = { id: 'c1', interval_days: 0, ease: 2.5, repetitions: 0, lapses: 0, times_reviewed: 0, times_correct: 0 }
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / (24 * 60 * 60 * 1000)

describe('nextReviewState: new card, first review', () => {
  it.each([
    ['again', 0],
    ['hard', 1],
    ['good', 1],
    ['easy', 4],
  ])('%s schedules %s day(s) out', (rating, expectedDays) => {
    const next = nextReviewState(newCard, rating, NOW)
    expect(next.interval_days).toBe(expectedDays)
  })

  it('again drops due_at within the session (minutes, not days) and resets repetitions', () => {
    const next = nextReviewState(newCard, 'again', NOW)
    expect(daysBetween(NOW, next.due_at)).toBeLessThan(1)
    expect(new Date(next.due_at) > NOW).toBe(true)
    expect(next.repetitions).toBe(0)
    expect(next.lapses).toBe(1)
  })

  it('good and easy advance repetitions; hard and again do not', () => {
    expect(nextReviewState(newCard, 'good', NOW).repetitions).toBe(1)
    expect(nextReviewState(newCard, 'easy', NOW).repetitions).toBe(1)
    expect(nextReviewState(newCard, 'hard', NOW).repetitions).toBe(0)
    expect(nextReviewState(newCard, 'again', NOW).repetitions).toBe(0)
  })

  it('due_at is exactly interval_days after now for hard/good/easy', () => {
    for (const rating of ['hard', 'good', 'easy']) {
      const next = nextReviewState(newCard, rating, NOW)
      expect(daysBetween(NOW, next.due_at)).toBeCloseTo(next.interval_days, 5)
    }
  })
})

describe('nextReviewState: ease changes', () => {
  it('again and hard lower ease; easy raises it; good leaves it unchanged', () => {
    expect(nextReviewState(newCard, 'again', NOW).ease).toBeCloseTo(2.3)
    expect(nextReviewState(newCard, 'hard', NOW).ease).toBeCloseTo(2.35)
    expect(nextReviewState(newCard, 'good', NOW).ease).toBe(2.5)
    expect(nextReviewState(newCard, 'easy', NOW).ease).toBeCloseTo(2.65)
  })

  it('ease never drops below 1.3 even after repeated lapses', () => {
    let card = { ...newCard, ease: 1.35 }
    card = { ...card, ...nextReviewState(card, 'again', NOW) }
    expect(card.ease).toBeGreaterThanOrEqual(1.3)
    card = { ...card, ...nextReviewState(card, 'again', NOW) }
    expect(card.ease).toBe(1.3)
  })

  it('ease never rises above 3.5 even after repeated easy ratings', () => {
    let card = { ...newCard, ease: 3.45 }
    for (let i = 0; i < 5; i++) card = { ...card, ...nextReviewState(card, 'easy', NOW) }
    expect(card.ease).toBe(3.5)
  })
})

describe('nextReviewState: a mature card (reps >= 3) grows by interval * ease', () => {
  const mature = { ...newCard, interval_days: 10, ease: 2.5, repetitions: 3 }

  it('good multiplies the interval by ease', () => {
    const next = nextReviewState(mature, 'good', NOW)
    expect(next.interval_days).toBe(25) // 10 * 2.5
    expect(next.repetitions).toBe(4)
  })

  it('easy multiplies by ease and a bonus, and is longer than good', () => {
    const good = nextReviewState(mature, 'good', NOW).interval_days
    const easy = nextReviewState(mature, 'easy', NOW).interval_days
    expect(easy).toBeGreaterThan(good)
  })

  it('hard grows more slowly than good', () => {
    const hard = nextReviewState(mature, 'hard', NOW).interval_days
    const good = nextReviewState(mature, 'good', NOW).interval_days
    expect(hard).toBeLessThan(good)
  })

  it('again resets a mature card back to relearning, losing its streak', () => {
    const next = nextReviewState(mature, 'again', NOW)
    expect(next.repetitions).toBe(0)
    expect(next.interval_days).toBe(0)
    expect(next.lapses).toBe(1)
  })
})

describe('nextReviewState: counters', () => {
  it('times_reviewed always increases by one', () => {
    for (const rating of RATINGS) {
      expect(nextReviewState(newCard, rating, NOW).times_reviewed).toBe(1)
    }
  })

  it('times_correct increases for every rating except again', () => {
    expect(nextReviewState(newCard, 'again', NOW).times_correct).toBe(0)
    expect(nextReviewState(newCard, 'hard', NOW).times_correct).toBe(1)
    expect(nextReviewState(newCard, 'good', NOW).times_correct).toBe(1)
    expect(nextReviewState(newCard, 'easy', NOW).times_correct).toBe(1)
  })

  it('counters accumulate across repeated calls', () => {
    let card = newCard
    card = { ...card, ...nextReviewState(card, 'good', NOW) }
    card = { ...card, ...nextReviewState(card, 'again', NOW) }
    card = { ...card, ...nextReviewState(card, 'good', NOW) }
    expect(card.times_reviewed).toBe(3)
    expect(card.times_correct).toBe(2)
  })

  it('last_reviewed_at is set to the given time', () => {
    expect(nextReviewState(newCard, 'good', NOW).last_reviewed_at).toBe(NOW.toISOString())
  })
})

describe('nextReviewState: input validation and purity', () => {
  it('rejects an unknown rating', () => {
    expect(() => nextReviewState(newCard, 'meh', NOW)).toThrow(/unknown rating/i)
  })

  it('does not mutate the card it was given', () => {
    const card = { ...newCard }
    const snapshot = { ...card }
    nextReviewState(card, 'good', NOW)
    expect(card).toEqual(snapshot)
  })

  it('missing optional fields on a plain new-card object default sensibly', () => {
    const bare = { id: 'c2' }
    const next = nextReviewState(bare, 'good', NOW)
    expect(next).toMatchObject({ interval_days: 1, repetitions: 1, times_reviewed: 1, times_correct: 1 })
  })
})

describe('reviewLogEntry', () => {
  it('captures the before/after interval and the ease actually used', () => {
    const card = { ...newCard, id: 'card-9', interval_days: 6 }
    const next = nextReviewState(card, 'good', NOW)
    expect(reviewLogEntry(card, 'good', next)).toEqual({
      flashcard_id: 'card-9', rating: 'good', interval_days_before: 6, interval_days_after: next.interval_days,
      ease_after: next.ease,
    })
  })
})
