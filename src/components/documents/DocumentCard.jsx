import { Link } from 'react-router-dom'
import Card from '../Card'
import Button from '../Button'
import ProgressBar from './ProgressBar'
import {
  countsSummary,
  documentState,
  pluralize,
  studySetState,
  sumCounts,
} from '../../lib/generation'

const StudySetRow = ({ set, now, onDelete }) => {
  const state = studySetState(set, now)
  const running = ['analyzing', 'generating', 'saving'].includes(state.kind)
  const summary = countsSummary({ flashcards: set.flashcard_count, questions: set.question_count })
  const warnings = Array.isArray(set.warnings) ? set.warnings : []

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{set.title}</p>
          <p className="text-xs text-muted">
            {state.kind === 'ready' ? summary || 'Empty set' : state.label}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {state.kind === 'ready' && set.flashcard_count > 0 && (
            <Link
              to={`/study/${set.id}`}
              className="rounded-md px-2 py-1 text-sm text-ink underline-offset-2 hover:underline"
            >
              Study
            </Link>
          )}
          {state.kind === 'ready' && set.question_count > 0 && (
            <Link
              to={`/quiz/${set.id}`}
              className="rounded-md px-2 py-1 text-sm text-ink underline-offset-2 hover:underline"
            >
              Quiz
            </Link>
          )}
          {!running && (
          <Button
            variant="ghost"
            aria-label={`Delete study set ${set.title}`}
            className="shrink-0 px-2! py-1!"
            onClick={() => onDelete(set)}
          >
            Delete
          </Button>
          )}
        </div>
      </div>

      {running && <ProgressBar percent={state.percent} label={`${set.title}: ${state.label}`} />}

      {(state.kind === 'failed' || state.kind === 'stalled') && (
        <p className="text-xs text-danger">
          {set.error_message || 'This study set did not finish.'} Delete it and try again.
        </p>
      )}
      {state.kind === 'ready' &&
        warnings.map((w) => (
          <p key={w} className="text-xs text-muted">
            {w}
          </p>
        ))}
    </li>
  )
}

const DocumentCard = ({ doc, studySets = [], now, onGenerate, onRetry, onDelete, onDeleteSet }) => {
  const state = documentState(doc, now)
  const totals = sumCounts(studySets)
  const size = doc.page_count ? pluralize(doc.page_count, doc.file_type === 'pptx' ? 'slide' : 'page') : ''
  const created = new Date(doc.created_at).toLocaleDateString()

  const details = [state.label]
  if (state.kind === 'ready') {
    if (size) details.push(size)
    const summary = countsSummary(totals)
    if (summary) details.push(summary)
  }
  details.push(created)

  return (
    <Card className="p-4!">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
          <p className="mt-0.5 text-xs text-muted">{details.join(' · ')}</p>
          {doc.status === 'failed' && doc.error_message && (
            <p className="mt-1 text-xs text-danger">{doc.error_message}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {state.kind === 'ready' && (
            <Button className="px-3! py-1.5!" onClick={() => onGenerate(doc)}>
              Generate
            </Button>
          )}
          {state.canRetry && (
            <Button variant="ghost" aria-label={`Retry ${doc.title}`} onClick={() => onRetry(doc)}>
              Retry
            </Button>
          )}
          <Button variant="ghost" aria-label={`Delete ${doc.title}`} onClick={() => onDelete(doc)}>
            Delete
          </Button>
        </div>
      </div>

      {studySets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3 border-t border-line pt-3" aria-label={`Study sets for ${doc.title}`}>
          {studySets.map((set) => (
            <StudySetRow key={set.id} set={set} now={now} onDelete={onDeleteSet} />
          ))}
        </ul>
      )}
    </Card>
  )
}

export default DocumentCard
