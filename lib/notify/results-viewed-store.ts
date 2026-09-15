import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * The two database calls behind "one results-viewed email per closed run" (spec
 * docs/superpowers/specs/2026-09-15-results-viewed-email-design.md). Both RPCs are granted to service_role
 * ONLY, so a church admin cannot suppress or postpone Kevin's email by calling them with their own
 * session. That makes this a server-trusted path like lib/auth/invited-account.ts: the diagnosis page
 * authorizes the viewer as the church's admin (its RLS-backed role check) before it calls here. It lives
 * outside lib/data/, which stays anon-key + RLS only (ADR 0002).
 *
 * Neither function throws. A missing service-role key (null client) or any RPC error, including the
 * function not existing before the migration is applied, returns false with one reason-only warning, so
 * the caller simply sends nothing.
 */

/** Claims the right to send: true only when the run is closed, not yet emailed, and not claimed in the last 5 minutes. */
export async function claimResultsViewedEmail(
  churchId: string,
  admin: SupabaseClient | null = createServiceRoleClient(),
): Promise<boolean> {
  if (!admin) {
    console.warn('[notify] SUPABASE_SERVICE_ROLE_KEY is not set; no results-viewed email')
    return false
  }
  const { data, error } = await admin.rpc('claim_results_viewed_email', { p_church_id: churchId })
  if (error) {
    console.warn('[notify] claim_results_viewed_email failed; no results-viewed email:', error.code || error.message)
    return false
  }
  return data === true
}

/** Records that the results-viewed email went out, so no later view repeats it. */
export async function markResultsViewedEmailed(
  churchId: string,
  admin: SupabaseClient | null = createServiceRoleClient(),
): Promise<boolean> {
  if (!admin) {
    console.warn('[notify] SUPABASE_SERVICE_ROLE_KEY is not set; results-viewed email not marked')
    return false
  }
  const { error } = await admin.rpc('mark_results_viewed_emailed', { p_church_id: churchId })
  if (error) {
    console.warn('[notify] mark_results_viewed_emailed failed:', error.code || error.message)
    return false
  }
  return true
}
