// Source-reading tripwire (node env, no DOM) — same approach as tests/dashboard/close-reopen-wiring.test.ts.
// ADR 0003 follow-up: the admin dashboard's diagnosis affordance is DYNAMIC on run status.
//   closed  (status 'complete')    + diagnosis exists → today's primary "View diagnosis" link, unchanged.
//   reopened (status 'in_progress') + diagnosis exists → <RegenerateDiagnosisButton> in its place, fed
//     the SAME finishedMemberCount N-of-M the Close confirm uses, PLUS a secondary "View diagnosis" link
//     so the existing report stays reachable.
//   no diagnosis → Generate / gated Generate, unchanged. Members' view is unchanged (all admin-gated).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8'))

describe('dashboard regenerate-diagnosis wiring', () => {
  it('imports the button and derives "reopened" from hasDiagnosis + run status', () => {
    expect(page).toContain("import { RegenerateDiagnosisButton } from './regenerate-diagnosis-button'")
    expect(page).toContain("const runReopened = hasDiagnosis && run?.status === 'in_progress'")
  })

  it('renders the button admin-only, only when reopened, fed by finishedMemberCount', () => {
    const at = page.indexOf('<RegenerateDiagnosisButton')
    expect(at).toBeGreaterThan(-1)
    expect(page.match(/<RegenerateDiagnosisButton/g)?.length).toBe(1)
    // the guard immediately around it
    expect(page).toMatch(/\{isAdmin && runReopened && \(\s*<RegenerateDiagnosisButton/)
    const block = page.slice(at, page.indexOf('/>', at))
    expect(block).toContain('churchId={churchId}')
    expect(block).toContain('finished={finishedMembers.finished}')
    expect(block).toContain('total={finishedMembers.total}')
  })

  it('keeps ONE View-diagnosis link, admin-only when a diagnosis exists, styled secondary while reopened', () => {
    // exactly one diagnosis href in the page (the link is not duplicated per branch)
    expect(page.match(/`\/app\/\$\{churchId\}\/diagnosis`/g)?.length).toBe(1)
    const linkAt = page.indexOf('`/app/${churchId}/diagnosis`')
    const link = page.slice(linkAt, page.indexOf('</Link>', linkAt))
    expect(link).toContain('View diagnosis')
    // primary (bg-ink text-paper) when closed, secondary (text-ink, no fill) when reopened
    expect(link).toContain('className={runReopened ? SECONDARY_LINK : PRIMARY_LINK}')
    expect(page).toMatch(/const PRIMARY_LINK =\s*'[^']*bg-ink[^']*text-paper[^']*'/)
    expect(page).toMatch(/const SECONDARY_LINK =\s*'[^']*text-ink[^']*'/)
    expect(page.match(/const SECONDARY_LINK =\s*'([^']*)'/)![1]).not.toContain('bg-ink')
    // the link is guarded on hasDiagnosis, not on status — it survives Reopen
    expect(page).toMatch(/\{isAdmin && hasDiagnosis && \(\s*<Link/)
  })

  it('orders Regenerate BEFORE the View link ("in place of"), and both before Close / Reopen', () => {
    const regen = page.indexOf('<RegenerateDiagnosisButton')
    const view = page.indexOf('View diagnosis')
    const control = page.indexOf('<CloseReopenControls')
    expect(regen).toBeLessThan(view)
    expect(view).toBeLessThan(control)
  })

  it('leaves the no-diagnosis Generate branch alone (Generate / gated Generate, guarded on !hasDiagnosis)', () => {
    expect(page).toMatch(/\{isAdmin && !hasDiagnosis && \(\s*dashboardGate\.ok \? \(\s*<GenerateButton churchId=\{churchId\} \/>/)
    expect(page.match(/<GenerateButton churchId=\{churchId\} \/>/g)?.length).toBe(1)
  })
})
