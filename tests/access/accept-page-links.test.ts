// Source-reading tripwire (node env, no DOM): every internal link on the invitation-accept page must
// point at a route that actually exists. The "already accepted" branch previously offered
// `href="/app"` ("Go to your churches") — but app/app/ contains only the [churchId] segment and no
// page.tsx, so that link 404s. The correct destination is /get-started, which forwards a returning
// member to /app/{churchId} (app/get-started/page.tsx) and otherwise shows the church-creation form.
// This test derives the set of real top-level routes from the filesystem rather than hardcoding it,
// so a future route addition doesn't make it stale. Comments are stripped so prose can't satisfy or
// break the assertions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = path.join(ROOT, 'app', 'accept', '[token]', 'page.tsx')
const CODE = fs
  .readFileSync(PAGE, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  // whole-line comments only — a naive /\/\/.*$/ would also eat the `//` in `https://`
  .replace(/^\s*\/\/.*$/gm, '')

function routeExists(route: string): boolean {
  const segments = route.split('/').filter(Boolean)
  const dir = path.join(ROOT, 'app', ...segments)
  return ['page.tsx', 'route.ts'].some((f) => fs.existsSync(path.join(dir, f)))
}

const staticHrefs = [...CODE.matchAll(/href="(\/[^"{}]*)"/g)]
  .map((m) => m[1])
  .filter((href): href is string => typeof href === 'string')

describe('invitation accept page — internal links', () => {
  it('finds the static internal links it is meant to guard', () => {
    expect(staticHrefs.length, 'expected at least one static internal href to check').toBeGreaterThan(
      0,
    )
  })

  it('points every static internal link at a route that exists', () => {
    const broken = staticHrefs.filter((href) => href !== '/' && !routeExists(href))
    expect(broken, `these hrefs have no matching page.tsx/route.ts under app/: ${broken.join(', ')}`).toEqual(
      [],
    )
  })

  it('never links to the non-existent /app index', () => {
    expect(CODE, '/app has no page.tsx — use /get-started instead').not.toContain('href="/app"')
  })

  it('confirms the guard is meaningful: /app really is not a route', () => {
    expect(routeExists('/app'), 'if /app ever gains a page.tsx, revisit this test').toBe(false)
    expect(routeExists('/get-started'), '/get-started must exist as the replacement target').toBe(true)
  })
})
