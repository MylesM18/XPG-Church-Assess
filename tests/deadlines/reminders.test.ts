import { describe, it, expect } from 'vitest'
import { planCompletionReminders, planInviteReminders } from '@/lib/deadlines/reminders'

const now = new Date(Date.UTC(2026, 7, 1, 12, 0, 0)) // 2026-08-01T12:00Z
const future = new Date(now.getTime() + 48 * 3_600_000).toISOString() // +2d
const past = new Date(now.getTime() - 3_600_000).toISOString()

describe('planCompletionReminders', () => {
  it('includes an open, not-yet-reminded member with the shared copy', () => {
    const out = planCompletionReminders(
      [{ church_id: 'c1', user_id: 'u1', email: 'u1@x.com', deadline_at: future, last_reminded_on: null }],
      now,
    )
    expect(out).toEqual([{
      church_id: 'c1', user_id: 'u1', to: 'u1@x.com',
      subject: 'Your church assessment window',
      text: 'You have 2 days left to complete the assessment.',
    }])
  })
  it('skips a member already reminded today', () => {
    expect(planCompletionReminders(
      [{ church_id: 'c1', user_id: 'u1', email: 'u1@x.com', deadline_at: future, last_reminded_on: '2026-08-01' }],
      now,
    )).toEqual([])
  })
  it('skips a member whose window already closed', () => {
    expect(planCompletionReminders(
      [{ church_id: 'c1', user_id: 'u1', email: 'u1@x.com', deadline_at: past, last_reminded_on: null }],
      now,
    )).toEqual([])
  })
})

describe('planInviteReminders', () => {
  it('includes an admin with an open window', () => {
    const out = planInviteReminders(
      [{ church_id: 'c1', user_id: 'a1', email: 'a1@x.com',
         earliest_invite_at: new Date(now.getTime() - 24 * 3_600_000).toISOString(),
         last_invite_reminded_on: null }],
      now,
    )
    expect(out).toEqual([{
      church_id: 'c1', user_id: 'a1', to: 'a1@x.com',
      subject: 'Your invitation window',
      text: 'You have 2 days left to send invitations.',
    }])
  })
  it('skips an admin already reminded today', () => {
    expect(planInviteReminders(
      [{ church_id: 'c1', user_id: 'a1', email: 'a1@x.com',
         earliest_invite_at: new Date(now.getTime() - 24 * 3_600_000).toISOString(),
         last_invite_reminded_on: '2026-08-01' }],
      now,
    )).toEqual([])
  })
})
