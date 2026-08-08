import { predatesOutreach } from '@/lib/methodology/effective'

/**
 * "Closed window, closed test." A member whose answering window has passed cannot be
 * asked for questions that did not exist when it was open — so on pre-0.3.0 runs their
 * progress is measured against the old item list.
 *
 * Mirrors 20260801000400's STRICT `now() > assessment_deadline_at`: at the boundary
 * instant the window is still open, so there is no exemption yet.
 */
export function isExemptMember(
  deadlineAt: string | null,
  runMethodologyVersion: string | null,
  now: Date,
): boolean {
  if (deadlineAt === null) return false
  if (!predatesOutreach(runMethodologyVersion)) return false
  return now.getTime() > new Date(deadlineAt).getTime()
}
