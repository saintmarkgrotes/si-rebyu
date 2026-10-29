import { useEffect, useRef } from 'react'

const SIZES = { md: 'max-w-md', lg: 'max-w-lg' }

const Modal = ({ open, onClose, title, size = 'md', children }) => {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const dialog = dialogRef.current
    const focusableElements = () => Array.from(dialog.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    )).filter((element) => (
      element.tabIndex >= 0 && !element.matches(':disabled') &&
      !element.closest('[hidden], [inert]') &&
      getComputedStyle(element).display !== 'none' &&
      getComputedStyle(element).visibility !== 'hidden'
    ))

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const elements = focusableElements()
      const first = elements[0] ?? dialog
      const last = elements.at(-1) ?? dialog
      const active = document.activeElement
      if (!elements.includes(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      }
    }

    const initialFocus = focusableElements()[0] ?? dialog
    initialFocus.focus()
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-xl border border-line bg-card p-6 shadow-xl ${SIZES[size]}`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded-md px-2 py-1 text-xl leading-none text-muted-foreground transition-colors hover:bg-subtle hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export default Modal
