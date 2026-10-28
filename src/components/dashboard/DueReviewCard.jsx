import { Link } from 'react-router-dom'
import Card from '../Card'
import { pluralize } from '../../lib/generation'

const DueReviewCard = ({ count }) => (
  <Card>
    <p className="text-sm text-muted-foreground">Today's review</p>
    <p className="mt-2 text-2xl font-semibold text-ink">{count === null ? '—' : pluralize(count, 'card')}</p>
    {count > 0 ? (
      <Link
        to="/review"
        className="mt-3 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-hover"
      >
        Start review
      </Link>
    ) : (
      count === 0 && <p className="mt-3 text-xs text-muted-foreground">Nothing due right now.</p>
    )}
  </Card>
)

export default DueReviewCard
