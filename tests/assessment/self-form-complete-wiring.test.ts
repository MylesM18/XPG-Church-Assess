// Source-reading tripwire (node env, no DOM): the assessment form's Finish now hands off to the
// section-complete interstitial for THIS category, NOT straight to /done. Invisible in a static
// render → the tripwire; the reverse guard fails a revert to the old direct /done push.
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

describe('self-form → section-complete wiring', () => {
  it('onComplete pushes to the section-complete interstitial for this category', () => {
    expect(
      selfForm,
      'Finish must route to answer/${categoryId}/complete (the interstitial)',
    ).toContain('router.push(`/app/${churchId}/answer/${categoryId}/complete`)')
  })

  it('no longer pushes straight to /done (reverse guard against a revert)', () => {
    expect(
      selfForm,
      'the direct Finish→/done push has been replaced by the interstitial; a revert must fail here',
    ).not.toContain('router.push(`/app/${churchId}/done`)')
  })
})
