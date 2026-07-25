import { describe, it, expect } from 'vitest'
import { buildMemberMatrix } from '@/lib/coverage/member-matrix'
import type { Category } from '@/lib/methodology/schema'

function cat(id: string, itemIds: string[]): Category {
  return {
    id, name: id.toUpperCase(), kind: 'stage', position: 1,
    items: itemIds.map((iid) => ({ id: iid, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } })),
  }
}
const CATS: Category[] = [cat('guest', ['G1', 'G2', 'G3', 'G4', 'G5']), cat('conn', ['C1', 'C2', 'C3', 'C4', 'C5'])]
const MEMBERS = [
  { user_id: 'u1', full_name: 'Ann', email: 'ann@t.com' },
  { user_id: 'u2', full_name: null, email: 'ben@t.com' },
]

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
})
