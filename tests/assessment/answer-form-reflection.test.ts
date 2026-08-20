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

  it('gates Next/Finish on the save round-trip alone — never on reflections', () => {
    // The reflection is optional: leaving the textarea empty must never strand a member on the
    // step. This used to be pinned through `currentAnswered`; since every question now opens with
    // DEFAULT_SCORE already chosen, the only gate left is `pending`, so the two gating lines are
    // anchored instead. Anchoring the FULL line with ^...$ (multiline) is what makes the pin
    // evasion-proof: a `not.toContain('reflections[currentItem.id] &&')` substring check only
    // rejects one spelling, and a regression that appends a differently-worded reflections
    // condition to the same line — e.g. `pending || !reflections[currentItem.id]?.trim()` —
    // leaves the original prefix intact. Anything appended to these lines fails the match.
    expect(src).toMatch(/^\s*aria-disabled=\{pending\}\s*$/m)
    expect(src).toMatch(/^\s*onClick=\{\(e\) => \{ if \(pending\) e\.preventDefault\(\) \}\}\s*$/m)
    // ...and nothing on the save path may bail out because a reflection is empty.
    const bailsOnReflection = src
      .split('\n')
      .filter((l) => l.includes('reflections[') && /\breturn false\b|preventDefault\(\)/.test(l))
    expect(
      bailsOnReflection,
      `reflection text is gating the save path: ${bailsOnReflection.join(' | ')}`,
    ).toEqual([])
  })
})
