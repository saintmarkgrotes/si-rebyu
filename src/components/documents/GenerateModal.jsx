import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Input from '../Input'
import Button from '../Button'
import {
  COUNT_CHOICES,
  DEFAULT_OPTIONS,
  DIFFICULTIES,
  QUESTION_TYPES,
  estimateText,
  toPayload,
  validateOptions,
} from '../../lib/generation'
import { estimateGeneration, getDocumentTopics, startGeneration } from '../../lib/studySets'

// Estimate errors that mean "this request can never work", as opposed to a network hiccup.
const BLOCKING_STATUSES = [400, 404, 409]

// A row of buttons where exactly one is selected. Selection is shown by inverting the fill, not by color.
const ChoiceGroup = ({ id, label, value, choices, onChange }) => (
  <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
    <span id={id} className="text-sm font-medium text-ink">
      {label}
    </span>
    <div className="flex flex-wrap gap-2">
      {choices.map((choice) => {
        const selected = value === choice.value
        return (
          <button
            key={choice.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(choice.value)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              selected ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:bg-subtle'
            }`}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  </div>
)

const Check = ({ label, checked, onChange, disabled = false }) => (
  <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-muted' : 'text-ink'}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 accent-ink"
    />
    {label}
  </label>
)

// The one line under the form: what is wrong, that we're working it out, or how big this will be.
const describeEstimate = (problem, current, blocked) => {
  if (problem) return problem
  if (!current) return 'Estimating…'
  if (current.error) return blocked ? current.error.message : 'Could not estimate the size. You can still generate.'
  return estimateText(current.data)
}

const toggle = (list, value, on) => (on ? [...list, value] : list.filter((v) => v !== value))

const GenerateForm = ({ doc, onClose, onStarted, estimateDelay, initialTopic }) => {
  const [options, setOptions] = useState(
    initialTopic ? { ...DEFAULT_OPTIONS, topics: [initialTopic] } : DEFAULT_OPTIONS,
  )
  const [title, setTitle] = useState('')
  const [topics, setTopics] = useState(null) // null while loading
  const [allTopics, setAllTopics] = useState(!initialTopic)
  const [estimate, setEstimate] = useState({ key: null })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (patch) => setOptions((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    let active = true
    getDocumentTopics(doc.id)
      .then((names) => active && setTopics(names))
      .catch(() => active && setTopics([]))
    return () => {
      active = false
    }
  }, [doc.id])


  const effective = { ...options, topics: allTopics ? [] : options.topics }
  const problem =
    validateOptions(effective) ||
    (!allTopics && options.topics.length === 0 ? 'Choose at least one topic, or use all topics.' : '')
  const key = problem ? null : JSON.stringify(toPayload(effective))

  // Ask the server how big this would be. Debounced, and answers for old settings are ignored.
  useEffect(() => {
    if (!key) return undefined
    let active = true
    const timer = setTimeout(async () => {
      try {
        const data = await estimateGeneration(doc.id, JSON.parse(key))
        if (active) setEstimate({ key, data })
      } catch (err) {
        if (active) setEstimate({ key, error: err })
      }
    }, estimateDelay)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [key, doc.id, estimateDelay])

  const current = key && estimate.key === key ? estimate : null
  const blocked = Boolean(current?.error && BLOCKING_STATUSES.includes(current.error.status))

  const estimateMessage = describeEstimate(problem, current, blocked)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (problem || blocked) return
    setSubmitting(true)
    setError('')
    try {
      onStarted(await startGeneration(doc.id, toPayload(effective, title)))
    } catch (err) {
      setError(err.message || 'Could not start generating.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Study material is created from “{doc.title}” only, and every item points back to where it came from.
      </p>

      <ChoiceGroup
        id="gen-flashcards"
        label="Flashcards"
        value={options.flashcards}
        choices={COUNT_CHOICES.map((n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))}
        onChange={(flashcards) => set({ flashcards })}
      />

      <ChoiceGroup
        id="gen-questions"
        label="Questions"
        value={options.questions}
        choices={COUNT_CHOICES.map((n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))}
        onChange={(questions) => set({ questions })}
      />

      <ChoiceGroup
        id="gen-difficulty"
        label="Difficulty"
        value={options.difficulty}
        choices={DIFFICULTIES}
        onChange={(difficulty) => set({ difficulty })}
      />

      <fieldset className="flex flex-col gap-2" disabled={options.questions === 0}>
        <legend className="mb-1 text-sm font-medium text-ink">Question types</legend>
        {QUESTION_TYPES.map((type) => (
          <Check
            key={type.value}
            label={type.label}
            checked={options.questions > 0 && options.questionTypes.includes(type.value)}
            disabled={options.questions === 0}
            onChange={(on) => set({ questionTypes: toggle(options.questionTypes, type.value, on) })}
          />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">Topics</legend>
        {initialTopic && (
          <p className="text-xs text-muted">
            Pre-selected from your Dashboard: <span className="text-ink">{initialTopic}</span>
          </p>
        )}
        <Check
          label="All topics"
          checked={allTopics}
          disabled={!topics || topics.length === 0}
          onChange={(on) => setAllTopics(on)}
        />
        {!allTopics &&
          topics &&
          topics.map((name) => (
            <div key={name} className="ml-6">
              <Check
                label={name}
                checked={options.topics.includes(name)}
                onChange={(on) => set({ topics: toggle(options.topics, name, on) })}
              />
            </div>
          ))}
        {topics && topics.length === 0 && (
          <p className="text-xs text-muted">
            Topics appear here after your first study set, so later ones can focus on part of the document.
          </p>
        )}
      </fieldset>

      <Input
        id="gen-title"
        label="Name (optional)"
        placeholder="e.g. Midterm review"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <p className={`text-sm ${blocked ? 'text-danger' : 'text-muted'}`} aria-live="polite">
        {estimateMessage}
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} disabled={Boolean(problem) || blocked}>
          Generate
        </Button>
      </div>
    </form>
  )
}

// The form is only mounted while the modal is open, so it starts fresh every time.
const GenerateModal = ({ open, doc, onClose, onStarted, estimateDelay = 400, initialTopic = null }) => (
  <Modal open={open} onClose={onClose} title="Generate study material" size="lg">
    {doc && (
      <GenerateForm
        key={doc.id}
        doc={doc}
        onClose={onClose}
        onStarted={onStarted}
        estimateDelay={estimateDelay}
        initialTopic={initialTopic}
      />
    )}
  </Modal>
)

export default GenerateModal
