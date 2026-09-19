import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTasks, addTask, setTaskDone, deleteTask } from '../lib/tasks'
import Card from './Card'
import AddTaskModal from './AddTaskModal'

function formatDue(dateStr) {
  // date-only strings parse as UTC; add a time so it stays on the right local day
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function isOverdue(task) {
  if (!task.due_date || task.is_done) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${task.due_date}T00:00:00`) < today
}

export default function StudyTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let active = true
    getTasks()
      .then((data) => active && setTasks(data))
      .catch((err) => active && setError(err.message || 'Could not load your tasks.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  async function handleAdd(values) {
    const task = await addTask(user.id, values)
    setTasks((prev) => [task, ...prev])
    setModalOpen(false)
  }

  async function handleToggle(task) {
    setError('')
    try {
      const updated = await setTaskDone(task.id, !task.is_done)
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err.message || 'Could not update this task.')
    }
  }

  async function handleDelete(task) {
    setError('')
    try {
      await deleteTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      setError(err.message || 'Could not delete this task.')
    }
  }

  const pendingCount = tasks.filter((t) => !t.is_done).length

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">To study</h2>
          <p className="text-sm text-muted">
            {loading ? 'Loading…' : `${pendingCount} to do`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Add a task"
          title="Add a task"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-2xl leading-none text-paper transition-colors hover:bg-ink-hover"
        >
          +
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        {!loading && tasks.length === 0 ? (
          <Card className="!p-6 text-center">
            <p className="text-sm text-muted">
              Nothing here yet. Tap the + to add something to study.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {tasks.map((task) => (
              <li key={task.id}>
                <Card className="flex items-start gap-3 !p-4">
                  <input
                    type="checkbox"
                    checked={task.is_done}
                    onChange={() => handleToggle(task)}
                    aria-label={`Mark "${task.title}" as ${task.is_done ? 'not done' : 'done'}`}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-ink"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        task.is_done ? 'text-muted line-through' : 'text-ink'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.note && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{task.note}</p>
                    )}
                    {task.due_date && (
                      <p
                        className={`mt-1 text-xs ${
                          isOverdue(task) ? 'font-medium text-ink underline' : 'text-muted'
                        }`}
                      >
                        {isOverdue(task) ? 'Overdue · ' : 'Due '}
                        {formatDue(task.due_date)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(task)}
                    aria-label={`Delete "${task.title}"`}
                    className="rounded-md px-2 py-1 text-lg leading-none text-muted transition-colors hover:bg-subtle hover:text-ink"
                  >
                    ×
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAdd}
      />
    </section>
  )
}
