import { describe, expect, it } from 'vitest'
import { resolveNext, resolveNextFromRedirectTo } from '@/lib/auth/resolve-next'

describe('resolveNext', () => {
  it('returns the default fallback when no next param is present', () => {
    expect(resolveNext('')).toBe('/get-started')
    expect(resolveNext('?foo=bar')).toBe('/get-started')
  })

  it('returns a valid same-origin relative path', () => {
    expect(resolveNext('?next=/app/abc/answer/1')).toBe('/app/abc/answer/1')
    expect(resolveNext('?next=/app/abc')).toBe('/app/abc')
    expect(resolveNext('?next=/')).toBe('/')
  })

  it('rejects protocol-relative URLs (open-redirect guard)', () => {
    expect(resolveNext('?next=//evil.com')).toBe('/get-started')
    expect(resolveNext('?next=/\\evil.com')).toBe('/get-started')
  })

  it('rejects absolute URLs (open-redirect guard)', () => {
    expect(resolveNext('?next=https://evil.com')).toBe('/get-started')
    expect(resolveNext('?next=http://evil.com/app')).toBe('/get-started')
  })

  it('honours a custom fallback', () => {
    expect(resolveNext('', '/home')).toBe('/home')
    expect(resolveNext('?next=//evil.com', '/home')).toBe('/home')
  })
})

// The token_hash confirm route reads its `next` out of the Supabase template's
// `{{ .RedirectTo }}`, which renders the ABSOLUTE `emailRedirectTo` URL rather than a
// relative path — so plain resolveNext would reject every real destination and dump
// every emailed sign-in on /get-started. This variant reduces an absolute URL to its
// path before applying the very same guard.
describe('resolveNextFromRedirectTo', () => {
  it('reduces an absolute same-origin URL to its path', () => {
    expect(
      resolveNextFromRedirectTo(
        '?next=https://www.360churchhealthassessment.com/accept-invitation/abc',
      ),
    ).toBe('/accept-invitation/abc')
  })

  it('keeps the query string of an absolute destination', () => {
    expect(
      resolveNextFromRedirectTo('?next=https://www.360churchhealthassessment.com/app/x?tab=2'),
    ).toBe('/app/x?tab=2')
  })

  it('still accepts a plain relative path', () => {
    expect(resolveNextFromRedirectTo('?next=/app/abc/answer/1')).toBe('/app/abc/answer/1')
  })

  it('discards the host of a foreign absolute URL rather than honouring it', () => {
    // Not merely "rejected": the host is dropped entirely, so the worst an attacker-supplied
    // next can do is choose a path on OUR origin. The caller redirects to `${origin}${next}`.
    expect(resolveNextFromRedirectTo('?next=https://evil.com/app/abc')).toBe('/app/abc')
  })

  it('rejects protocol-relative and backslash forms', () => {
    expect(resolveNextFromRedirectTo('?next=//evil.com')).toBe('/get-started')
    expect(resolveNextFromRedirectTo('?next=/\\evil.com')).toBe('/get-started')
  })

  it('falls back when no next param is present', () => {
    expect(resolveNextFromRedirectTo('')).toBe('/get-started')
    expect(resolveNextFromRedirectTo('?foo=bar')).toBe('/get-started')
  })

  it('treats a bare origin as no destination, not as the marketing home page', () => {
    // Supabase silently swaps a non-allow-listed redirect_to for the Site URL, so
    // `{{ .RedirectTo }}` can arrive as the bare origin. Reducing that to '/' would strand a
    // freshly signed-in member on the landing page — the exact failure the callback route's
    // '/get-started' fallback exists to prevent.
    expect(resolveNextFromRedirectTo('?next=https://www.360churchhealthassessment.com')).toBe(
      '/get-started',
    )
    expect(resolveNextFromRedirectTo('?next=https://www.360churchhealthassessment.com/')).toBe(
      '/get-started',
    )
  })

  it('honours a custom fallback', () => {
    expect(resolveNextFromRedirectTo('?next=//evil.com', '/home')).toBe('/home')
  })
})
