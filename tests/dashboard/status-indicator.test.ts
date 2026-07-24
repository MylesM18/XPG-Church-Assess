// Source-reading tripwire (node env, no DOM): asserts on app/app/[churchId]/page.tsx and
// app/globals.css text, not rendered output.
//
// Pins the per-area status colour indicator: each status word gets a red / amber / green dot; the
// dot is aria-hidden (decorative) so the visible text label still carries the status — colour is a
// reinforcement, never the sole signal (WCAG 1.4.1 Use of Color); and the three status colour
// tokens exist in the @theme block so the bg-status-* utilities actually resolve. If the dot loses
// aria-hidden, a status loses its colour, the label is dropped, or a token is renamed, this fails.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = fs.readFileSync(path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
// Strip block and line comments so a prose mention can neither satisfy nor break a code assertion.
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const THEME = fs.readFileSync(path.join(REPO_ROOT, 'app', 'globals.css'), 'utf8')

describe('per-area status colour indicator', () => {
  it('renders the dot as decorative (aria-hidden) so the text still carries the status', () => {
    expect(
      CODE,
      'the status dot must be aria-hidden="true" — the visible label already conveys the status, ' +
        'so colour reinforces it and is never the sole signal (WCAG 1.4.1)',
    ).toContain('aria-hidden="true"')
  })

  it('maps a colour to every status', () => {
    for (const cls of ['bg-status-red', 'bg-status-amber', 'bg-status-green']) {
      expect(CODE, `the dashboard must use ${cls} for a status dot`).toContain(cls)
    }
  })

  it('keeps the text label beside the dot', () => {
    expect(CODE, 'the status word must still render next to the dot').toContain('STATUS_LABEL[status]')
  })

  it('defines the three status colour tokens in @theme so bg-status-* resolves', () => {
    for (const token of ['--color-status-red', '--color-status-amber', '--color-status-green']) {
      expect(THEME, `app/globals.css @theme must define ${token}`).toContain(`${token}:`)
    }
  })
})
