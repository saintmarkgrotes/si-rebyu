import Card from '../Card'
import Button from '../Button'
import { topicBreakdown } from '../../lib/quiz'

const QuizResults = ({ results, onTryAgain, onDone }) => {
  const total = results.length
  const correct = results.filter((r) => r.isCorrect).length
  const accuracy = total ? Math.round((correct / total) * 100) : 0
  const topics = topicBreakdown(results)
  const missed = results.filter((r) => !r.isCorrect)

  return (
    <div className="flex flex-col gap-6">
      <Card className="text-center">
        <h2 className="text-xl font-semibold text-ink">
          Score: {correct} / {total}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{accuracy}% correct</p>
      </Card>

      {topics.length > 0 && (
        <Card>
          <h3 className="text-sm font-medium text-ink">Topics</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {topics.map((t) => (
              <li key={t.topic} className="flex items-center justify-between text-sm">
                <span className="text-ink">{t.topic}</span>
                <span className="text-muted-foreground">
                  {t.percent}% ({t.correct}/{t.total})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {missed.length > 0 && (
        <Card>
          <h3 className="text-sm font-medium text-ink">Review incorrect answers</h3>
          <ul className="mt-3 flex flex-col gap-4">
            {missed.map((r) => (
              <li key={r.question.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <p className="text-sm text-ink">{r.question.question_text}</p>
                <p className="mt-1 text-sm text-muted-foreground">Your answer: {r.userAnswer || '(left blank)'}</p>
                <p className="text-sm text-muted-foreground">Correct answer: {r.question.correct_answer}</p>
                {r.question.explanation && <p className="mt-1 text-xs text-muted-foreground">{r.question.explanation}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex justify-center gap-2">
        <Button variant="secondary" onClick={onTryAgain}>
          Try again
        </Button>
        <Button onClick={onDone}>Back to documents</Button>
      </div>
    </div>
  )
}

export default QuizResults
