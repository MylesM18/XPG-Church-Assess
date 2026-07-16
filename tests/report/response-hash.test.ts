import { describe, it, expect } from 'vitest';
import { responseHash } from '../../lib/report/response-hash';

const rows = [
  { category_id: 'guest', item_id: 'G1', value: 5, respondent_label: 'Pastor' },
  { category_id: 'guest', item_id: 'G2', value: 7, respondent_label: 'Pastor' },
  { category_id: 'conn', item_id: 'C1', value: 3, respondent_label: 'Elder' },
];

describe('responseHash', () => {
  it('is deterministic for the same rows and version', () => {
    expect(responseHash(rows, '0.1.0')).toBe(responseHash(rows, '0.1.0'));
  });

  it('is independent of row order', () => {
    const shuffled = [rows[2]!, rows[0]!, rows[1]!];
    expect(responseHash(shuffled, '0.1.0')).toBe(responseHash(rows, '0.1.0'));
  });

  it('changes when any value changes', () => {
    const changed = [{ ...rows[0]!, value: 6 }, rows[1]!, rows[2]!];
    expect(responseHash(changed, '0.1.0')).not.toBe(responseHash(rows, '0.1.0'));
  });

  it('changes when the methodology version changes', () => {
    expect(responseHash(rows, '0.2.0')).not.toBe(responseHash(rows, '0.1.0'));
  });
});
