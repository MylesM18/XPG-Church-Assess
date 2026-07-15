import { describe, it, expect } from 'vitest';
import { scoreCategory } from '../../lib/engine/score';
import type { NormalizedCategory } from '../../lib/engine/types';

function norm(itemMap: Record<string, number[]>): NormalizedCategory {
  return {
    category_id: 'x',
    itemValues: new Map(Object.entries(itemMap)),
    respondentMeans: [],
    respondentCount: 0,
  };
}

describe('scoreCategory', () => {
  it('all sixes → 60', () => {
    expect(scoreCategory(norm({ a: [6], b: [6], c: [6] }))).toBe(60);
  });
  it('mixed values → mean × 10, rounded', () => {
    expect(scoreCategory(norm({ a: [8], b: [2], c: [2], d: [2], e: [2] }))).toBe(32);
  });
  it('no values → 0', () => {
    expect(scoreCategory(norm({ a: [], b: [] }))).toBe(0);
  });
});
