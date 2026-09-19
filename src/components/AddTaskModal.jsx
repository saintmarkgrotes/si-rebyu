import { useState } from 'react'
import Modal from './Modal'
import Input from './Input'
import Button from './Button'

const TaskForm = ({ onSubmit, onCancel }) => {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Give your task a title.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit({ title, note, dueDate })
    } catch (err) {
      setError(err.message || 'Could not save this task.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="task-title"
        label="Task"
        placeholder="e.g. Review Chapter 4 – Cell Division"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={error}
        autoFocus
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="task-note" className="text-sm font-medium text-ink">
          Note <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="task-note"
          rows={3}
          placeholder="Anything you want to remember…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-none rounded-md border border-line px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-ink"
        />
      </div>

      <Input
        id="task-due"
        type="date"
        label="Due date (optional)"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Add task
        </Button>
      </div>
    </form>
  )
}

// The form is only mounted while the modal is open, so it resets every time.
const AddTaskModal = ({ open, onClose, onSubmit }) => {
  return (
    <Modal open={open} onClose={onClose} title="Add a study task">
      <TaskForm onSubmit={onSubmit} onCancel={onClose} />
    </Modal>
  )
}

export default AddTaskModal