// Source-reading tripwire (node env, no DOM): asserts on the refresh-on-focus client component's
// text, not rendered output.
//
// The dashboard is a Server Component whose per-area status is computed once from get_run_coverage.
// Self-assessment opens in a new tab, so returning to the dashboard tab must re-run that render.
// This component does it by calling router.refresh() when the tab becomes visible again. If the
// file is deleted, or its visibilitychange listener / visible-state guard is removed, per-area
// status silently stops advancing not_started → In progress → Completed. This is the tripwire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(
  path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'refresh-on-focus.tsx'),
  'utf8',
)
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('RefreshOnFocus component shape', () => {
  it('is a client component', () => {
    expect(
      CODE,
      'must start with the "use client" directive — useRouter/useEffect run only on the client',
    ).toMatch(/^\s*['"]use client['"]/)
  })

  it('refreshes on return, keyed to the tab becoming visible', () => {
    expect(CODE).toContain('visibilitychange')
    expect(
      CODE,
      'must guard on visibilityState === "visible" so it refreshes on RETURN, not when leaving',
    ).toContain("visibilityState === 'visible'")
    expect(CODE, 'must call router.refresh() to re-run the server render').toContain('router.refresh()')
  })

  it('removes its listener on unmount', () => {
    expect(
      CODE,
      'the visibilitychange listener must be cleaned up in the useEffect return to avoid leaks/duplicates',
    ).toContain('removeEventListener')
  })
})
