import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null // or a spinner
  // Remember where they were headed, so signing in can return them there instead of always /dashboard.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

export default ProtectedRoute