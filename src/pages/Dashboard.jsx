import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { getStudySets } from '../lib/studySets'
import {
  getDueFlashcardCount, getOverallAccuracy, getStudyStreak, getTopicsStudiedCount, getWeakTopics,
} from '../lib/progress'
import NavHeader from '../components/NavHeader'
import StudyTasks from '../components/StudyTasks'
import StatCard from '../components/dashboard/StatCard'
import DueReviewCard from '../components/dashboard/DueReviewCard'
import WeakTopicsList from '../components/dashboard/WeakTopicsList'
import RecentStudySets from '../components/dashboard/RecentStudySets'
import StudyMascot from '../components/StudyMascot'

const RECENT_LIMIT = 5

const Dashboard = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [studySets, setStudySets] = useState(null)
  const [weakTopics, setWeakTopics] = useState(null)
  const [error, setError] = useState('')
  const profileName = [user?.user_metadata?.display_name, user?.user_metadata?.full_name, user?.user_metadata?.name]
    .find((name) => typeof name === 'string' && name.trim())
  const firstName = profileName?.trim().split(/\s+/)[0] || user?.email?.split('@')[0]
  const mascotMessage = stats?.dueCount > 0
    ? `You have ${stats.dueCount} ${stats.dueCount === 1 ? 'card' : 'cards'} ready to revisit. Let’s take them one at a time!`
    : stats && studySets?.length === 0
      ? 'I’m Rebyu! Add your first document and we’ll start learning together. Kaya natin ’to!'
      : stats?.dueCount === 0
        ? 'You’re all caught up on reviews! Explore a study set, or take a well-earned breather.'
        : 'I’m Rebyu, your little study buddy. Ready to learn something together?'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [streak, accuracy, topicsStudied, dueCount, sets, weak] = await Promise.all([
          getStudyStreak(),
          getOverallAccuracy(),
          getTopicsStudiedCount(),
          getDueFlashcardCount(),
          getStudySets(),
          getWeakTopics(),
        ])
        if (!active) return
        setStats({ streak, accuracy, topicsStudied, dueCount })
        setStudySets(sets.slice(0, RECENT_LIMIT))
        setWeakTopics(weak)
      } catch (err) {
        if (active) setError(err.message || 'Could not load your dashboard.')
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-paper">
      <NavHeader />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-ink">
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's where your studying stands.</p>

        <div className="mt-6">
          <StudyMascot message={mascotMessage} />
        </div>

        {error && <p className="mt-6 text-sm text-danger">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <DueReviewCard count={stats?.dueCount ?? null} />
          <StatCard label="Study streak" value={stats?.streak ?? null} suffix={stats?.streak === 1 ? ' day' : ' days'} />
          <StatCard label="Quiz accuracy" value={stats?.accuracy?.percent ?? null} suffix="%" />
          <StatCard label="Topics studied" value={stats?.topicsStudied ?? null} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <WeakTopicsList topics={weakTopics} />
          <RecentStudySets studySets={studySets} />
        </div>

        <StudyTasks />
      </main>
    </div>
  )
}

export default Dashboard
