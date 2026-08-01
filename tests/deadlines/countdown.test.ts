import { describe, it, expect } from 'vitest'
import {
  WINDOW_DAYS, daysLeft, inviteWindowState, completionWindowState,
  dayWord, inviteBannerText, inviteBoxText, completionBannerText,
  memberDaysLeftText, todayISODate,
} from '@/lib/deadlines/countdown'

const at = (h: number) => new Date(Date.UTC(2026, 7, 1, h, 0, 0)) // Aug 1 2026, h:00 UTC

describe('WINDOW_DAYS', () => {
  it('is 3', () => expect(WINDOW_DAYS).toBe(3))
})

describe('daysLeft', () => {
  const now = at(0)
  it('72h → 3', () => expect(daysLeft(new Date(now.getTime() + 72 * 3_600_000), now)).toBe(3))
  it('71h → 3 (ceil)', () => expect(daysLeft(new Date(now.getTime() + 71 * 3_600_000), now)).toBe(3))
  it('48h → 2', () => expect(daysLeft(new Date(now.getTime() + 48 * 3_600_000), now)).toBe(2))
  it('24h → 1', () => expect(daysLeft(new Date(now.getTime() + 24 * 3_600_000), now)).toBe(1))
  it('1h → 1', () => expect(daysLeft(new Date(now.getTime() + 3_600_000), now)).toBe(1))
  it('exactly now → 0', () => expect(daysLeft(now, now)).toBe(0))
  it('past → clamped to 0', () => expect(daysLeft(new Date(now.getTime() - 3_600_000), now)).toBe(0))
})

describe('inviteWindowState', () => {
  it('no invites yet → not started, open, full window', () =>
    expect(inviteWindowState(null, at(0))).toEqual({ started: false, open: true, daysLeft: 3 }))
  it('anchored, mid-window → started, open, 2 days', () =>
    expect(inviteWindowState(at(0), at(24))).toEqual({ started: true, open: true, daysLeft: 2 }))
  it('anchored, past 3 days → started, closed, 0', () =>
    expect(inviteWindowState(at(0), at(72 + 1))).toEqual({ started: true, open: false, daysLeft: 0 }))
})

describe('completionWindowState', () => {
  it('null deadline → untimed', () =>
    expect(completionWindowState(null, at(0))).toEqual({ timed: false, open: true, daysLeft: 3 }))
  it('future deadline → timed, open', () =>
    expect(completionWindowState(at(48), at(0))).toEqual({ timed: true, open: true, daysLeft: 2 }))
  it('past deadline → timed, closed', () =>
    expect(completionWindowState(at(0), at(1))).toEqual({ timed: true, open: false, daysLeft: 0 }))
})

describe('copy builders', () => {
  it('dayWord singular/plural', () => {
    expect(dayWord(1)).toBe('day')
    expect(dayWord(2)).toBe('days')
    expect(dayWord(0)).toBe('days')
  })
  it('inviteBannerText: null before first invite', () =>
    expect(inviteBannerText({ started: false, open: true, daysLeft: 3 })).toBeNull())
  it('inviteBannerText: open', () =>
    expect(inviteBannerText({ started: true, open: true, daysLeft: 2 })).toBe('You have 2 days left to send invitations.'))
  it('inviteBannerText: closed', () =>
    expect(inviteBannerText({ started: true, open: false, daysLeft: 0 })).toBe('Your 3-day invitation window has closed.'))
  it('inviteBoxText: not started', () =>
    expect(inviteBoxText({ started: false, open: true, daysLeft: 3 })).toBe('You have 3 days to invite once you send your first invitation.'))
  it('inviteBoxText: open singular', () =>
    expect(inviteBoxText({ started: true, open: true, daysLeft: 1 })).toBe('1 day left to invite.'))
  it('inviteBoxText: closed', () =>
    expect(inviteBoxText({ started: true, open: false, daysLeft: 0 })).toBe('Your 3-day invitation window has closed.'))
  it('completionBannerText: untimed → null', () =>
    expect(completionBannerText({ timed: false, open: true, daysLeft: 3 })).toBeNull())
  it('completionBannerText: open', () =>
    expect(completionBannerText({ timed: true, open: true, daysLeft: 2 })).toBe('You have 2 days left to complete the assessment.'))
  it('completionBannerText: closed', () =>
    expect(completionBannerText({ timed: true, open: false, daysLeft: 0 })).toBe('Your assessment window has closed — ask an admin to reopen it.'))
  it('memberDaysLeftText: untimed → null', () =>
    expect(memberDaysLeftText({ timed: false, open: true, daysLeft: 3 })).toBeNull())
  it('memberDaysLeftText: open', () =>
    expect(memberDaysLeftText({ timed: true, open: true, daysLeft: 1 })).toBe('1 day left'))
  it('memberDaysLeftText: closed', () =>
    expect(memberDaysLeftText({ timed: true, open: false, daysLeft: 0 })).toBe('Window closed'))
})

describe('todayISODate', () => {
  it('formats YYYY-MM-DD in UTC', () =>
    expect(todayISODate(new Date(Date.UTC(2026, 7, 1, 14, 30, 0)))).toBe('2026-08-01'))
})
