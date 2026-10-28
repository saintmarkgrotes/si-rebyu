import { Link } from 'react-router-dom'
import Card from '../Card'

const WeakTopicsList = ({ topics }) => (
  <Card elevated>
    <h3 className="text-sm font-medium text-ink">Weak topics</h3>
    {topics === null && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
    {topics !== null && topics.length === 0 && (
      <p className="mt-3 text-sm text-muted-foreground">Take a few quizzes to see which topics need more work.</p>
    )}
    {topics !== null && topics.length > 0 && (
      <ul className="mt-3 flex flex-col gap-2">
        {topics.map((t) => (
          <li key={t.topic} className="flex items-center justify-between text-sm">
            <Link
              to={`/documents?topic=${encodeURIComponent(t.topic)}`}
              className="text-ink underline-offset-2 hover:underline"
            >
              {t.topic}
            </Link>
            <span className="text-muted-foreground">
              {t.percent}% ({t.correct}/{t.total})
            </span>
          </li>
        ))}
      </ul>
    )}
  </Card>
)

export default WeakTopicsList
