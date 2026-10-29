import Card from '../Card'
import Button from '../Button'
import { pluralize } from '../../lib/generation'
import StudyMascot from '../StudyMascot'

const SessionSummary = ({ reviewed, correct, onDone, doneLabel = 'Back to documents' }) => {
  const accuracy = reviewed ? Math.round((correct / reviewed) * 100) : 0
  return (
    <Card className="text-center">
      <div className="mx-auto mb-6 max-w-sm">
        <StudyMascot compact message={reviewed > 0 ? 'Look at you showing up for yourself! Every card is a little step forward. I’m proud of your effort.' : 'Every little start counts. I’ll be here when you’re ready to study!'} />
      </div>
      <h2 className="text-xl font-semibold text-ink">Session complete</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You reviewed {pluralize(reviewed, 'card')}
        {reviewed > 0 && <> and got {accuracy}% right the first time</>}.
      </p>
      <Button className="mt-6" onClick={onDone}>
        {doneLabel}
      </Button>
    </Card>
  )
}

export default SessionSummary
