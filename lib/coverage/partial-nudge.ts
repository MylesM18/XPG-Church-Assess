import type { Category } from '@/lib/methodology/schema'
import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

export interface PartialNudge {
  category_id: string
  count: number
}

/**
 * Per-area count of members who started an area but did not finish every item in it — i.e. whose
 * buildMemberMatrix cell for that category is 'partial'. Those respondents are dropped from the
 * area's score, not down-weighted (AreaFit.excludedPartial, spec §4.5); this lets the dashboard
 * tell the admin what that cost. Derived from the member x category matrix rather than a
 * diagnosis, so it can render before any diagnosis has been generated.
 *
 * Only areas with at least one partial respondent are returned.
 */
export function partialNudges(matrix: MemberMatrixRow[], categories: Category[]): PartialNudge[] {
  return categories
    .map((cat) => ({
      category_id: cat.id,
      count: matrix.filter((row) =>
        row.cells.some((cell) => cell.category_id === cat.id && cell.status === 'partial'),
      ).length,
    }))
    .filter((n) => n.count > 0)
}
