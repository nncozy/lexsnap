import { useContext } from 'react'
import { AuthContext } from '@/contexts/AuthContext'

/**
 * Returns the current auth context value.
 * Must be called inside a component that is a descendant of <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>')
  return ctx
}
