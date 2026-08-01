import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for trusted server jobs (the reminder cron) that must bypass RLS to
 * read across all churches. Returns null when SUPABASE_SERVICE_ROLE_KEY (or the URL) is unset, so
 * callers can degrade to a no-op instead of throwing. Never import this from anything reachable by a
 * browser or an authenticated request path.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
