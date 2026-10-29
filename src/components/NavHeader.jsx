import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import ProfileMenu from './ProfileMenu'

const linkBase = 'flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm'
const linkClass = ({ isActive }) =>
  `${linkBase} ${isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-subtle hover:text-ink'}`

const NavHeader = () => {
  return (
    <header className="flex flex-nowrap items-center justify-between gap-2 border-b border-line bg-card px-2 py-3 sm:gap-6 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-1 sm:gap-6">
        <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent-strong sm:text-sm">si-rebyu</span>
        <nav aria-label="Main navigation" className="flex shrink-0 items-center sm:gap-1">
          <NavLink to="/dashboard" className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/documents" className={linkClass}>
            Documents
          </NavLink>
        </nav>
      </div>
      <div className="ml-auto flex shrink-0 items-center sm:gap-2">
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  )
}

export default NavHeader
