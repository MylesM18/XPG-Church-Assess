// Source-reading test (node env, no DOM): pins the ARIA contract of the shared disclosure.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'inline-disclosure.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('useDisclosure primitive', () => {
  it('wires aria-expanded to open state', () => {
    expect(CODE_ONLY).toContain("'aria-expanded': open")
  })
  it('wires aria-controls to the region id', () => {
    expect(CODE_ONLY).toContain("'aria-controls': regionId")
  })
  it('toggles the region with the hidden attribute, not CSS-only', () => {
    expect(CODE_ONLY).toContain('hidden: !open')
  })
  it('derives a stable region id from useId', () => {
    expect(CODE_ONLY).toContain('useId()')
  })
  it('does not trap or move focus (no ref.focus in the primitive)', () => {
    expect(CODE_ONLY, 'a disclosure is not a dialog — it must not move focus').not.toContain('.focus()')
  })
})
