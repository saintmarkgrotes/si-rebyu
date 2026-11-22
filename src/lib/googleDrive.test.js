import { describe, expect, it } from 'vitest'
import { isDriveConfigured, planDownload } from './googleDrive'

describe('planDownload', () => {
  it('downloads regular files as-is', () => {
    const plan = planDownload({ id: 'abc', name: 'Lecture 1.pdf', mimeType: 'application/pdf' })
    expect(plan.url).toBe('https://www.googleapis.com/drive/v3/files/abc?alt=media')
    expect(plan.fileName).toBe('Lecture 1.pdf')
    expect(plan.type).toBe('application/pdf')
  })

  it('exports Google Docs as .docx', () => {
    const plan = planDownload({ id: 'd1', name: 'Notes', mimeType: 'application/vnd.google-apps.document' })
    expect(plan.url).toContain('/files/d1/export?mimeType=')
    expect(decodeURIComponent(plan.url)).toContain('wordprocessingml.document')
    expect(plan.fileName).toBe('Notes.docx')
  })

  it('exports Google Slides as .pptx and replaces a stray extension', () => {
    const plan = planDownload({ id: 's1', name: 'Deck.v2', mimeType: 'application/vnd.google-apps.presentation' })
    expect(plan.fileName).toBe('Deck.pptx')
    expect(decodeURIComponent(plan.url)).toContain('presentationml.presentation')
  })

  it('encodes ids that contain unusual characters', () => {
    const plan = planDownload({ id: 'a/b', name: 'x.pdf', mimeType: 'application/pdf' })
    expect(plan.url).toContain('/files/a%2Fb?alt=media')
  })
})

describe('isDriveConfigured', () => {
  it('is false when the Google env vars are missing (the default in tests)', () => {
    expect(isDriveConfigured).toBe(false)
  })
})