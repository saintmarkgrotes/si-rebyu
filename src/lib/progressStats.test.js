import { describe, expect, it } from 'vitest'
import { accuracyPercent, computeStreak, groupTopicAccuracy, prioritizeDueCards } from './progressStats'

// Built entirely from local calendar components (year, month, day, hour), never from a UTC ISO
// string with local mutation mixed in — that combination gives a different "today" depending on
// the machine's timezone, which is exactly the bug this fixture exists to avoid reintroducing.
const NOW = new Date(2026, 0, 15, 18, 0, 0) // local: 15 Jan 2026, 6pm
const iso = (daysAgo, hour = 12) => new Date(2026, 0, 15 - daysAgo, hour).toISOString()

describe('computeStreak', () => {
  it('is 0 with no sessions at all', () => {
    expect(computeStreak([], NOW)).toBe(0)
  })

  it('counts today alone as a streak of 1', () => {
    expect(computeStreak([iso(0)], NOW)).toBe(1)
  })

  it('counts several consecutive days ending today', () => {
    expect(computeStreak([iso(0), iso(1), iso(2)], NOW)).toBe(3)
  })

  it('still counts the streak if today has no session yet, but yesterday does', () => {
    expect(computeStreak([iso(1), iso(2)], NOW)).toBe(2)
  })

  it('is 0 if the most recent session was two or more days ago', () => {
    expect(computeStreak([iso(2), iso(3)], NOW)).toBe(0)
  })

  it('a gap stops the count from reaching further back', () => {
    expect(computeStreak([iso(0), iso(1), iso(3), iso(4)], NOW)).toBe(2)
  })

  it('multiple sessions on the same day only count once', () => {
    expect(computeStreak([iso(0, 8), iso(0, 20), iso(1, 9)], NOW)).toBe(2)
  })

  it('ignores null/undefined entries without crashing', () => {
    expect(computeStreak([iso(0), null, undefined], NOW)).toBe(1)
  })
})

describe('accuracyPercent', () => {
  it('rounds to the nearest whole percent', () => {
    expect(accuracyPercent(1, 3)).toBe(33)
    expect(accuracyPercent(2, 3)).toBe(67)
  })

  it('is null (not 0, not NaN) when there is nothing to measure yet', () => {
    expect(accuracyPercent(0, 0)).toBeNull()
  })

  it('0 correct out of a real total is 0%, not null', () => {
    expect(accuracyPercent(0, 5)).toBe(0)
  })
})

describe('groupTopicAccuracy', () => {
  const a = (topic, isCorrect) => ({ topic, isCorrect })

  it('groups by topic and computes percent correct', () => {
    const rows = groupTopicAccuracy([a('VLAN', true), a('VLAN', true), a('VLAN', false)], { minAttempts: 1 })
    expect(rows).toEqual([{ topic: 'VLAN', correct: 2, total: 3, percent: 67 }])
  })

  it('sorts the weakest topic first', () => {
    const rows = groupTopicAccuracy(
      [a('Strong', true), a('Strong', true), a('Strong', true), a('Weak', false), a('Weak', false), a('Weak', true)],
      { minAttempts: 1 },
    )
    expect(rows.map((t) => t.topic)).toEqual(['Weak', 'Strong'])
  })

  it('leaves out topics with too few attempts to mean anything', () => {
    const rows = groupTopicAccuracy([a('New', false), a('Established', false), a('Established', false), a('Established', true)])
    expect(rows.map((t) => t.topic)).toEqual(['Established'])
  })

  it('groups attempts with no topic under General', () => {
    const rows = groupTopicAccuracy([a(null, true), a(null, false), a(undefined, true)], { minAttempts: 1 })
    expect(rows).toEqual([{ topic: 'General', correct: 2, total: 3, percent: 67 }])
  })

  it('an empty attempt list gives an empty result', () => {
    expect(groupTopicAccuracy([])).toEqual([])
  })
})

describe('prioritizeDueCards', () => {
  const card = (id, topic) => ({ id, topics: topic ? { name: topic } : null })

  it('moves weak-topic cards to the front, keeping the rest in their original order', () => {
    const cards = [card('a', 'Strong'), card('b', 'Weak'), card('c', 'Strong'), card('d', 'Weak')]
    const result = prioritizeDueCards(cards, ['Weak'])
    expect(result.map((c) => c.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('is a no-op when there are no weak topics', () => {
    const cards = [card('a', 'X'), card('b', 'Y')]
    expect(prioritizeDueCards(cards, []).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('cards with no topic are never treated as weak', () => {
    const cards = [card('a', null), card('b', 'Weak')]
    expect(prioritizeDueCards(cards, ['Weak']).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the array it was given', () => {
    const cards = [card('a', 'Strong'), card('b', 'Weak')]
    const snapshot = [...cards]
    prioritizeDueCards(cards, ['Weak'])
    expect(cards).toEqual(snapshot)
  })
})
