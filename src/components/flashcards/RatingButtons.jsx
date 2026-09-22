import Button from '../Button'

// Order matches the spec and how these are read left to right: hardest to easiest.
const RATINGS = [
  { value: 'again', label: 'Again' },
  { value: 'hard', label: 'Hard' },
  { value: 'good', label: 'Good' },
  { value: 'easy', label: 'Easy' },
]

const RatingButtons = ({ onRate, disabled = false }) => (
  <div role="group" aria-label="Rate this card" className="grid grid-cols-4 gap-2">
    {RATINGS.map((r) => (
      <Button key={r.value} variant="secondary" disabled={disabled} onClick={() => onRate(r.value)}>
        {r.label}
      </Button>
    ))}
  </div>
)

export default RatingButtons
