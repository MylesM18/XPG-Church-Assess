import type { Category } from '@/lib/methodology/schema'

export type CoverageStatus = 'not_started' | 'partial' | 'covered'

export interface CoverageRow {
  category_id: string
  item_id: string
  response_count: number
  respondent_count: number
}

export interface CategoryCoverage {
  category_id: string
  status: CoverageStatus
}

export interface CoverageResult {
  categories: CategoryCoverage[]
  coveredCount: number
}

/**
 * Pure classifier. For each methodology category: not_started if none of its items have any
 * response; covered if every one of its items has >=1 response; partial otherwise. coveredCount
 * is the number of covered categories → the dashboard "N of 8 areas" header.
 */
export function coverage(rows: CoverageRow[], categories: Category[]): CoverageResult {
  const answered = new Set(
    rows.filter((r) => r.response_count > 0).map((r) => `${r.category_id}:${r.item_id}`),
  )

  const cats: CategoryCoverage[] = categories.map((cat) => {
    const answeredCount = cat.items.filter((it) => answered.has(`${cat.id}:${it.id}`)).length
    let status: CoverageStatus
    if (answeredCount === 0) status = 'not_started'
    else if (answeredCount === cat.items.length) status = 'covered'
    else status = 'partial'
    return { category_id: cat.id, status }
  })

  return { categories: cats, coveredCount: cats.filter((c) => c.status === 'covered').length }
}
