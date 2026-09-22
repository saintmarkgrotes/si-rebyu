import { describe, expect, it, vi, beforeEach } from 'vitest'
import { gradeAnswer, isAutoGraded, orderForQuiz, topicBreakdown, getStudySetQuestions, submitAttempt } from './quiz'

const mcq = { question_type: 'multiple_choice', correct_answer: 'DHCP', options: ['DHCP', 'DNS', 'HTTP', 'FTP'] }
const tf = { question_type: 'true_false', correct_answer: 'True' }
const ident = { question_type: 'identification', correct_answer: 'DHCP' }
const short = { question_type: 'short_answer', correct_answer: 'It assigns IP addresses automatically.' }
const scenario = { question_type: 'scenario', correct_answer: 'DHCP', options: null }
const scenarioMcq = { question_type: 'scenario', correct_answer: 'DHCP', options: ['DHCP', 'DNS'] }

describe('isAutoGraded', () => {
  it('multiple_choice, true_false and identification are auto-graded', () => {
    expect(isAutoGraded(mcq)).toBe(true)
    expect(isAutoGraded(tf)).toBe(true)
    expect(isAutoGraded(ident)).toBe(true)
  })

  it('short_answer is never auto-graded', () => {
    expect(isAutoGraded(short)).toBe(false)
  })

  it('scenario depends on whether it has choices', () => {
    expect(isAutoGraded(scenario)).toBe(false)
    expect(isAutoGraded(scenarioMcq)).toBe(true)
  })
})

describe('gradeAnswer: auto-graded types', () => {
  it('multiple choice is an exact match against the correct choice', () => {
    expect(gradeAnswer(mcq, 'DHCP')).toBe(true)
    expect(gradeAnswer(mcq, 'DNS')).toBe(false)
  })

  it('true/false compares exactly', () => {
    expect(gradeAnswer(tf, 'True')).toBe(true)
    expect(gradeAnswer(tf, 'False')).toBe(false)
  })

  it('identification is case-insensitive and ignores surrounding/extra whitespace', () => {
    expect(gradeAnswer(ident, 'dhcp')).toBe(true)
    expect(gradeAnswer(ident, '  DHCP  ')).toBe(true)
    expect(gradeAnswer(ident, 'DH  CP')).toBe(false)
    expect(gradeAnswer(ident, 'DNS')).toBe(false)
  })

  it('an empty answer is never marked correct', () => {
    expect(gradeAnswer(mcq, '')).toBe(false)
    expect(gradeAnswer(ident, '')).toBe(false)
    expect(gradeAnswer(ident, undefined)).toBe(false)
  })
})

describe('gradeAnswer: self-graded types return null (no automatic verdict)', () => {
  it('short_answer and a choice-less scenario cannot be graded automatically', () => {
    expect(gradeAnswer(short, 'anything')).toBeNull()
    expect(gradeAnswer(scenario, 'DHCP')).toBeNull()
  })

  it('a scenario with choices is graded like multiple choice', () => {
    expect(gradeAnswer(scenarioMcq, 'DHCP')).toBe(true)
    expect(gradeAnswer(scenarioMcq, 'DNS')).toBe(false)
  })
})

describe('orderForQuiz', () => {
  it('groups recall-first: identification, short_answer, scenario, true_false, multiple_choice', () => {
    const qs = [
      { id: 1, question_type: 'multiple_choice' },
      { id: 2, question_type: 'identification' },
      { id: 3, question_type: 'true_false' },
      { id: 4, question_type: 'scenario' },
      { id: 5, question_type: 'short_answer' },
    ]
    expect(orderForQuiz(qs).map((q) => q.id)).toEqual([2, 5, 4, 3, 1])
  })

  it('keeps the original relative order within the same type (stable)', () => {
    const qs = [
      { id: 'a', question_type: 'identification' },
      { id: 'b', question_type: 'multiple_choice' },
      { id: 'c', question_type: 'identification' },
    ]
    expect(orderForQuiz(qs).map((q) => q.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not mutate the array it was given', () => {
    const qs = [{ id: 1, question_type: 'multiple_choice' }, { id: 2, question_type: 'identification' }]
    const snapshot = [...qs]
    orderForQuiz(qs)
    expect(qs).toEqual(snapshot)
  })
})

describe('topicBreakdown', () => {
  const r = (topic, isCorrect) => ({ question: { topics: topic ? { name: topic } : null }, isCorrect })

  it('computes percent correct per topic', () => {
    const rows = topicBreakdown([r('VLAN', true), r('VLAN', true), r('VLAN', false), r('DHCP', true)])
    expect(rows).toEqual([
      { topic: 'VLAN', correct: 2, total: 3, percent: 67 },
      { topic: 'DHCP', correct: 1, total: 1, percent: 100 },
    ])
  })

  it('sorts the weakest topic first', () => {
    const rows = topicBreakdown([r('Strong', true), r('Strong', true), r('Weak', false), r('Weak', true)])
    expect(rows.map((t) => t.topic)).toEqual(['Weak', 'Strong'])
  })

  it('groups questions with no topic under General instead of dropping them', () => {
    const rows = topicBreakdown([r(null, true), r(null, false)])
    expect(rows).toEqual([{ topic: 'General', correct: 1, total: 2, percent: 50 }])
  })

  it('an empty result list gives an empty breakdown', () => {
    expect(topicBreakdown([])).toEqual([])
  })
})

const chain = (result) => {
  const obj = {
    select: vi.fn(() => obj), eq: vi.fn(() => obj), order: vi.fn(() => obj), insert: vi.fn(() => obj),
    then: (resolve) => Promise.resolve(result).then(resolve),
  }
  return obj
}

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from './supabase'

beforeEach(() => vi.clearAllMocks())

describe('getStudySetQuestions', () => {
  it('filters by study set and joins the topic name', async () => {
    const c = chain({ data: [{ id: 'q1' }], error: null })
    supabase.from.mockReturnValue(c)
    const rows = await getStudySetQuestions('set-1')
    expect(supabase.from).toHaveBeenCalledWith('questions')
    expect(c.select).toHaveBeenCalledWith('*, topics(name)')
    expect(c.eq).toHaveBeenCalledWith('study_set_id', 'set-1')
    expect(rows).toEqual([{ id: 'q1' }])
  })

  it('throws the Supabase error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    await expect(getStudySetQuestions('set-1')).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('submitAttempt', () => {
  it('inserts a row with the given answer and verdict', async () => {
    const c = chain({ error: null })
    supabase.from.mockReturnValue(c)
    await submitAttempt('session-1', 'q1', 'DHCP', true)
    expect(c.insert).toHaveBeenCalledWith({
      session_id: 'session-1', question_id: 'q1', user_answer: 'DHCP', is_correct: true,
    })
  })

  it('throws the Supabase error', async () => {
    supabase.from.mockReturnValue(chain({ error: { message: 'denied' } }))
    await expect(submitAttempt('s', 'q', 'a', true)).rejects.toMatchObject({ message: 'denied' })
  })
})
