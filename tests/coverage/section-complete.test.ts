import { describe, it, expect } from 'vitest'
import { sectionCompleteNav } from '@/lib/coverage/section-complete'
import type { CoverageResult } from '@/lib/coverage/coverage'
import type { Category } from '@/lib/methodology/schema'

// Minimal 3-category stand-in; order matters for "next unfinished" selection.
const cats: Category[] = ['a', 'b', 'c'].map((id, i) => ({
  id, name: id.toUpperCase(), kind: 'stage', position: i + 1,
  items: [{ id: `${id}1`, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } }],
}))

function result(statuses: Array<'not_started' | 'partial' | 'covered'>): CoverageResult {
  const categories = cats.map((c, i) => {
    const status = statuses[i] ?? 'not_started'
    const answeredCount = status === 'not_started' ? 0 : status === 'covered' ? c.items.length : 1
    return { category_id: c.id, status, answeredCount }
  })
  return { categories, coveredCount: categories.filter((c) => c.status === 'covered').length }
}

describe('sectionCompleteNav()', () => {
  it('completed section not actually covered → finish-section back to that section', () => {
    // Deep link to a/complete without having covered a.
    expect(
      sectionCompleteNav({ completedId: 'a', result: result(['partial', 'not_started', 'not_started']), categories: cats }),
    ).toEqual({ action: 'finish-section', targetId: 'a' })
  })

  it('completed id absent from coverage → finish-section (defensive)', () => {
    expect(
      sectionCompleteNav({ completedId: 'zzz', result: result(['covered', 'covered', 'covered']), categories: cats }),
    ).toEqual({ action: 'finish-section', targetId: 'zzz' })
  })

  it('every section covered → done', () => {
    expect(
      sectionCompleteNav({ completedId: 'a', result: result(['covered', 'covered', 'covered']), categories: cats }),
    ).toEqual({ action: 'done' })
  })

  it('mid-completion → interstitial naming the completed and the next UNFINISHED section', () => {
    // a covered, b partial, c not_started → next unfinished is b.
    expect(
      sectionCompleteNav({ completedId: 'a', result: result(['covered', 'partial', 'not_started']), categories: cats }),
    ).toEqual({ action: 'interstitial', completedName: 'A', nextId: 'b', nextName: 'B' })
  })

  it('skips an already-covered section when choosing next', () => {
    // a and b covered, c partial → completing a points next at c (skips covered b).
    expect(
      sectionCompleteNav({ completedId: 'a', result: result(['covered', 'covered', 'partial']), categories: cats }),
    ).toEqual({ action: 'interstitial', completedName: 'A', nextId: 'c', nextName: 'C' })
  })
})
