// Source-reading tripwire (node env, no DOM): the /accept/[token] page auto-accepts on arrival so an
// invited member goes from the emailed link straight into their assessment, with no interstitial
// "Accept invitation" click.
//
// The SECURITY-RELEVANT property this file guards is ORDERING: the accept RPC must sit behind every
// gate in resolveAcceptState — in particular the signed-out (`sign_in`) and email-mismatch
// (`wrong_email`) branches must both be evaluated BEFORE the mutation is reachable. That ordering is
// what makes the page safe against email-client link prefetch: Gmail and friends fetch the URL with
// no session cookie, resolve to `sign_in`, and return before touching the RPC. If someone later
// hoists the accept call above those guards, an unauthenticated prefetch would start attempting
// mutations — these assertions fail loudly if that happens.
//
// The authoritative gate is still server-side (accept_member_invitation is security definer and
// re-checks auth, pending status, expiry and email), so this page-level ordering is defence in
// depth rather than the only guard. resolveAcceptState's own behaviour is covered by
// tests/access/accept-state.test.ts.
//
// Only WHOLE-LINE comments are stripped: a naive /\/\/.*$/ would also eat the `//` in `https://`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'accept', '[token]', 'page.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const idxResolve = CODE.indexOf('resolveAcceptState')
const idxSignIn = CODE.indexOf("state === 'sign_in'")
const idxWrongEmail = CODE.indexOf("state === 'wrong_email'")
const idxAccept = CODE.indexOf('accept_member_invitation')

describe('accept page — auto-accept on arrival', () => {
  it('calls the accept RPC from the page itself', () => {
    expect(idxAccept, 'the page must invoke accept_member_invitation to auto-accept').not.toBe(-1)
  })

  it('redirects the accepted member into their church assessment', () => {
    expect(CODE, 'must import redirect from next/navigation').toMatch(
      /import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*'next\/navigation'/,
    )
    expect(CODE, 'a successful accept must send the member to /app/{churchId}').toMatch(
      /redirect\(`\/app\/\$\{/,
    )
  })

  it('resolves the invitation state before any mutation is reachable', () => {
    expect(idxResolve, 'resolveAcceptState must be present').not.toBe(-1)
    expect(idxResolve, 'state must be resolved before the accept RPC').toBeLessThan(idxAccept)
  })

  it('keeps the accept RPC behind the signed-out guard (prefetch safety)', () => {
    expect(idxSignIn, "the sign_in branch must exist").not.toBe(-1)
    expect(
      idxSignIn,
      'a signed-out visitor (including an email-client prefetch) must return before the RPC',
    ).toBeLessThan(idxAccept)
  })

  it('keeps the accept RPC behind the wrong-email guard', () => {
    expect(idxWrongEmail, 'the wrong_email branch must exist').not.toBe(-1)
    expect(
      idxWrongEmail,
      'a session whose email does not match the invitation must return before the RPC',
    ).toBeLessThan(idxAccept)
  })

  it('never calls revalidatePath during render', () => {
    expect(
      CODE,
      'revalidatePath throws when called while rendering a Server Component; /app/[churchId] is dynamic so there is nothing to invalidate',
    ).not.toContain('revalidatePath')
  })

  it('still offers a manual fallback when auto-accept fails', () => {
    expect(
      CODE,
      'a failed RPC must not dead-end the member — the manual AcceptButton stays as a fallback',
    ).toContain('<AcceptButton')
  })

  it('announces an auto-accept failure through the LiveStatus primitive', () => {
    // Not decorative: a conditionally mounted <p role="alert"> is silently missed by screen
    // readers (see components/live-status.tsx). tests/a11y/live-regions-applied.test.ts enforces
    // this repo-wide; pinning it here too keeps the rule visible at the point of use.
    expect(CODE, 'the failure message must route through <LiveStatus>').toContain('<LiveStatus')
    expect(CODE, 'the region must never be conditionally mounted').not.toMatch(
      /\{\s*acceptError\s*(\?|&&)\s*</,
    )
  })
})
