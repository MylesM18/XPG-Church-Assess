// Source-reading tripwire (node env, no DOM): the admin "Member progress" matrix
// (<MemberCoverageMatrix …/>) must render BELOW the Invite Member section on the dashboard.
// Anchored on the render tag (`<MemberCoverageMatrix`), NOT the import, so the order check
// reflects JSX position. Comments are stripped so a commented-out mention can't move the anchor.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const page = read('app', 'app', '[churchId]', 'page.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('dashboard section order', () => {
  it('renders the Member progress matrix below the Invite Member section', () => {
    const inviteIdx = page.indexOf('Invite Member')
    const matrixIdx = page.indexOf('<MemberCoverageMatrix')
    expect(inviteIdx, 'Invite Member section heading must exist in page.tsx').toBeGreaterThan(-1)
    expect(matrixIdx, 'MemberCoverageMatrix must be rendered in page.tsx').toBeGreaterThan(-1)
    expect(
      matrixIdx,
      'the Member progress matrix must render AFTER (below) the Invite Member section',
    ).toBeGreaterThan(inviteIdx)
  })
})
