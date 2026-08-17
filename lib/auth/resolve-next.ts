/**
 * Resolve a post-auth redirect target from a URL query string's `next` param,
 * guarding against open redirects.
 *
 * Only same-origin *relative* paths are honoured. Anything that a browser could
 * treat as an absolute or protocol-relative destination — `https://evil.com`,
 * `//evil.com`, `/\evil.com` — falls back to `fallback`, as does a missing
 * param. Mirrors the relative-only guard in `app/auth/callback/route.ts`, which
 * ultimately consumes this value as `${origin}${next}`.
 */
export function resolveNext(search: string, fallback = '/get-started'): string {
  return guardPath(new URLSearchParams(search).get('next'), fallback)
}

/**
 * The one open-redirect guard. Both resolvers delegate here so there is a single
 * definition of "a path we are willing to append to our own origin".
 */
function guardPath(raw: string | null, fallback: string): string {
  if (
    raw &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\')
  ) {
    return raw
  }
  return fallback
}

/**
 * Same guard, for a `next` that arrives as an **absolute** URL.
 *
 * The token_hash sign-in link (`app/auth/confirm`) is built by Supabase's email
 * template, where the destination can only be expressed as `{{ .RedirectTo }}` — the
 * rendered `emailRedirectTo`, which is always absolute. `resolveNext` rejects absolute
 * values outright, so using it there would send every emailed sign-in to the fallback.
 *
 * The host is **discarded**, never honoured: `https://evil.com/x` reduces to `/x`, which
 * the caller then appends to our own origin. So a hostile `next` can at worst pick a path
 * on our site, which is the same power a relative `next` already has.
 *
 * A bare origin (no path) resolves to `fallback`, not `/`. Supabase silently substitutes
 * the Site URL for a redirect_to that misses the allow-list, and `/` would strand a
 * signed-in member on the marketing page — the case `/get-started` exists to prevent.
 */
export function resolveNextFromRedirectTo(search: string, fallback = '/get-started'): string {
  const raw = new URLSearchParams(search).get('next')
  if (!raw) return fallback

  if (/^https?:\/\//i.test(raw)) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return fallback
    }
    const path = `${url.pathname}${url.search}${url.hash}`
    return path === '/' ? fallback : guardPath(path, fallback)
  }

  return guardPath(raw, fallback)
}
