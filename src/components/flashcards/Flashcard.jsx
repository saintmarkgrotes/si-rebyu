// The card itself: front, and the back once revealed. Flipping is a click/Space/Enter on the whole card.
const Flashcard = ({ front, back, revealed, onReveal }) => (
  <div
    role="button"
    tabIndex={0}
    aria-pressed={revealed}
    onClick={!revealed ? onReveal : undefined}
    onKeyDown={(e) => {
      if (!revealed && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onReveal()
      }
    }}
    className={`flex min-h-64 w-full flex-col items-center justify-center gap-6 rounded-lg border border-line bg-paper p-8 text-center ${!revealed ? 'cursor-pointer' : ''}`}
  >
    <p className="text-lg text-ink">{front}</p>
    {revealed ? (
      <div className="w-full border-t border-line pt-6">
        <p className="text-lg text-ink">{back}</p>
      </div>
    ) : (
      <span className="text-sm text-muted-foreground">Click to show the answer</span>
    )}
  </div>
)

export default Flashcard
