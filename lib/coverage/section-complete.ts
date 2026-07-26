import type { Category } from '@/lib/methodology/schema'
import type { CoverageResult } from '@/lib/coverage/coverage'
import { assessmentCta } from '@/lib/coverage/assessment-cta'

export type SectionCompleteNav =
  | { action: 'finish-section'; targetId: string }
  | { action: 'done' }
  | { action: 'interstitial'; completedName: string; nextId: string; nextName: string }

/**
 * Pure navigation decision for the "section complete" interstitial, given the section just
 * finished (`completedId`), the caller's own coverage (`result`), and the methodology
 * `categories` (for names + canonical order). The route stays a thin data-loader.
 *
 * - finish-section — the caller has NOT actually covered `completedId` (e.g. a deep link to
 *   `.../[id]/complete`). Send them back to finish that very section.
 * - done — every section is covered. Hand off to the `/done` screen (whose own guard re-confirms).
 * - interstitial — otherwise. `nextId` is the first non-covered section in canonical order (the
 *   same choice `assessmentCta` makes); since `completedId` is covered, `next` is a different,
 *   still-incomplete section.
 */
export function sectionCompleteNav({
  completedId,
  result,
  categories,
}: {
  completedId: string
  result: CoverageResult
  categories: Category[]
}): SectionCompleteNav {
  const completed = result.categories.find((c) => c.category_id === completedId)
  if (!completed || completed.status !== 'covered') {
    return { action: 'finish-section', targetId: completedId }
  }
  if (categories.length > 0 && result.coveredCount === categories.length) {
    return { action: 'done' }
  }
  const next = assessmentCta(result, categories)
  const completedName = categories.find((c) => c.id === completedId)?.name ?? ''
  const nextName = categories.find((c) => c.id === next.targetCategoryId)?.name ?? ''
  return { action: 'interstitial', completedName, nextId: next.targetCategoryId, nextName }
}
