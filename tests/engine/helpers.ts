import { loadMethodology } from '../../lib/methodology/load';
import type { Methodology } from '../../lib/methodology/schema';
import type { Response } from '../../lib/engine/types';

let cached: Methodology | null = null;

export function loadFixtureMethodology(): Methodology {
  if (!cached) cached = loadMethodology();
  return cached;
}

export function answers(
  methodology: Methodology,
  categoryId: string,
  valueOrMap: number | Record<string, number>,
  label = 'Pastor',
): Response[] {
  const cat = methodology.questions.categories.find(c => c.id === categoryId);
  if (!cat) throw new Error(`answers: unknown category "${categoryId}"`);
  return cat.items.map(it => ({
    category_id: categoryId,
    item_id: it.id,
    value: typeof valueOrMap === 'number' ? valueOrMap : (valueOrMap[it.id] ?? 5),
    respondent_label: label,
  }));
}

export function buildResponses(...groups: Response[][]): Response[] {
  return groups.flat();
}

/**
 * Emits responses for ONLY the listed item ids — a PARTIAL respondent.
 * answers() always emits every item in the category, which is why no fixture
 * ever exercised partial coverage and why the pooled-mean unfairness survived
 * to production. Throws on an unknown item id so a typo cannot silently
 * produce a smaller-than-intended partial.
 */
export function partialAnswers(
  methodology: Methodology,
  categoryId: string,
  itemIds: string[],
  valueOrMap: number | Record<string, number>,
  label = 'Elder',
): Response[] {
  const cat = methodology.questions.categories.find(c => c.id === categoryId);
  if (!cat) throw new Error(`partialAnswers: unknown category "${categoryId}"`);
  const known = new Set(cat.items.map(it => it.id));
  for (const id of itemIds) {
    if (!known.has(id)) throw new Error(`partialAnswers: "${id}" is not an item of "${categoryId}"`);
  }
  return itemIds.map(id => ({
    category_id: categoryId,
    item_id: id,
    value: typeof valueOrMap === 'number' ? valueOrMap : (valueOrMap[id] ?? 5),
    respondent_label: label,
  }));
}
