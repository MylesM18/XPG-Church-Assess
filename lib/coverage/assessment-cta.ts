import type { Category } from '@/lib/methodology/schema'
import type { CoverageResult } from '@/lib/coverage/coverage'

export type AssessmentCtaState = 'not_started' | 'in_progress' | 'complete'

export interface AssessmentCta {
  state: AssessmentCtaState
  label: string
  targetCategoryId: string
}

/**
 * Whole-assessment primary CTA, derived from the coverage the dashboard already computes.
 * - not_started (nothing answered anywhere) → "Start Assessment" @ first category.
 * - complete (every category covered)       → "Take Again" @ first category (prefilled to review).
 * - in_progress (otherwise)                 → "Continue Assessment" @ first non-covered category.
 * The step WITHIN the category is chosen by the form page (first unanswered), not here.
 */
export function assessmentCta(result: CoverageResult, categories: Category[]): AssessmentCta {
  const firstId = categories[0]?.id ?? ''
  const allNotStarted = result.categories.every((c) => c.status === 'not_started')
  if (allNotStarted) {
    return { state: 'not_started', label: 'Start Assessment', targetCategoryId: firstId }
  }
  if (categories.length > 0 && result.coveredCount === categories.length) {
    return { state: 'complete', label: 'Take Again', targetCategoryId: firstId }
  }
  const firstNonCovered = result.categories.find((c) => c.status !== 'covered')
  return {
    state: 'in_progress',
    label: 'Continue Assessment',
    targetCategoryId: firstNonCovered?.category_id ?? firstId,
  }
}
