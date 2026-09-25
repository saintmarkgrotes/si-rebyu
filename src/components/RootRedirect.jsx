import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Sends a signed-in user back into the app and everyone else to sign in. Used for the bare root
// and for any path that doesn't match a real route, so a stale bookmark or a typo never dumps a
// logged-in user back onto the login form.
const RootRedirect = () => {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default RootRedirect
