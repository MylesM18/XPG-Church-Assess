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
  /** church_members.assessment_deadline_at (null = untimed). Feeds the per-member exemption
   *  check (isExemptMember) that the caller's opts.isExempt is built from. */
  assessment_deadline_at: string | null
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
 * Optional, per-member exemption hook for buildMemberMatrix. isExempt is called once per
 * member (never once for the whole matrix), so two members with different deadlines/run
 * versions can be classified differently within the same call. buildMemberMatrix stays pure
 * and version/clock-agnostic — the caller (dashboard wiring) builds isExempt from Task 19's
 * isExemptMember plus each member's own run, and passes it in here.
 */
export interface BuildMemberMatrixOptions {
  isExempt: (member: MatrixMember) => boolean
  effectiveCategories: Category[]
}

/**
 * Pivot the sparse (member, category, count) coverage rows into a dense per-member × per-category
 * grid. The roster drives the rows, so members with zero answers still appear (all cells
 * not_started); rows for members not in the roster are ignored. Pure — no DB.
 *
 * opts is optional and backward-compatible: omitted, every member is classified against
 * `categories` exactly as before. When given, a member for whom opts.isExempt(member) is true
 * has their cell totals computed against opts.effectiveCategories (the pre-0.3.0 item list
 * their closed window never gave them a chance to answer) instead of the grown `categories`.
 * The cell list itself is always one per `categories` entry either way — only the total each
 * cell classifies against changes.
 */
export function buildMemberMatrix(
  members: MatrixMember[],
  rows: MemberCategoryCoverageRow[],
  categories: Category[],
  opts?: BuildMemberMatrixOptions,
): MemberMatrixRow[] {
  const answeredByKey = new Map<string, number>()
  for (const r of rows) answeredByKey.set(`${r.respondent_user_id}:${r.category_id}`, r.answered_count)
  return members.map((member) => {
    const totals = new Map(
      (opts && opts.isExempt(member) ? opts.effectiveCategories : categories).map((c) => [c.id, c.items.length]),
    )
    return {
      member,
      cells: categories.map((cat) => ({
        category_id: cat.id,
        status: classify(answeredByKey.get(`${member.user_id}:${cat.id}`) ?? 0, totals.get(cat.id) ?? cat.items.length),
      })),
    }
  })
}
