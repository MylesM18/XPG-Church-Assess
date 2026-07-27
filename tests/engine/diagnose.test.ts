import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { diagnose } from '../../lib/engine/index';
import type { Response } from '../../lib/engine/types';

const m = loadMethodology();
function cat(id: string, value: number): Response[] {
  const c = m.questions.categories.find(x => x.id === id)!;
  return c.items.map(it => ({ category_id: id, item_id: it.id, value, respondent_label: 'Pastor', respondent_id: 'Pastor' }));
}
const responses: Response[] = [
  ...cat('guest', 3), ...cat('conn', 7), ...cat('disc', 7), ...cat('vol', 7),
  ...cat('gen', 7), ...cat('gov', 7), ...cat('comm', 7), ...cat('sys', 7),
];

describe('diagnose end-to-end', () => {
  const d = diagnose(responses, m, { attendance_band: '500_999' });
  it('returns all eight categories and stamps the methodology version', () => {
    expect(d.categories).toHaveLength(8);
    expect(d.methodology_version).toBe('0.2.0');
  });
  it('identifies the broken first stage as primary and selects its offer', () => {
    expect(d.primary_constraint?.category_id).toBe('guest');
    expect(d.offer.type).toBe('guest_retention');
  });
  it('builds a primary evidence receipt', () => {
    expect(d.evidence_trail.some(r => r.claim === 'primary_constraint:guest')).toBe(true);
  });
});
