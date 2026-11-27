import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import Modal from '../Modal'
import Input from '../Input'
import Button from '../Button'
import { createCustomSet } from '../../lib/customCards'

const NewSetModal = ({ open, onClose }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!title.trim()) {
      setError('Give your set a name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const set = await createCustomSet(user.id, title)
      navigate(`/sets/${set.id}/edit`)
    } catch (err) {
      setError(err.message || 'Could not create the set.')
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New custom set">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          id="new-set-title"
          label="Set name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Anatomy midterm"
          error={error}
        />
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>
            Create and add cards
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default NewSetModal