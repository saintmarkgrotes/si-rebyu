import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import ProfileMenu from './ProfileMenu'

const linkBase = 'text-sm font-medium transition-colors'
const linkClass = ({ isActive }) =>
  `${linkBase} ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`

const NavHeader = () => {
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
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  )
}

export default NavHeader
