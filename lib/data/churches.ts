import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

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
