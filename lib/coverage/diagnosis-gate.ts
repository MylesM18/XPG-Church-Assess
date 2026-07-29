import type { Category } from '@/lib/methodology/schema'
import type { NormalizedCategory } from '@/lib/engine/types'
import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

export interface GateResult {
  ok: boolean
  blockedAreas: string[]
}

/**
 * The diagnosis gate under the 5-of-5 rule (spec §4.6).
 *
 * The previous gate — coverage(rows).coveredCount === categories.length — checked
 * that every ITEM had at least one response from ANYONE. That is satisfiable while
 * zero people completed any area, which would produce a report with nothing
 * scoreable. Every area now needs n >= 1: at least one fully-covered respondent.
 */
export function diagnosisGate(
  normalized: Map<string, NormalizedCategory>,
  categories: Category[],
): GateResult {
  const blockedAreas = categories
    .filter((cat) => (normalized.get(cat.id)?.fit.n ?? 0) < 1)
    .map((cat) => cat.id)
  return { ok: blockedAreas.length === 0, blockedAreas }
}

/**
 * The same rule, computed from the admin dashboard's member x category matrix instead of raw
 * responses. The dashboard page reads coverage RPCs, not response rows, so it cannot compute
 * fit.n directly — but spec §3's rationale states the rule as "count a person in an area iff
 * their buildMemberMatrix cell is already green," which is exactly this data. A category is
 * blocked iff no member's cell for it is 'covered' (buildMemberMatrix / classify() in
 * lib/coverage/coverage.ts already define 'covered' as every item answered by that member).
 */
export function diagnosisGateFromMatrix(
  matrix: MemberMatrixRow[],
  categories: Category[],
): GateResult {
  const blockedAreas = categories
    .filter((cat) => !matrix.some((row) =>
      row.cells.some((cell) => cell.category_id === cat.id && cell.status === 'covered'),
    ))
    .map((cat) => cat.id)
  return { ok: blockedAreas.length === 0, blockedAreas }
}
