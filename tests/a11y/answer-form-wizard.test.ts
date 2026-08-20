// Source-reading tripwires (node env, no DOM) for the wizard's load-bearing invariants.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'answer-form.tsx'), 'utf8')
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('answer-form wizard', () => {
  it('seeds every slider from the caller’s saved value, else the midpoint default', () => {
    // Task 4 (resumable-assessment-progress) seeds resumed sliders from `initialValues` (the
    // caller's own previously-saved answers). Unanswered items used to seed null, which showed an
    // em-dash on a thumb already sitting at 5 — a member who meant 5 had to drag off the midpoint
    // and back before Next would accept it. They now seed DEFAULT_SCORE, so 5 is already chosen.
    expect(CODE_ONLY).toMatch(/const DEFAULT_SCORE = 5\b/)
    // Anchored to the state declaration: a bare /Record<string, number>/ would also be satisfied by
    // the unchanged `initialValues` prop type, and so would pass even if the state kept its nulls.
    expect(CODE_ONLY).toContain('useState<Record<string, number>>(')
    expect(CODE_ONLY).not.toMatch(/Record<string, number \| null>/)
    expect(CODE_ONLY).toContain('[i.id, initialValues[i.id] ?? DEFAULT_SCORE]')
    expect(
      CODE_ONLY,
      'unanswered sliders must not seed null again — that is the bug this replaced',
    ).not.toContain('[i.id, initialValues[i.id] ?? null]')
    expect(
      CODE_ONLY,
      'the value readout must show a number from first paint, never the unset em-dash',
    ).not.toMatch(/\?\? '—'/)
    expect(
      CODE_ONLY,
      'the midpoint belongs to DEFAULT_SCORE — no bare 5 may drift away from it',
    ).not.toMatch(/\?\? 5\b/)
  })
  it('saves the current answer via exactly one onSaveAnswer call site', () => {
    // Task 4 (resumable-assessment-progress) replaced bulk onSubmit with save-on-advance: a single
    // onSaveAnswer(...) call site inside saveCurrent(), invoked from both goNext() and finish().
    expect((CODE_ONLY.match(/onSaveAnswer\(/g) ?? []).length).toBe(1)
  })
  it('shows a progressbar', () => {
    expect(CODE_ONLY).toContain('role="progressbar"')
  })
  it('gates Next on the in-flight save only, and disables Back on the first step', () => {
    // Every question now opens with DEFAULT_SCORE already selected, so there is nothing left for
    // Next to wait on but the save round-trip. Re-adding an answeredness gate would re-strand a
    // member who is happy with 5.
    expect(CODE_ONLY).toContain('aria-disabled={pending}')
    expect(
      CODE_ONLY,
      'no answeredness gate — every question is answered from first paint',
    ).not.toContain('currentAnswered')
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
