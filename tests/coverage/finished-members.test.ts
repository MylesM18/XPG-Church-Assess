import { describe, expect, it } from 'vitest'
import { finishedMemberCount } from '@/lib/coverage/finished-members'
import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

function row(userId: string, statuses: Array<'not_started' | 'partial' | 'covered'>): MemberMatrixRow {
  return {
    member: { user_id: userId, full_name: null, email: `${userId}@t.com`, assessment_deadline_at: null },
    cells: statuses.map((status, i) => ({ category_id: `cat${i}`, status })),
  }
}

describe('finishedMemberCount()', () => {
  it('counts a member as finished only when EVERY cell is covered', () => {
    const matrix = [
      row('u1', ['covered', 'covered', 'covered']),
      row('u2', ['covered', 'partial', 'covered']),
      row('u3', ['not_started', 'not_started', 'not_started']),
    ]
    expect(finishedMemberCount(matrix)).toEqual({ finished: 1, total: 3 })
  })
  it('moves in both directions when a cell flips', () => {
    const before = [row('u1', ['covered', 'partial'])]
    const after = [row('u1', ['covered', 'covered'])]
    expect(finishedMemberCount(before).finished).toBe(0)
    expect(finishedMemberCount(after).finished).toBe(1)
  })
  it('is 0 of 0 for an empty matrix (viewers never see the control anyway)', () => {
    expect(finishedMemberCount([])).toEqual({ finished: 0, total: 0 })
  })
  it('does not count a member with zero cells as finished (vacuous every())', () => {
    expect(finishedMemberCount([row('u1', [])])).toEqual({ finished: 0, total: 1 })
  })
})
