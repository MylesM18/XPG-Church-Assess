// Source-reading tripwires (node env, no DOM) for the wizard's load-bearing invariants.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'answer-form.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('answer-form wizard', () => {
  it('seeds every slider from the caller’s saved value, else null — never pre-filling 5', () => {
    // Task 4 (resumable-assessment-progress) seeds resumed sliders from `initialValues` (the
    // caller's own previously-saved answers); unanswered items still seed null, never a literal 5.
    expect(CODE_ONLY).toMatch(/Record<string, number \| null>/)
    expect(CODE_ONLY).toContain('[i.id, initialValues[i.id] ?? null]')
    expect(CODE_ONLY, 'sliders must never hardcode-prefill the midpoint').not.toMatch(/\[i\.id, 5\]/)
  })
  it('saves the current answer via exactly one onSaveAnswer call site', () => {
    // Task 4 (resumable-assessment-progress) replaced bulk onSubmit with save-on-advance: a single
    // onSaveAnswer(...) call site inside saveCurrent(), invoked from both goNext() and finish().
    expect((CODE_ONLY.match(/onSaveAnswer\(/g) ?? []).length).toBe(1)
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
  it('never reintroduces the requireName name-step (self-form is the sole caller)', () => {
    // Task 4 (resumable-assessment-progress) confirmed via `rg -l "AnswerForm" app components` that
    // the member self-form is AnswerForm's only caller, and dropped the unused requireName name-step
    // in favor of save-on-advance. Pin its absence so nobody silently reintroduces the old
    // two-purpose (invited + member) shape.
    expect(CODE_ONLY).not.toContain('requireName')
    expect(CODE_ONLY).not.toContain('hasNameStep')
  })
  it('renders the three bands via band()/BANDS, never berry', () => {
    expect(CODE_ONLY).toContain("from '@/lib/answers/band'")
    expect(CODE_ONLY).toContain('BANDS.map')
    expect(CODE_ONLY, 'the active band uses ink+sand, not berry').not.toContain('berry')
  })
})
