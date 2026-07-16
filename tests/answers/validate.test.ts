import { describe, it, expect } from 'vitest'
import { validateCategoryAnswers } from '@/lib/answers/validate'
import type { Category } from '@/lib/methodology/schema'

const guest: Category = {
  id: 'guest',
  name: 'Guest',
  kind: 'stage',
  position: 1,
  items: ['G1', 'G2', 'G3', 'G4', 'G5'].map((id) => ({
    id, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' },
  })),
}
const CATS = [guest]
const full = [
  { item_id: 'G1', value: 3 }, { item_id: 'G2', value: 4 }, { item_id: 'G3', value: 5 },
  { item_id: 'G4', value: 6 }, { item_id: 'G5', value: 7 },
]

describe('validateCategoryAnswers()', () => {
  it('accepts a complete, in-range set', () => {
    const r = validateCategoryAnswers('guest', full, CATS)
    expect(r.ok).toBe(true)
  })

  it('rejects an unknown category', () => {
    const r = validateCategoryAnswers('nope', full, CATS)
    expect(r).toEqual({ ok: false, error: expect.stringContaining('category') })
  })

  it('rejects a non-array payload', () => {
    const r = validateCategoryAnswers('guest', { G1: 3 }, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects the wrong number of answers', () => {
    const r = validateCategoryAnswers('guest', full.slice(0, 4), CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects an item that is not in the category', () => {
    const bad = [...full.slice(0, 4), { item_id: 'ZZ', value: 5 }]
    const r = validateCategoryAnswers('guest', bad, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects a duplicate item', () => {
    const dup = [...full.slice(0, 4), { item_id: 'G1', value: 5 }]
    const r = validateCategoryAnswers('guest', dup, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects an out-of-range value', () => {
    const bad = [...full.slice(0, 4), { item_id: 'G5', value: 11 }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })

  it('rejects a non-integer value', () => {
    const bad = [...full.slice(0, 4), { item_id: 'G5', value: 5.5 }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })
})
