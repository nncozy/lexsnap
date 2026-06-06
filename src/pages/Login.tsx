import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Public login screen.
 *
 * Flow:
 *   1. User clicks "Sign in with Google".
 *   2. supabase.auth.signInWithOAuth redirects to Google.
 *   3. Google redirects back to window.location.origin (/).
 *   4. onAuthStateChange fires, AuthContext sets session.
 *   5. useEffect below navigates to the originally requested route.
 *
 * Note: The Supabase project must have window.location.origin listed as an
 * allowed redirect URL (Authentication → URL Configuration in the dashboard).
 */
export default function Login() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Return destination — set by RequireAuth when it bounces an unauthenticated visitor.
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  // Once authenticated, navigate to the original destination.
  useEffect(() => {
    if (!loading && session) navigate(from, { replace: true })
  }, [session, loading, navigate, from])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Must match an allowed redirect URL in your Supabase project settings.
        redirectTo: window.location.origin,
      },
    })
    if (error) {
      setError(error.message)
      setSigningIn(false)
    }
    // On success the browser navigates away — no further local state update needed.
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      {/* Branding */}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-primary flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-bold text-white select-none">
          L
        </div>
        <h1 className="text-2xl font-bold">LexSnap</h1>
        <p className="text-muted text-sm">Snap words. Build your vocabulary.</p>
      </div>

      {/* Sign-in area */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={signingIn || loading}
          className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-ink shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
        >
          <GoogleIcon />
          {signingIn ? 'Redirecting…' : 'Sign in with Google'}
        </button>

        {error && (
          <p className="text-review text-center text-sm">{error}</p>
        )}
      </div>
    </div>
  )
}

/** Google "G" logo mark (official brand colors). */
function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66 2.84-.62-.82z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
