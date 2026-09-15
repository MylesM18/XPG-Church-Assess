import { describe, expect, it } from 'vitest'
import { isSameOrigin } from '@/lib/auth/same-origin'

// The compensating control for verifying a token_hash without PKCE (PR #71): a cross-site form
// POST is CORS-simple and never preflighted, so the only thing standing between an attacker's
// auto-submitting page and a login-CSRF is this host comparison. Shared by /auth/confirm/verify
// and /accept/[token]/continue — both spend a sign-in token on a POST.
function req(headers: Record<string, string>, url = 'https://www.360churchhealthassessment.com/x') {
  return new Request(url, { method: 'POST', headers })
}

describe('isSameOrigin', () => {
  it('accepts a form POST whose Origin matches the request host', () => {
    expect(isSameOrigin(req({ origin: 'https://www.360churchhealthassessment.com' }))).toBe(true)
  })

  it('accepts an Origin matching x-forwarded-host behind the load balancer', () => {
    const r = req(
      { origin: 'https://www.360churchhealthassessment.com', 'x-forwarded-host': 'www.360churchhealthassessment.com' },
      'https://internal-host/x',
    )
    expect(isSameOrigin(r)).toBe(true)
  })

  it('rejects a foreign Origin, including a look-alike host', () => {
    expect(isSameOrigin(req({ origin: 'https://evil.com' }))).toBe(false)
    expect(isSameOrigin(req({ origin: 'https://evil-360churchhealthassessment.com' }))).toBe(false)
    expect(isSameOrigin(req({ origin: 'https://www.360churchhealthassessment.com.evil.com' }))).toBe(false)
  })

  it('treats an unparseable Origin as hostile', () => {
    expect(isSameOrigin(req({ origin: 'not a url' }))).toBe(false)
  })

  it('without an Origin, only positive cross-site evidence rejects', () => {
    expect(isSameOrigin(req({}))).toBe(true)
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(isSameOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })
})
