import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server client bound to the request's cookies. Uses the ANON key, so every
// query is enforced by Postgres RLS. `cookies()` is async in Next 16 — await it.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Safe to ignore — middleware.ts refreshes the session.
          }
        },
      },
    },
  )
}
