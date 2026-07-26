import { notFound, redirect } from 'next/navigation'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ChurchMembershipDecision =
  | { action: 'redirect-signin' }
  | { action: 'not-found' }
  | { action: 'ok' }

/**
 * Pure authorization decision for a member-facing church route, given whether the church is
 * visible to the caller (RLS), whether the caller is authenticated, whether they hold a
 * `church_members` row, and whether the caller opted into a sign-in redirect for the church-hidden
 * case. No IO — the async wrapper feeds it booleans and executes the result.
 */
export function churchMembershipDecision({
  churchExists,
  isAuthenticated,
  hasMembership,
  signInNext,
}: {
  churchExists: boolean
  isAuthenticated: boolean
  hasMembership: boolean
  signInNext: string | undefined
}): ChurchMembershipDecision {
  if (!churchExists) {
    if (!isAuthenticated && signInNext) return { action: 'redirect-signin' }
    return { action: 'not-found' }
  }
  if (!hasMembership) return { action: 'not-found' }
  return { action: 'ok' }
}

/**
 * Shared church + membership permission wall for the member-facing assessment routes.
 * RLS hides churches the caller isn't a member of (→ 404); the `church_members` row is the explicit
 * second gate. Pass `signInNext` to send an *unauthenticated* deep-link to sign-in (with a `next`
 * back to the page) instead of a bare 404 — omit it to keep `notFound()`-only behavior.
 */
export async function requireChurchMembership(
  supabase: SupabaseServerClient,
  churchId: string,
  opts?: { signInNext?: string },
): Promise<void> {
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()

  const decision = churchMembershipDecision({
    churchExists: church != null,
    isAuthenticated: user != null,
    hasMembership: membership != null,
    signInNext: opts?.signInNext,
  })

  if (decision.action === 'redirect-signin') redirect(`/sign-in?next=${opts?.signInNext}`)
  if (decision.action === 'not-found') notFound()
  // 'ok' → return void
}
