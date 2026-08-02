import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * The earliest invitation timestamp for a church (the invite-window anchor), or null when none have
 * been sent. Reads through the anon-key RLS client — admins may select member_invitations for their
 * church (the access page already relies on this). The RPC guard remains the authoritative wall.
 */
export async function earliestInviteAt(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('member_invitations')
    .select('created_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.created_at as string | null) ?? null
}
