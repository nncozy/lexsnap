import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Layout route guard.
 *
 * Usage in App.tsx:
 *   <Route element={<RequireAuth />}>
 *     <Route path="/" element={<Home />} />
 *     ...
 *   </Route>
 *
 * - While the initial session is loading, renders a full-screen spinner.
 * - Unauthenticated visitors are redirected to /login with `state.from` set
 *   so the login page can navigate back after sign-in.
 * - Authenticated users pass through and their nested <Route> renders.
 */
export default function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-muted text-sm">Loading…</span>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
