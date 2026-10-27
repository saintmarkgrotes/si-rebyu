import { supabase } from './supabase'

// Empty in local dev (Vite proxies /api). In production, set VITE_API_URL to the backend origin.
// A trailing slash is an easy thing to paste by accident and would produce "//api/..." URLs.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// FastAPI sends either a string, or (for invalid input) a list of {msg} objects.
const messageFrom = (detail) => {
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : ''))
      .filter(Boolean)
      .join(' ')
  }
  return typeof detail === 'string' ? detail : ''
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Calls the backend with the signed-in user's Supabase token.
// `path` is relative to /api, e.g. apiFetch('/health', { auth: false }).
export const apiFetch = async (path, { method = 'GET', body, auth = true, signal } = {}) => {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new ApiError('You are signed out. Please log in again.', 401)
    headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    // free hosting tiers can take ~1 minute to wake up after being idle
    throw new ApiError('Could not reach the server. It may be waking up — try again in a moment.', 0)
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(messageFrom(payload?.detail) || `Request failed (${res.status}).`, res.status)
  }
  return payload
}
