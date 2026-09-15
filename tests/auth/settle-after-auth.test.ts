// Source-reading tripwire (node env, no DOM): every way a session begins must settle the
// signed-in person's invitations (settle_my_invitations) so that an invitee who arrives by ANY
// path — emailed magic link, Google, the homepage button, or a direct visit — is marked as
// joined and routed to the church they were invited to, never to "Add your church".
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) =>
  fs
    .readFileSync(path.join(ROOT, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const CALLBACK = read('app', 'auth', 'callback', 'route.ts')
const VERIFY = read('app', 'auth', 'confirm', 'verify', 'route.ts')
const GET_STARTED = read('app', 'get-started', 'page.tsx')
const IMPORT = /from\s*'@\/lib\/auth\/invited-account'/

describe('OAuth callback', () => {
  it('settles after the code exchange succeeds and before redirecting', () => {
    expect(CALLBACK).toMatch(IMPORT)
    const exchange = CALLBACK.indexOf('exchangeCodeForSession(')
    const settle = CALLBACK.indexOf('settleInvitations(')
    expect(settle).toBeGreaterThan(exchange)
  })
})

describe('token_hash verify route', () => {
  it('settles after verifyOtp succeeds', () => {
    expect(VERIFY).toMatch(IMPORT)
    const spend = VERIFY.indexOf('verifyOtp(')
    const settle = VERIFY.indexOf('settleInvitations(')
    expect(settle).toBeGreaterThan(spend)
  })

  it('delegates request provenance to the shared helper', () => {
    expect(VERIFY).toMatch(/from\s*'@\/lib\/auth\/same-origin'/)
    expect(VERIFY).not.toMatch(/function\s+isSameOrigin\s*\(/)
  })
})

describe('/get-started', () => {
  it('settles before deciding whether the visitor has a church', () => {
    expect(GET_STARTED).toMatch(IMPORT)
    const settle = GET_STARTED.indexOf('settleInvitations(')
    const membership = GET_STARTED.indexOf("from('church_members')")
    expect(settle).toBeGreaterThan(-1)
    expect(settle).toBeLessThan(membership)
  })
})
