export interface FitCell {
  respondent_id: string;
  item_id: string;
  value: number;
}

export interface AreaFit {
  category_id: string;
  mu: number; // 1..10 on a non-empty block; 0 when n === 0
  n: number; // respondents who answered EVERY item
  personEffects: Array<{ respondent_id: string; effect: number }>;
  questionEffects: Array<{ item_id: string; effect: number }>;
  // Respondents who answered SOME but not all items of this area. Counts only
  // people who submitted at least one cell here, so n + excludedPartial is NOT
  // the run's respondent count — someone who skipped the area entirely is in
  // neither. Report copy must not read it as "N people didn't finish this area".
  excludedPartial: number;
}

/**
 * Two-way balanced decomposition of one area (spec §4.1):
 *
 *   value_ri = mu + person_r + question_i + residual_ri
 *
 * Only respondents with a cell for EVERY item count (the 5-of-5 rule, spec §3
 * decision 2). That makes the block a complete rectangle with no holes, on which
 * the fit is exact and closed-form: no iteration, no convergence tolerance, no
 * shrinkage, and person-first / item-first / pooled all yield the same mu.
 *
 * SAFETY PROPERTY: on a complete rectangle mu IS the pooled mean, so when
 * everyone finished this returns exactly what the old scoreCategory() returned.
 * The math diverges from the old model only where the old model was unfair.
 *
 * Residuals are deliberately not exported — nothing in the report reads them, so
 * no dead field ships. Tests derive them from the four exported quantities.
 */
export function fitArea(category_id: string, itemIds: string[], cells: FitCell[]): AreaFit {
  const byRespondent = new Map<string, Map<string, number>>();
  const known = new Set(itemIds);

  for (const c of cells) {
    if (!known.has(c.item_id)) continue; // ignore values for unknown items
    let row = byRespondent.get(c.respondent_id);
    if (!row) {
      row = new Map<string, number>();
      byRespondent.set(c.respondent_id, row);
    }
    if (!row.has(c.item_id)) row.set(c.item_id, c.value); // first write wins; never double-count
  }

  const complete: Array<[string, Map<string, number>]> = [];
  let excludedPartial = 0;
  for (const entry of byRespondent) {
    if (entry[1].size === itemIds.length) complete.push(entry);
    else excludedPartial++;
  }

  const n = complete.length;
  if (n === 0) {
    return { category_id, mu: 0, n: 0, personEffects: [], questionEffects: [], excludedPartial };
  }

  let total = 0;
  for (const [, row] of complete) for (const id of itemIds) total += row.get(id)!;
  const mu = total / (n * itemIds.length);

  const personEffects = complete.map(([respondent_id, row]) => {
    let sum = 0;
    for (const id of itemIds) sum += row.get(id)!;
    return { respondent_id, effect: sum / itemIds.length - mu };
  });

  const questionEffects = itemIds.map(item_id => {
    let sum = 0;
    for (const [, row] of complete) sum += row.get(item_id)!;
    return { item_id, effect: sum / n - mu };
  });

  return { category_id, mu, n, personEffects, questionEffects, excludedPartial };
}

/** Area score on the report's 0..100 scale. Replaces scoreCategory(). */
export function scoreFromFit(fit: AreaFit): number {
  return Math.round(fit.mu * 10);
}
