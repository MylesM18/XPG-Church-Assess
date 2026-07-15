import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { normalize } from '../../lib/engine/normalize';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();

describe('normalize', () => {
  it('groups by item and computes per-respondent means', () => {
    const responses: Response[] = [];
    for (const it of ['G1', 'G2', 'G3', 'G4', 'G5']) {
      responses.push({ category_id: 'guest', item_id: it, value: 6, respondent_label: 'A' });
      responses.push({ category_id: 'guest', item_id: it, value: 4, respondent_label: 'B' });
    }
    const norm = normalize(responses, m).get('guest')!;
    expect(norm.itemValues.get('G1')).toEqual([6, 4]);
    expect(norm.respondentCount).toBe(2);
    expect(norm.respondentMeans.map(r => r.mean).sort()).toEqual([4, 6]);
  });

  it('produces an empty-but-present entry for unanswered categories', () => {
    const norm = normalize([], m);
    expect(norm.has('sys')).toBe(true);
    expect(norm.get('sys')!.respondentCount).toBe(0);
  });
});
