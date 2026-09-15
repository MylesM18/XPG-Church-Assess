import { describe, expect, it } from 'vitest'
import { splitRoster } from '@/lib/access/roster'

// Since invite = account creation, a person who has been invited but never signed in already
// holds a church_members row. The Manage access page must not list them under "Members" as if
// they had joined — they belong under the pending invitations, which is where Resend / Revoke
// live. The split is by e-mail against the still-pending invitations (case-insensitive: the
// invitation stores a lower-cased address, auth keeps what the person typed).
const members = [
  { user_id: 'u1', email: 'Founder@Church.org', role: 'admin' },
  { user_id: 'u2', email: 'Leader@Church.org', role: 'viewer' },
  { user_id: 'u3', email: null, role: 'viewer' },
]

describe('splitRoster', () => {
  it('moves members with a pending invitation out of the joined list', () => {
    const { joined, waiting } = splitRoster(members, [{ invited_email: 'leader@church.org' }])
    expect(joined.map((m) => m.user_id)).toEqual(['u1', 'u3'])
    expect(waiting.map((m) => m.user_id)).toEqual(['u2'])
  })

  it('keeps everyone when nothing is pending', () => {
    const { joined, waiting } = splitRoster(members, [])
    expect(joined).toHaveLength(3)
    expect(waiting).toHaveLength(0)
  })

  it('never matches a null e-mail against anything', () => {
    const { joined } = splitRoster(members, [{ invited_email: '' }])
    expect(joined.map((m) => m.user_id)).toEqual(['u1', 'u2', 'u3'])
  })
})
