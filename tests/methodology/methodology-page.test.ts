// Source-reading tripwire (node env, no DOM): the PUBLIC /methodology page must explain the whole
// diagnosis mechanism in plain English AND must never leak the proprietary tuning constants. We read
// the RAW source (comments NOT stripped) so a constant hidden in a code comment would also trip the
// IP-safety guard. Positive assertions pin the ten explainer sections, the required "provisional
// benchmarks" caveat, and the back-to-home link; the negative assertions are the IP guard.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'methodology', 'page.tsx'), 'utf8')

describe('public methodology page — content', () => {
  it.each([
    'What this assessment is',
    'What we measure',
    'How a score is formed',
    'headline numbers',
    'chain',
    'Blind spot',
    'Agreement',
    'role of AI',
    'Versioning',
  ])('covers the "%s" section', (heading) => {
    expect(SOURCE).toContain(heading)
  })

  it('offers a back-to-home link', () => {
    expect(SOURCE).toContain('href="/"')
  })

  it('declares page metadata', () => {
    expect(SOURCE).toContain('export const metadata')
  })
})

describe('public methodology page — IP safety (no leaked constants)', () => {
  it.each([
    '0.85',
    '0.15',
    'dispersion',
    '2.0',
    'p25',
    'p50',
    'p75',
    'blind_spot',
    'min_weight',
    'min_n',
  ])('never leaks the "%s" constant', (secret) => {
    expect(SOURCE).not.toContain(secret)
  })
})

describe('public methodology page — section 04 uses the report\'s own words (step F)', () => {
  // SCOPED to the Section 04 block on purpose: "capacity" is a normal English word that may
  // legitimately appear elsewhere on this page (and does, in the copy deck this page draws on),
  // so a whole-file negative would be brittle and would fail for the wrong reason.
  const S04 = SOURCE.slice(SOURCE.indexOf('n="04"'), SOURCE.indexOf('n="05"'))

  it('is a genuine, non-empty section block, so nothing below passes vacuously', () => {
    expect(S04.length).toBeGreaterThan(200)
    expect(S04).toContain('The two headline numbers')
  })

  it.each(['health score', 'real-world result', 'points lost'])(
    'names the two numbers as the report itself does: "%s"',
    (phrase) => {
      expect(S04.toLowerCase()).toContain(phrase)
    },
  )

  it.each(['capacity', 'throughput'])(
    'no longer explains the engine jargon "%s" the reader will never see',
    (jargon) => {
      // Without this the page keeps teaching two words that appear nowhere in the report.
      expect(S04.toLowerCase()).not.toContain(jargon)
    },
  )

  it.each(['weakest stage', 'wide gap', 'narrow gap'])(
    'keeps the substance — "%s" — while the names change',
    (substance) => {
      expect(S04.toLowerCase()).toContain(substance)
    },
  )
})
