// Source-reading tripwire (node env, no DOM): /auth/confirm/verify is the POST half of the
// token_hash sign-in flow — the only place the one-time token is spent. Three properties are
// load-bearing and none of them are visible from a green build:
//
//   1. POST only. Exporting a GET here would hand link prefetchers the very token burn the
//      interstitial exists to prevent (see tests/auth/confirm-interstitial.test.ts).
//   2. 303, not the NextResponse.redirect default of 307. A 307 preserves the method, so the
//      browser would re-POST the form body at /get-started (or the member's deep link) instead
//      of GETting it. See Other is what turns a form POST into a normal navigation.
//   3. The post-auth destination comes from the one shared guard. `next` arrives here as an
//      ABSOLUTE URL — Supabase renders {{ .RedirectTo }} — which resolveNext rejects outright,
//      hence resolveNextFromRedirectTo. Re-implementing the guard inline is how open redirects
//      get reintroduced.
//
// Comments are stripped so the prose above the code can neither satisfy nor break the assertions.
// Only WHOLE-LINE comments are stripped: a naive /\/\/.*$/ would also eat the `//` in `https://`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(
  path.join(ROOT, 'app', 'auth', 'confirm', 'verify', 'route.ts'),
  'utf8',
)
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const REDIRECTS = CODE.match(/NextResponse\.redirect\([^)]*\)/g) ?? []

describe('/auth/confirm/verify — method surface', () => {
  it('exports POST', () => {
    expect(CODE).toMatch(/export\s+async\s+function\s+POST\s*\(/)
  })

  it('exports no GET — a prefetchable GET would burn the token', () => {
    expect(CODE).not.toMatch(/export\s+(async\s+)?function\s+GET\s*\(/)
    expect(CODE).not.toMatch(/export\s+const\s+GET\b/)
  })

  it('reads the token from the form body, not the query string', () => {
    expect(CODE).toMatch(/formData\(\)/)
    expect(CODE, 'a token in the query string is a token in referrer logs').not.toMatch(
      /searchParams\.get\(\s*'token_hash'/,
    )
  })
})

describe('/auth/confirm/verify — verification', () => {
  it('verifies the emailed token_hash with its declared type', () => {
    expect(CODE).toMatch(/verifyOtp\s*\(/)
    expect(CODE).toContain('token_hash')
    expect(CODE).toContain('type')
  })

  it('uses the cookie-bound server client so the session lands on the response', () => {
    expect(CODE).toMatch(/from\s*'@\/lib\/supabase\/server'/)
  })
})

describe('/auth/confirm/verify — destination', () => {
  it('delegates the open-redirect guard to the shared absolute-URL resolver', () => {
    expect(CODE).toMatch(
      /import\s*\{[^}]*\bresolveNextFromRedirectTo\b[^}]*\}\s*from\s*'@\/lib\/auth\/resolve-next'/,
    )
    expect(CODE).toMatch(/resolveNextFromRedirectTo\s*\(/)
  })

  it('does not duplicate the guard inline', () => {
    expect(CODE, 'the startsWith guard belongs in lib/auth/resolve-next.ts').not.toMatch(
      /\.startsWith\(\s*'\/'/,
    )
  })

  it('mirrors the callback route x-forwarded-host branches', () => {
    expect(CODE).toContain('x-forwarded-host')
    expect(CODE).toContain('${origin}${next}')
    expect(CODE).toContain('${forwardedHost}${next}')
  })

  it('redirects on every branch — three successes, the failure, and the provenance rejection', () => {
    expect(REDIRECTS.length).toBe(5)
  })

  it('sends 303 on every redirect so the browser stops POSTing', () => {
    for (const call of REDIRECTS) {
      expect(call, `${call} must pass 303 — the 307 default would replay the POST`).toContain('303')
    }
    expect(CODE, 'a method-preserving redirect would re-POST the token at the destination').not.toMatch(
      /\b30[78]\b/,
    )
  })

  it('routes any failure to the existing sign-in error channel', () => {
    expect(CODE).toContain('/sign-in?error=auth')
  })
})

// Login CSRF. verifyOtp deliberately drops PKCE's browser binding — that is precisely what buys
// the cross-device sign-in this flow exists for — so nothing intrinsic stops an attacker
// auto-submitting their OWN token_hash from their OWN page and silently signing the visitor into
// the attacker's account, where the visitor's assessment answers then land.
//
// A cross-site urlencoded form POST is a CORS-simple request, so it is never preflighted away, and
// SameSite governs whether cookies are SENT, not whether a response may SET them. The old
// /auth/callback route was immune for free: PKCE needs the code_verifier cookie in the browser that
// requested the link. Next.js's automatic Origin/Host check covers Server Actions only, not Route
// Handlers, so this route has to state the check itself.
describe('/auth/confirm/verify — request provenance', () => {
  it('inspects the Origin header', () => {
    expect(CODE).toMatch(/headers\.get\(\s*'origin'\s*\)/)
  })

  it('compares Origin by host against the hosts it already trusts for the redirect', () => {
    expect(CODE, 'a substring/startsWith compare matches evil-360churchhealthassessment.com').toMatch(
      /new URL\(\s*originHeader\s*\)\.host/,
    )
    expect(CODE).toMatch(/\.has\(\s*originHost\s*\)/)
  })

  it('gates on provenance BEFORE spending the token', () => {
    const gate = CODE.search(/if\s*\(\s*!isSameOrigin\(request\)\s*\)/)
    const spend = CODE.search(/verifyOtp\s*\(/)
    expect(gate, 'the POST must reject a cross-origin caller').toBeGreaterThan(-1)
    expect(spend, 'a check after verifyOtp has already established the session').toBeGreaterThan(
      gate,
    )
  })

  it('treats an unparseable Origin as hostile rather than falling through', () => {
    expect(CODE).toMatch(/catch\s*\{\s*return false/)
  })
})
