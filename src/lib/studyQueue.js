// Pure queue logic for a flashcard session: what to show next, and what "Again" does (comes back
// later in the same session instead of ending the card's turn). Kept separate from SM-2 and from
// React so the session flow itself can be tested without a database or a renderer.

const REQUEUE_AFTER = 3 // how many other cards to show before an "again" card comes back around

export const buildQueue = (cards) => cards.map((card) => ({ card, everAgain: false }))

// Returns the queue's new state, plus whether this rating finished the card for the session
// (anything but "again") and whether the card was ever missed before that happened.
export const applyRating = (queue, cardId, rating) => {
  const index = queue.findIndex((item) => item.card.id === cardId)
  if (index === -1) throw new Error(`Card ${cardId} is not the current card in this queue.`)
  const item = queue[index]
  const rest = [...queue.slice(0, index), ...queue.slice(index + 1)]

  if (rating === 'again') {
    const requeued = { ...item, everAgain: true }
    const at = Math.min(rest.length, REQUEUE_AFTER)
    return { queue: [...rest.slice(0, at), requeued, ...rest.slice(at)], completed: false, everAgain: true }
  }
  return { queue: rest, completed: true, everAgain: item.everAgain }
}

export const currentCard = (queue) => queue[0]?.card ?? null
