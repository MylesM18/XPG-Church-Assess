import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

export interface FinishedMemberCount {
  finished: number
  total: number
}

/**
 * "N of M members have finished" for the Close confirm (dashboard) and the still-open note
 * (diagnosis page) — ADR 0003. A member has finished when EVERY cell in their matrix row is
 * 'covered' (classify(): every item answered), which is the same per-member notion assessmentCta
 * maps to 'complete' (coveredCount === categories.length). Computed from the admin matrix the
 * dashboard already builds; pure — no DB. A row with zero cells is not finished (a vacuous
 * every() must not count anyone).
 */
export function finishedMemberCount(matrix: MemberMatrixRow[]): FinishedMemberCount {
  const finished = matrix.filter(
    (row) => row.cells.length > 0 && row.cells.every((cell) => cell.status === 'covered'),
  ).length
  return { finished, total: matrix.length }
}
