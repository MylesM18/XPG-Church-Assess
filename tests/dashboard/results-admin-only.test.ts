// Source-reading tripwire (node env, no DOM): asserts on the diagnosis page + dashboard text.
// Pins results-are-admins-only at the UI layer: viewers are redirected off the diagnosis page,
// and the dashboard's diagnosis controls are gated behind isAdmin.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const DIAG = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))
const DASH = strip(read('app', 'app', '[churchId]', 'page.tsx'))

describe('results restricted to admins (UI)', () => {
  it('redirects non-admins away from the diagnosis page', () => {
    expect(DIAG, 'diagnosis page must redirect non-admins').toContain('if (!isAdmin)')
    expect(DIAG, 'diagnosis page must call redirect()').toContain('redirect(')
  })
  it('gates the dashboard diagnosis controls behind isAdmin', () => {
    expect(DASH, 'dashboard must reference isAdmin').toContain('isAdmin')
    expect(DASH, 'the diagnosis controls block must be wrapped in {isAdmin && (').toMatch(
      /isAdmin && \(/,
    )
  })
})
