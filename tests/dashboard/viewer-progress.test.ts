// Source-reading tripwire (node env, no DOM): asserts on app/app/[churchId]/page.tsx text.
// Pins per-viewer progress wiring: the dashboard picks the per-user coverage RPC for viewers
// and the aggregate RPC for admins, and renders the personal "You've completed" header.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = fs.readFileSync(path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
// Strip comments so a prose mention can neither satisfy nor break a code assertion.
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('viewer personal progress', () => {
  it('reads the per-user coverage RPC for viewers', () => {
    expect(CODE, 'dashboard must call get_member_run_coverage for viewers').toContain(
      'get_member_run_coverage',
    )
  })
  it('keeps the aggregate coverage RPC for admins', () => {
    expect(CODE, 'dashboard must still call get_run_coverage for admins').toContain(
      "'get_run_coverage'",
    )
  })
  it('renders a personal completion header for viewers', () => {
    expect(CODE, "viewers see a personal \"You've completed N of 8\" header").toContain(
      "You've completed",
    )
  })
})
