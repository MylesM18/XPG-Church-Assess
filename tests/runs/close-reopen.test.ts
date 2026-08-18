import { describe, expect, it } from 'vitest'
import {
  CLOSE_REOPEN_ERRORS,
  REOPEN_CONFIRM_TEXT,
  closeConfirmText,
  closedDateLabel,
  closedLineText,
  closedReadOnlyCopy,
  mapCloseReopenError,
  openNoteText,
} from '@/lib/runs/close-reopen'

const CLOSED_AT = '2026-08-18T14:03:00.000Z'

describe('close / reopen copy (spec §5, verbatim)', () => {
  it('close confirm names N of M and the reopen escape hatch', () => {
    expect(closeConfirmText(3, 8)).toBe(
      '3 of 8 members have finished. After closing, members can review but not change their answers. You can reopen later.',
    )
    // both directions: the numbers are interpolated, not baked in
    expect(closeConfirmText(0, 1)).toContain('0 of 1 members have finished.')
  })
  it('reopen confirm warns about edits and reminder emails', () => {
    expect(REOPEN_CONFIRM_TEXT).toBe(
      'Members will be able to change their answers again and reminder emails may resume.',
    )
  })
  it('formats the closed date en-US / UTC like the report cover', () => {
    expect(closedDateLabel(CLOSED_AT)).toBe('August 18, 2026')
    // UTC, not local: 23:30Z on the 18th must not roll to the 19th on a US machine
    expect(closedDateLabel('2026-08-18T23:30:00.000Z')).toBe('August 18, 2026')
  })
  it('dashboard closed line: dated when closed_at is known, dateless for an old-path run', () => {
    expect(closedLineText(CLOSED_AT)).toBe('Assessment closed on August 18, 2026')
    expect(closedLineText(null)).toBe('Assessment closed')
  })
  it('diagnosis open note names N of M', () => {
    expect(openNoteText(2, 5)).toBe(
      "This assessment is still open — 2 of 5 members have finished. Regenerate after closing to include everyone's answers.",
    )
  })
  it('answer page closed copy names the admin and the date', () => {
    expect(closedReadOnlyCopy(CLOSED_AT)).toBe(
      'This assessment was closed by your church admin on August 18, 2026, so your answers are read-only.',
    )
  })
})

describe('mapCloseReopenError() (spec §7)', () => {
  it('maps the two stale-state refusals to refresh copy', () => {
    expect(mapCloseReopenError('run is already closed')).toBe('Already closed — refresh to see the latest state')
    expect(mapCloseReopenError('run is not closed')).toBe('Already open — refresh to see the latest state')
    expect(CLOSE_REOPEN_ERRORS.alreadyClosed).toBe('Already closed — refresh to see the latest state')
    expect(CLOSE_REOPEN_ERRORS.alreadyOpen).toBe('Already open — refresh to see the latest state')
  })
  it('maps admin-gate refusals to Not allowed', () => {
    expect(mapCloseReopenError('must be an admin of this church')).toBe('Not allowed')
    expect(mapCloseReopenError('not authenticated')).toBe('Not allowed')
    expect(CLOSE_REOPEN_ERRORS.notAllowed).toBe('Not allowed')
  })
  it('maps anything else to the generic message and never echoes the raw error', () => {
    const out = mapCloseReopenError('connection reset by peer')
    expect(out).toBe(CLOSE_REOPEN_ERRORS.generic)
    expect(out).not.toContain('peer')
  })
})
