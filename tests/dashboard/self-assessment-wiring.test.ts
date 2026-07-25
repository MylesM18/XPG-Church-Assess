// Source-reading tripwire (node env, no DOM): asserts on app/app/[churchId]/page.tsx text,
// not rendered output.
//
// Pins the Bug-2 dashboard wiring: each per-area self-assessment link opens in a NEW window
// (target="_blank" + rel="noopener noreferrer"), the fully-covered status reads "Completed", and
// the page mounts <RefreshOnFocus/> so returning to this tab re-runs the server render. Each of
// these is invisible in a static render and guarded by no other test — if one is dropped, the
// new-window / live-status behaviour regresses silently. This is the tripwire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
// Strip block and line comments so a prose mention can neither satisfy nor break a code assertion.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('dashboard self-assessment wiring', () => {
  it('opens the per-area self-assessment link in a new window', () => {
    expect(
      CODE,
      'the per-area "Answer yourself" card Link must carry target="_blank" (Bug 2) — without it, ' +
        'answering navigates away from the dashboard tab instead of opening a new window. ' +
        '(The whole-assessment primary button is a separate, same-tab control.)',
    ).toContain('target="_blank"')
  })

  it('marks the new window rel="noopener noreferrer"', () => {
    expect(
      CODE,
      'target="_blank" without rel="noopener noreferrer" leaves the opener reachable (reverse tabnabbing)',
    ).toContain('rel="noopener noreferrer"')
  })

  it('labels a fully-covered area "Completed", not "Covered"', () => {
    expect(CODE).toContain("covered: 'Completed'")
    expect(
      CODE,
      'the covered label was renamed Covered → Completed (locked with the owner); a revert must fail here',
    ).not.toContain("covered: 'Covered'")
  })

  it('mounts RefreshOnFocus so returning to the tab re-renders the server component', () => {
    expect(CODE, 'the dashboard must render <RefreshOnFocus/> for live status on return').toContain(
      '<RefreshOnFocus',
    )
    expect(CODE).toContain("from './refresh-on-focus'")
  })

  it('renders the whole-assessment primary CTA from assessmentCta()', () => {
    expect(
      CODE,
      'the dashboard must derive its single primary button from assessmentCta() (Start/Continue/Take Again)',
    ).toContain('assessmentCta(')
    expect(CODE).toContain('cta.label')
    expect(CODE).toContain('cta.targetCategoryId')
  })

  it("derives the admin whole-assessment CTA from the caller's OWN coverage, not church-wide coverage", () => {
    expect(
      CODE,
      'the CTA must be fed by ctaResult (caller-scoped), not the church-wide result — an admin resumes ' +
        'their own progress; the header/dots/diagnosis-gate stay on church-wide result',
    ).toContain('assessmentCta(ctaResult, categories)')
    const memberCoverageCallCount = CODE.split("'get_member_run_coverage'").length - 1
    expect(
      memberCoverageCallCount,
      "get_member_run_coverage must be called exactly twice: once for viewers (it drives everything) " +
        'and once more for admins (to source the CTA only, alongside the church-wide fetch). If this drops ' +
        'to 1, the admin CTA has silently regressed back to church-wide coverage.',
    ).toBe(2)
  })
})
