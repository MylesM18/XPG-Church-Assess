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

/**
 * The church's full profile row — everything the settings form edits and the report's
 * facts pack calibrates with (spec locked decision 6). One seam function owns the column
 * list so the form, the server action, and plan 3's report wiring can never drift on
 * which fields exist (ADR 0002).
 */
export interface ChurchProfile {
  id: string
  name: string
  denomination: string | null
  context: string | null
  attendance_band: string | null
  adults_band: string | null
  staff_fte_band: string | null
  budget_band: string | null
  church_age_band: string | null
  growth_trajectory: string | null
  campuses_band: string | null
  facility_status: string | null
  leadership_history: string | null
  consultant_notes: string | null
}

export type ChurchProfileUpdate = Partial<Omit<ChurchProfile, 'id' | 'name'>>

const PROFILE_COLUMNS =
  'id, name, denomination, context, attendance_band, adults_band, staff_fte_band, ' +
  'budget_band, church_age_band, growth_trajectory, campuses_band, facility_status, ' +
  'leadership_history, consultant_notes'

/**
 * Full profile for the settings form's initial values (and plan 3's facts pack).
 * Null when RLS hides the church from the caller; unexpected errors throw rather than
 * masquerade as not-found — the same posture loadChurchForMember takes.
 */
export async function loadChurchProfile(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<ChurchProfile | null> {
  const { data, error } = await supabase
    .from('churches')
    .select(PROFILE_COLUMNS)
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  return (data as ChurchProfile | null) ?? null
}

/**
 * Direct UPDATE under the existing churches_update RLS policy (admin-only USING +
 * WITH CHECK, 20260715000400) — deliberately no new RPC (spec "Settings surface").
 * NOTE: RLS filtering means a non-admin's update matches zero rows and returns NO
 * error — callers must verify the admin role first (the settings action does).
 */
export async function updateChurchProfile(
  supabase: SupabaseServerClient,
  churchId: string,
  fields: ChurchProfileUpdate,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('churches').update(fields).eq('id', churchId)
  return { error: error?.message ?? null }
}
