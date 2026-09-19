import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const itemClass =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-subtle focus-visible:bg-subtle'

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'shrink-0 text-muted',
}

const Icons = {
  dashboard: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  documents: (
    <svg {...iconProps}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  logout: (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
}

const ProfileMenu = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Profile"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-subtle"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile"
          className="absolute right-0 z-40 mt-2 w-60 rounded-lg border border-line bg-paper p-1.5 shadow-xl"
        >
          <div className="px-3 py-2">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate text-sm font-medium text-ink" title={user?.email}>
              {user?.email ?? 'Your account'}
            </p>
          </div>

          <div role="separator" className="my-1 h-px bg-line" />

          <Link to="/dashboard" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            {Icons.dashboard} Dashboard
          </Link>
          <Link to="/documents" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            {Icons.documents} My documents
          </Link>
          <Link to="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            {Icons.settings} Settings
          </Link>

          <div role="separator" className="my-1 h-px bg-line" />

          <button type="button" role="menuitem" className={itemClass} onClick={handleLogout}>
            {Icons.logout} Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfileMenu