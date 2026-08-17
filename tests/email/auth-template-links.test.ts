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
