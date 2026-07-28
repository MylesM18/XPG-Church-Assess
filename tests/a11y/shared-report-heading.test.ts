// Pins that the public shared-report page carries exactly one top-level heading.
// SOURCE-READING test (node env, no DOM): it asserts on file structure, not rendered output —
// same approach as tests/a11y/main-landmark.test.ts, which this mirrors.
//
// Why it exists: app/r/[shareToken]/page.tsx is a public, unauthenticated page. Before Task 15's
// report-reform split, VerdictHeader rendered <h1>{name}</h1> here. The reworked VerdictHeader
// (app/app/[churchId]/diagnosis/report/cover.tsx) emits only <p> elements, and this page's own
// church-identity block is deliberately a <p> too (it would collide with CoverCard's <h1> once
// Task 16 brings that component here) — so it is easy for this page to end up with a document
// outline that starts at <h2> and has no <h1> at all. Nothing else in this repo would catch that:
// tests/a11y/main-landmark.test.ts only asserts on <main> opening tags, never on headings.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHARE_PAGE = path.join(REPO_ROOT, 'app', 'r', '[shareToken]', 'page.tsx')

/** Remove /* *​/ blocks and // line comments so prose mentions of `<h1` are not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('shared report page heading invariant', () => {
  it('carries exactly one <h1', () => {
    const source = stripComments(fs.readFileSync(SHARE_PAGE, 'utf8'))
    // Require whitespace, `>` or `/` after `<h1` so `<h1x` is not matched (mirrors
    // main-landmark.test.ts's identical guard on `<main`).
    const matches = source.match(/<h1(?=[\s>/])/g) ?? []
    expect(
      matches.length,
      `app/r/[shareToken]/page.tsx must carry exactly one <h1> — it is a public, unauthenticated ` +
        `page, so its document outline needs a top-level heading of its own. Found ${matches.length}.`,
    ).toBe(1)
  })
})
