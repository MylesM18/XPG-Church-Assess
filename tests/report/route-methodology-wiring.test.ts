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

const ROUTES = [
  { label: 'app/app/[churchId]/diagnosis/page.tsx', segs: ['app', 'app', '[churchId]', 'diagnosis', 'page.tsx'] },
  { label: 'app/api/report/[runId]/pdf/route.ts', segs: ['app', 'api', 'report', '[runId]', 'pdf', 'route.ts'] },
  { label: 'app/r/[shareToken]/page.tsx', segs: ['app', 'r', '[shareToken]', 'page.tsx'] },
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
})
