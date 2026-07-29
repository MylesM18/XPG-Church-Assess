// Source-reading tripwire (node env, no DOM): the answer page now shows the AnonymityNote privacy
// callout above the form. Mirrors tests/assessment/back-to-menu-link.test.ts.
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

describe('answer page privacy note', () => {
  it('imports the AnonymityNote component', () => {
    expect(answer, 'the answer page must import AnonymityNote').toContain(
      "import { AnonymityNote } from '@/components/anonymity-note'",
    )
  })

  it('renders <AnonymityNote /> above the form', () => {
    expect(answer, 'the note must be rendered').toContain('<AnonymityNote')
    // above the sliders: the note must appear before <SelfForm in source order.
    expect(
      answer.indexOf('<AnonymityNote'),
      'the note must sit above <SelfForm />',
    ).toBeLessThan(answer.indexOf('<SelfForm'))
  })
})
