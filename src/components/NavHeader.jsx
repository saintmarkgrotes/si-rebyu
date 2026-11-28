import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import ProfileMenu from './ProfileMenu'
import BrandLogo from './BrandLogo'

const pill = 'rounded-full border border-line bg-card shadow-sm'

const linkBase =
  'flex min-h-9 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm'
const linkClass = ({ isActive }) =>
  `${linkBase} ${
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-subtle hover:text-ink'
  }`

const NavHeader = () => {
  return (
    <header className="sticky top-0 z-30 flex flex-nowrap items-center justify-between gap-2 bg-paper/80 px-2 py-3 backdrop-blur sm:gap-4 sm:px-6 sm:py-4">
      {/* Left: brand pill */}
      <NavLink
        to="/dashboard"
        aria-label="si-rebyu home"
        className={`${pill} flex h-12 shrink-0 items-center px-2 sm:px-4`}
      >
        <BrandLogo compact />
      </NavLink>

      {/* Center: floating nav pill, active item is a filled pill */}
      <nav
        aria-label="Main navigation"
        className={`${pill} flex min-w-0 items-center gap-0.5 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        <NavLink to="/dashboard" className={linkClass}>
          Dashboard
        </NavLink>
        <NavLink to="/documents" className={linkClass}>
          Documents
        </NavLink>
        <NavLink to="/review" className={linkClass}>
          Review
        </NavLink>
      </nav>

      {/* Right: actions pill + profile pill */}
      <div className="flex shrink-0 items-center gap-2">
        <div className={`${pill} hidden h-12 items-center px-1.5 sm:flex`}>
          <ThemeToggle />
        </div>
        <ProfileMenu />
      </div>
    </header>
  )
}

export default NavHeader