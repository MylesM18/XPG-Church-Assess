// Source-reading tripwire (node env, no DOM): asserts on file structure, not rendered output —
// same approach as tests/report/route-rederive.test.ts / route-call-ordering.test.ts.
//
// `reflections` is an OPTIONAL argument on resolveReportView's opts (lib/report/view.ts), so tsc
// cannot catch a silent drop at the PDF call site. tests/report/view.test.ts and
// tests/report/audience-parity.test.ts both call buildReportView directly with hand-built opts —
// they never read a route file's source, so they structurally cannot observe whether a route
// actually wires reflections through (Task 16's own report flagged exactly this gap under
// "Concerns" #1). This file closes that gap directly on the three route sources:
//   - the screen route (app/app/[churchId]/diagnosis/page.tsx) must pass reflections to
//     assembleReport( — `reflections` is a REQUIRED field there (lib/report/compose.ts) since
//     plan 4's web swap, so a total omission is now tsc-caught too; this test still pins it
//     directly on the source, and additionally pins that the KEYED sibling (hashReflections)
//     never leaks past its one consumer, reportInputs;
//   - the PDF route (app/api/report/[runId]/pdf/route.ts, Task 17) must pass reflections;
//   - the public share route (app/r/[shareToken]/page.tsx) must NEVER pass reflections — private
//     free-text is excluded from the public share surface at four independent layers (the RPC
//     never selects the reflection column; the row type doesn't name it; this call site never
//     threads a `reflections` array into the view opts; and buildReportView's own audience check
//     drops it again even if a caller somehow did — see app/r/[shareToken]/page.tsx's row-type
//     comment and lib/report/view.ts's buildReportView doc comment for the canonical list of all
//     four). tests/outreach/shared-exclusion.test.ts pins the SQL and row-type layers; this test
//     pins the call-site layer, more precisely (the resolveReportView opts literal itself, not
//     just a whole-file substring check).
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
  it('screen route (diagnosis/page.tsx) passes the KEYLESS reflections to resolveReportSections', () => {
    const source = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))

    // Plan 5's resolver seam: resolveReportSections (lib/report/resolve.ts) is now the page's
    // one call site — it threads `reflections` through to assembleReport internally.
    expect(source, 'the screen route must call resolveReportSections(').toContain('resolveReportSections(')
    expect(
      source,
      'the screen route must pass reflections, or outreach voices silently disappear from ' +
        'the on-screen report while every current test stays green.',
    ).toMatch(/resolveReportSections\(\{[\s\S]*?\breflections\b[\s\S]*?\}\)/)

    // The keyed sibling carries respondent identity and must reach resolveReportSections (which
    // threads it into reportInputs, lib/report/resolve.ts) and NOTHING else. Occurrence-count
    // equality, not substring absence: the identifier is legitimately present in the file, so
    // what matters is how many places consume it.
    const uses = [...source.matchAll(/\bhashReflections\b/g)].length
    expect(
      uses,
      'hashReflections must appear exactly twice — its declaration and its single ' +
        'consumer, resolveReportSections. A third use is a respondent-identity leak into a renderer.',
    ).toBe(2)
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

  it('shared route (r/[shareToken]/page.tsx) never passes a populated reflections array', () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))

    // The exclusion is now STRUCTURAL, not an omitted optional: FallbackSectionArgs
    // requires `reflections`, so the empty literal is visible at the call site. Assert
    // the literal is there AND that it is the file's only reflections expression — a
    // "helpful" symmetry edit that populated it would otherwise slip past.
    const EXCLUSION_LITERAL = /reflections:\s*\[\s*\]/g
    expect(
      (source.match(EXCLUSION_LITERAL) ?? []).length,
      'the shared surface must pass exactly one explicit `reflections: []`',
    ).toBe(1)
    expect(
      /\breflections\b/.test(source.replace(EXCLUSION_LITERAL, '')),
      'the shared surface must NEVER receive reflections — private free-text is excluded ' +
        'from the public share page at four independent layers, and this call site is one ' +
        'of them.',
    ).toBe(false)
  })
})
