import { useId, useState } from 'react'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import { validateFlashcardDraft } from '../../lib/customCards'

// `onSave(draft)` should return a promise; a rejection is shown under the form.
const FlashcardEditor = ({ initial, onSave, onCancel, saveLabel = 'Save card', cancelLabel = 'Cancel' }) => {
  const uid = useId()
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const patch = (changes) => setDraft((d) => ({ ...d, ...changes }))

  const submit = async (event) => {
    event.preventDefault()
    const problem = validateFlashcardDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
    } catch (err) {
      setError(err.message || 'Could not save this card.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Textarea
        id={`${uid}-front`}
        label="Front (the question or term)"
        value={draft.front}
        onChange={(e) => patch({ front: e.target.value })}
      />
      <Textarea
        id={`${uid}-back`}
        label="Back (the answer)"
        value={draft.back}
        onChange={(e) => patch({ back: e.target.value })}
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

export default FlashcardEditor