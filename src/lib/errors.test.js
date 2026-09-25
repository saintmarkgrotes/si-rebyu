import { describe, expect, it } from 'vitest'
import { friendlyRowError, isRowNotFoundError } from './errors'

describe('isRowNotFoundError', () => {
  it('recognizes the real PostgREST "no row" error code', () => {
    expect(isRowNotFoundError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(true)
  })

  it('also recognizes it by message alone, in case the code is ever missing', () => {
    expect(isRowNotFoundError({ message: 'JSON object requested, multiple (or no) rows returned' })).toBe(true)
  })

  it('is false for an unrelated error', () => {
    expect(isRowNotFoundError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    expect(isRowNotFoundError({ message: 'Network request failed' })).toBe(false)
  })

  it('is false for no error at all', () => {
    expect(isRowNotFoundError(null)).toBe(false)
    expect(isRowNotFoundError(undefined)).toBe(false)
  })
})

describe('friendlyRowError', () => {
  it('replaces a not-found error with the given friendly message', () => {
    const error = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
    expect(friendlyRowError(error, 'Not found, friendly.', 'fallback')).toBe('Not found, friendly.')
  })

  it('keeps a real, already-readable error message untouched', () => {
    expect(friendlyRowError({ message: 'Your session has expired.' }, 'Not found.', 'fallback')).toBe(
      'Your session has expired.',
    )
  })

  it('falls back to the given message when the error has none', () => {
    expect(friendlyRowError({}, 'Not found.', 'Something went wrong.')).toBe('Something went wrong.')
  })
})
