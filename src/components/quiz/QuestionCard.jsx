import { useState } from 'react'
import Card from '../Card'
import Button from '../Button'
import Input from '../Input'
import { gradeAnswer, isAutoGraded } from '../../lib/quiz'

const sourceLabel = (source) => {
  if (!source) return null
  if (source.page) return `Page ${source.page}`
  if (source.page_start) return `Pages ${source.page_start}–${source.page_end}`
  if (source.slide) return `Slide ${source.slide}`
  if (source.slide_start) return `Slides ${source.slide_start}–${source.slide_end}`
  if (source.section) return source.section
  return null
}

const ChoiceList = ({ options, choice, onChoose }) => (
  <fieldset className="mt-4 flex flex-col gap-2">
    <legend className="sr-only">Choose one</legend>
    {options.map((opt) => (
      <label key={opt} className="flex items-center gap-2 text-sm text-ink">
        <input
          type="radio"
          name="choice"
          value={opt}
          checked={choice === opt}
          onChange={() => onChoose(opt)}
          className="h-4 w-4 accent-ink"
        />
        {opt}
      </label>
    ))}
  </fieldset>
)

// One question: an answer control appropriate to its type, then feedback once answered.
// `onAnswered(userAnswer, isCorrect)` fires exactly once, when the question is settled.
const QuestionCard = ({ question, onAnswered }) => {
  const [choice, setChoice] = useState('')
  const [text, setText] = useState('')
  const [answered, setAnswered] = useState(false)
  const [selfVerdict, setSelfVerdict] = useState(null) // for self-graded types, until the student judges it

  const auto = isAutoGraded(question)
  const hasChoices = question.question_type === 'multiple_choice' || Boolean(question.options)
  const usesChoiceState = hasChoices || question.question_type === 'true_false'
  const source = sourceLabel(question.source)
  const answerGiven = usesChoiceState ? choice : text

  const check = () => {
    if (auto) {
      const correct = gradeAnswer(question, answerGiven)
      setAnswered(true)
      onAnswered(answerGiven, correct)
    } else {
      setAnswered(true) // reveals the model answer; correctness comes from the student next
    }
  }

  const judgeSelf = (wasCorrect) => {
    setSelfVerdict(wasCorrect)
    onAnswered(text, wasCorrect)
  }

  const isCorrect = auto && answered ? gradeAnswer(question, answerGiven) : null

  return (
    <Card>
      <p className="text-lg text-ink">{question.question_text}</p>

      {!answered && hasChoices && <ChoiceList options={question.options} choice={choice} onChoose={setChoice} />}

      {!answered && !hasChoices && question.question_type === 'true_false' && (
        <div role="radiogroup" aria-label="True or false" className="mt-4 flex gap-2">
          {['True', 'False'].map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={choice === opt ? 'primary' : 'secondary'}
              aria-pressed={choice === opt}
              onClick={() => setChoice(opt)}
            >
              {opt}
            </Button>
          ))}
        </div>
      )}

      {!answered && !hasChoices && question.question_type !== 'true_false' && (
        // identification (auto-graded) and short_answer / choice-less scenario (self-graded)
        <div className="mt-4">
          <Input
            id="quiz-answer"
            label="Your answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={auto ? 'Type your answer' : 'Type your answer, or leave blank and check the model answer'}
          />
        </div>
      )}

      {!answered && (
        <Button className="mt-4" onClick={check} disabled={usesChoiceState && !choice}>
          Check answer
        </Button>
      )}

      {answered && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          {auto ? (
            <p className="text-sm font-medium text-ink">{isCorrect ? 'Correct' : 'Incorrect'}</p>
          ) : (
            <p className="text-sm font-medium text-ink">Your answer: {text || '(left blank)'}</p>
          )}
          <p className="text-sm text-ink">Correct answer: {question.correct_answer}</p>
          {question.explanation && <p className="text-sm text-muted">{question.explanation}</p>}
          {source && <p className="text-xs text-muted">Source: {source}</p>}

          {!auto && selfVerdict === null && (
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={() => judgeSelf(true)}>
                I had it right
              </Button>
              <Button variant="secondary" onClick={() => judgeSelf(false)}>
                I had it wrong
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default QuestionCard
