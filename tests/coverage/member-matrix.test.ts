import { describe, it, expect } from 'vitest'
import { buildMemberMatrix } from '@/lib/coverage/member-matrix'
import { isExemptMember } from '@/lib/coverage/exemption'
import type { Category } from '@/lib/methodology/schema'

function cat(id: string, itemIds: string[]): Category {
  return {
    id, name: id.toUpperCase(), kind: 'stage', position: 1,
    items: itemIds.map((iid) => ({ id: iid, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } })),
  }
}
const CATS: Category[] = [cat('guest', ['G1', 'G2', 'G3', 'G4', 'G5']), cat('conn', ['C1', 'C2', 'C3', 'C4', 'C5'])]
const MEMBERS = [
  { user_id: 'u1', full_name: 'Ann', email: 'ann@t.com', assessment_deadline_at: null },
  { user_id: 'u2', full_name: null, email: 'ben@t.com', assessment_deadline_at: null },
]

// Fixtures for the exemption-options tests below: one category with 3 items, the 3rd ('G3')
// a 0.3.0 item; effectiveCategories is the same category with only the first 2 -- the
// pre-0.3.0 item list a closed-window member never had a chance to answer.
const EXEMPT_MEMBER = { user_id: 'u1', full_name: 'A', email: 'a@x.com', assessment_deadline_at: '2026-08-01T00:00:00.000Z' }
const OPEN_MEMBER = { user_id: 'u2', full_name: 'B', email: 'b@x.com', assessment_deadline_at: null }
const categories: Category[] = [{
  id: 'guest', name: 'GUEST', kind: 'stage', position: 1,
  items: [
    { id: 'G1', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
    { id: 'G2', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } },
    { id: 'G3', text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' }, since: '0.3.0' },
  ],
}]
const effectiveCategories: Category[] = [cat('guest', ['G1', 'G2'])]

describe('buildMemberMatrix', () => {
  it('shows a zero-answer member as all not_started', () => {
    const m = buildMemberMatrix(MEMBERS, [], CATS)
    const ben = m.find((r) => r.member.user_id === 'u2')!
    expect(ben.cells.every((c) => c.status === 'not_started')).toBe(true)
    expect(ben.cells).toHaveLength(2)
  })
  it('classifies each cell from the coverage rows', () => {
    const m = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 5 },
      { respondent_user_id: 'u1', category_id: 'conn', answered_count: 2 },
      { respondent_user_id: 'u2', category_id: 'guest', answered_count: 3 },
    ], CATS)
    const ann = m.find((r) => r.member.user_id === 'u1')!
    expect(ann.cells.find((c) => c.category_id === 'guest')!.status).toBe('covered')
    expect(ann.cells.find((c) => c.category_id === 'conn')!.status).toBe('partial')
    const ben = m.find((r) => r.member.user_id === 'u2')!
    expect(ben.cells.find((c) => c.category_id === 'guest')!.status).toBe('partial')
    expect(ben.cells.find((c) => c.category_id === 'conn')!.status).toBe('not_started')
  })
  it('preserves member order and ignores rows for unknown members', () => {
    const m = buildMemberMatrix(MEMBERS, [{ respondent_user_id: 'ghost', category_id: 'guest', answered_count: 5 }], CATS)
    expect(m.map((r) => r.member.user_id)).toEqual(['u1', 'u2'])
    expect(m.every((r) => r.cells.every((c) => c.status === 'not_started'))).toBe(true)
  })

  it('an exempt member who answered the old items counts as covered', () => {
    const matrix = buildMemberMatrix([EXEMPT_MEMBER], [{ respondent_user_id: 'u1', category_id: 'guest', answered_count: 2 }], categories, {
      isExempt: (m) => m.user_id === 'u1',
      effectiveCategories,
    })
    expect(matrix[0]!.cells[0]!.status).toBe('covered')
  })
  it('a non-exempt member with the same answers is still partial', () => {
    const matrix = buildMemberMatrix([OPEN_MEMBER], [{ respondent_user_id: 'u2', category_id: 'guest', answered_count: 2 }], categories, {
      isExempt: () => false,
      effectiveCategories,
    })
    expect(matrix[0]!.cells[0]!.status).toBe('partial')
  })
  it('without opts, behaviour is exactly as before', () => {
    const matrix = buildMemberMatrix([OPEN_MEMBER], [{ respondent_user_id: 'u2', category_id: 'guest', answered_count: 2 }], categories)
    expect(matrix[0]!.cells[0]!.status).toBe('partial')
    expect(matrix[0]!.cells).toHaveLength(categories.length)
  })
  it('an exempt member still gets one cell per category', () => {
    const matrix = buildMemberMatrix([EXEMPT_MEMBER], [], categories, {
      isExempt: () => true,
      effectiveCategories,
    })
    expect(matrix[0]!.cells).toHaveLength(categories.length)
  })
  // Beyond the brief's 4 cases: exercises the REAL isExemptMember (Task 19, revised by the owner
  // ruling in Task 26) through opts.isExempt, instead of a synthetic predicate. Proves
  // buildMemberMatrix has no exemption logic of its own to get wrong -- it purely delegates to
  // what it's given.
  //
  // REVISED (owner ruling, 2026-08-08): this used to prove a member exactly AT their deadline
  // instant was NOT yet exempt (isExemptMember's old strict `>` boundary). isExemptMember no longer
  // takes a deadline or a clock at all -- exemption is purely a fact about the run's methodology
  // version -- so there is no boundary left to pin here. What replaces it: proving that even a
  // member whose window is still WIDE OPEN (deadline far in the future) reads exempt, because the
  // answer page never serves the outreach items to anyone on a pre-0.3.0 run regardless of their
  // own deadline. This is the exact open-window interaction the owner ruling fixes.
  it('an open-window member (deadline far in the future) is still exempt via the REAL isExemptMember, because exemption is now run-scoped only', () => {
    const OPEN_WINDOW_MEMBER = { user_id: 'u1', full_name: 'A', email: 'a@x.com', assessment_deadline_at: '2099-01-01T00:00:00.000Z' }
    const matrix = buildMemberMatrix(
      [OPEN_WINDOW_MEMBER],
      [{ respondent_user_id: 'u1', category_id: 'guest', answered_count: 2 }],
      categories,
      { isExempt: () => isExemptMember('0.2.0'), effectiveCategories },
    )
    // 2/2 effective items answered -> covered. Under the OLD semantics an open-window member would
    // NOT have been exempt (measured against categories' full 3 items) and would have read
    // 'partial' forever for G3 -- an item the answer page will never even show them.
    expect(matrix[0]!.cells[0]!.status).toBe('covered')
  })
})
