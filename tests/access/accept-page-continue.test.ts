// Source-reading tripwire (node env, no DOM): the signed-out branch of /accept/[token] is now a
// one-click sign-in — an inert interstitial that POSTs to /accept/[token]/continue — with the
// pre-existing "Sign in to accept" link kept as the fallback. Two hazards this pins:
//   - the interstitial must not auto-submit when it was just bounced back with ?error=, or a
//     failing continue route would loop forever;
//   - without a service-role key the page must fall back rather than render a form that fails.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'accept', '[token]', 'page.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('accept page — one-click sign-in', () => {
  it('posts to the continue route and auto-submits', () => {
    expect(CODE).toContain('/continue')
    expect(CODE).toMatch(/method="post"/)
    expect(CODE).toContain('AutoSubmit')
  })

  it('reads the bounce-back error and does not auto-submit with one present', () => {
    expect(CODE).toContain('searchParams')
    expect(CODE).toMatch(/const autoSubmitting = oneClick && !continueError/)
    expect(CODE).toMatch(/autoSubmitting && <AutoSubmit/)
    expect((CODE.match(/<AutoSubmit\b/g) ?? []).length, 'exactly one mount, behind that guard').toBe(1)
  })

  it('falls back to the emailed sign-in when the service role is unavailable', () => {
    expect(CODE).toMatch(/from\s*'@\/lib\/supabase\/service-role'/)
    expect(CODE).toContain('/sign-up?next=')
  })

  it('offers the same one-click sign-in to a returning invitee (the link lives for 14 days)', () => {
    expect(CODE).toContain('resolveAcceptedEntry(')
    const accepted = CODE.indexOf("state === 'accepted'")
    const expired = CODE.indexOf("state === 'expired'")
    const branch = CODE.slice(accepted, expired)
    expect(branch).toContain('<ContinueInterstitial')
    expect(branch, 'a dead link falls back to the ordinary sign-in, never a dead end').toContain('/sign-in?email=')
  })

  it('keeps the accept RPC behind every auth guard (auto-accept ordering is unchanged)', () => {
    const signIn = CODE.indexOf("state === 'sign_in'")
    const wrong = CODE.indexOf("state === 'wrong_email'")
    const accept = CODE.indexOf('accept_member_invitation')
    expect(signIn).toBeLessThan(accept)
    expect(wrong).toBeLessThan(accept)
  })
})
