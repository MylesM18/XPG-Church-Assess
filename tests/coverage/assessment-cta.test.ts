import { describe, it, expect } from 'vitest'
import { assessmentCta } from '@/lib/coverage/assessment-cta'
import type { CoverageResult } from '@/lib/coverage/coverage'
import type { Category } from '@/lib/methodology/schema'

// Minimal 3-category stand-in; order matters for target selection.
const cats: Category[] = ['a', 'b', 'c'].map((id, i) => ({
  id, name: id.toUpperCase(), kind: 'stage', position: i + 1,
  items: [{ id: `${id}1`, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, theme: 'systems' }],
}))

function result(statuses: Array<'not_started' | 'partial' | 'covered'>): CoverageResult {
  const categories = cats.map((c, i) => {
    const status = statuses[i] ?? 'not_started'
    const answeredCount = status === 'not_started' ? 0 : status === 'covered' ? c.items.length : 1
    return { category_id: c.id, status, answeredCount }
  })
  return { categories, coveredCount: categories.filter((c) => c.status === 'covered').length }
}

describe('assessmentCta()', () => {
  it('nothing answered → Start Assessment at the first category', () => {
    expect(assessmentCta(result(['not_started', 'not_started', 'not_started']), cats))
      .toEqual({ state: 'not_started', label: 'Start Assessment', targetCategoryId: 'a' })
  })
  it('all covered → Review answers at the first category (review is read-only; ADR 0003: completion is admin Close, reversible)', () => {
    expect(assessmentCta(result(['covered', 'covered', 'covered']), cats))
      .toEqual({ state: 'complete', label: 'Review answers', targetCategoryId: 'a' })
  })
  it('partly done → Continue Assessment at the first non-covered category', () => {
    expect(assessmentCta(result(['covered', 'partial', 'not_started']), cats))
      .toEqual({ state: 'in_progress', label: 'Continue Assessment', targetCategoryId: 'b' })
  })
  it('first category not_started while a later one is partial → Continue at the first non-covered', () => {
    const cta = assessmentCta(result(['not_started', 'partial', 'covered']), cats)
    expect(cta.state).toBe('in_progress')
    expect(cta.targetCategoryId).toBe('a')
  })
})
