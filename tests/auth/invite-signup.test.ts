import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isInviteSignup } from '@/lib/auth/resolve-next'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const ENTRY = strip(fs.readFileSync(path.join(ROOT, 'components', 'auth', 'passwordless-entry.tsx'), 'utf8'))

/**
 * Which of the two first-time emails a new address receives.
 *
 * Supabase renders ONE "Confirm signup" template for every new account, and it was written as
 * the admin's onboarding welcome — add your church, invite your leaders, receive your diagnosis.
 * An invited leader does none of those things, so they were being handed a checklist that was
 * never theirs (Natalie, 2026-08-19).
 *
 * The signal is already in the URL and needs no new plumbing: the accept page sends a signed-out
 * invitee to `/sign-up?next=/accept/<token>&email=…` (app/accept/[token]/page.tsx). This reads
 * that `next` through the SAME open-redirect guard `resolveNext` uses, so the two can never
 * disagree about what counts as a path we honour.
 */
describe('isInviteSignup', () => {
  it('is true for the accept-invitation next the accept page sends', () => {
    expect(isInviteSignup('?next=%2Faccept%2Fabc123&email=leader%40church.org')).toBe(true)
  })

  it('is true regardless of param order or a missing email hint', () => {
    expect(isInviteSignup('?email=leader%40church.org&next=%2Faccept%2Fabc123')).toBe(true)
    expect(isInviteSignup('?next=%2Faccept%2Fabc123')).toBe(true)
  })

  it('is false for a first-time leader beginning their own assessment', () => {
    expect(isInviteSignup('')).toBe(false)
    expect(isInviteSignup('?next=%2Fget-started')).toBe(false)
    expect(isInviteSignup('?next=%2Fapp%2Fchurch-1%2Fdiagnosis')).toBe(false)
  })

  it('is false for a path that merely mentions accept elsewhere', () => {
    // Anchored at the start of the path, so `/app/x/accept-terms` is not an invitation.
    expect(isInviteSignup('?next=%2Fapp%2Fx%2Faccept-terms')).toBe(false)
    expect(isInviteSignup('?next=%2Facceptable-use')).toBe(false)
  })

  it('is false for anything the open-redirect guard rejects', () => {
    // A hostile next can only ever change which of two emails is sent, never a privilege — but
    // it reads the guarded path all the same, so the two resolvers cannot drift.
    expect(isInviteSignup('?next=https%3A%2F%2Fevil.com%2Faccept%2Fx')).toBe(false)
    expect(isInviteSignup('?next=%2F%2Fevil.com%2Faccept%2Fx')).toBe(false)
    expect(isInviteSignup('?next=%2F%5Cevil.com%2Faccept%2Fx')).toBe(false)
  })

  it('is false for the bare accept route with no token', () => {
    expect(isInviteSignup('?next=%2Faccept')).toBe(false)
  })
})

/**
 * Source-reading tripwire (node env, no DOM), the house idiom for this component — the OTP send
 * is a network call to Supabase, so what is assertable here is the shape of the request.
 */
describe('PasswordlessEntry forwards the invite flag to Supabase', () => {
  it('reads the flag through isInviteSignup, never by re-parsing next itself', () => {
    expect(ENTRY).toContain('isInviteSignup')
    expect(ENTRY).toContain("from '@/lib/auth/resolve-next'")
    // A second, hand-rolled '/accept/' check here would be a second definition of the rule.
    expect(ENTRY.split("'/accept/'").length - 1).toBe(0)
  })

  it('sends it as signInWithOtp options.data, which becomes user_metadata', () => {
    const otp = ENTRY.slice(ENTRY.indexOf('signInWithOtp'), ENTRY.indexOf('if (error) setError'))
    expect(otp).toContain('data:')
    expect(otp).toContain('invited')
    expect(otp).toContain('emailRedirectTo')
  })

  it('always sends the flag, so the template never reads a missing key', () => {
    // Explicit true AND false. The Confirm-signup template renders only at account creation, so
    // every account that can ever render it is created through this call — sending the key
    // unconditionally means `{{ .Data.invited }}` is never evaluated against absent metadata.
    const otp = ENTRY.slice(ENTRY.indexOf('signInWithOtp'), ENTRY.indexOf('if (error) setError'))
    expect(otp, 'a conditional spread would leave admins with no `invited` key at all').not.toMatch(
      /\.\.\.\(/,
    )
  })
})
