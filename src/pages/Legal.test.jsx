import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Privacy from './Privacy'
import Terms from './Terms'

const renderPage = (page) => render(page, { wrapper: MemoryRouter })

describe('legal pages', () => {
  it('renders the Privacy Policy with the Google API Limited Use statement', () => {
    renderPage(<Privacy />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/Limited Use requirements/)).toBeInTheDocument()
  })

  it('renders the Terms of Service', () => {
    renderPage(<Terms />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
  })

  it('links the two pages to each other in the footer', () => {
    renderPage(<Terms />)
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })
})