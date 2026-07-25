import type { Category } from '@/lib/methodology/schema'
import { classify, type CoverageStatus } from '@/lib/coverage/coverage'

/** One (member, category) answered count, as returned by get_member_category_coverage. */
export interface MemberCategoryCoverageRow {
  respondent_user_id: string
  category_id: string
  answered_count: number
}

/** Structural subset of a get_church_members row needed to render a matrix row. */
export interface MatrixMember {
  user_id: string
  full_name: string | null
  email: string | null
}

export interface MatrixCell {
  category_id: string
  status: CoverageStatus
}

export interface MemberMatrixRow {
  member: MatrixMember
  cells: MatrixCell[]
}

/**
 * Pivot the sparse (member, category, count) coverage rows into a dense per-member × per-category
 * grid. The roster drives the rows, so members with zero answers still appear (all cells
 * not_started); rows for members not in the roster are ignored. Pure — no DB.
 */
export function buildMemberMatrix(
  members: MatrixMember[],
  rows: MemberCategoryCoverageRow[],
  categories: Category[],
): MemberMatrixRow[] {
  const answeredByKey = new Map<string, number>()
  for (const r of rows) answeredByKey.set(`${r.respondent_user_id}:${r.category_id}`, r.answered_count)
  return members.map((member) => ({
    member,
    cells: categories.map((cat) => ({
      category_id: cat.id,
      status: classify(answeredByKey.get(`${member.user_id}:${cat.id}`) ?? 0, cat.items.length),
    })),
  }))
}
