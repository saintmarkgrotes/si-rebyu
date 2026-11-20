import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { AuthContext } from '../authContextObject'
import { ThemeProvider } from '../ThemeContext'
import { useTheme } from '../useTheme'

function Probe() {
  const { palette, canUseStrawberry, setPalette } = useTheme()
  return (
    <>
      <p data-testid="state">{`${palette}|${canUseStrawberry}`}</p>
      <button onClick={() => setPalette('strawberry')}>strawberry</button>
      <button onClick={() => setPalette('mono')}>mono</button>
    </>
  )
}

const renderAs = (user) =>
  render(
    <AuthContext.Provider value={{ user, loading: false }}>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </AuthContext.Provider>
  )

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.palette
})

it('gives regular users the black & white theme and ignores attempts to switch', () => {
  renderAs({ id: 'u1', app_metadata: { role: 'student' } })
  expect(screen.getByTestId('state')).toHaveTextContent('mono|false')
  act(() => screen.getByText('strawberry').click())
  expect(screen.getByTestId('state')).toHaveTextContent('mono|false')
  expect(document.documentElement.dataset.palette).toBe('mono')
})

it('ignores a stored strawberry choice for ineligible users', () => {
  localStorage.setItem('si-rebyu-palette', 'strawberry')
  renderAs({ id: 'u1' })
  expect(document.documentElement.dataset.palette).toBe('mono')
  expect(localStorage.getItem('si-rebyu-palette-ok')).toBeNull()
})

it.each(['simang', 'admin'])('lets %s default to strawberry and switch to mono and back', (role) => {
  renderAs({ id: 'u2', app_metadata: { role } })
  expect(screen.getByTestId('state')).toHaveTextContent('strawberry|true')
  expect(document.documentElement.dataset.palette).toBe('strawberry')
  act(() => screen.getByText('mono').click())
  expect(document.documentElement.dataset.palette).toBe('mono')
  act(() => screen.getByText('strawberry').click())
  expect(document.documentElement.dataset.palette).toBe('strawberry')
})