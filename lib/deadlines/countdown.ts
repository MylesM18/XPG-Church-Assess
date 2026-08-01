// Single source of truth for both deadline windows: the day-math and every user-facing string
// for the invite window and the completion window. Pure — no I/O, no Date.now() — so banners,
// the invite box, the admin roster, and the daily email job all agree and are unit-tested.

export const WINDOW_DAYS = 3
export const DAY_MS = 86_400_000

/** Whole days remaining until `deadline`, rounded UP, clamped at 0. 72h→3, 71h→3, 24h→1, past→0. */
export function daysLeft(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS))
}

export interface InviteWindow {
  started: boolean // has the church sent its first invitation?
  open: boolean
  daysLeft: number
}

export interface CompletionWindow {
  timed: boolean // false = untimed (founder / pre-existing rows with null deadline)
  open: boolean
  daysLeft: number
}

/** Church-wide invite window from the earliest invitation's created_at (null = none sent yet). */
export function inviteWindowState(earliestInviteAt: Date | null, now: Date): InviteWindow {
  if (earliestInviteAt === null) {
    return { started: false, open: true, daysLeft: WINDOW_DAYS }
  }
  const deadline = new Date(earliestInviteAt.getTime() + WINDOW_DAYS * DAY_MS)
  return { started: true, open: now.getTime() < deadline.getTime(), daysLeft: daysLeft(deadline, now) }
}

/** Per-member completion window from church_members.assessment_deadline_at (null = untimed). */
export function completionWindowState(deadlineAt: Date | null, now: Date): CompletionWindow {
  if (deadlineAt === null) {
    return { timed: false, open: true, daysLeft: WINDOW_DAYS }
  }
  return { timed: true, open: now.getTime() < deadlineAt.getTime(), daysLeft: daysLeft(deadlineAt, now) }
}

export function dayWord(n: number): string {
  return n === 1 ? 'day' : 'days'
}

/** Dashboard admin banner. Null before the first invite (no banner shown). */
export function inviteBannerText(w: InviteWindow): string | null {
  if (!w.started) return null
  if (w.open) return `You have ${w.daysLeft} ${dayWord(w.daysLeft)} left to send invitations.`
  return 'Your 3-day invitation window has closed.'
}

/** Short line above the invite form's Send button (always shown to admins). */
export function inviteBoxText(w: InviteWindow): string {
  if (!w.started) return 'You have 3 days to invite once you send your first invitation.'
  if (w.open) return `${w.daysLeft} ${dayWord(w.daysLeft)} left to invite.`
  return 'Your 3-day invitation window has closed.'
}

/** Dashboard member banner. Null for untimed users (founder). */
export function completionBannerText(w: CompletionWindow): string | null {
  if (!w.timed) return null
  if (w.open) return `You have ${w.daysLeft} ${dayWord(w.daysLeft)} left to complete the assessment.`
  return 'Your assessment window has closed — ask an admin to reopen it.'
}

/** Compact days-left tag beside a timed member in the admin roster. Null for untimed. */
export function memberDaysLeftText(w: CompletionWindow): string | null {
  if (!w.timed) return null
  if (w.open) return `${w.daysLeft} ${dayWord(w.daysLeft)} left`
  return 'Window closed'
}

/** UTC calendar date, for the best-effort per-recipient same-day reminder guard. */
export function todayISODate(now: Date): string {
  return now.toISOString().slice(0, 10)
}
