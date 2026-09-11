import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Card from '../components/Card'
import Button from '../components/Button'

const Dashboard =()=> {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <span className="text-sm font-medium text-ink">si-rebyu</span>
        <Button variant="secondary" onClick={handleLogout}>
          Log out
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">
          Welcome back{user?.email ? `, ${user.email}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted">
          You're signed in. Build your app's content here.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted">Placeholder</p>
            <p className="mt-2 text-2xl font-semibold text-ink">128</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Placeholder</p>
            <p className="mt-2 text-2xl font-semibold text-ink">42</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Placeholder</p>
            <p className="mt-2 text-2xl font-semibold text-ink">7</p>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default Dashboard;