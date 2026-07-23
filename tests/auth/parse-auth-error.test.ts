import { describe, expect, it } from 'vitest'
import { GENERIC_AUTH_ERROR, parseAuthError } from '@/lib/auth/parse-auth-error'

describe('parseAuthError', () => {
  it('returns null for a clean load (no error signal)', () => {
    expect(parseAuthError('', '')).toBeNull()
    expect(parseAuthError('?next=/get-started', '')).toBeNull()
    expect(parseAuthError('?email=a@b.com', '#')).toBeNull()
  })

  it('surfaces the Supabase reason verbatim from the URL fragment', () => {
    // This is the exact fragment a dead magic-link token lands on:
    // /auth/v1/verify redirects to the Site URL with the reason in the #hash.
    const hash =
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    expect(parseAuthError('', hash)).toBe('Email link is invalid or has expired')
  })

  it('decodes %20-encoded fragment descriptions too', () => {
    const hash = '#error=access_denied&error_description=Email%20link%20has%20expired'
    expect(parseAuthError('', hash)).toBe('Email link has expired')
  })

  it('falls back to a generic message when the fragment has an error but no description', () => {
    expect(parseAuthError('', '#error=server_error')).toBe(GENERIC_AUTH_ERROR)
    expect(parseAuthError('', '#error_code=otp_expired')).toBe(GENERIC_AUTH_ERROR)
  })

  it('surfaces a generic message for the callback reasonless ?error=auth signal', () => {
    // app/auth/callback/route.ts redirects here with ?error=auth when
    // exchangeCodeForSession fails — no reason travels with it.
    expect(parseAuthError('?error=auth', '')).toBe(GENERIC_AUTH_ERROR)
  })

  it('prefers the specific fragment reason over the generic ?error=auth', () => {
    const hash = '#error=access_denied&error_description=Email+link+is+invalid+or+has+expired'
    expect(parseAuthError('?error=auth', hash)).toBe('Email link is invalid or has expired')
  })

  it('ignores an unrelated ?error value', () => {
    expect(parseAuthError('?error=other', '')).toBeNull()
  })
})
