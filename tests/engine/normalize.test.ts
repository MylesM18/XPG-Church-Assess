import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { normalize } from '../../lib/engine/normalize';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();

describe('normalize', () => {
  it('groups by item and computes per-respondent means', () => {
    const responses: Response[] = [];
    for (const it of ['G1', 'G2', 'G3', 'G4', 'G5']) {
      responses.push({ category_id: 'guest', item_id: it, value: 6, respondent_label: 'A', respondent_id: 'A' });
      responses.push({ category_id: 'guest', item_id: it, value: 4, respondent_label: 'B', respondent_id: 'B' });
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

describe('normalize keys respondents on identity, not label', () => {
  it('keeps two unnamed members apart even though both are labelled "Member"', () => {
    const rows: Response[] = ['G1', 'G2', 'G3', 'G4', 'G5'].flatMap((item_id) => [
      { category_id: 'guest', item_id, value: 8, respondent_label: 'Member', respondent_id: 'u-1' },
      { category_id: 'guest', item_id, value: 2, respondent_label: 'Member', respondent_id: 'u-2' },
    ]);
    const guest = normalize(rows, m).get('guest')!;

    expect(guest.respondentCount).toBe(2);
    expect(guest.fit.n).toBe(2);
    expect(guest.fit.personEffects.map((p) => p.respondent_id).sort()).toEqual(['u-1', 'u-2']);
    expect(guest.fit.mu).toBeCloseTo(5, 10);
  });
});
