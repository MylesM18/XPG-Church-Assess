import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Claims the right to send this church's results-viewed email (spec
 * docs/superpowers/specs/2026-09-15-results-viewed-email-design.md). `true` only when the admin-gated
 * `claim_results_viewed_email` RPC says this caller won: the run is closed, not yet emailed, and not
 * claimed in the last 5 minutes. Every error, including the RPC not existing before the migration is
 * applied, resolves to `false` with one reason-only warning, so the caller simply sends nothing.
 * Anon-key RLS client; the RPC is SECURITY DEFINER and gates on require_church_admin itself.
 */
export async function claimResultsViewedEmail(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_results_viewed_email', { p_church_id: churchId })
  if (error) {
    console.warn('[notify] claim_results_viewed_email failed; no results-viewed email:', error.code || error.message)
    return false
  }
  return data === true
}

/**
 * Records that the results-viewed email went out (`mark_results_viewed_emailed`). `false`, with one
 * reason-only warning, when the RPC errors; the email is already sent by then, so the caller only logs.
 */
export async function markResultsViewedEmailed(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('mark_results_viewed_emailed', { p_church_id: churchId })
  if (error) {
    console.warn('[notify] mark_results_viewed_emailed failed:', error.code || error.message)
    return false
  }
  return true
}
