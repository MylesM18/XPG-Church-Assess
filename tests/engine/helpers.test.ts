import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, buildResponses, partialAnswers } from './helpers';

const m = loadFixtureMethodology();

describe('fixture helpers', () => {
  it('answers() builds one response per item, uniform value', () => {
    const rs = answers(m, 'guest', 7);
    expect(rs).toHaveLength(5);
    expect(rs.every(r => r.value === 7 && r.category_id === 'guest')).toBe(true);
    expect(rs.every(r => r.respondent_label === 'Pastor')).toBe(true);
  });
  it('answers() honors a per-item map and a custom label', () => {
    const rs = answers(m, 'guest', { G1: 2, G3: 8 }, 'Elder');
    const byId = Object.fromEntries(rs.map(r => [r.item_id, r.value]));
    expect(byId.G1).toBe(2);
    expect(byId.G3).toBe(8);
    expect(byId.G2).toBe(5); // default for unspecified items
    expect(rs.every(r => r.respondent_label === 'Elder')).toBe(true);
  });
  it('buildResponses() flattens groups', () => {
    expect(buildResponses(answers(m, 'guest', 7), answers(m, 'conn', 3))).toHaveLength(10);
  });
});

describe('partialAnswers', () => {
  it('emits only the requested items, unlike answers() which emits all five', () => {
    expect(answers(m, 'vol', 6, 'Pastor')).toHaveLength(5);
    const partial = partialAnswers(m, 'vol', ['V1'], 1, 'Elder');
    expect(partial).toHaveLength(1);
    expect(partial[0]!.item_id).toBe('V1');
    expect(partial[0]!.value).toBe(1);
    expect(partial[0]!.respondent_label).toBe('Elder');
    expect(partial[0]!.category_id).toBe('vol');
  });

  it('accepts a per-item map', () => {
    const rows = partialAnswers(m, 'vol', ['V1', 'V2'], { V1: 3, V2: 9 }, 'Elder');
    expect(rows.map((r) => [r.item_id, r.value])).toEqual([['V1', 3], ['V2', 9]]);
  });

  it('rejects an item id that is not in the category', () => {
    expect(() => partialAnswers(m, 'vol', ['G1'], 5)).toThrow(/G1/);
  });
});
