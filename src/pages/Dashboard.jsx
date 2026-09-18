import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import NavHeader from '../components/NavHeader'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadStats() {
      setLoading(true)
      setError('')
      const [docs, sessions, topics] = await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase.from('study_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('topics').select('*', { count: 'exact', head: true }),
      ])
      const firstError = docs.error || sessions.error || topics.error
      if (!active) return
      if (firstError) {
        setError(firstError.message)
      } else {
        setStats({
          documentCount: docs.count ?? 0,
          sessionCount: sessions.count ?? 0,
          topicCount: topics.count ?? 0,
        })
      }
      setLoading(false)
    }
    loadStats()
    return () => { active = false }
  }, [])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">
          Welcome back{user?.email ? `, ${user.email}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted">Here's where your studying stands.</p>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted">Documents uploaded</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{loading ? '—' : stats.documentCount}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Study sessions</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{loading ? '—' : stats.sessionCount}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Topics studied</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{loading ? '—' : stats.topicCount}</p>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default Dashboard