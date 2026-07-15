import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { BenchmarksSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/benchmarks.yaml', import.meta.url)), 'utf8');
const b = BenchmarksSchema.parse(yaml.load(raw));

const BANDS = ['under_100','100_249','250_499','500_999','1000_1499','1500_plus'];
const CATS = ['guest','conn','disc','vol','gen','gov','comm','sys'];

describe('benchmarks.yaml', () => {
  it('labels itself as provisional priors', () => {
    expect(b.source.toLowerCase()).toContain('prior');
  });
  it('covers every band and category', () => {
    for (const band of BANDS) {
      expect(b.bands[band], `missing band ${band}`).toBeTruthy();
      for (const cat of CATS) {
        expect(b.bands[band]![cat], `missing ${band}.${cat}`).toBeTruthy();
      }
    }
  });
  it('percentiles are monotonic p25 < p50 < p75 and within 0..100', () => {
    for (const band of BANDS) {
      for (const cat of CATS) {
        const { p25, p50, p75 } = b.bands[band]![cat]!;
        expect(p25).toBeGreaterThanOrEqual(0);
        expect(p25).toBeLessThan(p50);
        expect(p50).toBeLessThan(p75);
        expect(p75).toBeLessThanOrEqual(100);
      }
    }
  });
});
