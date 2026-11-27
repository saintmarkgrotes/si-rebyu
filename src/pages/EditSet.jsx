import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import NavHeader from '../components/NavHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import FlashcardEditor from '../components/custom/FlashcardEditor'
import QuestionEditor from '../components/custom/QuestionEditor'
import { QUESTION_TYPES } from '../lib/generation'
import {
  addFlashcard,
  addQuestion,
  blankFlashcardDraft,
  blankQuestionDraft,
  deleteFlashcard,
  deleteQuestion,
  draftFromFlashcard,
  draftFromQuestion,
  getSetContent,
  renameStudySet,
  syncSetCounts,
  updateFlashcard,
  updateQuestion,
} from '../lib/customCards'

const typeLabel = (type) => QUESTION_TYPES.find((t) => t.value === type)?.label ?? type

const RowActions = ({ label, onEdit, onDelete }) => (
  <div className="flex shrink-0 gap-1">
    <Button variant="ghost" aria-label={`Edit ${label}`} onClick={onEdit} className="px-2! py-1.5!">
      <Pencil className="mr-1 size-4" aria-hidden />
      Edit
    </Button>
    <Button variant="ghost" aria-label={`Delete ${label}`} onClick={onDelete} className="px-2! py-1.5!">
      <Trash2 className="mr-1 size-4" aria-hidden />
      Delete
    </Button>
  </div>
)

const EditSet = () => {
  const { studySetId } = useParams()
  const { user } = useAuth()

  const [content, setContent] = useState(null) // { set, cards, questions }; null while loading
  const [error, setError] = useState('')
  const [tab, setTab] = useState('flashcards')
  const [adding, setAdding] = useState(false) // the "new" editor is open
  const [newKey, setNewKey] = useState(0) // bump to clear the "new" editor after a save
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    let active = true
    getSetContent(studySetId)
      .then((data) => active && setContent(data))
      .catch((err) => active && setError(err.message || 'Could not load this study set.'))
    return () => {
      active = false
    }
  }, [studySetId])

  const refresh = async ({ recount = false } = {}) => {
    if (recount) await syncSetCounts(studySetId)
    setContent(await getSetContent(studySetId))
  }

  const switchTab = (next) => {
    setTab(next)
    setAdding(false)
    setEditingId(null)
  }

  const saveCard = async (draft, card) => {
    if (card) {
      await updateFlashcard(card.id, user.id, draft)
      await refresh()
      setEditingId(null)
    } else {
      await addFlashcard(content.set, user.id, draft)
      await refresh({ recount: true })
      setNewKey((k) => k + 1) // stay open with a blank form, for adding several in a row
    }
  }

  const saveQuestion = async (draft, question) => {
    if (question) {
      await updateQuestion(question.id, user.id, draft)
      await refresh()
      setEditingId(null)
    } else {
      await addQuestion(content.set, user.id, draft)
      await refresh({ recount: true })
      setNewKey((k) => k + 1)
    }
  }

  const removeCard = async (card) => {
    if (!confirm('Delete this flashcard?')) return
    setError('')
    try {
      await deleteFlashcard(card.id)
      await refresh({ recount: true })
    } catch (err) {
      setError(err.message || 'Could not delete this flashcard.')
    }
  }

  const removeQuestion = async (question) => {
    if (!confirm('Delete this question?')) return
    setError('')
    try {
      await deleteQuestion(question.id)
      await refresh({ recount: true })
    } catch (err) {
      setError(err.message || 'Could not delete this question.')
    }
  }

  const rename = async () => {
    const title = prompt('Rename study set', content.set.title)
    if (!title || !title.trim() || title.trim() === content.set.title) return
    setError('')
    try {
      await renameStudySet(studySetId, title)
      await refresh()
    } catch (err) {
      setError(err.message || 'Could not rename this study set.')
    }
  }

  const set = content?.set
  const editable = set?.status === 'ready'

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/documents" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← Back to documents
        </Link>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        {!content && !error && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

        {content && (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-ink wrap-anywhere">{set.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {content.cards.length} flashcard{content.cards.length === 1 ? '' : 's'} ·{' '}
                  {content.questions.length} question{content.questions.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" onClick={rename}>
                  Rename
                </Button>
                {content.cards.length > 0 && (
                  <Link
                    to={`/study/${set.id}`}
                    className="rounded-md px-2 py-1 text-sm text-ink underline-offset-2 hover:underline"
                  >
                    Study
                  </Link>
                )}
                {content.questions.length > 0 && (
                  <Link
                    to={`/quiz/${set.id}`}
                    className="rounded-md px-2 py-1 text-sm text-ink underline-offset-2 hover:underline"
                  >
                    Quiz
                  </Link>
                )}
              </div>
            </div>

            {!editable && (
              <Card className="mt-8 text-center">
                <p className="text-sm text-muted-foreground">
                  This study set is still being generated. You can edit it once it is complete.
                </p>
              </Card>
            )}

            {editable && (
              <>
                <div className="mt-6 flex gap-2" role="group" aria-label="What to edit">
                  <Button
                    variant={tab === 'flashcards' ? 'primary' : 'secondary'}
                    aria-pressed={tab === 'flashcards'}
                    onClick={() => switchTab('flashcards')}
                  >
                    Flashcards
                  </Button>
                  <Button
                    variant={tab === 'questions' ? 'primary' : 'secondary'}
                    aria-pressed={tab === 'questions'}
                    onClick={() => switchTab('questions')}
                  >
                    Questions
                  </Button>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {adding ? (
                    <Card className="p-4!">
                      {tab === 'flashcards' ? (
                        <FlashcardEditor
                          key={newKey}
                          initial={blankFlashcardDraft()}
                          onSave={(draft) => saveCard(draft, null)}
                          onCancel={() => setAdding(false)}
                          saveLabel="Add card"
                          cancelLabel="Done"
                        />
                      ) : (
                        <QuestionEditor
                          key={newKey}
                          initial={blankQuestionDraft()}
                          onSave={(draft) => saveQuestion(draft, null)}
                          onCancel={() => setAdding(false)}
                          saveLabel="Add question"
                          cancelLabel="Done"
                        />
                      )}
                    </Card>
                  ) : (
                    <Button
                      variant="secondary"
                      className="self-start"
                      onClick={() => {
                        setEditingId(null)
                        setAdding(true)
                      }}
                    >
                      <Plus className="mr-1 size-4" aria-hidden />
                      {tab === 'flashcards' ? 'Add flashcard' : 'Add question'}
                    </Button>
                  )}

                  {tab === 'flashcards' && content.cards.length === 0 && !adding && (
                    <p className="text-sm text-muted-foreground">No flashcards yet.</p>
                  )}
                  {tab === 'questions' && content.questions.length === 0 && !adding && (
                    <p className="text-sm text-muted-foreground">No questions yet.</p>
                  )}

                  <ul className="flex flex-col gap-3">
                    {tab === 'flashcards' &&
                      content.cards.map((card) => (
                        <li key={card.id}>
                          <Card className="p-4!">
                            {editingId === card.id ? (
                              <FlashcardEditor
                                initial={draftFromFlashcard(card)}
                                saveLabel="Save changes"
                                onSave={(draft) => saveCard(draft, card)}
                                onCancel={() => setEditingId(null)}
                              />
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-ink wrap-anywhere">{card.front}</p>
                                  <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">{card.back}</p>
                                  {card.topics?.name && (
                                    <p className="mt-1 text-xs text-muted-foreground">Topic: {card.topics.name}</p>
                                  )}
                                </div>
                                <RowActions
                                  label="flashcard"
                                  onEdit={() => {
                                    setAdding(false)
                                    setEditingId(card.id)
                                  }}
                                  onDelete={() => removeCard(card)}
                                />
                              </div>
                            )}
                          </Card>
                        </li>
                      ))}

                    {tab === 'questions' &&
                      content.questions.map((q) => (
                        <li key={q.id}>
                          <Card className="p-4!">
                            {editingId === q.id ? (
                              <QuestionEditor
                                initial={draftFromQuestion(q)}
                                saveLabel="Save changes"
                                onSave={(draft) => saveQuestion(draft, q)}
                                onCancel={() => setEditingId(null)}
                              />
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs text-muted-foreground">{typeLabel(q.question_type)}</p>
                                  <p className="mt-0.5 text-sm font-medium text-ink wrap-anywhere">{q.question_text}</p>
                                  {Array.isArray(q.options) ? (
                                    <ul className="mt-2 flex flex-col gap-1">
                                      {q.options.map((opt) => (
                                        <li
                                          key={opt}
                                          className={`text-sm wrap-anywhere ${
                                            opt === q.correct_answer ? 'font-medium text-ink' : 'text-muted-foreground'
                                          }`}
                                        >
                                          {opt === q.correct_answer ? '✓ ' : '• '}
                                          {opt}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">
                                      Answer: {q.correct_answer}
                                    </p>
                                  )}
                                  {q.topics?.name && (
                                    <p className="mt-1 text-xs text-muted-foreground">Topic: {q.topics.name}</p>
                                  )}
                                </div>
                                <RowActions
                                  label="question"
                                  onEdit={() => {
                                    setAdding(false)
                                    setEditingId(q.id)
                                  }}
                                  onDelete={() => removeQuestion(q)}
                                />
                              </div>
                            )}
                          </Card>
                        </li>
                      ))}
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default EditSet