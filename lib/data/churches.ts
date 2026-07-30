import type { createClient } from '@/lib/supabase/server'
import { memberRole, type MemberRole } from '@/lib/data/members'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface ChurchForMember {
  id: string
  name: string
  brand_color: string
  attendance_band: string | null
}

/**
 * A church's display name, or null if not visible to the caller (RLS). The single place the
 * `churches.name` lookup lives. Reads through the anon-key RLS client; no service role.
 */
export async function churchName(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle()
  return data?.name ?? null
}

/**
 * The church (chrome + engine columns) plus the caller's role, in one call — the church+membership
 * shape the member-facing pages all re-expressed inline. Throws on an unexpected church-load error
 * (a real failure must not masquerade as "not found"); the role is only looked up once the church is
 * visible (RLS). Reads through the anon-key RLS client; no service role.
 */
export async function loadChurchForMember(
  supabase: SupabaseServerClient,
  churchId: string,
  userId: string,
): Promise<{ church: ChurchForMember | null; role: MemberRole | null }> {
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, brand_color, attendance_band')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  const church = (data as ChurchForMember | null) ?? null
  const role = church ? await memberRole(supabase, churchId, userId) : null
  return { church, role }
}

/**
 * Create a church and its admin membership atomically via the `create_church_with_admin` RPC.
 * Returns the new church id (parsed from the RPC's `[{ church_id, run_id }]` row) or the error
 * message. Callers build the `p_*` args from their form.
 */
export async function createChurchWithAdmin(
  supabase: SupabaseServerClient,
  args: Record<string, string | null>,
): Promise<{ churchId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_church_with_admin', args)
  if (error) return { churchId: null, error: error.message }
  const rows = data as Array<{ church_id: string; run_id: string }> | null
  return { churchId: rows?.[0]?.church_id ?? null, error: null }
}
