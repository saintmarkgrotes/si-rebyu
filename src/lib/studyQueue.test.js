import { describe, expect, it } from 'vitest'
import { applyRating, buildQueue, currentCard } from './studyQueue'

const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]

describe('buildQueue / currentCard', () => {
  it('starts with the first card, in the given order', () => {
    const q = buildQueue(cards)
    expect(currentCard(q)).toEqual({ id: 'a' })
  })

  it('an empty deck has no current card', () => {
    expect(currentCard(buildQueue([]))).toBeNull()
  })
})

describe('applyRating: non-again ratings finish the card', () => {
  it.each(['hard', 'good', 'easy'])('%s removes the card and marks it completed', (rating) => {
    const q = buildQueue(cards)
    const result = applyRating(q, 'a', rating)
    expect(result.completed).toBe(true)
    expect(result.everAgain).toBe(false)
    expect(currentCard(result.queue)).toEqual({ id: 'b' })
    expect(result.queue.map((i) => i.card.id)).toEqual(['b', 'c', 'd', 'e'])
  })
})

describe('applyRating: again requeues instead of finishing', () => {
  it('is not completed, and the card is not gone', () => {
    const q = buildQueue(cards)
    const result = applyRating(q, 'a', 'again')
    expect(result.completed).toBe(false)
    expect(result.queue.some((i) => i.card.id === 'a')).toBe(true)
    expect(currentCard(result.queue)).toEqual({ id: 'b' }) // moves on to the next card
  })

  it('comes back a few cards later, not immediately next', () => {
    const q = buildQueue(cards)
    const { queue } = applyRating(q, 'a', 'again')
    const position = queue.findIndex((i) => i.card.id === 'a')
    expect(position).toBeGreaterThan(0)
    expect(queue[0].card.id).not.toBe('a')
  })

  it('is remembered as missed once it does finish', () => {
    let q = buildQueue([{ id: 'a' }, { id: 'b' }])
    const again = applyRating(q, 'a', 'again')
    q = again.queue
    // work through the rest of the deck until "a" comes back around
    let result
    while (currentCard(q)?.id !== 'a') {
      result = applyRating(q, currentCard(q).id, 'good')
      q = result.queue
    }
    const final = applyRating(q, 'a', 'good')
    expect(final.everAgain).toBe(true)
    expect(final.completed).toBe(true)
  })

  it('a short deck still requeues without erroring, even with few cards left', () => {
    const q = buildQueue([{ id: 'a' }, { id: 'b' }])
    const result = applyRating(q, 'a', 'again')
    expect(result.queue.map((i) => i.card.id).sort()).toEqual(['a', 'b'])
  })

  it('the last card in the deck can still be marked again and comes back', () => {
    const q = buildQueue([{ id: 'a' }])
    const result = applyRating(q, 'a', 'again')
    expect(currentCard(result.queue)).toEqual({ id: 'a' })
    expect(result.completed).toBe(false)
  })
})

describe('applyRating: errors', () => {
  it('throws if the card is not in the queue (already completed, or never existed)', () => {
    const q = buildQueue(cards)
    expect(() => applyRating(q, 'zzz', 'good')).toThrow(/not the current card/i)
  })

  it('does not mutate the queue it was given', () => {
    const q = buildQueue(cards)
    const snapshot = JSON.parse(JSON.stringify(q))
    applyRating(q, 'a', 'again')
    expect(q).toEqual(snapshot)
  })
})
