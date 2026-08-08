// Source-reading tripwire (node env, no DOM): self-form.tsx is a thin pass-through wrapper around
// AnswerForm (mirrors tests/assessment/self-form-complete-wiring.test.ts — same file, same style;
// page.tsx/self-form.tsx are not easily rendered in vitest, so this codebase pins wiring as text).
// Task 12 threads initialReflections through self-form.tsx so a resumed answer's saved reflection
// text prefills the textarea instead of starting blank.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const selfForm = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'self-form.tsx'),
    'utf8',
  ),
)

describe('self-form reflection wiring', () => {
  it('declares initialReflections as an optional prop (same optionality as Task 11’s AnswerForm)', () => {
    // Catches: the prop dropped from the type entirely, or made required — either breaks the page
    // (which won't always have a non-empty reflection set) and contradicts the brief's "make it
    // optional for the same reason as Task 11."
    expect(selfForm).toContain('initialReflections?: Record<string, string>')
  })

  it('forwards initialReflections to AnswerForm', () => {
    // Catches the exact failure mode named for this task: initialReflections accepted as a prop but
    // silently dropped instead of threaded through to AnswerForm — the page would compute prefill
    // data that never reaches the component that renders it.
    expect(selfForm).toContain('initialReflections={initialReflections}')
  })

  it('forwards it into the same AnswerForm element as initialValues', () => {
    // Guards against the forward landing on the wrong tag (e.g. attached to some other element).
    // self-form.tsx renders exactly one JSX element, so the first `/>` after `<AnswerForm` is its own.
    const start = selfForm.indexOf('<AnswerForm')
    const end = selfForm.indexOf('/>', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const tag = selfForm.slice(start, end)
    expect(tag).toContain('initialValues={initialValues}')
    expect(tag).toContain('initialReflections={initialReflections}')
  })
})
