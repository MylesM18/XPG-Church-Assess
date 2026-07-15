import type { Methodology } from '../methodology/schema';
import type { Response, NormalizedCategory } from './types';

export function normalize(
  responses: Response[],
  methodology: Methodology,
): Map<string, NormalizedCategory> {
  const result = new Map<string, NormalizedCategory>();

  for (const cat of methodology.questions.categories) {
    const itemValues = new Map<string, number[]>();
    for (const it of cat.items) itemValues.set(it.id, []);

    const perRespondent = new Map<string, number[]>();

    for (const r of responses) {
      if (r.category_id !== cat.id) continue;
      const bucket = itemValues.get(r.item_id);
      if (!bucket) continue; // ignore values for unknown items
      bucket.push(r.value);
      const rb = perRespondent.get(r.respondent_label);
      if (rb) rb.push(r.value);
      else perRespondent.set(r.respondent_label, [r.value]);
    }

    const respondentMeans = [...perRespondent.entries()].map(([label, vals]) => ({
      label,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));

    result.set(cat.id, {
      category_id: cat.id,
      itemValues,
      respondentMeans,
      respondentCount: perRespondent.size,
    });
  }

  return result;
}
