import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Button from './Button'

const linkBase = 'text-sm font-medium transition-colors'
const linkClass = ({ isActive }) =>
  `${linkBase} ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`

const NavHeader = () => {
  const { logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-4">
      <div className="flex items-center gap-6">
        <span className="text-sm font-medium text-ink">si-rebyu</span>
        <nav className="flex items-center gap-4">
          <NavLink to="/dashboard" className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/documents" className={linkClass}>
            Documents
          </NavLink>
        </nav>
      </div>
      <Button variant="secondary" onClick={handleLogout}>
        Log out
      </Button>
    </header>
  )
}

export default NavHeader