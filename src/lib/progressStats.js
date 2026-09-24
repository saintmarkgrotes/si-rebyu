// Pure calculations for the dashboard: streaks, accuracy, and per-topic weak-spot grouping.
// No Supabase, no React — kept separate so the math can be tested without a database.

const dayKey = (date) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Counts consecutive calendar days with at least one study session, ending today or yesterday.
// A day with no session at all before today or yesterday breaks the streak (it isn't "still going").
export const computeStreak = (sessionDates, now = new Date()) => {
  const days = new Set(sessionDates.filter(Boolean).map(dayKey))
  if (days.size === 0) return 0

  const cursor = new Date(now)
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1) // no session yet today; a streak can still continue from yesterday
    if (!days.has(dayKey(cursor))) return 0
  }

  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export const accuracyPercent = (correct, total) => (total > 0 ? Math.round((correct / total) * 100) : null)

// Groups quiz attempts by topic. Topics with fewer than `minAttempts` are left out of the "weak
// topics" view — a single wrong guess on a brand-new topic isn't yet a pattern worth flagging.
export const groupTopicAccuracy = (attempts, { minAttempts = 3 } = {}) => {
  const byTopic = new Map()
  for (const a of attempts) {
    const name = a.topic || 'General'
    const entry = byTopic.get(name) || { topic: name, correct: 0, total: 0 }
    entry.total += 1
    if (a.isCorrect) entry.correct += 1
    byTopic.set(name, entry)
  }
  return [...byTopic.values()]
    .filter((t) => t.total >= minAttempts)
    .map((t) => ({ ...t, percent: accuracyPercent(t.correct, t.total) }))
    .sort((a, b) => a.percent - b.percent)
}


// Puts cards from a weak topic first among what's due, so a review session works on the topics
// that actually need it before anything else — without hiding or delaying cards that aren't due.
// Within each group (weak / not weak), the original order (most-overdue-first) is preserved.
export const prioritizeDueCards = (cards, weakTopicNames) => {
  const weak = new Set(weakTopicNames)
  const isWeak = (card) => weak.has(card.topics?.name)
  return [...cards].sort((a, b) => Number(isWeak(b)) - Number(isWeak(a)))
}
