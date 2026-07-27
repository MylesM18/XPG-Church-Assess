import { describe, it, expect } from 'vitest';
import { throughput, capacity, gap } from '../../lib/engine/throughput';

const W = 0.85;

describe('throughput', () => {
  it('pins the worked example from the spec', () => {
    // guest 85 · conn 80 · disc 73 · vol 48 · gen 92
    // 0.85 * 48 + 0.15 * 75.6 = 40.8 + 11.34 = 52.14 -> 52
    expect(throughput([85, 80, 73, 48, 92], W)).toBe(52);
  });

  it('is monotone — raising any stage never lowers throughput', () => {
    const base = [85, 80, 73, 48, 92];
    for (let i = 0; i < base.length; i++) {
      for (const bump of [1, 5, 20, 52]) {
        const raised = base.slice();
        raised[i] = Math.min(100, raised[i]! + bump);
        expect(throughput(raised, W)).toBeGreaterThanOrEqual(throughput(base, W));
      }
    }
  });

  it('rewards fixing the bottleneck about 10x more than polishing a strength', () => {
    const base = [85, 80, 73, 48, 92];
    const fixed = throughput([85, 80, 73, 70, 92], W) - throughput(base, W); // vol 48 -> 70
    const polished = throughput([100, 95, 88, 48, 100], W) - throughput(base, W);
    // base:     min 48, mean 75.6 -> 0.85*48 + 0.15*75.6 = 52.14 -> 52
    // fixed:    min 70, mean 80.0 -> 0.85*70 + 0.15*80.0 = 71.50 -> 72   (delta 20)
    // polished: min 48, mean 86.2 -> 0.85*48 + 0.15*86.2 = 53.73 -> 54   (delta  2)
    expect(fixed).toBe(20);
    expect(polished).toBe(2);
    expect(fixed).toBeGreaterThan(polished * 9); // 20 > 18; the sibling test below bounds polished at <= 2
  });

  it('never pays for polishing strengths the way a harmonic mean would', () => {
    // The harmonic mean of the base chain is ~72 and rises to ~77 when only the
    // strengths improve — a +5 reward for ignoring the bottleneck, contradicting
    // the report's own "do not work on the faded stages yet". This must stay <= 2.
    const base = [85, 80, 73, 48, 92];
    expect(throughput([100, 95, 88, 48, 100], W) - throughput(base, W)).toBeLessThanOrEqual(2);
  });

  it('needs no special case when nothing is broken', () => {
    expect(throughput([90, 90, 90, 90, 90], W)).toBe(90);
  });

  it('returns 0 for an empty chain', () => {
    expect(throughput([], W)).toBe(0);
  });
});

describe('capacity and gap', () => {
  it('capacity is the mean of all eight area scores', () => {
    expect(capacity([85, 80, 73, 48, 92, 74, 81, 79])).toBe(77);
  });

  it('gap is capacity minus throughput', () => {
    expect(gap(77, 52)).toBe(25);
  });

  it('ranks a bottlenecked strong church above a uniformly weak one', () => {
    // The inversion hazard from spec §3: a pure gap ratio ranks these backwards.
    const weak = throughput([40, 40, 40, 40, 40], W);
    const bottlenecked = throughput([85, 80, 73, 48, 92], W);
    expect(bottlenecked).toBeGreaterThan(weak);
  });
});
