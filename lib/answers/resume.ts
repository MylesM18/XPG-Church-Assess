/**
 * Resume step for the answer form. Given the category's item ids IN ORDER and the caller's saved
 * values (item_id → value), return the 0-based index of the first item with no saved value — where
 * a returning user should pick up. If every item is answered, return 0 (open at Q1 to review/edit,
 * e.g. the "Take Again" flow).
 */
export function firstUnansweredStep(itemIds: string[], values: Record<string, number>): number {
  const idx = itemIds.findIndex((id) => values[id] == null)
  return idx === -1 ? 0 : idx
}
