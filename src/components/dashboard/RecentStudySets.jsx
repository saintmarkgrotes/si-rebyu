import { Link } from 'react-router-dom'
import Card from '../Card'
import { countsSummary } from '../../lib/generation'

const RecentStudySets = ({ studySets }) => (
  <Card elevated>
    <h3 className="text-sm font-medium text-ink">Recent study sets</h3>
    {studySets === null && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
    {studySets !== null && studySets.length === 0 && (
      <p className="mt-3 text-sm text-muted-foreground">
        Upload a document and generate study material to see it here.
      </p>
    )}
    {studySets !== null && studySets.length > 0 && (
      <ul className="mt-3 flex flex-col gap-3">
        {studySets.map((s) => {
          const summary = countsSummary({ flashcards: s.flashcard_count, questions: s.question_count })
          return (
            <li key={s.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{s.title}</p>
                {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {s.flashcard_count > 0 && (
                  <Link to={`/study/${s.id}`} className="text-sm text-ink underline-offset-2 hover:underline">
                    Study
                  </Link>
                )}
                {s.question_count > 0 && (
                  <Link to={`/quiz/${s.id}`} className="text-sm text-ink underline-offset-2 hover:underline">
                    Quiz
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    )}
  </Card>
)

export default RecentStudySets
