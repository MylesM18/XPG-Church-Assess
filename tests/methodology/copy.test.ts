import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology } from '../engine/helpers';

describe('copy.yaml dossier band copy', () => {
  it('has no placeholder dossier copy', () => {
    const { dossier } = loadFixtureMethodology().copy;
    const all = [
      ...Object.values(dossier.reading.stage),
      ...Object.values(dossier.reading.enabler),
      ...Object.values(dossier.generosity),
      ...Object.values(dossier.agreement),
      dossier.enabler_belief_only,
      dossier.calibration_spread,
    ];
    expect(all).toHaveLength(8 + 3 + 2 + 2); // every authored string is in the guard
    for (const s of all) {
      expect(s).not.toMatch(/owner text|PLACEHOLDER|TODO|TBD/i);
      expect(s.trim().length).toBeGreaterThan(20);
    }
  });

  it('covers all four bands for both category kinds, and all three generosity modes', () => {
    const { reading, generosity } = loadFixtureMethodology().copy.dossier;
    for (const kind of ['stage', 'enabler'] as const) {
      expect(Object.keys(reading[kind]).sort()).toEqual(['broken', 'holding', 'severe', 'watch']);
    }
    expect(Object.keys(generosity).sort()).toEqual(['both', 'breadth', 'depth']);
  });
});

// Task 7: S3's Executive Health Dashboard reads one line per archetype x tier instead of eight
// per-category bullets. xpg_read is named-keys (XpgReadSchema), not z.record, so a missing
// archetype or tier is a load-time failure rather than `undefined` in a rendered bullet — this
// test locks in that every one of the twelve pairs is actually present and non-placeholder.
describe('copy.yaml xpg_read (S3 executive dashboard)', () => {
  it('covers every archetype x tier pair with real, non-placeholder copy', () => {
    const { xpg_read } = loadFixtureMethodology().copy;
    const archetypes = ['capacity', 'constraint', 'foundation'] as const;
    const tiers = ['healthy_ready', 'healthy_stretched', 'strained', 'at_risk'] as const;
    expect(Object.keys(xpg_read).sort()).toEqual([...archetypes].sort());
    for (const archetype of archetypes) {
      expect(Object.keys(xpg_read[archetype]).sort()).toEqual([...tiers].sort());
      for (const tier of tiers) {
        const s = xpg_read[archetype][tier];
        expect(s, `${archetype}.${tier}`).not.toMatch(/owner text|PLACEHOLDER|TODO|TBD/i);
        expect(s.trim().length, `${archetype}.${tier}`).toBeGreaterThan(20);
      }
    }
  });
});
