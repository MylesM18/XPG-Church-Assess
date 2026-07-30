import { createClient } from '@/lib/supabase/server'
import { memberRole } from '@/lib/data/members'

/**
 * Pure decision for the action-facing admin guard: given whether the caller is authenticated and
 * their role, return the error message to surface, or null when they may proceed. No IO.
 */
export function adminGuardDecision(isAuthenticated: boolean, role: string | null): string | null {
  if (!isAuthenticated) return 'You must be signed in.'
  if (role !== 'admin') return 'You must be an admin of this church.'
  return null
}

/**
 * Shared admin guard for server actions. Replaces the byte-for-byte `requireAdmin` that was cloned
 * in access/actions.ts and diagnosis/actions.ts. Returns the RLS client (for the action to reuse)
 * plus an error string that is null iff the caller is an admin of the church.
 */
export async function requireChurchAdmin(
  churchId: string,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user ? await memberRole(supabase, churchId, user.id) : null
  return { supabase, error: adminGuardDecision(user != null, role) }
}
