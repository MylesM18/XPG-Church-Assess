// Source-reading tripwire (node env, no DOM): the OAuth/magic-link callback must NOT invent its own
// post-auth destination. It previously duplicated the open-redirect guard from lib/auth/resolve-next
// but defaulted a missing `next` to '/' — the marketing home page — which stranded a freshly
// signed-in member on the landing page instead of routing them onward via /get-started (which
// forwards a returning member to /app/{churchId}). The behavioural guarantees for the guard itself
// live in tests/auth/resolve-next.test.ts; these assertions pin that the route DELEGATES to that one
// shared implementation and never reintroduces a home-page fallback. Comments are stripped so the
// explanatory prose above the code cannot satisfy or break the assertions. Only WHOLE-LINE comments
// are stripped: a naive /\/\/.*$/ would also eat the `//` in `https://`, corrupting the source.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'auth', 'callback', 'route.ts'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('auth callback — post-auth destination', () => {
  it('delegates the next-param guard to the shared resolveNext helper', () => {
    expect(CODE, 'the callback must import resolveNext rather than re-implement the guard').toMatch(
      /import\s*\{[^}]*\bresolveNext\b[^}]*\}\s*from\s*'@\/lib\/auth\/resolve-next'/,
    )
    expect(CODE, 'the callback must actually call resolveNext').toMatch(/resolveNext\s*\(/)
  })

  it('never falls back to the marketing home page', () => {
    expect(CODE, "a missing next must not default to '/'").not.toMatch(/\?\?\s*'\/'/)
    expect(CODE, "a rejected next must not collapse to '/'").not.toMatch(/next\s*=\s*'\/'/)
  })

  it('does not duplicate the open-redirect guard inline', () => {
    expect(
      CODE,
      'the startsWith guard belongs in lib/auth/resolve-next.ts, not duplicated here',
    ).not.toMatch(/next\.startsWith/)
  })

  it('still redirects to the resolved destination on every success branch', () => {
    const redirects = CODE.match(/NextResponse\.redirect\(/g) ?? []
    expect(redirects.length, 'expected the three success branches plus the auth-error branch').toBe(4)
    expect(CODE, 'the local-dev and origin branches must append the resolved next').toContain(
      '${origin}${next}',
    )
    expect(CODE, 'the forwarded-host branch must append the resolved next').toContain(
      '${forwardedHost}${next}',
    )
  })

  it('keeps the failure path pointed at sign-in, not the home page', () => {
    expect(CODE).toContain('/sign-in?error=auth')
  })
})
