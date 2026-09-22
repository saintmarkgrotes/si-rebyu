import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import QuestionCard from '../QuestionCard'

const mcq = {
  id: 'q1', question_type: 'multiple_choice', question_text: 'Which protocol assigns IPs?',
  options: ['DHCP', 'DNS', 'HTTP', 'FTP'], correct_answer: 'DHCP',
  explanation: 'DHCP automatically assigns IP configuration.', source: { page: 12 },
}

const tf = {
  id: 'q2', question_type: 'true_false', question_text: 'DHCP assigns IPs automatically.',
  correct_answer: 'True', explanation: 'That is correct.', source: { slide: 4 },
}

const ident = {
  id: 'q3', question_type: 'identification', question_text: 'What protocol assigns IPs?',
  correct_answer: 'DHCP', explanation: 'DHCP does this.', source: { section: 'Networking' },
}

const short = {
  id: 'q4', question_type: 'short_answer', question_text: 'Explain DHCP.',
  correct_answer: 'It assigns IP addresses automatically.', explanation: null, source: null,
}

describe('QuestionCard: multiple choice', () => {
  it('disables Check answer until a choice is made', async () => {
    const user = userEvent.setup()
    render(<QuestionCard question={mcq} onAnswered={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'DHCP' }))
    expect(screen.getByRole('button', { name: 'Check answer' })).not.toBeDisabled()
  })

  it('a correct choice reports correct and shows feedback', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={mcq} onAnswered={onAnswered} />)
    await user.click(screen.getByRole('radio', { name: 'DHCP' }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onAnswered).toHaveBeenCalledWith('DHCP', true)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText(/DHCP automatically assigns/)).toBeInTheDocument()
    expect(screen.getByText('Source: Page 12')).toBeInTheDocument()
  })

  it('a wrong choice reports incorrect', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={mcq} onAnswered={onAnswered} />)
    await user.click(screen.getByRole('radio', { name: 'DNS' }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onAnswered).toHaveBeenCalledWith('DNS', false)
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })

  it('calls onAnswered only once, even if somehow checked twice', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={mcq} onAnswered={onAnswered} />)
    await user.click(screen.getByRole('radio', { name: 'DHCP' }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(screen.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument()
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })
})

describe('QuestionCard: true/false', () => {
  it('answering True correctly is graded correct', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={tf} onAnswered={onAnswered} />)
    await user.click(screen.getByRole('button', { name: 'True' }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onAnswered).toHaveBeenCalledWith('True', true)
  })
})

describe('QuestionCard: identification', () => {
  it('is case-insensitive when grading', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={ident} onAnswered={onAnswered} />)
    await user.type(screen.getByLabelText('Your answer'), 'dhcp')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onAnswered).toHaveBeenCalledWith('dhcp', true)
  })
})

describe('QuestionCard: short answer (self-graded)', () => {
  it('shows the model answer first, with no verdict yet', async () => {
    const user = userEvent.setup()
    render(<QuestionCard question={short} onAnswered={vi.fn()} />)
    await user.type(screen.getByLabelText('Your answer'), 'my own words')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(screen.getByText(/Correct answer: It assigns IP addresses/)).toBeInTheDocument()
    expect(screen.getByText('Your answer: my own words')).toBeInTheDocument()
  })

  it('lets the student judge their own answer, which decides the verdict', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={short} onAnswered={onAnswered} />)
    await user.click(screen.getByRole('button', { name: 'Check answer' })) // blank answer is fine here
    expect(onAnswered).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'I had it right' }))
    expect(onAnswered).toHaveBeenCalledWith('', true)
  })

  it('judging it wrong reports incorrect', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={short} onAnswered={onAnswered} />)
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'I had it wrong' }))
    expect(onAnswered).toHaveBeenCalledWith('', false)
  })
})

describe('QuestionCard: a scenario with its own choices is graded like multiple choice', () => {
  const scenarioMcq = {
    id: 'q5', question_type: 'scenario', question_text: 'Which service should be configured?',
    options: ['DHCP', 'DNS'], correct_answer: 'DHCP', explanation: 'Because it assigns addresses.', source: null,
  }

  it('has no free-text answer box, and reports correct/incorrect', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    render(<QuestionCard question={scenarioMcq} onAnswered={onAnswered} />)
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'DHCP' }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onAnswered).toHaveBeenCalledWith('DHCP', true)
  })
})

describe('QuestionCard: no source line when the question has none', () => {
  it('does not render a Source row', async () => {
    const user = userEvent.setup()
    render(<QuestionCard question={short} onAnswered={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(screen.queryByText(/^Source:/)).not.toBeInTheDocument()
  })
})
