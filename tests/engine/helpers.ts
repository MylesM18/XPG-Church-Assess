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
