import { expect, it, vi } from 'vitest'
import { fetchAll } from './pagination'

it('reads every page instead of dropping rows after the first response', async () => {
  const range = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: [3], error: null })
  expect(await fetchAll(() => ({ range }), 2)).toEqual([1, 2, 3])
  expect(range.mock.calls).toEqual([[0, 1], [2, 3]])
})
it('does not return a misleading partial list after a later page fails', async () => {
  const range = vi.fn().mockResolvedValueOnce({ data: [1], error: null }).mockResolvedValueOnce({ data: null, error: new Error('offline') })
  await expect(fetchAll(() => ({ range }), 1)).rejects.toThrow('offline')
})
