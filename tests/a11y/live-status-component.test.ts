// Pins the shape of the LiveStatus live-region primitive. SOURCE-READING test (node env, no DOM):
// it asserts on file text, not rendered output.
//
// Why it exists: `{message && <p aria-live="polite">{message}</p>}` inserts the region and its
// content in the same tick. Screen readers register live regions on mount and announce only
// SUBSEQUENT mutations, so the first message is silently missed. The whole M6d I-1 design rests on
// the region being permanently mounted with only its text content changing. If someone later
// "tidies" this component into a conditional render, every announcement in the app goes silent
// with no visual change and no other test failing. This test is the tripwire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'live-status.tsx'), 'utf8')
// Every assertion below must judge CODE, not prose: the component's doc comment quotes
// `aria-live="assertive"` verbatim (three times) while explaining why the attribute must never be
// set, and no textual pattern can tell a JSX attribute from a comment quoting one. Strip comments —
// both full-line and trailing — before every assertion; SOURCE itself is used only to build
// CODE_ONLY, never for a `toContain`/`toMatch` check.
const CODE_ONLY = SOURCE.replace(/\/\/.*$/gm, '')

describe('LiveStatus component shape', () => {
  it('never conditionally mounts the region', () => {
    expect(
      CODE_ONLY,
      'live-status.tsx must not gate its <p> behind `message &&` — a conditionally mounted live ' +
        'region misses its first announcement. Render always; vary only the text content.',
    ).not.toMatch(/\{\s*message\s*&&/)
  })

  it('maps tone to an implicit-live role', () => {
    expect(CODE_ONLY).toContain("role={tone === 'error' ? 'alert' : 'status'}")
  })

  it('does not also set aria-live', () => {
    expect(
      CODE_ONLY,
      'role="alert" already implies aria-live="assertive" and role="status" implies polite; both ' +
        'imply aria-atomic="true". Specifying aria-live as well is redundant.',
    ).not.toContain('aria-live')
  })

  it('falls back to sr-only when there is no message', () => {
    expect(
      CODE_ONLY,
      'An always-mounted empty <p> would add a phantom flex-gap row in every parent (they are all ' +
        'flex columns with a gap). sr-only is position:absolute so it is not a flex item, and ' +
        'unlike display:none it stays in the accessibility tree.',
    ).toContain("'sr-only'")
  })

  it('requires all three props', () => {
    expect(CODE_ONLY).toContain('message: string | null')
    expect(CODE_ONLY).toContain("tone: 'error' | 'status'")
    expect(CODE_ONLY).toContain('className: string')
    expect(CODE_ONLY, 'no prop may be optional — a missing className would render unstyled text').not.toMatch(
      /(message|tone|className)\?:/,
    )
  })

  it('renders the message as the element body', () => {
    expect(
      CODE_ONLY,
      'the <p> must render {message} as its child — a region with an empty body announces nothing, ' +
        'even if every other assertion in this file passes',
    ).toContain('{message}')
  })
})
