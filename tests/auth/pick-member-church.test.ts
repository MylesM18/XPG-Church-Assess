import { describe, expect, it } from 'vitest'
import { pickMemberChurch } from '@/lib/auth/pick-member-church'

describe('pickMemberChurch', () => {
  it('returns null when the user belongs to no church', () => {
    expect(pickMemberChurch([])).toBeNull()
  })

  it('returns the only church id when the user belongs to exactly one', () => {
    expect(pickMemberChurch([{ church_id: 'church-abc' }])).toBe('church-abc')
  })

  it('returns the first row deterministically for a multi-church member', () => {
    // The page queries church_members ordered by created_at asc, so "first row" is
    // the earliest-joined church — a stable landing target across requests.
    expect(
      pickMemberChurch([
        { church_id: 'first-church' },
        { church_id: 'second-church' },
        { church_id: 'third-church' },
      ]),
    ).toBe('first-church')
  })
})
