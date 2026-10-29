import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import ProfileMenu from './ProfileMenu'

const linkBase = 'rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const linkClass = ({ isActive }) =>
  `${linkBase} ${isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-subtle hover:text-ink'}`

const NavHeader = () => {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2 sm:gap-6">
        <span className="text-sm font-semibold text-accent-strong">si-rebyu</span>
        <nav className="flex items-center gap-1">
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
