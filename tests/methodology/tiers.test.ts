import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { RulesSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/rules.yaml', import.meta.url)), 'utf8');
const parsed = yaml.load(raw) as Record<string, unknown>;
const r = RulesSchema.parse(parsed);

describe('rules.yaml tiers block (spec P1/P7)', () => {
  it('carries the four locked bands with their display names', () => {
    expect(r.tiers).toEqual({
      healthy_ready: { min: 85, name: 'Healthy & Ready' },
      healthy_stretched: { min: 70, name: 'Healthy but Stretched' },
      strained: { min: 55, name: 'Strained' },
      at_risk: { min: 0, name: 'At Risk' },
    });
  });
  it('a missing band fails at load (named keys, never z.record)', () => {
    const { at_risk: _dropped, ...partialTiers } = (parsed.tiers ?? {}) as Record<string, unknown>;
    expect(RulesSchema.safeParse({ ...parsed, tiers: partialTiers }).success).toBe(false);
  });
  it('rules.yaml version is untouched (tiers are presentation thresholds, not scoring semantics)', () => {
    expect(r.version).toBe('0.2.0');
  });
});
