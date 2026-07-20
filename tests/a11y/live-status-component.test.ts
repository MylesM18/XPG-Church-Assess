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
// The aria-live assertion below must judge CODE, not prose: the component's doc comment quotes
// `aria-live="assertive"` verbatim while explaining why the attribute must never be set, and no
// textual pattern can tell a JSX attribute from a comment quoting one. Strip line comments first.
const CODE_ONLY = SOURCE.replace(/^\s*\/\/.*$/gm, '')

describe('LiveStatus component shape', () => {
  it('never conditionally mounts the region', () => {
    expect(
      SOURCE,
      'live-status.tsx must not gate its <p> behind `message &&` — a conditionally mounted live ' +
        'region misses its first announcement. Render always; vary only the text content.',
    ).not.toMatch(/\{\s*message\s*&&/)
  })

  it('maps tone to an implicit-live role', () => {
    expect(SOURCE).toContain("role={tone === 'error' ? 'alert' : 'status'}")
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
      SOURCE,
      'An always-mounted empty <p> would add a phantom flex-gap row in every parent (they are all ' +
        'flex columns with a gap). sr-only is position:absolute so it is not a flex item, and ' +
        'unlike display:none it stays in the accessibility tree.',
    ).toContain("'sr-only'")
  })

  it('requires all three props', () => {
    expect(SOURCE).toContain('message: string | null')
    expect(SOURCE).toContain("tone: 'error' | 'status'")
    expect(SOURCE).toContain('className: string')
    expect(SOURCE, 'no prop may be optional — a missing className would render unstyled text').not.toMatch(
      /(message|tone|className)\?:/,
    )
  })
})
