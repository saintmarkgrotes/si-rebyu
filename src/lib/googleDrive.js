// Import a file straight from the user's Google Drive.
//
// Flow: Google Identity Services asks the user for permission -> Google Picker lets them
// choose a file -> we download it in the browser -> the caller hands the resulting File to
// the normal upload path (Supabase Storage + /process), so Drive files behave exactly like
// files picked from the computer.
//
// Scope is `drive.file`: the app can only read the files the user picks, never browse the
// rest of their Drive. The client id / API key / project number are public by design
// (restrict them by HTTP referrer in Google Cloud); there are no secrets here.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID // Google Cloud project number

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  gdoc: 'application/vnd.google-apps.document',
  gslides: 'application/vnd.google-apps.presentation',
}

// Google-native files have no bytes of their own; Drive converts them on request.
const EXPORTS = {
  [MIME.gdoc]: { mimeType: MIME.docx, ext: 'docx' },
  [MIME.gslides]: { mimeType: MIME.pptx, ext: 'pptx' },
}

export const isDriveConfigured = Boolean(CLIENT_ID && API_KEY && APP_ID)

// Decide what to fetch for a picked file. Pure, so it is easy to test.
export const planDownload = ({ id, name, mimeType }) => {
  const exported = EXPORTS[mimeType]
  const base = encodeURIComponent(id)
  if (exported) {
    const clean = name.replace(/\.[^./\\]+$/, '') // "Notes" -> "Notes.docx"
    return {
      url: `https://www.googleapis.com/drive/v3/files/${base}/export?mimeType=${encodeURIComponent(exported.mimeType)}`,
      fileName: `${clean}.${exported.ext}`,
      type: exported.mimeType,
    }
  }
  return {
    url: `https://www.googleapis.com/drive/v3/files/${base}?alt=media`,
    fileName: name,
    type: mimeType,
  }
}

const scripts = new Map()
const loadScript = (src) => {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script')
        el.src = src
        el.async = true
        el.onload = resolve
        el.onerror = () => {
          scripts.delete(src) // allow a retry
          reject(new Error('Could not load Google. Check your connection and try again.'))
        }
        document.head.appendChild(el)
      }),
    )
  }
  return scripts.get(src)
}

let cachedToken = null // { value, expiresAt }

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value
  await loadScript(GIS_SRC)
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error || !res.access_token) {
          reject(new Error('Google Drive access was not granted.'))
          return
        }
        cachedToken = { value: res.access_token, expiresAt: Date.now() + Number(res.expires_in) * 1000 }
        resolve(res.access_token)
      },
      error_callback: () => reject(new Error('The Google sign-in window was closed.')),
    })
    client.requestAccessToken({ prompt: cachedToken ? '' : 'consent' })
  })
}

// Opens the Drive file picker. Resolves with { id, name, mimeType, sizeBytes } or null if cancelled.
const openPicker = async (token) => {
  await loadScript(GAPI_SRC)
  await new Promise((resolve) => window.gapi.load('picker', resolve))
  const { google } = window

  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(true)
    .setMimeTypes(Object.values(MIME).join(','))

  return new Promise((resolve) => {
    new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION]
        if (action === google.picker.Action.PICKED) {
          const doc = data[google.picker.Response.DOCUMENTS][0]
          resolve({
            id: doc[google.picker.Document.ID],
            name: doc[google.picker.Document.NAME],
            mimeType: doc[google.picker.Document.MIME_TYPE],
            sizeBytes: Number(doc[google.picker.Document.SIZE_BYTES] || 0),
          })
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
      .setVisible(true)
  })
}

// Lets the user choose a Drive file and returns it as a File, or null if they cancelled.
// `maxBytes` is checked before downloading so a huge file is rejected early.
export const pickFromGoogleDrive = async ({ maxBytes } = {}) => {
  if (!isDriveConfigured) throw new Error('Google Drive import is not set up.')
  const token = await getAccessToken()
  const picked = await openPicker(token)
  if (!picked) return null

  if (maxBytes && picked.sizeBytes > maxBytes) {
    throw new Error(`File is too large. Max size is ${Math.round(maxBytes / 1024 / 1024)}MB.`)
  }

  const { url, fileName, type } = planDownload(picked)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    if (res.status === 403 && EXPORTS[picked.mimeType]) {
      throw new Error('Google could not convert this file (Drive limits conversions to 10MB).')
    }
    throw new Error(`Could not download this file from Google Drive (${res.status}).`)
  }
  const blob = await res.blob()
  return new File([blob], fileName, { type })
}