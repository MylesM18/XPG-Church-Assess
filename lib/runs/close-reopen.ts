/**
 * Copy, error mapping, and the action result type for the admin Close / Reopen assessment feature
 * (ADR 0003, spec docs/superpowers/specs/2026-08-18-close-assessment-design.md §5 / §7).
 *
 * Pure — no IO, no React, no 'use client' / 'use server' — so the server actions, the client
 * control, and three server pages all read ONE source. Strings are the spec's, verbatim.
 */

export type RunActionResult = { ok: true } | { ok: false; error: string }

/** Close confirm (dashboard). N/M come from finishedMemberCount(memberMatrix). */
export function closeConfirmText(finished: number, total: number): string {
  return `${finished} of ${total} members have finished. After closing, members can review but not change their answers. You can reopen later.`
}

/** Reopen confirm (dashboard). */
export const REOPEN_CONFIRM_TEXT =
  'Members will be able to change their answers again and reminder emails may resume.'

/** "August 18, 2026" — en-US, UTC: the report cover's own convention (diagnosis/page.tsx dateLabel),
 *  and deterministic under test regardless of the machine's zone. */
export function closedDateLabel(closedAt: string): string {
  return new Date(closedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Dashboard line for a closed run. An old-path run (completed by Generate before ADR 0003) has no
 *  closed_at; the date is omitted rather than invented. */
export function closedLineText(closedAt: string | null): string {
  return closedAt ? `Assessment closed on ${closedDateLabel(closedAt)}` : 'Assessment closed'
}

/** Diagnosis page note while the run is still open (Q4). */
export function openNoteText(finished: number, total: number): string {
  return `This assessment is still open — ${finished} of ${total} members have finished. Regenerate after closing to include everyone's answers.`
}

/** Answer page read-only copy once closed_at is known. The answer page keeps today's sentence
 *  ("This assessment is complete, so your answers are read-only.") inline as the null fallback. */
export function closedReadOnlyCopy(closedAt: string): string {
  return `This assessment was closed by your church admin on ${closedDateLabel(closedAt)}, so your answers are read-only.`
}

export const CLOSE_REOPEN_ERRORS = {
  alreadyClosed: 'Already closed — refresh to see the latest state',
  alreadyOpen: 'Already open — refresh to see the latest state',
  notAllowed: 'Not allowed',
  generic: 'Something went wrong. Please try again.',
} as const

/**
 * Maps a close_run / reopen_run refusal (the RPC's raise message) to inline copy (spec §7). Never
 * echoes the raw database error to the browser.
 */
export function mapCloseReopenError(message: string): string {
  if (message.includes('run is already closed')) return CLOSE_REOPEN_ERRORS.alreadyClosed
  if (message.includes('run is not closed')) return CLOSE_REOPEN_ERRORS.alreadyOpen
  if (message.includes('must be an admin of this church') || message.includes('not authenticated')) {
    return CLOSE_REOPEN_ERRORS.notAllowed
  }
  return CLOSE_REOPEN_ERRORS.generic
}
