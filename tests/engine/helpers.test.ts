import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, buildResponses } from './helpers';

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
