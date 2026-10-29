import { useId, useState } from 'react'
import mascot from '../assets/rebyu-lamb.png'
import './StudyMascot.css'

const encouragements = [
  'One card at a time. Kaya mo ’yan!',
  'A little progress is still progress. I’m cheering for you!',
  'Take a breath. You don’t have to learn it all at once.',
  'A little flower for your effort. Let’s keep growing!',
]

export default function StudyMascot({ message, compact = false }) {
  const [taps, setTaps] = useState(0)
  const messageId = useId()

  return (
    <div className={`study-mascot${compact ? ' study-mascot--compact' : ''}`}>
      <button
        type="button"
        className="study-mascot__button"
        aria-label="Say hello to Rebyu"
        aria-describedby={messageId}
        onClick={() => setTaps((value) => value + 1)}
      >
        <span className="study-mascot__halo" aria-hidden="true" />
        <img
          key={taps}
          className="study-mascot__image"
          src={mascot}
          alt="Simang, a fluffy lamb holding a pink tulip"
          width="192"
          height="192"
          draggable="false"
        />
        <span className="study-mascot__hint">Tap to say hi</span>
      </button>
      <div className="study-mascot__bubble">
        <p className="text-xs font-semibold tracking-wide text-secondary-foreground">SIMANG · YOUR STUDY BUDDY</p>
        <p id={messageId} role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm leading-relaxed text-secondary-foreground">
          {taps === 0 ? message : encouragements[(taps - 1) % encouragements.length]}
        </p>
      </div>
    </div>
  )
}
