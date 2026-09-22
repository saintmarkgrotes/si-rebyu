import Card from '../Card'
import Button from '../Button'
import { pluralize } from '../../lib/generation'

const SessionSummary = ({ reviewed, correct, onDone }) => {
  const accuracy = reviewed ? Math.round((correct / reviewed) * 100) : 0
  return (
    <Card className="text-center">
      <h2 className="text-xl font-semibold text-ink">Session complete</h2>
      <p className="mt-2 text-sm text-muted">
        You reviewed {pluralize(reviewed, 'card')}
        {reviewed > 0 && <> and got {accuracy}% right the first time</>}.
      </p>
      <Button className="mt-6" onClick={onDone}>
        Back to documents
      </Button>
    </Card>
  )
}

export default SessionSummary
