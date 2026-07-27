import type { Methodology } from '../methodology/schema';
import type { Response, NormalizedCategory } from './types';
import { fitArea, type FitCell } from './fit';

export function normalize(
  responses: Response[],
  methodology: Methodology,
): Map<string, NormalizedCategory> {
  const result = new Map<string, NormalizedCategory>();

  for (const cat of methodology.questions.categories) {
    const itemValues = new Map<string, number[]>();
    for (const it of cat.items) itemValues.set(it.id, []);

    const perRespondent = new Map<string, { label: string; values: number[] }>();
    const cells: FitCell[] = [];

    for (const r of responses) {
      if (r.category_id !== cat.id) continue;
      const bucket = itemValues.get(r.item_id);
      if (!bucket) continue; // ignore values for unknown items
      bucket.push(r.value);
      const rb = perRespondent.get(r.respondent_id);
      if (rb) rb.values.push(r.value);
      else perRespondent.set(r.respondent_id, { label: r.respondent_label, values: [r.value] });
      cells.push({ respondent_id: r.respondent_id, item_id: r.item_id, value: r.value });
    }

    const respondentMeans = [...perRespondent.values()].map(({ label, values }) => ({
      label,
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    }));

    result.set(cat.id, {
      category_id: cat.id,
      itemValues,
      respondentMeans,
      respondentCount: perRespondent.size,
      fit: fitArea(cat.id, cat.items.map(it => it.id), cells),
    });
  }

  return result;
}
