import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import { QUESTION_TYPES } from '../../lib/generation'
import { MAX_CHOICES, MIN_CHOICES, validateQuestionDraft } from '../../lib/customCards'

const selectClass =
  'w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-ring'

const QuestionEditor = ({ initial, onSave, onCancel, saveLabel = 'Save question', cancelLabel = 'Cancel' }) => {
  const uid = useId()
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const patch = (changes) => setDraft((d) => ({ ...d, ...changes }))

  const changeType = (type) => {
    let answerText = draft.answerText
    if (type === 'true_false') answerText = 'True'
    else if (draft.question_type === 'true_false') answerText = ''
    else if (draft.hasChoices && type !== 'multiple_choice') answerText = draft.choices[draft.correctIndex] ?? ''
    patch({ question_type: type, hasChoices: type === 'multiple_choice', answerText })
  }

  const setChoice = (i, value) => patch({ choices: draft.choices.map((c, j) => (j === i ? value : c)) })
  const addChoice = () => {
    if (draft.choices.length < MAX_CHOICES) patch({ choices: [...draft.choices, ''] })
  }
  const removeChoice = (i) => {
    if (draft.choices.length <= MIN_CHOICES) return
    let correctIndex = draft.correctIndex
    if (i === correctIndex) correctIndex = 0
    else if (i < correctIndex) correctIndex -= 1
    patch({ choices: draft.choices.filter((_, j) => j !== i), correctIndex })
  }

  const submit = async (event) => {
    event.preventDefault()
    const problem = validateQuestionDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
    } catch (err) {
      setError(err.message || 'Could not save this question.')
      setSaving(false)
    }
  }

  const isTrueFalse = draft.question_type === 'true_false'

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-type`} className="text-sm font-medium text-ink">
          Question type
        </label>
        <select
          id={`${uid}-type`}
          className={selectClass}
          value={draft.question_type}
          onChange={(e) => changeType(e.target.value)}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        id={`${uid}-text`}
        label="Question"
        value={draft.question_text}
        onChange={(e) => patch({ question_text: e.target.value })}
        placeholder="What do you want to be asked?"
      />

      {isTrueFalse && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Correct answer</legend>
          <div className="flex gap-2">
            {['True', 'False'].map((opt) => (
              <Button
                key={opt}
                variant={draft.answerText === opt ? 'primary' : 'secondary'}
                aria-pressed={draft.answerText === opt}
                onClick={() => patch({ answerText: opt })}
              >
                {opt}
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      {!isTrueFalse && draft.hasChoices && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">
            Choices <span className="font-normal text-muted-foreground">(select the correct one)</span>
          </legend>
          {draft.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${uid}-correct`}
                checked={draft.correctIndex === i}
                onChange={() => patch({ correctIndex: i })}
                aria-label={`Choice ${i + 1} is the correct answer`}
                className="h-4 w-4 shrink-0 accent-accent-strong"
              />
              <div className="min-w-0 flex-1">
                <Input
                  id={`${uid}-choice-${i}`}
                  aria-label={`Choice ${i + 1}`}
                  value={choice}
                  onChange={(e) => setChoice(i, e.target.value)}
                  placeholder={`Choice ${i + 1}`}
                />
              </div>
              <Button
                variant="ghost"
                aria-label={`Remove choice ${i + 1}`}
                disabled={draft.choices.length <= MIN_CHOICES}
                onClick={() => removeChoice(i)}
                className="px-2! py-2!"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          {draft.choices.length < MAX_CHOICES && (
            <Button variant="ghost" onClick={addChoice} className="self-start">
              <Plus className="mr-1 size-4" aria-hidden />
              Add choice
            </Button>
          )}
        </fieldset>
      )}

      {!isTrueFalse && !draft.hasChoices && (
        <div className="flex flex-col gap-1.5">
          <Input
            id={`${uid}-answer`}
            label="Correct answer"
            value={draft.answerText}
            onChange={(e) => patch({ answerText: e.target.value })}
            placeholder="The answer"
          />
          <p className="text-xs text-muted-foreground">
            {draft.question_type === 'identification'
              ? 'Typed answers are matched exactly (capitalization is ignored), so keep this to one term or number.'
              : 'Students see this as the model answer and judge their own response.'}
          </p>
        </div>
      )}

      <Textarea
        id={`${uid}-explanation`}
        rows={2}
        label="Explanation (optional)"
        value={draft.explanation}
        onChange={(e) => patch({ explanation: e.target.value })}
      />
      <Input
        id={`${uid}-topic`}
        label="Topic (optional)"
        value={draft.topicName}
        onChange={(e) => patch({ topicName: e.target.value })}
        placeholder="e.g. Cell biology"
      />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {saveLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  )
}

export default QuestionEditor