// Source-reading tripwire (node env, no DOM): asserts on file structure, not rendered output —
// same approach as tests/report/route-rederive.test.ts / route-call-ordering.test.ts.
//
// `reflections` is an OPTIONAL argument on resolveReportView's opts (lib/report/view.ts), so tsc
// cannot catch a silent drop at either authenticated call site. tests/report/view.test.ts and
// tests/report/audience-parity.test.ts both call buildReportView directly with hand-built opts —
// they never read a route file's source, so they structurally cannot observe whether a route
// actually wires reflections through (Task 16's own report flagged exactly this gap under
// "Concerns" #1). This file closes that gap directly on the three route sources:
//   - the screen route (app/app/[churchId]/diagnosis/page.tsx, Task 16) must pass reflections;
//   - the PDF route (app/api/report/[runId]/pdf/route.ts, Task 17) must pass reflections;
//   - the public share route (app/r/[shareToken]/page.tsx) must NEVER pass reflections — that is
//     one of the three independent layers tests/outreach/shared-exclusion.test.ts also pins, from
//     the SQL and row-type side; this test pins it from the call-site side.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
/** Strip comments so a doc comment mentioning `reflections` cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * Locates the resolveReportView opts object literal via its distinctive `audience: '<value>'`
 * key (unique per route — confirmed exactly one `audience:` occurrence per file) and returns
 * everything between that key's value and the object's closing brace — e.g. `, reflections ` or
 * just ` `. Returns null if the literal isn't found in this shape, so callers can fail loudly on
 * absence instead of treating "not found" the same as "found and empty" (the vacuous-on-absence
 * trap: a bare `/reflections/.test(entireFileSource)` would not distinguish "inside the opts
 * object" from "somewhere else in the file", e.g. the `const reflections = ...` array literal a
 * few lines above the call).
 */
function optsTail(source: string, audience: string): string | null {
  const re = new RegExp(`\\{\\s*audience:\\s*'${audience}'([^}]*)\\}`)
  const match = re.exec(source)
  return match ? match[1]! : null
}

describe('report routes wire reflections into resolveReportView only on the authenticated surfaces, never on the shared surface', () => {
  it('screen route (diagnosis/page.tsx, Task 16) passes reflections', () => {
    const source = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))
    const tail = optsTail(source, 'screen')

    expect(tail, "expected a resolveReportView opts literal shaped { audience: 'screen', ... }").not.toBeNull()
    expect(
      /\breflections\b/.test(tail!),
      'the screen route must pass reflections into the opts, or outreach voices silently ' +
        'disappear from the on-screen report while every current test stays green (reflections ' +
        'is optional, so tsc cannot catch the drop).',
    ).toBe(true)
  })

  it('PDF route (pdf/route.ts, Task 17) passes reflections', () => {
    const source = strip(read('app', 'api', 'report', '[runId]', 'pdf', 'route.ts'))
    const tail = optsTail(source, 'pdf')

    expect(tail, "expected a resolveReportView opts literal shaped { audience: 'pdf', ... }").not.toBeNull()
    expect(
      /\breflections\b/.test(tail!),
      'the PDF route must pass reflections into the opts, or outreach voices silently disappear ' +
        'from the exported PDF while every current test stays green.',
    ).toBe(true)
  })

  it('shared route (r/[shareToken]/page.tsx) never passes reflections', () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))
    const tail = optsTail(source, 'shared')

    expect(tail, "expected a resolveReportView opts literal shaped { audience: 'shared', ... }").not.toBeNull()
    expect(
      /\breflections\b/.test(tail!),
      'the shared surface must NEVER receive reflections — a "helpful" symmetry edit that adds ' +
        'it here would put private free-text reflections behind nothing but the audience gate ' +
        "inside buildReportView, undoing one of the feature's three independent exclusion layers.",
    ).toBe(false)
  })
})
