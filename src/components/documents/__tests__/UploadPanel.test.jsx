import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UploadPanel from '../UploadPanel'

const setup = (props = {}) => {
  const onFile = vi.fn()
  const onDrive = vi.fn()
  render(
    <UploadPanel
      acceptedTypes={['.pdf', '.docx', '.pptx']}
      maxSizeMb={20}
      driveEnabled
      onFile={onFile}
      onDrive={onDrive}
      {...props}
    />,
  )
  return { onFile, onDrive }
}

const openMenu = () => userEvent.click(screen.getByRole('button', { name: /add document/i }))

describe('UploadPanel', () => {
  it('opens a source menu from the plus button and closes it on Escape', async () => {
    setup()
    await openMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('uploads a file chosen from this device', async () => {
    const { onFile } = setup()
    const file = new File(['x'], 'Notes.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/choose a file from this device/i), file)
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('calls onDrive from the Google Drive option', async () => {
    const { onDrive } = setup()
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /google drive/i }))
    expect(onDrive).toHaveBeenCalledTimes(1)
  })

  it('hides Google Drive when it is not configured and disables upcoming sources', async () => {
    setup({ driveEnabled: false })
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /google drive/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /dropbox/i })).toBeDisabled()
  })

  it('passes a dropped file to onFile', () => {
    const { onFile } = setup()
    const file = new File(['x'], 'Slides.pptx')
    const zone = screen.getByText(/drag a file here/i).closest('div[class*="border-dashed"]')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    drop.dataTransfer = { files: [file] }
    zone.dispatchEvent(drop)
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('disables the plus button while busy', () => {
    setup({ uploading: true })
    expect(screen.getByRole('button', { name: /add document/i })).toBeDisabled()
  })
})