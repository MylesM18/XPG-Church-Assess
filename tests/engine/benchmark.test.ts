import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { percentile, benchmarkFor } from '../../lib/engine/benchmark';

const m = loadMethodology();

describe('percentile', () => {
  const band = { p25: 40, p50: 55, p75: 70 };
  it('lands exactly on the anchor percentiles', () => {
    expect(percentile(40, band)).toBe(25);
    expect(percentile(55, band)).toBe(50);
    expect(percentile(70, band)).toBe(75);
  });
  it('interpolates between anchors', () => {
    expect(percentile(20, band)).toBe(13); // halfway from (0,0) to (40,25) → 12.5 → 13
  });
  it('clamps outside the range', () => {
    expect(percentile(-5, band)).toBe(0);
    expect(percentile(200, band)).toBe(100);
  });
});

describe('benchmarkFor', () => {
  it('uses the band + category priors', () => {
    const p = benchmarkFor('guest', 60, m, '500_999'); // p50 = 60 → 50
    expect(p).toBe(50);
  });
  it('throws on an unknown band', () => {
    expect(() => benchmarkFor('guest', 60, m, 'nope')).toThrow(/attendance_band/);
  });
});
