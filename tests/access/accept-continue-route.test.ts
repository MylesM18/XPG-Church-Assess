// Source-reading tripwire (node env, no DOM): /accept/[token]/continue is the POST half of the
// invitation's one-click sign-in. It mints a sign-in token for the invited address server-side
// and spends it in the invitee's own browser session, so three properties are load-bearing:
//
//   1. POST only, gated on request provenance BEFORE anything is minted (login-CSRF).
//   2. The invitation is validated (pending, unexpired) through the service-role client — the
//      row is default-deny under RLS and the visitor has no session yet.
//   3. 303 on every redirect, success landing inside /app/, and settle_my_invitations runs after
//      the session exists so the roster and the completion clock update.
//
// Only WHOLE-LINE comments are stripped: a naive /\/\/.*$/ would also eat the `//` in `https://`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(
  path.join(ROOT, 'app', 'accept', '[token]', 'continue', 'route.ts'),
  'utf8',
)
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const REDIRECTS = CODE.match(/NextResponse\.redirect\([^)]*\)/g) ?? []

describe('/accept/[token]/continue — method surface', () => {
  it('exports POST and no GET', () => {
    expect(CODE).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    expect(CODE).not.toMatch(/export\s+(async\s+)?function\s+GET\s*\(/)
    expect(CODE).not.toMatch(/export\s+const\s+GET\b/)
  })

  it('gates on the shared provenance check before minting or verifying', () => {
    expect(CODE).toMatch(/from\s*'@\/lib\/auth\/same-origin'/)
    const gate = CODE.search(/if\s*\(\s*!isSameOrigin\(request\)\s*\)/)
    const mint = CODE.indexOf('mintSignInToken(')
    const spend = CODE.indexOf('verifyOtp(')
    expect(gate).toBeGreaterThan(-1)
    expect(mint).toBeGreaterThan(gate)
    expect(spend).toBeGreaterThan(mint)
  })
})

describe('/accept/[token]/continue — invitation gate', () => {
  it('reads the invitation through the service-role client', () => {
    expect(CODE).toMatch(/from\s*'@\/lib\/supabase\/service-role'/)
    expect(CODE).toContain("from('member_invitations')")
  })

  it('refuses anything but a pending, unexpired invitation before minting', () => {
    const pending = CODE.indexOf("'pending'")
    const expires = CODE.indexOf('expires_at')
    const mint = CODE.indexOf('mintSignInToken(')
    expect(pending).toBeGreaterThan(-1)
    expect(expires).toBeGreaterThan(-1)
    expect(pending).toBeLessThan(mint)
    expect(expires).toBeLessThan(mint)
  })
})

describe('/accept/[token]/continue — session + destination', () => {
  it('spends the minted token with the cookie-bound client and its reported type', () => {
    expect(CODE).toMatch(/from\s*'@\/lib\/supabase\/server'/)
    expect(CODE).toContain('token_hash')
    expect(CODE).toMatch(/verifyOtp\s*\(\s*\{[^}]*type/)
  })

  it('settles invitations only after the session exists', () => {
    const spend = CODE.indexOf('verifyOtp(')
    const settle = CODE.indexOf('settleInvitations(')
    expect(settle).toBeGreaterThan(spend)
  })

  it('lands the invitee inside their church and never on a church-creation page', () => {
    expect(CODE).toContain('/app/${')
    expect(CODE).not.toContain('/get-started')
  })

  it('sends 303 on every redirect so the browser stops POSTing', () => {
    expect(REDIRECTS.length, 'bounce helper, provenance rejection, success').toBeGreaterThanOrEqual(3)
    for (const call of REDIRECTS) expect(call, `${call} must pass 303`).toContain('303')
  })

  it('returns a failure to the accept page with a reason rather than dead-ending', () => {
    expect(CODE).toMatch(/\/accept\/\$\{[^}]+\}/)
    expect(CODE).toContain('?error=${reason}')
  })
})
