// Source-reading tripwire (node env, no DOM): the answer page now shows the AnonymityNote privacy
// callout above the form. Mirrors tests/assessment/back-to-menu-link.test.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import { AnonymityNote } from '@/components/anonymity-note'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const answer = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

/** Flattens the element tree a plain function component returns. No DOM, no renderer.
 *  Mirrors tests/report/anonymity-note.test.ts's textOf. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children)
  return ''
}

const REFLECTION_SENTENCE =
  'If you add an optional reflection, though, it appears in the report exactly as written, unattributed — never with your name.'

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

describe('answer page privacy note — reflection sentence (full variant)', () => {
  it('the answer page renders the bare tag — no variant override — so it gets the full (default) variant', () => {
    // If this page ever passed variant="short", the assertions below (which exercise the
    // component directly) would keep passing while the page itself silently stopped promising
    // the reflection sentence — this pin catches that drift at the call-site.
    expect(
      answer,
      'the answer page must render <AnonymityNote /> with no props, so it defaults to "full"',
    ).toContain('<AnonymityNote />')
  })

  it('the full variant explains that an optional reflection appears in the report, unattributed', () => {
    const text = textOf(AnonymityNote({}))
    expect(text).toContain(REFLECTION_SENTENCE)
  })

  it('the short variant (dashboard only, not used by this page) does not carry the reflection sentence', () => {
    // Same query as the positive assertion above, run against the other variant — this is what
    // actually catches the sentence leaking into the shared/short copy, which a differently
    // worded absence check (e.g. checking for "never shown to anyone") would not.
    const text = textOf(AnonymityNote({ variant: 'short' }))
    expect(text).not.toContain(REFLECTION_SENTENCE)
  })
})
