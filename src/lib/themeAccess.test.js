import { describe, expect, it } from 'vitest'
import { canUseStrawberryTheme } from './themeAccess'

describe('canUseStrawberryTheme', () => {
  it('allows simang and admin', () => {
    expect(canUseStrawberryTheme({ app_metadata: { role: 'simang' } })).toBe(true)
    expect(canUseStrawberryTheme({ app_metadata: { role: 'admin' } })).toBe(true)
    expect(canUseStrawberryTheme({ app_metadata: { role: 'Admin' } })).toBe(true)
  })

  it('denies everyone else, including self-editable user_metadata', () => {
    expect(canUseStrawberryTheme(null)).toBe(false)
    expect(canUseStrawberryTheme({})).toBe(false)
    expect(canUseStrawberryTheme({ app_metadata: { role: 'student' } })).toBe(false)
    expect(canUseStrawberryTheme({ user_metadata: { role: 'admin' } })).toBe(false)
  })
})