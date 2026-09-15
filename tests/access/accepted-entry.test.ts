import { describe, expect, it } from 'vitest'
import { resolveAcceptedEntry } from '@/lib/access/accept-state'

// Owner decision 2026-09-14: the invitation link keeps signing its invitee in for its whole 14-day
// life, not just once. An 'accepted' invitation therefore still has an entry decision to make on
// /accept/[token]: run the one-click sign-in again, hand over to the ordinary sign-in, route a
// signed-in member home, or refuse a different account.
const base = { isExpired: false, signedIn: false, sessionEmail: null, invitedEmail: 'Leader@Church.org', oneClick: true }

describe('resolveAcceptedEntry', () => {
  it('signs a signed-out invitee in again while the link is live and minting is possible', () => {
    expect(resolveAcceptedEntry(base)).toBe('continue')
  })

  it('hands a signed-out invitee to the ordinary sign-in once the link expired or nothing can mint', () => {
    expect(resolveAcceptedEntry({ ...base, isExpired: true })).toBe('sign_in_link')
    expect(resolveAcceptedEntry({ ...base, oneClick: false })).toBe('sign_in_link')
  })

  it('lets the signed-in invitee continue to the church the route resolves, case-insensitively', () => {
    expect(resolveAcceptedEntry({ ...base, signedIn: true, sessionEmail: 'leader@church.org' })).toBe('continue')
  })

  it('routes the signed-in invitee home when the link is dead — they are a member either way', () => {
    expect(resolveAcceptedEntry({ ...base, signedIn: true, sessionEmail: 'leader@church.org', isExpired: true })).toBe('go_home')
    expect(resolveAcceptedEntry({ ...base, signedIn: true, sessionEmail: 'leader@church.org', oneClick: false })).toBe('go_home')
  })

  it('refuses a different signed-in account before anything else', () => {
    expect(resolveAcceptedEntry({ ...base, signedIn: true, sessionEmail: 'other@church.org' })).toBe('wrong_account')
    expect(resolveAcceptedEntry({ ...base, signedIn: true, sessionEmail: 'other@church.org', isExpired: true })).toBe('wrong_account')
  })
})
