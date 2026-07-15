import { describe, it, expect } from 'vitest';
import { dispersionFor } from '../../lib/engine/dispersion';
import type { NormalizedCategory } from '../../lib/engine/types';

function norm(means: Array<{ label: string; mean: number }>): NormalizedCategory {
  return { category_id: 'disc', itemValues: new Map(), respondentMeans: means, respondentCount: means.length };
}

describe('dispersionFor', () => {
  it('flags wide disagreement', () => {
    const f = dispersionFor(norm([{ label: 'A', mean: 8 }, { label: 'B', mean: 3 }]), 2.0);
    expect(f).not.toBeNull();
    expect(f!.spread).toBeCloseTo(2.5, 5);
    expect(f!.respondents.map(r => r.label).sort()).toEqual(['A', 'B']);
  });
  it('does not flag near-agreement', () => {
    expect(dispersionFor(norm([{ label: 'A', mean: 8 }, { label: 'B', mean: 7 }]), 2.0)).toBeNull();
  });
  it('never flags a single respondent', () => {
    expect(dispersionFor(norm([{ label: 'A', mean: 8 }]), 2.0)).toBeNull();
  });
});
