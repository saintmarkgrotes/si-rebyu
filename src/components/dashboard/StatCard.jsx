import Card from '../Card'

// A single number with a label, used for streak, accuracy, and any other headline stat.
// `value` of null renders as an em dash rather than "null" or "0", for a stat with no data yet.
const StatCard = ({ label, value, suffix = '' }) => (
  <Card elevated>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-ink">{value === null || value === undefined ? '—' : `${value}${suffix}`}</p>
  </Card>
)

export default StatCard
