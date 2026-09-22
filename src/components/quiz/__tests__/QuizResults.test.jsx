import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import QuizResults from '../QuizResults'

const q = (id, topic, over = {}) => ({
  id, question_text: `Question ${id}`, correct_answer: `Answer ${id}`, explanation: `Why ${id}`,
  topics: topic ? { name: topic } : null, ...over,
})

describe('QuizResults', () => {
  it('shows the score and accuracy', () => {
    const results = [
      { question: q(1, 'VLAN'), userAnswer: 'a', isCorrect: true },
      { question: q(2, 'VLAN'), userAnswer: 'b', isCorrect: false },
    ]
    render(<QuizResults results={results} onTryAgain={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByText('Score: 1 / 2')).toBeInTheDocument()
    expect(screen.getByText('50% correct')).toBeInTheDocument()
  })

  it('lists topic accuracy, weakest first', () => {
    const results = [
      { question: q(1, 'Strong'), userAnswer: 'a', isCorrect: true },
      { question: q(2, 'Weak'), userAnswer: 'b', isCorrect: false },
    ]
    render(<QuizResults results={results} onTryAgain={vi.fn()} onDone={vi.fn()} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    const topicRow = items.find((t) => t.includes('Weak') || t.includes('Strong'))
    expect(topicRow).toBeDefined()
    const weakIndex = items.findIndex((t) => t.includes('Weak'))
    const strongIndex = items.findIndex((t) => t.includes('Strong'))
    expect(weakIndex).toBeLessThan(strongIndex)
  })

  it('lists only the incorrect answers for review, with the explanation', () => {
    const results = [
      { question: q(1, 'VLAN'), userAnswer: 'right', isCorrect: true },
      { question: q(2, 'VLAN'), userAnswer: 'wrong guess', isCorrect: false },
    ]
    render(<QuizResults results={results} onTryAgain={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByText('Question 2')).toBeInTheDocument()
    expect(screen.queryByText('Question 1')).not.toBeInTheDocument()
    expect(screen.getByText('Your answer: wrong guess')).toBeInTheDocument()
    expect(screen.getByText('Correct answer: Answer 2')).toBeInTheDocument()
    expect(screen.getByText('Why 2')).toBeInTheDocument()
  })

  it('a blank self-graded answer still shows clearly in the review list', () => {
    const results = [{ question: q(1, null), userAnswer: '', isCorrect: false }]
    render(<QuizResults results={results} onTryAgain={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByText('Your answer: (left blank)')).toBeInTheDocument()
  })

  it('a perfect score has no review section', () => {
    const results = [{ question: q(1, 'VLAN'), userAnswer: 'a', isCorrect: true }]
    render(<QuizResults results={results} onTryAgain={vi.fn()} onDone={vi.fn()} />)
    expect(screen.queryByText('Review incorrect answers')).not.toBeInTheDocument()
  })

  it('Try again and Back to documents call their handlers', async () => {
    const user = userEvent.setup()
    const onTryAgain = vi.fn()
    const onDone = vi.fn()
    render(<QuizResults results={[{ question: q(1, 'V'), userAnswer: 'a', isCorrect: true }]} onTryAgain={onTryAgain} onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await user.click(screen.getByRole('button', { name: 'Back to documents' }))
    expect(onTryAgain).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })
})
