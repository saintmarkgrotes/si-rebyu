import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

const loadApi = async (apiUrl) => {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', apiUrl)
  return import('./api')
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('apiFetch base URL', () => {
  it('uses a relative /api path when VITE_API_URL is empty (local dev with the Vite proxy)', async () => {
    const { apiFetch } = await loadApi('')
    await apiFetch('/health', { auth: false })
    expect(fetch.mock.calls[0][0]).toBe('/api/health')
  })

  it('prefixes the configured backend origin', async () => {
    const { apiFetch } = await loadApi('https://api.example.com')
    await apiFetch('/health', { auth: false })
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.com/api/health')
  })

  it('ignores a trailing slash instead of producing //api', async () => {
    const { apiFetch } = await loadApi('https://api.example.com/')
    await apiFetch('/health', { auth: false })
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.com/api/health')
  })

  it('sends the signed-in user token as a bearer header', async () => {
    const { apiFetch } = await loadApi('https://api.example.com')
    await apiFetch('/me')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })
})
