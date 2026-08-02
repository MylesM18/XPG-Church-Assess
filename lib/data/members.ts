import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type MemberRole = 'admin' | 'viewer'

/**
 * The caller's role in a church, or null if they hold no church_members row. The single place the
 * `church_members` role lookup lives — previously re-expressed inline in every admin guard and page.
 * Reads through the anon-key RLS client (members_select gates visibility); no service role.
 */
export async function memberRole(
  supabase: SupabaseServerClient,
  churchId: string,
  userId: string,
): Promise<MemberRole | null> {
  const { data } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.role as MemberRole | null) ?? null
}

/**
 * The caller's completion deadline in a church (church_members.assessment_deadline_at), or null when
 * untimed (founder / pre-existing rows) or when they hold no row. Reads through the anon-key RLS
 * client (members_select gates visibility); no service role.
 */
export async function memberDeadline(
  supabase: SupabaseServerClient,
  churchId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('church_members')
    .select('assessment_deadline_at')
    .eq('church_id', churchId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.assessment_deadline_at as string | null) ?? null
}

/**
 * Remove a member from a church via the last-admin-guarded `remove_member` RPC. Returns the RPC's
 * refusal message (e.g. removing the last admin) rather than throwing, so callers can surface it.
 */
export async function removeChurchMember(
  supabase: SupabaseServerClient,
  churchId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_member', { p_church_id: churchId, p_user_id: userId })
  return { error: error?.message ?? null }
}

/**
 * The church's members via the admin-gated `get_church_members` RPC, defaulted to []. Generic in the
 * row shape so each call site keeps its own view type without the RPC name leaking out to callers.
 */
export async function churchMembers<T>(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<T[]> {
  const { data } = await supabase.rpc('get_church_members', { p_church_id: churchId })
  return (data ?? []) as T[]
}
