import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync('components/answer-form.tsx', 'utf8')

describe('answer-form reflection textarea', () => {
  it('renders the textarea only for items that carry a prompt', () => {
    expect(src).toContain('{currentItem.reflection && (')
  })

  it('caps input at 2000 characters', () => {
    expect(src).toContain('maxLength={2000}')
  })

  it('associates a hint via aria-describedby', () => {
    expect(src).toContain('aria-describedby={`reflection-hint-${currentItem.id}`}')
    expect(src).toContain('id={`reflection-hint-${currentItem.id}`}')
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

  it('keeps rating-only gating (an empty reflection never blocks Next)', () => {
    expect(src).not.toContain('reflections[currentItem.id] &&')
  })
})
