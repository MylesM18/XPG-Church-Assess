import { describe, it, expect } from 'vitest'
import { partialNudges } from '@/lib/coverage/partial-nudge'
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
  { user_id: 'u2', full_name: 'Ben', email: 'ben@t.com' },
]

describe('partialNudges', () => {
  it('counts a member who started an area but did not finish it', () => {
    const matrix = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 3 },
    ], CATS)
    expect(partialNudges(matrix, CATS)).toEqual([{ category_id: 'guest', count: 1 }])
  })

  it('omits areas with zero partial respondents entirely, rather than reporting count: 0', () => {
    const matrix = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 5 },
    ], CATS)
    expect(partialNudges(matrix, CATS)).toEqual([])
  })

  it('does not count a member who has not started or who fully finished the area', () => {
    const matrix = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 5 }, // covered
      { respondent_user_id: 'u2', category_id: 'guest', answered_count: 0 }, // not_started
    ], CATS)
    expect(partialNudges(matrix, CATS)).toEqual([])
  })

  it('counts every member with a partial cell in an area, and reports multiple areas independently', () => {
    const matrix = buildMemberMatrix(MEMBERS, [
      { respondent_user_id: 'u1', category_id: 'guest', answered_count: 2 },
      { respondent_user_id: 'u2', category_id: 'guest', answered_count: 4 },
      { respondent_user_id: 'u1', category_id: 'conn', answered_count: 1 },
    ], CATS)
    expect(partialNudges(matrix, CATS)).toEqual([
      { category_id: 'guest', count: 2 },
      { category_id: 'conn', count: 1 },
    ])
  })

  it('returns no nudges for an empty matrix', () => {
    expect(partialNudges([], CATS)).toEqual([])
  })
})
