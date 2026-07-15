import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { analyzeConstraint } from '../../lib/engine/constraint';

const m = loadMethodology();
const names = new Map(m.questions.categories.map(c => [c.id, c.name]));
const scoresOf = (o: Record<string, number>) => {
  const map = new Map<string, number>();
  for (const c of m.questions.categories) map.set(c.id, o[c.id] ?? 70);
  return map;
};
const noGen = { breadth: null, depth: null };

describe('analyzeConstraint', () => {
  it('first broken stage is primary; later broken stages are do_not_work_on', () => {
    const r = analyzeConstraint(scoresOf({ guest: 30, conn: 30, disc: 30 }), noGen, m, names);
    expect(r.primary_constraint?.category_id).toBe('guest');
    expect(r.do_not_work_on.map(x => x.category_id)).toEqual(['conn', 'disc']);
    expect(r.contributing).toEqual(['conn', 'disc']);
    expect(r.do_not_work_on[0]!.reason).toContain('Guest Experience');
  });

  it('no broken stage → NO_STRUCTURAL_CONSTRAINT', () => {
    const r = analyzeConstraint(scoresOf({}), noGen, m, names);
    expect(r.primary_constraint).toBeNull();
    expect(r.do_not_work_on).toEqual([]);
  });

  it('an enabler below gate becomes a gating condition', () => {
    const r = analyzeConstraint(scoresOf({ gov: 30 }), noGen, m, names);
    expect(r.gating_conditions.map(g => g.enabler_id)).toContain('gov');
  });

  it('generosity split: only breadth low → breadth; both low → both', () => {
    expect(analyzeConstraint(scoresOf({}), { breadth: 2, depth: 7 }, m, names).generosity_mode).toBe('breadth');
    expect(analyzeConstraint(scoresOf({}), { breadth: 2, depth: 2 }, m, names).generosity_mode).toBe('both');
    expect(analyzeConstraint(scoresOf({}), { breadth: 7, depth: 2 }, m, names).generosity_mode).toBe('depth');
    expect(analyzeConstraint(scoresOf({}), { breadth: 7, depth: 7 }, m, names).generosity_mode).toBeNull();
  });
});
