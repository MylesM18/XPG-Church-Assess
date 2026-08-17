import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { tierFor, archetypeFor } from '../../lib/report/tier';

const rules = loadMethodology().rules;

describe('tierFor (spec P1: half-open lower bounds over fractional capacity)', () => {
  it.each([
    [100, 'healthy_ready', 'Healthy & Ready'],
    [85, 'healthy_ready', 'Healthy & Ready'],
    [84.6, 'healthy_stretched', 'Healthy but Stretched'],
    [70, 'healthy_stretched', 'Healthy but Stretched'],
    [69.9, 'strained', 'Growth Constrained'],
    [55, 'strained', 'Growth Constrained'],
    [54.9, 'at_risk', 'Strategic Priority'],
    [0, 'at_risk', 'Strategic Priority'],
  ] as const)('capacity %s → %s', (capacity, id, name) => {
    expect(tierFor(capacity, rules)).toEqual({ id, name });
  });
});

describe('archetypeFor (locked decision 3: the engine picks, never GPT)', () => {
  it('constraint when a primary constraint exists — even if enablers also gate', () => {
    expect(
      archetypeFor({
        primary_constraint: { category_id: 'conn' },
        gating_conditions: [{ enabler_id: 'sys', note: 'gated' }],
      }),
    ).toBe('constraint');
  });
  it('foundation when no constraint but at least one enabler gates', () => {
    expect(
      archetypeFor({
        primary_constraint: null,
        gating_conditions: [{ enabler_id: 'gov', note: 'gated' }],
      }),
    ).toBe('foundation');
  });
  it('capacity when nothing is broken and nothing gates', () => {
    expect(archetypeFor({ primary_constraint: null, gating_conditions: [] })).toBe('capacity');
  });
});
