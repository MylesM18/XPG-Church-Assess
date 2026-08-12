// Source-reading tripwire (node env, no DOM): asserts on file structure, not rendered output —
// same approach as tests/report/route-rederive.test.ts / route-call-ordering.test.ts
// (readFileSync + comment-stripping + assertions on the source text).
//
// Task 13 computes, on all three report routes:
//   const reportMethodology = derived.ok ? derived.effectiveMethodology : methodology
// and threads it into BOTH resolveReportView's methodology argument AND the prose thunk's
// fallbackProse(d, reportMethodology) call — never the raw `methodology`. Reverting either call
// site back to plain `methodology` is NOT output-identical: the view path reads
// `questions.categories[].items` via buildOutreachVoices (lib/report/view.ts), which groups a
// run's reflections by `item.id`/`item.reflection` (lib/report/derive.ts's DeriveResult doc has
// the full rationale). A legacy run (predating the outreach questions, methodology_version
// '0.2.0' or null) handed the CURRENT methodology would therefore surface outreach voices for
// questions it was never asked — and this file is what catches that: the tripwire below
// source-reads all three call sites and fails the revert immediately, rather than relying on
// rendered output. (Task 13's own report flagged this exact gap under "Concerns" #3.)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
/** Strip comments so a doc comment mentioning either identifier cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * Extracts the balanced-parenthesis argument text of the first `callName(...)` call in
 * `source`, or null if the call isn't present. Used to scope a check to a specific call's
 * own object-literal argument, rather than the whole file — a bare whole-file scan for
 * `[{,]\s*methodology\s*[,}]` also matches ordinary positional call arguments (e.g.
 * `deriveDiagnosisForRun(responses, methodology, {...})`, which legitimately passes the
 * CURRENT methodology, not the report one), producing false positives outside any object
 * literal at all.
 */
function extractCallArgs(source: string, callName: string): string | null {
  const marker = `${callName}(`
  const start = source.indexOf(marker)
  if (start === -1) return null
  const openParenIdx = start + marker.length - 1
  let depth = 0
  let end = openParenIdx
  for (; end < source.length; end++) {
    if (source[end] === '(') depth++
    else if (source[end] === ')') {
      depth--
      if (depth === 0) { end++; break }
    }
  }
  return source.slice(openParenIdx + 1, end - 1)
}

const ROUTES = [
  { label: 'app/app/[churchId]/diagnosis/page.tsx', segs: ['app', 'app', '[churchId]', 'diagnosis', 'page.tsx'] },
  { label: 'app/api/report/[runId]/pdf/route.ts', segs: ['app', 'api', 'report', '[runId]', 'pdf', 'route.ts'] },
] as const

// Anchored on the surrounding call syntax (never a bare substring search), so a comment
// mentioning either identifier cannot satisfy or break the match, and so the check is
// arity-agnostic beyond this one argument position — whatever precedes `derived,` or follows the
// captured argument does not matter here. Tolerant of the file's real multi-line call formatting
// (one positional argument per line) via `\s*` between tokens.
const RESOLVE_ARG_RE = /resolveReportView\(\s*derived\s*,\s*(reportMethodology|methodology)\s*,/
const FALLBACK_ARG_RE = /fallbackProse\(\s*d\s*,\s*(reportMethodology|methodology)\s*\)/

describe('report routes build the view and the prose thunk from reportMethodology, never the raw methodology (Task 13)', () => {
  for (const { label, segs } of ROUTES) {
    it(`${label}: resolveReportView receives reportMethodology, not methodology`, () => {
      const source = strip(read(...segs))

      const match = RESOLVE_ARG_RE.exec(source)
      // Guard against the vacuous-on-absence trap: if the call shape itself is gone (renamed,
      // reformatted past what the regex tolerates, or removed), fail loudly here rather than
      // letting a `null` slip into the next assertion and read as "no bad value found".
      expect(
        match,
        `${label}: expected a resolveReportView(derived, <methodology arg>, ...) call in this shape`,
      ).not.toBeNull()

      expect(
        match![1],
        `${label}: resolveReportView's methodology argument must be reportMethodology, not the ` +
          `raw methodology — a legacy run would otherwise be scored against its own edition but ` +
          `RENDERED against the current one (lib/report/derive.ts's DeriveResult doc explains why).`,
      ).toBe('reportMethodology')
    })

    it(`${label}: the prose thunk's fallbackProse receives reportMethodology, not methodology`, () => {
      const source = strip(read(...segs))

      const match = FALLBACK_ARG_RE.exec(source)
      expect(
        match,
        `${label}: expected a fallbackProse(d, <methodology arg>) call inside the prose thunk`,
      ).not.toBeNull()

      expect(
        match![1],
        `${label}: the fallback-prose thunk must build from reportMethodology too, or the scored ` +
          `view and the prose describing it would silently disagree about which question set ran.`,
      ).toBe('reportMethodology')
    })
  }

  it("app/r/[shareToken]/page.tsx: every methodology argument is reportMethodology", () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))

    // The consumers changed (buildFacts / assembleFallbackOnly replace resolveReportView),
    // but the invariant did not: a legacy run must be RENDERED against the edition it was
    // scored under, never the current one.
    const passed = [...source.matchAll(/methodology:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!)
    expect(
      passed.length,
      'expected at least two methodology: <arg> call sites (buildFacts and assembleFallbackOnly)',
    ).toBeGreaterThanOrEqual(2)
    expect(new Set(passed)).toEqual(new Set(['reportMethodology']))

    // Shorthand `{ methodology }` would pass the RAW methodology while matching no
    // `methodology:` key at all — the fail-open hole the regex above cannot see. Scoped to
    // the two calls' own argument text (not the whole file): a whole-file scan for
    // `[{,]\s*methodology\s*[,}]` also matches deriveDiagnosisForRun's ordinary positional
    // `(responses, methodology, {...})` argument above, which legitimately passes the
    // CURRENT methodology and is not an object literal at all.
    const buildFactsArgs = extractCallArgs(source, 'buildFacts')
    const assembleArgs = extractCallArgs(source, 'assembleFallbackOnly')
    expect(buildFactsArgs, 'expected a buildFacts( call').not.toBeNull()
    expect(assembleArgs, 'expected an assembleFallbackOnly( call').not.toBeNull()
    const shorthand = /[{,]\s*methodology\s*[,}]/
    expect(
      shorthand.test(buildFactsArgs!) || shorthand.test(assembleArgs!),
      'the shared page must never pass the raw `methodology` via object shorthand',
    ).toBe(false)

    expect(
      source,
      'the reportMethodology assignment itself must survive',
    ).toContain('derived.effectiveMethodology')
  })
})
