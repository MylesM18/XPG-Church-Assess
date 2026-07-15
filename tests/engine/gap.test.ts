import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { gapFor } from '../../lib/engine/gap';
import type { NormalizedCategory } from '../../lib/engine/types';

const m = loadMethodology();
const guest = m.questions.categories.find(c => c.id === 'guest')!;
const gov = m.questions.categories.find(c => c.id === 'gov')!;

function normFor(values: Record<string, number>): NormalizedCategory {
  const itemValues = new Map<string, number[]>();
  for (const [k, v] of Object.entries(values)) itemValues.set(k, [v]);
  return { category_id: 'x', itemValues, respondentMeans: [], respondentCount: 1 };
}

describe('gapFor', () => {
  it('belief high, evidence low → blind spot', () => {
    // guest: belief = G3, evidence = G1,G2,G4,G5
    const g = gapFor(normFor({ G1: 2, G2: 2, G3: 8, G4: 2, G5: 2 }), guest, 20);
    expect(g.belief).toBe(80);
    expect(g.evidence).toBe(20);
    expect(g.gap).toBe(60);
    expect(g.gap_class).toBe('blind_spot');
  });

  it('an all-belief enabler has no evidence and no gap', () => {
    const g = gapFor(normFor({ GOV1: 7, GOV2: 7, GOV3: 7, GOV4: 7, GOV5: 7 }), gov, 20);
    expect(g.evidence).toBeNull();
    expect(g.gap).toBeNull();
    expect(g.gap_class).toBeNull();
  });
});
