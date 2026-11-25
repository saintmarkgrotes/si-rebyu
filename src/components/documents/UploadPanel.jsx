import { useEffect, useId, useRef, useState } from 'react'
import { Box, Cloud, CloudUpload, Laptop, Link2, LoaderCircle, Plus } from 'lucide-react'

// Sources that are planned but not built yet. They show up greyed out with a "Soon" badge.
const COMING_SOON = [
  { id: 'dropbox', title: 'Dropbox', icon: Box },
  { id: 'link', title: 'Paste a link', icon: Link2 },
]

const MenuItem = ({ icon: Icon, title, hint, badge, disabled = false, onClick }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink">
      <Icon className="size-4.5" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-ink">{title}</span>
      {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
    </span>
    {badge && (
      <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {badge}
      </span>
    )}
  </button>
)

const UploadPanel = ({
  acceptedTypes,
  maxSizeMb,
  uploading = false,
  pickingDrive = false,
  driveEnabled = false,
  onFile,
  onDrive,
  className = '',
}) => {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const dragDepth = useRef(0) // dragenter/dragleave also fire for child elements, so count them
  const menuId = useId()
  const busy = uploading || pickingDrive

  // Close the menu on outside click or Escape; focus the first option when it opens.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const onMenuKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')]
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement)
    const next = e.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
    items[next].focus()
  }

  const chooseDevice = () => {
    setOpen(false)
    inputRef.current?.click()
  }

  const chooseDrive = () => {
    setOpen(false)
    onDrive()
  }

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (file) onFile(file)
  }

  const onDragEnter = (e) => {
    e.preventDefault()
    if (busy) return
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (busy) return
    const file = e.dataTransfer?.files?.[0]
    if (file) onFile(file)
  }

  const title = uploading
    ? 'Uploading your file…'
    : pickingDrive
      ? 'Opening Google Drive…'
      : dragging
        ? 'Drop to upload'
        : 'Drag a file here, or add one'

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`flex flex-col gap-5 rounded-2xl border border-dashed p-5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
        dragging ? 'border-ink bg-subtle' : 'border-line bg-card'
      } ${className}`}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink">
          {busy ? (
            <LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <CloudUpload className="size-6" aria-hidden="true" />
          )}
        </span>
        <div aria-live="polite">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            PDF, Word or PowerPoint · up to {maxSizeMb} MB
          </p>
        </div>
      </div>

      <div ref={wrapRef} className="relative shrink-0">
        <button
          ref={triggerRef}
          type="button"
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <Plus
            className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-45' : ''}`}
            aria-hidden="true"
          />
          Add document
        </button>

        {open && (
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label="Upload from"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 top-full z-20 mt-2 w-full min-w-72 origin-top-right rounded-xl border border-line bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150 sm:w-72"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Upload from
            </p>
            <MenuItem
              icon={Laptop}
              title="This device"
              hint="Browse files on your computer"
              onClick={chooseDevice}
            />
            {driveEnabled && (
              <MenuItem
                icon={Cloud}
                title="Google Drive"
                hint="PDF, Word, PowerPoint, Docs, Slides"
                onClick={chooseDrive}
              />
            )}
            <div className="my-1.5 h-px bg-line" role="separator" />
            {COMING_SOON.map(({ id, title: label, icon }) => (
              <MenuItem key={id} icon={icon} title={label} badge="Soon" disabled />
            ))}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleInputChange}
        aria-label="Choose a file from this device"
        className="hidden"
      />
    </div>
  )
}

export default UploadPanel