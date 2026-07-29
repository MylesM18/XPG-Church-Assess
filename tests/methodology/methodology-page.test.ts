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
    'Benchmarks',
    'Blind spot',
    'Agreement',
    'role of AI',
    'Versioning',
  ])('covers the "%s" section', (heading) => {
    expect(SOURCE).toContain(heading)
  })

  it('carries the provisional-benchmark caveat', () => {
    expect(SOURCE).toContain('provisional')
    expect(SOURCE).toContain('observed cohort')
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
