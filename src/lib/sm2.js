// Spaced-repetition scheduling (a 4-button variant of SM-2, the same family used by Anki and similar apps).
// The AI never sets review dates; this is the only thing that does. Pure and side-effect free, so it's
// easy to test on its own.

export const RATINGS = ['again', 'hard', 'good', 'easy']

const MIN_EASE = 1.3
const MAX_EASE = 3.5
const AGAIN_MINUTES = 10 // "again" doesn't graduate to a full day; it comes back soon, within the session too

const clampEase = (ease) => Math.min(MAX_EASE, Math.max(MIN_EASE, ease))
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000)
const addDays = (date, days) => addMinutes(date, days * 24 * 60)

// `card` uses the flashcards table's own field names, so the result can be spread straight into an update.
export const nextReviewState = (card, rating, now = new Date()) => {
  if (!RATINGS.includes(rating)) throw new Error(`Unknown rating: ${rating}`)

  const prevInterval = card.interval_days ?? 0
  const prevEase = card.ease ?? 2.5
  const prevReps = card.repetitions ?? 0

  let interval_days = prevInterval
  let ease = prevEase
  let repetitions = prevReps
  let lapses = card.lapses ?? 0
  let due_at

  switch (rating) {
    case 'again':
      repetitions = 0
      lapses += 1
      ease = clampEase(prevEase - 0.2)
      interval_days = 0
      due_at = addMinutes(now, AGAIN_MINUTES)
      break
    case 'hard':
      ease = clampEase(prevEase - 0.15)
      interval_days = prevInterval > 0 ? Math.max(1, Math.round(prevInterval * 1.2)) : 1
      due_at = addDays(now, interval_days)
      break
    case 'good':
      repetitions += 1
      interval_days = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(prevInterval * prevEase)
      due_at = addDays(now, interval_days)
      break
    case 'easy':
      repetitions += 1
      ease = clampEase(prevEase + 0.15)
      interval_days = repetitions === 1 ? 4 : repetitions === 2 ? 8 : Math.round(prevInterval * prevEase * 1.3)
      due_at = addDays(now, interval_days)
      break
  }

  return {
    due_at: due_at.toISOString(),
    interval_days,
    ease,
    repetitions,
    lapses,
    times_reviewed: (card.times_reviewed ?? 0) + 1,
    times_correct: (card.times_correct ?? 0) + (rating === 'again' ? 0 : 1),
    last_reviewed_at: now.toISOString(),
  }
}

// The record kept in flashcard_reviews: the review log, independent of the card's current state.
export const reviewLogEntry = (card, rating, nextState) => ({
  flashcard_id: card.id,
  rating,
  interval_days_before: card.interval_days ?? 0,
  interval_days_after: nextState.interval_days,
  ease_after: nextState.ease,
})
