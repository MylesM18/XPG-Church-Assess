// The Supabase auth email templates are owner-pasted dashboard settings, so nothing at runtime
// exercises them and no build can catch a regression. These assertions are the only guard.
//
// What they pin:
//   • The sign-in link lives on OUR domain via the token_hash route, not on *.supabase.co. Both
//     the button and the "Use this link instead" fallback must carry it — the fallback is what a
//     reader clicks when the button fails to render, so a stale href there is a silent dead end.
//   • THREE copies exist (two .html files plus the copy inlined in the owner doc) and they must
//     stay identical. A drifted inline copy is worse than no copy: the owner pastes from the doc.
//   • The PR #70 invariants survive — the ~250-char signed URL is never printed as visible text,
//     and anchor color/text-decoration stay INLINE (iOS Mail and Outlook repaint links their own
//     blue/purple otherwise, which no palette test catches).
//
// The link shape is Supabase's own documented PKCE pattern, `{{ .SiteURL }}` base included: an
// href that STARTS with a template variable trips a known Go html/template sanitization bug that
// renders the whole link as `#ZgotmplZ`. `type=email` is the generic EmailOtpType that verifies
// both the Magic Link and the Confirm-signup token, so neither template has to guess.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const MAGIC_LINK = read('docs', 'owner', 'magic-link-template.html')
const CONFIRM_SIGNUP = read('docs', 'owner', 'confirm-signup-template.html')
const OWNER_DOC = read('docs', 'owner', 'email-auth-owner-setup-2026-08-06.md')
const INLINED = OWNER_DOC.match(/```html\n([\s\S]*?)\n```/)?.[1] ?? ''

/**
 * The two arms of the invited/admin conditionals, so an assertion about invitee copy can never be
 * satisfied by admin copy sitting elsewhere in the same file. Collects EVERY block — the template
 * branches in more than one place (preview text, heading, body) and a first-block-only slice
 * would silently assert against the preview line alone.
 */
const ARMS = /\{\{ if \.Data\.invited \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}/g
const armsOf = (html: string, group: 1 | 2) =>
  [...html.matchAll(ARMS)].map((m) => m[group]).join('\n')
const invitedArmOf = (html: string) => armsOf(html, 1)
const adminArmOf = (html: string) => armsOf(html, 2)

const CONFIRM_LINK =
  '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}'

const TEMPLATES: [string, string][] = [
  ['magic-link-template.html', MAGIC_LINK],
  ['confirm-signup-template.html', CONFIRM_SIGNUP],
]

describe('auth email templates — link points at our own domain', () => {
  it.each(TEMPLATES)('%s uses the token_hash confirm route', (_name, html) => {
    expect(html).toContain(`href="${CONFIRM_LINK}"`)
  })

  it.each(TEMPLATES)('%s swaps BOTH the button and the fallback anchor', (_name, html) => {
    const hrefs = html.match(/href="[^"]*\/auth\/confirm\?[^"]*"/g) ?? []
    expect(hrefs.length, 'the CTA button and the "Use this link instead" anchor').toBe(2)
  })

  it.each(TEMPLATES)('%s leaves no ConfirmationURL behind', (_name, html) => {
    expect(html, 'a leftover {{ .ConfirmationURL }} sends the member back to *.supabase.co').not.toContain(
      'ConfirmationURL',
    )
  })

  it.each(TEMPLATES)('%s still hyperlinks — never prints the URL as text', (_name, html) => {
    expect(html, 'the signed URL belongs in the href only, never in the reader’s face').not.toMatch(
      />[^<]*\{\{ \.SiteURL \}\}\/auth\/confirm/,
    )
  })

  it.each(TEMPLATES)('%s keeps anchor color and text-decoration inline', (_name, html) => {
    const anchors = html.match(/<a href="[^"]*"[^>]*>/g) ?? []
    expect(anchors.length).toBe(2)
    for (const anchor of anchors) {
      expect(anchor, 'iOS Mail and Outlook repaint links without an inline color').toMatch(/color:#/)
      expect(anchor).toMatch(/text-decoration:/)
    }
  })
})

describe('auth email templates — the three copies stay in sync', () => {
  it('the owner doc inlines the magic-link template verbatim', () => {
    expect(INLINED, 'no ```html block found in the owner doc').not.toBe('')
    expect(INLINED.trim(), 'the owner pastes from the doc — a drifted copy ships the drift').toBe(
      MAGIC_LINK.trim(),
    )
  })

  it('both templates carry the identical link string', () => {
    const linkOf = (html: string) => (html.match(/href="([^"]*\/auth\/confirm\?[^"]*)"/) ?? [])[1]
    expect(linkOf(MAGIC_LINK)).toBe(linkOf(CONFIRM_SIGNUP))
  })
})

/**
 * Natalie, 2026-08-19, on the live invite flow: an invited member or co-admin confirming their
 * account received the ADMIN's onboarding email — "add your church", "invite the leader who knows
 * each area best", "receive your diagnosis" — steps an invitee never performs.
 *
 * Supabase renders exactly one "Confirm signup" template per new account, so the split has to
 * live INSIDE it, as a Go conditional on `{{ .Data.invited }}` (auth.users.raw_user_meta_data,
 * set by PasswordlessEntry's signInWithOtp options.data). Both Supabase's own docs and its
 * customizing-emails-by-language guide sanction this pattern.
 */
describe('confirm-signup template — invited leader vs. first-time admin', () => {
  const INVITED_OPEN = '{{ if .Data.invited }}'

  it('branches on the invited flag, with an else arm for the admin', () => {
    expect(CONFIRM_SIGNUP).toContain(INVITED_OPEN)
    expect(CONFIRM_SIGNUP).toContain('{{ else }}')
    expect(CONFIRM_SIGNUP).toContain('{{ end }}')
    // Every conditional is a complete if/else/end triple — a stray `{{ if }}` with no `{{ else }}`
    // would slice into the wrong arm above and quietly weaken every assertion in this block.
    expect([...CONFIRM_SIGNUP.matchAll(ARMS)].length).toBe(
      (CONFIRM_SIGNUP.match(/\{\{ if /g) ?? []).length,
    )
    // Balanced: every opener closed, so a half-edited template fails here, not in an inbox.
    expect((CONFIRM_SIGNUP.match(/\{\{ if /g) ?? []).length).toBe(
      (CONFIRM_SIGNUP.match(/\{\{ end \}\}/g) ?? []).length,
    )
  })

  it('never asks an invited leader to do the admin-only steps', () => {
    const invited = invitedArmOf(CONFIRM_SIGNUP)
    // Non-vacuity: three .not assertions over an empty string all pass, so prove there IS copy.
    expect(invited.length).toBeGreaterThan(400)
    expect(invited, 'the invitee has no church to add').not.toMatch(/Add your church/i)
    expect(invited, 'the invitee invites nobody').not.toMatch(/invite the leader/i)
    expect(invited, 'the diagnosis goes to the church admin').not.toMatch(/Receive your diagnosis/i)
  })

  it('tells an invited leader what they will actually do', () => {
    const invited = invitedArmOf(CONFIRM_SIGNUP)
    expect(invited).toMatch(/invited/i)
    expect(invited, 'answering is the whole of their task').toMatch(/answer/i)
    expect(invited, 'the one promise the code actually guarantees').toMatch(/without your name/i)
  })

  /**
   * A consent statement, read at the moment someone decides how candidly to write. Since
   * `79a9adb` the private report prints every written reflection VERBATIM at any respondent
   * count (lib/report/fallback-sections.ts s8Bullets) — so the invited arm may promise that no
   * NAME is attached, which the code enforces, and must not promise that answers are summarised
   * into a pattern, which they are not.
   */
  it('never tells an invited leader their words are aggregated away', () => {
    const invited = invitedArmOf(CONFIRM_SIGNUP)
    expect(invited).not.toMatch(/pattern across/i)
    expect(invited).not.toMatch(/not who said what/i)
    expect(invited, 'say plainly that what they write is shared as written').toMatch(/as you wrote it/i)
  })

  it('keeps the admin arm exactly as Natalie approved it', () => {
    const admin = adminArmOf(CONFIRM_SIGNUP)
    expect(admin).toContain('Add your church')
    expect(admin).toContain('Receive your diagnosis')
    // The stray-invitee catch line belongs ONLY here: an invitee who ignores the accept link and
    // hits BEGIN instead lands in this arm. It must NOT claim the link carries them to the
    // invitation — a bare /sign-up sets emailRedirectTo to /get-started, which renders "Add your
    // church". It tells them to reopen the invitation email instead, which does work.
    expect(admin).toMatch(/Invited by a leader/i)
    expect(admin).not.toMatch(/takes you straight to their invitation/i)
    expect(admin).toMatch(/reopen their invitation email/i)
  })

  it('shares one CTA and one fallback anchor across both arms', () => {
    // The link invariants above count exactly two anchors per template. Branching the PROSE and
    // sharing the buttons is what keeps that true — and keeps one link to get right, not two.
    const anchors = CONFIRM_SIGNUP.match(/<a href=/g) ?? []
    expect(anchors.length).toBe(2)
    for (const arm of [invitedArmOf(CONFIRM_SIGNUP), adminArmOf(CONFIRM_SIGNUP)]) {
      expect(arm.length, 'an empty arm satisfies the check below vacuously').toBeGreaterThan(400)
      expect(arm, 'the shared CTA lives outside both arms').not.toContain('<a href=')
    }
  })
})

describe('auth email templates — first-time vs. returning copy', () => {
  // Confirm signup fires for a NEW address (a leader beginning the assessment, or a first-time
  // invitee), so it is the onboarding welcome: overview + "What happens next" steps. Magic Link
  // fires for a returning address and stays the plain sign-in email.
  it('confirm-signup is the first-time onboarding welcome', () => {
    expect(CONFIRM_SIGNUP).toContain('let&rsquo;s begin')
    expect(CONFIRM_SIGNUP).toContain('What happens next')
    expect(CONFIRM_SIGNUP).toContain('Confirm and begin')
    expect(CONFIRM_SIGNUP).not.toContain('Confirm your email address to finish setting up')
  })

  it('magic-link stays the returning sign-in email', () => {
    expect(MAGIC_LINK).toContain('Your sign-in link')
    expect(MAGIC_LINK).toContain('Sign in to your assessment')
  })
})

describe('owner setup doc — the invited/admin split is actionable', () => {
  // Nothing in this repo can make the change live: the template is a dashboard setting. The doc
  // is the only instrument, so it has to say what changed, that a re-paste is required, and how
  // to prove both arms before trusting it.
  // Scoped to the section this change adds, so a pre-existing "re-paste" note elsewhere in the
  // doc cannot satisfy these — the 2026-08-18 update already carried one.
  const SECTION = OWNER_DOC.slice(OWNER_DOC.indexOf('#### B1a.'), OWNER_DOC.indexOf('### B2.'))

  it('carries a section of its own, so the change is not a footnote', () => {
    expect(OWNER_DOC, 'no B1a section found').toContain('#### B1a.')
    expect(SECTION.length).toBeGreaterThan(400)
  })

  it('names the mechanism, so the next reader does not "tidy" the conditional away', () => {
    expect(SECTION).toContain('{{ if .Data.invited }}')
    expect(SECTION).toMatch(/user_metadata|raw_user_meta_data/)
  })

  it('states that the template must be re-pasted for any of this to reach an inbox', () => {
    expect(SECTION).toMatch(/re-paste/i)
  })

  it('says how to verify BOTH arms, not just that it was pasted', () => {
    // Anchored on the ACTION, not the word "invited" — that appears in the mechanism code fence
    // above and would satisfy a section containing no verification prose at all.
    expect(SECTION, 'the invited arm needs a real invitation to prove').toContain('Sign in to accept')
    expect(SECTION, 'and the admin arm a fresh address of your own').toMatch(/new address|fresh address|your own address/i)
  })
})

describe('owner setup doc — prose matches the shipped flow', () => {
  it('no longer tells the owner to preserve {{ .ConfirmationURL }}', () => {
    expect(OWNER_DOC, 'B1 prose, the inlined template, and the checklist all said this').not.toContain(
      'ConfirmationURL',
    )
  })

  it('documents the confirm route the emailed link now hits', () => {
    expect(OWNER_DOC).toContain('/auth/confirm')
  })

  it('no longer files the prefetch caveat as unfixed and out of scope', () => {
    expect(OWNER_DOC).not.toContain('out of scope for this branding task')
    expect(OWNER_DOC).not.toContain('A durable\nfix — if ever pursued —')
  })

  it('still documents /auth/callback, which Google OAuth continues to use', () => {
    expect(OWNER_DOC, 'the OAuth allow-list entry and the Google console fields depend on it').toContain(
      '/auth/callback',
    )
  })
})
