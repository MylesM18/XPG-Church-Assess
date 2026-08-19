import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isInvitePath, isInviteSignup } from '@/lib/auth/resolve-next'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const ENTRY = strip(fs.readFileSync(path.join(ROOT, 'components', 'auth', 'passwordless-entry.tsx'), 'utf8'))
const ACCEPT = strip(fs.readFileSync(path.join(ROOT, 'app', 'accept', '[token]', 'page.tsx'), 'utf8'))

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
describe('isInvitePath — the same rule over an already-resolved path', () => {
  it('agrees with isInviteSignup on every case above', () => {
    expect(isInvitePath('/accept/abc123')).toBe(true)
    expect(isInvitePath('/accept')).toBe(false)
    expect(isInvitePath('/acceptable-use')).toBe(false)
    expect(isInvitePath('/get-started')).toBe(false)
  })

  it('takes no fallback parameter that could turn a bare visit into an invitation', () => {
    // isInviteSignup('', '/accept/x') used to return true, which would have flipped every admin
    // onto the invitee email from one careless call site.
    expect(isInviteSignup.length, 'search only — no second parameter').toBe(1)
  })
})

describe('PasswordlessEntry forwards the invite flag to Supabase', () => {
  it('reads the flag through the shared helper, never by re-parsing next itself', () => {
    expect(ENTRY).toContain('isInvitePath')
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
    // Pins the VALUE EXPRESSION, not the absence of one spelling of one mistake. Both of these
    // mutations passed the earlier version of this test:
    //   data: isInvitePath(nextPath()) ? { invited: true } : {}   ← admins get no key at all
    //   data: { invited: !isInvitePath(nextPath()) }              ← polarity inverted
    const otp = ENTRY.slice(ENTRY.indexOf('signInWithOtp'), ENTRY.indexOf('if (error) setError'))
    expect(otp).toMatch(/data:\s*\{\s*invited:\s*isInvitePath\(nextPath\(\)\)\s*,?\s*\}/)
    expect(otp, 'a conditional would leave one audience with no `invited` key').not.toMatch(/\?/)
    expect(otp, 'a hardcoded flag sends every account down one arm').not.toMatch(
      /invited:\s*(true|false)\b/,
    )
    expect(otp, 'a negation sends every audience the other audience’s email').not.toMatch(
      /invited:\s*!/,
    )
  })

  it('derives the flag from the SAME path the email redirect is built from', () => {
    // nextPath() feeds magicLinkRedirectTo(). Reading it for the flag too is what stops the email
    // copy disagreeing with where the emailed link actually lands.
    expect(ENTRY).toMatch(/emailRedirectTo:\s*magicLinkRedirectTo\(\)/)
    expect(ENTRY).toContain('isInvitePath(nextPath())')
  })
})

describe('the accept page carries next= on EVERY auth link', () => {
  /**
   * The flag is only as good as the `next` that feeds it. The signed-out "Sign in to accept"
   * link always carried it; the wrong_email branch's "Go to sign in" link did not — so a leader
   * who was signed in as the wrong address, then signed in with the right (brand-new) one, was
   * still handed the admin's onboarding email, and landed on /get-started instead of back on the
   * invitation.
   */
  it('sends the wrong-email branch back to this invitation after signing in', () => {
    const bare = ACCEPT.match(/href="\/sign-in"/g) ?? []
    expect(bare, 'a bare /sign-in loses both the invitation and the invited email').toEqual([])
    expect(ACCEPT).toContain('/sign-in?next=')
  })

  it('still sends the signed-out branch to /sign-up with next and the email hint', () => {
    expect(ACCEPT).toContain('/sign-up?next=')
    expect(ACCEPT).toContain('email=')
  })
})
