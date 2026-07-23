// Source-reading tripwires (node env, no DOM) for the wizard's load-bearing invariants.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'answer-form.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('answer-form wizard', () => {
  it('seeds every slider UNSET (null), never pre-filling 5', () => {
    expect(CODE_ONLY).toMatch(/Record<string, number \| null>/)
    expect(CODE_ONLY).toContain('[i.id, null]')
    expect(CODE_ONLY, 'sliders must start unset').not.toMatch(/\[i\.id, 5\]/)
  })
  it('submits all answers in exactly one onSubmit call', () => {
    expect((CODE_ONLY.match(/onSubmit\(/g) ?? []).length).toBe(1)
  })
  it('shows a progressbar', () => {
    expect(CODE_ONLY).toContain('role="progressbar"')
  })
  it('gates Next on the current answer and disables Back on the first step', () => {
    expect(CODE_ONLY).toContain('currentAnswered')
    expect(CODE_ONLY).toContain('step === 0')
  })
  it('moves focus to the step heading on each step', () => {
    expect(CODE_ONLY).toContain('headingRef.current?.focus()')
    expect(CODE_ONLY).toContain('tabIndex={-1}')
  })
  it('adds the name intro step only when requireName', () => {
    expect(CODE_ONLY).toContain('hasNameStep')
    expect(CODE_ONLY).toContain('requireName')
  })
  it('renders the three bands via band()/BANDS, never berry', () => {
    expect(CODE_ONLY).toContain("from '@/lib/answers/band'")
    expect(CODE_ONLY).toContain('BANDS.map')
    expect(CODE_ONLY, 'the active band uses ink+sand, not berry').not.toContain('berry')
  })
})
