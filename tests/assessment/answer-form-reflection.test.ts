import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync('components/answer-form.tsx', 'utf8')

describe('answer-form reflection textarea', () => {
  it('renders the textarea only for items that carry a prompt', () => {
    expect(src).toContain('{currentItem.reflection && (')
  })

  it('does not cap input via the DOM (a hard maxLength would silently truncate a paste with no warning)', () => {
    expect(src).not.toContain('maxLength=')
  })

  it('associates the hint and the counter with the textarea via aria-describedby', () => {
    expect(src).toContain(
      'aria-describedby={`reflection-hint-${currentItem.id} reflection-counter-${currentItem.id}`}',
    )
    expect(src).toContain('id={`reflection-hint-${currentItem.id}`}')
    expect(src).toContain('id={`reflection-counter-${currentItem.id}`}')
  })

  it('announces the counter through the shared LiveStatus primitive, never a raw aria-live attribute', () => {
    // components/live-status.tsx's own header comment: a live region inserted at the same moment
    // as its first message is silently missed by screen readers — "`{error && <p aria-live>}` does
    // not work. This API makes the broken form inexpressible." A conditionally-mounted counter
    // carrying a raw `aria-live="polite"` attribute directly (rather than going through the
    // always-mounted <LiveStatus>) reproduces exactly that bug, so this pins the safe mechanism and
    // locks out the unsafe one.
    expect(src).toContain('tone="status"')
    expect(src).not.toContain('aria-live=')
  })

  it('labels the textarea with the item prompt', () => {
    expect(src).toContain('htmlFor={`reflection-${currentItem.id}`}')
    expect(src).toContain('id={`reflection-${currentItem.id}`}')
  })

  it('shows a remaining-characters counter near the cap', () => {
    expect(src).toContain('>= 1800')
    expect(src).toContain('characters left')
  })

  it('keeps reflections in state, seeded from an optional prop', () => {
    expect(src).toContain('initialReflections')
    expect(src).toContain('useState<Record<string, string>>')
  })

  it('sends the trimmed reflection for prompted items', () => {
    expect(src).toContain("reflection: (reflections[currentItem.id] ?? '').trim()")
  })

  it('gates Next/Finish on values alone — currentAnswered must never depend on reflections', () => {
    // A `not.toContain('reflections[currentItem.id] &&')` pin (the pre-fix version of this test)
    // is evadable: it only rejects that one exact spelling. A regression that appends a
    // differently-worded reflections check to the SAME line — e.g.
    // `... && !!reflections[currentItem.id]?.trim()` — leaves the original prefix intact, so a
    // substring check still finds nothing to object to. Anchoring the FULL line with ^...$ (in
    // multiline mode) closes that gap: anything appended or changed on this line fails the match,
    // regardless of how the extra condition is spelled.
    expect(src).toMatch(
      /^\s*const currentAnswered = currentItem != null && values\[currentItem\.id\] != null\s*$/m,
    )
  })
})
