import { describe, it, expect } from 'vitest'
import { coverage, classify, type CoverageRow } from '@/lib/coverage/coverage'
import type { Category } from '@/lib/methodology/schema'

// minimal two-category fixture (5 items each), matching the methodology shape
function cat(id: string, itemIds: string[]): Category {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'stage',
    position: 1,
    items: itemIds.map((iid) => ({
      id: iid,
      text: 't',
      signal: 'belief',
      anchors: { lo: 'l', mid: 'm', hi: 'h' },
    })),
  }
}

const CATS: Category[] = [
  cat('guest', ['G1', 'G2', 'G3', 'G4', 'G5']),
  cat('conn', ['C1', 'C2', 'C3', 'C4', 'C5']),
]

const rows = (items: Array<[string, string]>): CoverageRow[] =>
  items.map(([category_id, item_id]) => ({ category_id, item_id, response_count: 1, respondent_count: 1 }))

describe('coverage()', () => {
  it('classifies every category not_started when there are no rows', () => {
    const r = coverage([], CATS)
    expect(r.coveredCount).toBe(0)
    expect(r.categories.every((c) => c.status === 'not_started')).toBe(true)
  })

  it('classifies a category with all 5 items answered as covered', () => {
    const r = coverage(rows([['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3'], ['guest', 'G4'], ['guest', 'G5']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('covered')
    expect(r.categories.find((c) => c.category_id === 'conn')!.status).toBe('not_started')
    expect(r.coveredCount).toBe(1)
  })

  it('classifies a category with 3 of 5 items answered as partial', () => {
    const r = coverage(rows([['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('partial')
    expect(r.coveredCount).toBe(0)
  })

  it('treats a row with response_count 0 as not answered', () => {
    const zero: CoverageRow[] = [{ category_id: 'guest', item_id: 'G1', response_count: 0, respondent_count: 0 }]
    const r = coverage(zero, CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('not_started')
  })

  it('ignores rows for unknown items/categories', () => {
    const r = coverage(rows([['guest', 'ZZZ'], ['nope', 'X1']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('not_started')
    expect(r.coveredCount).toBe(0)
  })

  it('counts all covered categories', () => {
    const all = rows([
      ['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3'], ['guest', 'G4'], ['guest', 'G5'],
      ['conn', 'C1'], ['conn', 'C2'], ['conn', 'C3'], ['conn', 'C4'], ['conn', 'C5'],
    ])
    expect(coverage(all, CATS).coveredCount).toBe(2)
  })
})

describe('classify()', () => {
  it('0 answered → not_started', () => expect(classify(0, 5)).toBe('not_started'))
  it('all answered → covered', () => expect(classify(5, 5)).toBe('covered'))
  it('some answered → partial', () => expect(classify(3, 5)).toBe('partial'))
})

describe('coverage() answeredCount', () => {
  it('reports 0 for an untouched category', () => {
    const r = coverage([], CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.answeredCount).toBe(0)
  })
  it('reports the partial count', () => {
    const r = coverage(rows([['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.answeredCount).toBe(3)
  })
  it('reports the full count', () => {
    const r = coverage(rows([['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3'], ['guest', 'G4'], ['guest', 'G5']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.answeredCount).toBe(5)
  })
})
