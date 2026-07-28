import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology } from './helpers';
import { correlate, benjaminiHochberg } from '../../lib/engine/correlation';
import { calibrationFrom } from '../../lib/engine/calibration';
import type { AreaFit } from '../../lib/engine/fit';

const AREAS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

/** Deterministic pseudo-random in [-1, 1) — no Math.random, so runs are reproducible. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** Builds one AreaFit per area from a people x area effect table. */
function fitsFrom(table: Array<{ id: string; effects: Record<string, number> }>): AreaFit[] {
  return AREAS.map((category_id) => {
    const people = table.filter((p) => category_id in p.effects);
    return {
      category_id,
      mu: 5,
      n: people.length,
      personEffects: people.map((p) => ({ respondent_id: p.id, effect: p.effects[category_id]! })),
      questionEffects: [],
      excludedPartial: 0,
    };
  });
}

describe('correlation', () => {
  const rules = loadFixtureMethodology().rules;

  it('returns nothing below the N gate, and something at it', () => {
    const build = (count: number) => {
      const rnd = prng(7);
      const table = Array.from({ length: count }, (_, i) => ({
        id: `u${i}`,
        effects: Object.fromEntries(AREAS.map((a) => [a, rnd() * 2])) as Record<string, number>,
      }));
      const fits = fitsFrom(table);
      return correlate(fits, calibrationFrom(fits), rules);
    };
    expect(build(17)).toEqual([]);
    // 13 = the authored pairs (Task 9's 13 structural edges, deduplicated as
    // unordered pairs). Every authored pair emits an annotation once it clears the
    // N gate, regardless of significance. `.length >= 0` is unfailable — it passes
    // for `return []`, and for an off-by-one `if (n <= c.min_n) continue` that
    // renders annotations for no church, ever. Spec §9.4 pins BOTH halves by name.
    expect(build(18)).toHaveLength(13);
  });

  it('common-method variance: strong rating styles + independent areas => 0 confirmed edges', () => {
    // Every person has a strong constant style. Raw area-mean correlation lands
    // ~0.7 on all 28 pairs from generosity alone. The deviation path must see none.
    const rnd = prng(11);
    const table = Array.from({ length: 30 }, (_, i) => {
      const style = (i % 5) - 2; // -2..2, a strong habitual offset
      return {
        id: `u${i}`,
        effects: Object.fromEntries(AREAS.map((a) => [a, style + rnd() * 0.6])) as Record<string, number>,
      };
    });
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    expect(out.filter((c) => c.verdict === 'confirmed')).toEqual([]);
  });

  it('leave-two-out: people who completed exactly two areas are excluded', () => {
    // d_a = -d_b BY CONSTRUCTION for a two-area respondent — a guaranteed perfect
    // negative correlation that means nothing.
    const rnd = prng(13);
    const table = [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `full${i}`,
        effects: Object.fromEntries(AREAS.map((a) => [a, rnd()])) as Record<string, number>,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `two${i}`,
        effects: { guest: 2, conn: -2 } as Record<string, number>,
      })),
    ];
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    const guestConn = out.find((c) => c.from === 'guest' && c.to === 'conn');
    expect(guestConn?.verdict).not.toBe('confirmed');
    expect(guestConn?.n ?? 0).toBeLessThanOrEqual(20); // the two-area people did not count
  });

  it('false-positive discipline: pure noise produces 0 unexpected edges', () => {
    const rnd = prng(17);
    const table = Array.from({ length: 40 }, (_, i) => ({
      id: `u${i}`,
      effects: Object.fromEntries(AREAS.map((a) => [a, rnd() * 2])) as Record<string, number>,
    }));
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    expect(out.filter((c) => c.verdict === 'unexpected')).toEqual([]);
  });

  it('Benjamini-Hochberg rejects most individually-significant p-values', () => {
    // BH is not reachable through correlate() on any fixture in this file: on
    // prng(17) the largest |r| is 0.4189, so practical_floor 0.5 kills every
    // candidate before BH runs, and replacing benjaminiHochberg with a
    // pass-everything stub changes no outcome in any other test here. Unit-test
    // the helper directly instead — it is pure with a hand-checkable contract.
    // BH's threshold at rank k (1-based) of m is (k/m)*alpha. With m = 20 and one
    // individually-significant p = 0.03 sitting among 19 non-significant ones, no
    // rank clears its threshold (0.03 > 0.0025 at rank 1; 0.06 > 0.05 at rank 20),
    // so BH rejects even the p that a naive p < alpha test would have accepted.
    expect(benjaminiHochberg([0.03, ...Array(19).fill(0.06)], 0.05).size).toBe(0);
    // A genuinely tiny p in the same company still survives, at rank 1 only.
    const one = benjaminiHochberg([0.0001, ...Array(19).fill(0.06)], 0.05);
    expect(one.size).toBe(1);
    expect(one.has(0)).toBe(true);
    // And a set where every p clears its own rank threshold survives whole.
    expect(benjaminiHochberg([0.001, 0.002, 0.003], 0.05).size).toBe(3);
  });

  it('practical floor holds independently of statistical significance', () => {
    // The earlier version of this test ran on pure prng(23) noise, where the
    // leave-two-out deviation structure caps |r| near 1/7 and EVERY annotation comes
    // back not_visible — so the assertion body executed zero times and vitest passed
    // a test with no assertions. Use the forced-link table instead (11 confirmed +
    // 2 unexpected under the Step 4 implementation) and prove the loop is non-empty
    // BEFORE relying on it.
    const rnd = prng(29);
    const table = Array.from({ length: 40 }, (_, i) => {
      const shared = rnd() * 2;
      const effects = Object.fromEntries(AREAS.map((a) => [a, rnd()])) as Record<string, number>;
      effects.gen = shared; effects.gov = shared; effects.comm = shared;
      return { id: `u${i}`, effects };
    });
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);

    expect(out.some((c) => c.verdict !== 'not_visible')).toBe(true); // non-vacuity guard
    for (const c of out) {
      if (c.verdict !== 'not_visible') expect(Math.abs(c.r)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('reports at most max_unexpected non-authored pairs', () => {
    const rnd = prng(29);
    const table = Array.from({ length: 40 }, (_, i) => {
      const shared = rnd() * 2;
      const effects = Object.fromEntries(AREAS.map((a) => [a, rnd()])) as Record<string, number>;
      // force a genuine link across gen/gov/comm. NOTE: gen<->gov IS authored
      // (gov.gates: all expands over the whole chain and gen), so only gen<->comm
      // and gov<->comm land in `exploratory`. The cap is exercised by the
      // surrounding prng(29) noise: 10 exploratory pairs clear BH + the practical
      // floor before .slice(0, max_unexpected) cuts them to 2. Removing .slice
      // yields 10 and fails the assertion below — that is what makes it load-bearing.
      effects.gen = shared; effects.gov = shared; effects.comm = shared;
      return { id: `u${i}`, effects };
    });
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    expect(out.filter((c) => c.verdict === 'unexpected').length).toBeLessThanOrEqual(2);
  });
});
