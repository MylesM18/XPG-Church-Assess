// Source-reading tripwire (node env, no DOM): asserts on file structure, not rendered output —
// same approach as tests/dashboard/results-admin-only.test.ts (readFileSync + comment-stripping
// + string/regex assertions on the source text).
//
// Why this exists, and why tests/report/stale-payload.test.ts is not enough: CT-1 (whole-branch
// review) was a call-ORDERING bug at three route call sites, not a bug inside resolveReportView
// itself. stale-payload.test.ts feeds resolveReportView a stale payload DIRECTLY — that proves
// the function itself branches correctly, but a unit test one layer below a call site cannot
// observe whether the CALLER invokes fallbackProse/buildReportView before or after
// resolveReportView's internal version check. The scoped re-review of the CT-1 fix proved the
// gap concretely: reverting the version check at the diagnosis-page call site left 436/436
// green, and the same revert on the public share route also left 436/436 green — two valid,
// compiling, CT-1-shaped regressions the pre-existing suite could not see.
//
// resolveReportView's own doc comment (lib/report/view.ts) explains the fix: `blocks` is a LAZY
// THUNK (`() => ReportBlocks`), not a value, specifically so a stale payload can never reach
// fallbackProse/buildReportView — resolveReportView only invokes the thunk once it has confirmed
// the payload is fresh. A caller that resolves `blocks` eagerly, before calling
// resolveReportView, reintroduces the exact defect this file exists to catch: fallbackProse (or
// buildReportView) throws on an old-shaped payload before the version check ever runs.
//
// Plan 5 moved the PDF route (the last resolveReportView( call site) onto the same
// resolveScoreability(/resolveReportSections( seam the share page and the diagnosis page already
// use — see the three ordering guards below this comment's original subjects. The historical
// fallbackProse/buildReportView call-ordering bug (CT-1) this file exists to catch is preserved
// in spirit by those three guards' shape: resolveScoreability must run, and be checked, before the
// assembly pipeline is ever invoked, on every report surface.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
/** Strip comments so a doc comment mentioning these names cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('report routes resolve scoreability before assembling any section or view (CT-1)', () => {
  it('app/r/[shareToken]/page.tsx resolves scoreability before assembling any section (CT-1, plan 4)', () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))

    // Plan 4's shape of the CT-1 invariant. resolveReportView's lazy thunk is gone from
    // this page, but the harm it prevented is not: buildFacts and assembleFallbackOnly
    // both read derived.diagnosis, which does not exist on a not-scoreable run. The gate
    // must come first.
    // BOTH anchors are guarded — an ordering assertion whose needle is missing yields
    // indexOf === -1 and passes vacuously.
    expect(source, 'the shared page must call resolveScoreability(').toContain('resolveScoreability(')
    expect(source, 'the shared page must call assembleFallbackOnly(').toContain('assembleFallbackOnly(')
    expect(source.indexOf('resolveScoreability(')).toBeLessThan(source.indexOf('assembleFallbackOnly('))
    expect(
      source,
      'the shared page must keep the not-scoreable guard spelled `!resolution.scoreable`',
    ).toContain('!resolution.scoreable')
  })

  it('app/app/[churchId]/diagnosis/page.tsx resolves scoreability before calling the resolver seam (CT-1, plan 5)', () => {
    const source = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))

    // Plan 5's resolver seam (lib/report/resolve.ts, resolveReportSections) collapsed this
    // page's own `.from('reports')` read and `assembleReport(` call into one call site — the
    // CT-1 invariant did not change, only where it is enforced: resolveScoreability must still
    // run, and be checked, before the assembly pipeline is ever invoked.
    // BOTH anchors guarded on every ordering assertion — a missing needle yields
    // indexOf === -1 and would satisfy `toBeLessThan` vacuously.
    for (const needle of ['resolveScoreability(', 'resolveReportSections(']) {
      expect(source, `the diagnosis page must call ${needle}`).toContain(needle)
    }
    expect(source.indexOf('resolveScoreability(')).toBeLessThan(source.indexOf('resolveReportSections('))
    expect(
      source,
      'the diagnosis page must keep the not-scoreable guard spelled `!resolution.scoreable`',
    ).toContain('!resolution.scoreable')
  })

  it('app/api/report/[runId]/pdf/route.ts resolves scoreability before calling the resolver seam, with the 409 return between them (CT-1, plan 5, Task 6)', () => {
    const source = strip(read('app', 'api', 'report', '[runId]', 'pdf', 'route.ts'))

    // Task 6's shape of the same seam the diagnosis page adopted above: resolveReportView( is
    // gone from this route too, and the harm it prevented (a not-yet-scoreable run reaching the
    // assembly pipeline) is guarded the same way — resolveScoreability must run, and be checked,
    // before resolveReportSections is ever invoked. Unlike the other two surfaces, this route's
    // not-scoreable arm is an early HTTP return (409), not a component branch — so beyond "both
    // calls exist, gate before seam" this also pins that the 409 return itself sits BETWEEN the
    // gate and the seam call. A regression that hoists resolveReportSections( above the return
    // (but leaves resolveScoreability( first) would satisfy a two-anchor check alone; tsc happens
    // to reject that reordering today via ScoreabilityResolution's union narrowing, but this
    // guard's teeth should not depend on the compiler catching it.
    // ALL THREE anchors guarded before any indexOf comparison — a missing needle yields
    // indexOf === -1 and would satisfy `toBeLessThan`/`toBeGreaterThan` vacuously.
    for (const needle of ['resolveScoreability(', 'status: 409', 'resolveReportSections(']) {
      expect(source, `the PDF route must contain ${needle}`).toContain(needle)
    }
    expect(source.indexOf('resolveScoreability(')).toBeLessThan(source.indexOf('resolveReportSections('))
    expect(
      source.indexOf('status: 409'),
      'the 409 not-scoreable return must sit AFTER resolveScoreability( — the gate must run before ' +
        'the route can even know whether to return it',
    ).toBeGreaterThan(source.indexOf('resolveScoreability('))
    expect(
      source.indexOf('status: 409'),
      'the 409 not-scoreable return must sit BEFORE resolveReportSections( — otherwise a ' +
        'not-yet-scoreable run could reach the assembly pipeline before the route ever returns',
    ).toBeLessThan(source.indexOf('resolveReportSections('))
    expect(
      source,
      'the PDF route must keep the not-scoreable guard spelled `!resolution.scoreable`',
    ).toContain('!resolution.scoreable')
  })
})
