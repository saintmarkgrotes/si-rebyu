import { Link } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import { LEGAL } from '../lib/legal'

// Page shell shared by the Privacy Policy and Terms of Service (public, no sign-in needed).
export const LegalPage = ({ title, children }) => (
  <div className="min-h-screen bg-paper">
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link to="/" aria-label={`${LEGAL.appName} home`}>
          <BrandLogo compact />
        </Link>
        <Link to="/" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          Back to app
        </Link>
      </div>
    </header>

    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective {LEGAL.effectiveDate}</p>
      <div className="mt-8 flex flex-col gap-8">{children}</div>
    </main>

    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-3xl gap-4 px-6 py-6 text-sm text-muted-foreground">
        <Link to="/privacy" className="underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        <Link to="/terms" className="underline-offset-2 hover:underline">
          Terms of Service
        </Link>
      </div>
    </footer>
  </div>
)

export const Section = ({ title, children }) => (
  <section>
    <h2 className="text-lg font-semibold text-ink">{title}</h2>
    <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
)

export const List = ({ items }) => (
  <ul className="list-disc space-y-1.5 pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)