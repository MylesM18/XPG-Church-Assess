// Source-reading tripwire (node env, no DOM): the dashboard shows the owner-approved intro
// statement directly UNDER the primary CTA button (reading order: header → button → intro →
// cards). Both the copy and its placement are invisible in a static render → the tripwire. Also
// a reverse guard against accidental removal of the copy. Straight apostrophe matches the JSX.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
// Strip comments so a prose mention can neither satisfy nor break a code assertion.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const INTRO =
  "Please complete the assessment for each category. We encourage you to provide honest and thoughtful feedback, as your responses will help us gain an accurate understanding of the church's overall health and well-being."

describe('dashboard intro statement', () => {
  it('renders the owner-approved intro copy verbatim', () => {
    expect(CODE, 'the approved intro statement must appear on the dashboard').toContain(INTRO)
  })

  it('places the intro AFTER the primary CTA button (reading order)', () => {
    const ctaIdx = CODE.indexOf('cta.label')
    const introIdx = CODE.indexOf('Please complete the assessment for each category')
    expect(ctaIdx, 'the primary CTA (cta.label) must be present').toBeGreaterThan(-1)
    expect(introIdx, 'the intro copy must be present').toBeGreaterThan(-1)
    expect(
      introIdx,
      'the intro statement must come after the CTA button in source order (header → button → intro → cards)',
    ).toBeGreaterThan(ctaIdx)
  })
})
