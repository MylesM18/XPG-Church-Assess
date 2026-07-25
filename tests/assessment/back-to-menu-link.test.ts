// Source-reading tripwire (node env, no DOM): the answer page now has a "← Back to menu" link to
// the church dashboard, above the form, so a member can leave a category mid-answer without the
// browser back button. Styled like the manage-access back link. This link is invisible to every
// other assertion in the suite → pinned here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const answer = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

describe('answer page back-to-menu link', () => {
  it('imports next/link', () => {
    expect(answer, 'the answer page must import Link to render the back link').toContain(
      "import Link from 'next/link'",
    )
  })

  it('links back to the church dashboard with the "← Back to menu" label', () => {
    expect(answer, 'back link must target the church menu /app/${churchId}').toContain(
      'href={`/app/${churchId}`}',
    )
    expect(answer, 'back link text must read "← Back to menu"').toContain('← Back to menu')
  })
})
