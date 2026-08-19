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
 * True when this entry-page visit is a leader accepting an invitation rather than a leader
 * beginning their own assessment.
 *
 * WHY IT LIVES HERE: it reads the same `next` param through the same `guardPath`, so "a path we
 * honour" has one definition. A `next` the guard rejects is not an invitation.
 *
 * WHAT IT DECIDES: which of the two first-time emails Supabase renders. Supabase has exactly ONE
 * "Confirm signup" template for every new account, and it was written as the admin's onboarding
 * welcome — add your church, invite your leaders, receive your diagnosis. An invited leader does
 * none of those, so they were handed a checklist that was never theirs. The caller forwards this
 * as `signInWithOtp`'s `options.data`, which becomes `auth.users.raw_user_meta_data`, which the
 * template reads as `{{ .Data.invited }}` (docs/owner/confirm-signup-template.html).
 *
 * It carries NO privilege: the invitation itself is still gated server-side by the accept RPC on
 * the exact signed-in address. The worst a forged `next` achieves is the other email's copy.
 */
export function isInviteSignup(search: string, fallback = '/get-started'): boolean {
  const next = resolveNext(search, fallback)
  // Anchored on the route with a token after it: `/accept/<token>`. A bare `/accept`, or an
  // unrelated path that merely starts with the word (`/acceptable-use`), is not an invitation.
  return next.startsWith('/accept/') && next.length > '/accept/'.length
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
