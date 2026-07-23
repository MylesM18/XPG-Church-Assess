/**
 * Derive a human-readable sign-in error from the URL a failed magic-link / OAuth
 * round-trip lands on, so the sign-in page can say WHY it failed instead of
 * bouncing silently.
 *
 * The failure arrives on one of two independent channels, and this reads both:
 *
 *  - The URL **fragment** (`hash`): when Supabase's `/auth/v1/verify` rejects a
 *    token as invalid/expired it redirects to the Site URL with the reason in the
 *    fragment — `#error=access_denied&error_code=otp_expired&error_description=…`.
 *    The fragment never travels to the server, so only the client can recover it.
 *    This is the channel the production magic-link bug actually surfaces on.
 *
 *  - The **query string** (`search`): our own `app/auth/callback/route.ts`
 *    redirects here with `?error=auth` when `exchangeCodeForSession` fails. No
 *    reason rides along, so it maps to a generic message.
 *
 * Returns `null` when neither channel signals an error (the ordinary case) — the
 * caller leaves its error region empty.
 *
 * Mirrors the pure, client-agnostic style of `resolveNext` so it is unit-testable
 * under the repo's node-env vitest harness without a DOM.
 */
export const GENERIC_AUTH_ERROR =
  'Your sign-in link was invalid or has expired. Request a new link below.'

export function parseAuthError(search: string, hash: string): string | null {
  // Fragment first — it carries the specific Supabase reason when present.
  // URLSearchParams decodes both `+` and `%20` to spaces, matching how Supabase
  // encodes `error_description`.
  const frag = new URLSearchParams(hash.replace(/^#/, ''))
  const description = frag.get('error_description')
  if (description) return description
  if (frag.get('error') || frag.get('error_code')) return GENERIC_AUTH_ERROR

  // Our callback's reasonless failure signal.
  if (new URLSearchParams(search).get('error') === 'auth') return GENERIC_AUTH_ERROR

  return null
}
