import { describe, it, expect } from 'vitest'
import { validateCategoryAnswers, validateSingleAnswer } from '@/lib/answers/validate'
import type { Category } from '@/lib/methodology/schema'

// Exactly two items: G1 has no reflection prompt, G6 does. validateCategoryAnswers requires a
// complete set (answers.length === itemIds.length), so the fixture stays at two items to match
// the two-answer batches exercised below.
const guest: Category = {
  id: 'guest',
  name: 'Guest Experience',
  kind: 'stage',
  position: 1,
  items: [
    { id: 'G1', text: 'q1', signal: 'evidence', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
    { id: 'G6', text: 'q6', signal: 'evidence', since: '0.3.0', anchors: { lo: 'l', mid: 'm', hi: 'h' }, reflection: 'Tell us.' },
  ],
}
const CATS = [guest]

describe('validateSingleAnswer reflection', () => {
  it('carries a reflection through untrimmed', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '  hi  ' }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer.reflection).toBe('  hi  ')
  })

  it('omits reflection when absent, leaving no undefined-valued key', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G1', value: 3 }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.answer.reflection).toBeUndefined()
      // Catches `{ ..., reflection: rawReflection }` unconditionally (key present, value
      // undefined) as opposed to the required conditional spread (key absent entirely).
      expect('reflection' in r.answer).toBe(false)
    }
  })

  it('accepts an empty string (the server nullifies it, not the client)', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '' }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer.reflection).toBe('')
  })

  it('accepts whitespace-only text, carried through untouched', () => {
    // trim().length is 0, so this must pass the length check; the value itself must NOT be
    // normalized by the client (that is the server's nullif(btrim(...), '') job).
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: '   ' }, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer.reflection).toBe('   ')
  })

  it('rejects a non-string reflection', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: 42 }, CATS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/text/i)
  })

  it('rejects a reflection longer than 2000 characters after trimming', () => {
    const long = `  ${'x'.repeat(2001)}  ` // trimmed length 2001, raw length 2005
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: long }, CATS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/2000/)
  })

  it('accepts exactly 2000 characters', () => {
    const at = 'x'.repeat(2000)
    expect(validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: at }, CATS).ok).toBe(true)
  })

  it('measures length after trimming, not before: 1990 real chars padded past 2000 raw stays valid', () => {
    // trimmed length 1990 (valid); raw length 2010 (would wrongly fail an untrimmed check)
    const padded = `${' '.repeat(10)}${'x'.repeat(1990)}${' '.repeat(10)}`
    const r = validateSingleAnswer('guest', { item_id: 'G6', value: 7, reflection: padded }, CATS)
    expect(r.ok).toBe(true)
  })
})

describe('validateCategoryAnswers reflection', () => {
  const all = [
    { item_id: 'G1', value: 3 },
    { item_id: 'G6', value: 7, reflection: 'hello' },
  ]

  it('carries reflections through on the whole-category path, omitting the key where absent', () => {
    const r = validateCategoryAnswers('guest', all, CATS)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.answers.find((a) => a.item_id === 'G6')?.reflection).toBe('hello')
      const g1 = r.answers.find((a) => a.item_id === 'G1')
      expect(g1?.reflection).toBeUndefined()
      expect(g1 && 'reflection' in g1).toBe(false)
    }
  })

  it('rejects an over-long reflection anywhere in the batch', () => {
    const bad = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 'x'.repeat(2001) }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })

  it('rejects a non-string reflection anywhere in the batch', () => {
    const bad = [{ item_id: 'G1', value: 3 }, { item_id: 'G6', value: 7, reflection: 42 }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })
})
