// Pins the accessibility contract of the disabled "Generate diagnosis" control.
// SOURCE-READING test (node env, no DOM): it asserts on file text, not rendered output.
//
// Why it exists: `disabled` removes a <button> from the tab order in every browser. The reason the
// control is unavailable ("Answer all 8 areas first — 5 of 8" / "Admins can generate the
// diagnosis") lives INSIDE the button, so with `disabled` present a Tab-navigating user never
// reaches the explanation for why the page's primary action is unavailable.
//
// The fix keeps `aria-disabled="true"` — the control is still announced as unavailable — but drops
// `disabled` so it stays focusable, and adds a focus ring so that focus is visible once it can be
// reached. Re-adding `disabled` would silently restore the original defect with no visual change
// and no other failing test. This is the tripwire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'page.tsx')

/** Remove block and line comments so prose mentions of these attributes are not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const SOURCE = stripComments(fs.readFileSync(PAGE, 'utf8'))

// `cursor-not-allowed` appears on exactly one element in this file: the disabled-branch button.
// Matching the whole open tag lets every assertion below be scoped to that element rather than to
// the file as a whole — otherwise a `disabled` on some unrelated future control would pass.
const OPEN_TAG = SOURCE.match(/<button\b[^>]*cursor-not-allowed[^>]*>/)?.[0] ?? null

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

describe('disabled Generate-diagnosis control', () => {
  it('locates exactly one such control, so the assertions below cannot pass vacuously', () => {
    const occurrences = SOURCE.split('cursor-not-allowed').length - 1
    expect(
      occurrences,
      'expected exactly one `cursor-not-allowed` element in app/app/[churchId]/page.tsx — the ' +
        'disabled Generate-diagnosis button. If this count changed, the regex below is targeting ' +
        'the wrong element and every other assertion in this file is meaningless.',
    ).toBe(1)
    expect(
      OPEN_TAG,
      'could not find a <button> open tag containing `cursor-not-allowed`. Every assertion in ' +
        'this file is scoped to that tag, so they would all pass against null.',
    ).not.toBeNull()
  })

  it('is not `disabled`, so it stays in the tab order', () => {
    expect(
      OPEN_TAG,
      'the disabled Generate-diagnosis button must NOT carry the bare `disabled` attribute. ' +
        '`disabled` removes a button from the tab order, and the reason it is unavailable lives ' +
        'inside the button — so a Tab-navigating user would never reach that reason. Use ' +
        'aria-disabled="true" alone.',
    ).not.toMatch(/(?<![-\w])disabled(?![-\w])/)
  })

  it('keeps aria-disabled so it is still announced as unavailable', () => {
    expect(
      OPEN_TAG,
      'dropping `disabled` without `aria-disabled="true"` would make the control look actionable ' +
        'to assistive technology when it is not.',
    ).toContain('aria-disabled="true"')
  })

  it('carries the full canonical focus ring', () => {
    expect(
      OPEN_TAG,
      'a focusable control with no visible focus indicator fails SC 2.4.7. This must be the ' +
        `complete canonical string used by the sibling controls in this file, not a substring: ${FOCUS_RING}`,
    ).toContain(FOCUS_RING)
  })

  it('does not dim the reason text below legibility', () => {
    expect(
      OPEN_TAG,
      'opacity-60 composites text-ink-soft down to roughly 2.7:1 on paper, well under the 4.5:1 ' +
        'small text needs. The point of this change is making the reason perceivable, so the ' +
        'control keeps its muted look via text-ink-soft alone.',
    ).not.toContain('opacity-60')
  })
})
