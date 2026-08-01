import {
  completionWindowState, inviteWindowState,
  completionBannerText, inviteBannerText, todayISODate,
} from '@/lib/deadlines/countdown'

export interface CompletionCandidate {
  church_id: string
  user_id: string
  email: string
  deadline_at: string
  last_reminded_on: string | null
}

export interface InviteCandidate {
  church_id: string
  user_id: string
  email: string
  earliest_invite_at: string
  last_invite_reminded_on: string | null
}

export interface ReminderSend {
  church_id: string
  user_id: string
  to: string
  subject: string
  text: string
}

/** Timed members with an open window not already reminded today. Pure — the route supplies `now`. */
export function planCompletionReminders(cands: CompletionCandidate[], now: Date): ReminderSend[] {
  const today = todayISODate(now)
  const sends: ReminderSend[] = []
  for (const c of cands) {
    const w = completionWindowState(new Date(c.deadline_at), now)
    if (!w.open) continue
    if (c.last_reminded_on === today) continue
    const text = completionBannerText(w)
    if (text === null) continue
    sends.push({ church_id: c.church_id, user_id: c.user_id, to: c.email, subject: 'Your church assessment window', text })
  }
  return sends
}

/** Admins with an open invite window not already reminded today. */
export function planInviteReminders(cands: InviteCandidate[], now: Date): ReminderSend[] {
  const today = todayISODate(now)
  const sends: ReminderSend[] = []
  for (const c of cands) {
    const w = inviteWindowState(new Date(c.earliest_invite_at), now)
    if (!w.open) continue
    if (c.last_invite_reminded_on === today) continue
    const text = inviteBannerText(w)
    if (text === null) continue
    sends.push({ church_id: c.church_id, user_id: c.user_id, to: c.email, subject: 'Your invitation window', text })
  }
  return sends
}
