// Source-reading tripwire (node env, no DOM): the invite-accept page shows the AnonymityNote
// privacy callout in its 'ready' state, next to the Accept button. Mirrors
// tests/assessment/back-to-menu-link.test.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const accept = stripComments(
  fs.readFileSync(path.join(ROOT, 'app', 'accept', '[token]', 'page.tsx'), 'utf8'),
)

describe('accept page privacy note (ready state)', () => {
  it('imports the AnonymityNote component', () => {
    expect(accept, 'the accept page must import AnonymityNote').toContain(
      "import { AnonymityNote } from '@/components/anonymity-note'",
    )
  })

  it('renders <AnonymityNote /> in the ready state, before the accept button', () => {
    expect(accept, 'the note must be rendered').toContain('<AnonymityNote')
    // <AcceptButton lives only in the ready branch; pin that the note precedes it in source order,
    // placing the note inside the ready state next to the button.
    expect(
      accept.indexOf('<AnonymityNote'),
      'the note must sit just before <AcceptButton />',
    ).toBeLessThan(accept.indexOf('<AcceptButton'))
  })
})
