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
  const raw = new URLSearchParams(search).get('next')
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
