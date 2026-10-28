import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getStudySet } from '../lib/flashcards'
import { getStudySetQuestions, orderForQuiz, submitAttempt } from '../lib/quiz'
import { startStudySession, endStudySession } from '../lib/studySessions'
import NavHeader from '../components/NavHeader'
import Card from '../components/Card'
import QuestionCard from '../components/quiz/QuestionCard'
import QuizResults from '../components/quiz/QuizResults'

const Quiz = () => {
  const { studySetId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [studySet, setStudySet] = useState(null)
  const [questions, setQuestions] = useState(null) // null while loading
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState('')
  const sessionRef = useRef(null)

  const load = async () => {
    setError('')
    setQuestions(null)
    setIndex(0)
    setResults([])
    setShowResults(false)
    try {
      const [set, qs] = await Promise.all([getStudySet(studySetId), getStudySetQuestions(studySetId)])
      const session = await startStudySession(user.id, set.document_id, { mode: 'quiz', studySetId })
      setStudySet(set)
      setQuestions(orderForQuiz(qs))
      sessionRef.current = session
    } catch (err) {
      setError(err.message || 'Could not load this quiz.')
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!active) return
      await load()
    })()
    return () => {
      active = false
      if (sessionRef.current) endStudySession(sessionRef.current.id).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studySetId, user.id])

  const question = questions?.[index] ?? null

  const handleAnswered = async (userAnswer, isCorrect) => {
    setResults((prev) => [...prev, { question, userAnswer, isCorrect }])
    try {
      await submitAttempt(sessionRef.current?.id, question.id, userAnswer, isCorrect)
    } catch {
      // the attempt still counts in this session's results; a failed log shouldn't block the quiz
    }
  }

  const handleNext = () => {
    if (index + 1 === total) setShowResults(true)
    else setIndex((i) => i + 1)
  }

  const handleTryAgain = () => {
    if (sessionRef.current) endStudySession(sessionRef.current.id).catch(() => {})
    sessionRef.current = null
    load()
  }

  const handleDone = async () => {
    if (sessionRef.current) {
      await endStudySession(sessionRef.current.id).catch(() => {})
      sessionRef.current = null
    }
    navigate('/documents')
  }

  const total = questions?.length ?? 0
  const finished = showResults

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">{studySet?.title || 'Quiz'}</h1>

        {error && (
          <div className="mt-4">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={() => navigate('/documents')}
              className="mt-2 text-sm text-ink underline-offset-2 hover:underline"
            >
              Back to documents
            </button>
          </div>
        )}

        {questions === null && !error && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

        {questions !== null && total === 0 && (
          <Card className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">This study set has no questions yet.</p>
          </Card>
        )}

        {question && !finished && (
          <div className="mt-8 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Question {index + 1} of {total}
            </p>
            <QuestionCard key={question.id} question={question} onAnswered={handleAnswered} />
            {results.length === index + 1 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink-hover"
                >
                  {index + 1 === total ? 'See results' : 'Next'}
                </button>
              </div>
            )}
          </div>
        )}

        {finished && (
          <div className="mt-8">
            <QuizResults results={results} onTryAgain={handleTryAgain} onDone={handleDone} />
          </div>
        )}
      </main>
    </div>
  )
}

export default Quiz
