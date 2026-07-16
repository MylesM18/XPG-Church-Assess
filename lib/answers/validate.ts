import type { Category } from '@/lib/methodology/schema'

export interface AnswerInput {
  item_id: string
  value: number
}

export type ValidateResult =
  | { ok: true; answers: AnswerInput[] }
  | { ok: false; error: string }

/**
 * Methodology-semantic validation (the single source of methodology truth is the YAML, so this
 * lives here, not in SQL). Checks: category exists, exactly N answers where N = the category's
 * item count, each item_id belongs to the category, no duplicates, every item present, and each
 * value is an integer 1..10.
 */
export function validateCategoryAnswers(
  categoryId: string,
  answers: unknown,
  categories: Category[],
): ValidateResult {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { ok: false, error: `Unknown category: ${categoryId}` }

  if (!Array.isArray(answers)) return { ok: false, error: 'Answers must be an array.' }

  const itemIds = category.items.map((i) => i.id)
  if (answers.length !== itemIds.length) {
    return { ok: false, error: `Expected ${itemIds.length} answers, got ${answers.length}.` }
  }

  const seen = new Set<string>()
  const clean: AnswerInput[] = []
  for (const a of answers) {
    if (typeof a !== 'object' || a === null) return { ok: false, error: 'Each answer must be an object.' }
    const itemId = (a as Record<string, unknown>).item_id
    const value = (a as Record<string, unknown>).value
    if (typeof itemId !== 'string' || !itemIds.includes(itemId)) {
      return { ok: false, error: `Item ${String(itemId)} does not belong to category ${categoryId}.` }
    }
    if (seen.has(itemId)) return { ok: false, error: `Duplicate answer for item ${itemId}.` }
    seen.add(itemId)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
      return { ok: false, error: `Value for ${itemId} must be an integer 1–10.` }
    }
    clean.push({ item_id: itemId, value })
  }

  // all items present (length + membership + no-dup already guarantees this, but be explicit)
  for (const id of itemIds) {
    if (!seen.has(id)) return { ok: false, error: `Missing answer for item ${id}.` }
  }

  return { ok: true, answers: clean }
}
