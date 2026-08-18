import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Close the church's current run via the admin-gated `close_run` RPC (ADR 0003). Returns the RPC's
 * refusal message (`run is already closed`, `must be an admin of this church`, …) rather than
 * throwing, so the server action can map it to inline copy. Reads through the anon-key RLS client;
 * the RPC is SECURITY DEFINER and gates on require_church_admin itself.
 */
export async function closeRun(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('close_run', { p_church_id: churchId })
  return { error: error?.message ?? null }
}

/**
 * Reopen the church's current run via `reopen_run` (ADR 0003). Same contract as closeRun; the RPC
 * refuses with `run is not closed` when the run is already open.
 */
export async function reopenRun(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reopen_run', { p_church_id: churchId })
  return { error: error?.message ?? null }
}
