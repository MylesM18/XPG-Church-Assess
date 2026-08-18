// Source-reading tripwire (node env, no DOM) — same approach as tests/dashboard/member-matrix.test.ts.
// ADR 0003: the admin dashboard selects run status + closed_at and renders the Close / Reopen control
// next to the Generate / View-diagnosis block, admin-only, fed by finishedMemberCount(memberMatrix).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8'))

describe('dashboard close / reopen wiring', () => {
  it('selects status and closed_at on the run row (it selected neither before)', () => {
    expect(page).toContain(".select('id, methodology_version, status, closed_at')")
    expect(page.match(/\.from\('assessment_runs'\)/g)?.length).toBe(1)
  })
  it('imports the control and the finished counter', () => {
    expect(page).toContain("import { CloseReopenControls } from './close-reopen-controls'")
    expect(page).toContain("import { finishedMemberCount } from '@/lib/coverage/finished-members'")
    expect(page).toContain('const finishedMembers = finishedMemberCount(memberMatrix)')
  })
  it('renders the control admin-only, after the Generate / View-diagnosis block and before Manage access', () => {
    const controlAt = page.indexOf('<CloseReopenControls')
    expect(controlAt).toBeGreaterThan(-1)
    expect(page.indexOf('View diagnosis')).toBeLessThan(controlAt)
    expect(page.indexOf('<GenerateButton churchId={churchId} />')).toBeLessThan(controlAt)
    expect(controlAt).toBeLessThan(page.indexOf('Manage access'))
    // the guard immediately around it is isAdmin && run
    expect(page).toMatch(/\{isAdmin && run && \(\s*<CloseReopenControls/)
    // props: run.status / run.closed_at / N / M
    const block = page.slice(controlAt, page.indexOf('/>', controlAt))
    expect(block).toContain('status={run.status}')
    expect(block).toContain('closedAt={run.closed_at}')
    expect(block).toContain('finished={finishedMembers.finished}')
    expect(block).toContain('total={finishedMembers.total}')
  })
  it('keeps the View-diagnosis link as the FIRST diagnosis href (view-diagnosis-new-tab anchors on it)', () => {
    const first = page.indexOf('`/app/${churchId}/diagnosis`')
    expect(page.slice(first, page.indexOf('</Link>', first))).toContain('View diagnosis')
  })
})
