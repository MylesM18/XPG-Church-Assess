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
