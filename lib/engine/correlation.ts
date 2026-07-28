import type { Rules } from '../methodology/schema';
import type { AreaFit } from './fit';
import type { Calibration } from './calibration';
import { structuralEdges } from './dependencies';

export interface CorrelationAnnotation {
  from: string;
  to: string;
  r: number;
  n: number;
  verdict: 'confirmed' | 'not_visible' | 'unexpected';
}

/**
 * LEAVE-TWO-OUT (spec §6.2). A person's deviations are measured against their own
 * style, so they are mechanically constrained to sum toward zero. Someone who
 * completed exactly two areas has d_a = -d_b BY CONSTRUCTION — a guaranteed
 * perfect negative correlation that means nothing.
 *
 * For each pair (a,b) the style is recomputed EXCLUDING a and b, so deviations in
 * a and b are not mechanically linked. Requiring >= min_areas_per_person completed
 * areas keeps the leave-two-out style resting on at least two areas.
 */
function deviationPairs(
  effectsByPerson: Map<string, Map<string, number>>,
  a: string,
  b: string,
  minAreas: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [, effects] of effectsByPerson) {
    if (effects.size < minAreas) continue;
    const ea = effects.get(a);
    const eb = effects.get(b);
    if (ea === undefined || eb === undefined) continue;

    let sum = 0;
    let count = 0;
    for (const [area, e] of effects) {
      if (area === a || area === b) continue;
      sum += e;
      count++;
    }
    if (count < 2) continue; // style must rest on at least two other areas
    const style = sum / count;
    out.push([ea - style, eb - style]);
  }
  return out;
}

function pearson(pairs: Array<[number, number]>): number {
  const n = pairs.length;
  if (n < 3) return 0;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/**
 * Two-sided p-value for Pearson r via the t approximation, t = r*sqrt((n-2)/(1-r^2)).
 * Uses a normal approximation to the t tail — adequate at the n >= 18 this is gated
 * behind, and it avoids adding a stats dependency.
 */
function pValue(r: number, n: number): number {
  if (n < 3) return 1;
  const rr = Math.min(Math.abs(r), 0.999999);
  const t = rr * Math.sqrt((n - 2) / (1 - rr * rr));
  const z = t * (1 - 1 / (4 * (n - 2))) / Math.sqrt(1 + (t * t) / (2 * (n - 2)));
  // two-sided normal tail via erf approximation (Abramowitz & Stegun 7.1.26)
  const x = Math.abs(z) / Math.SQRT2;
  const tt = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt +
      0.254829592) *
      tt *
      Math.exp(-x * x);
  return Math.max(0, Math.min(1, 1 - erf));
}

/**
 * Benjamini-Hochberg. Returns the set of indices that survive at level alpha.
 * EXPORTED so Step 2's unit test can reach it: no fixture in this file makes BH
 * load-bearing through correlate() — the practical floor removes every candidate
 * first — so the only honest way to guard it is to test it directly.
 */
export function benjaminiHochberg(ps: number[], alpha: number): Set<number> {
  const ordered = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  let cutoff = -1;
  for (let k = 0; k < ordered.length; k++) {
    if (ordered[k]!.p <= ((k + 1) / ordered.length) * alpha) cutoff = k;
  }
  const survivors = new Set<number>();
  for (let k = 0; k <= cutoff; k++) survivors.add(ordered[k]!.i);
  return survivors;
}

export function correlate(
  fits: AreaFit[],
  _calibration: Calibration,
  rules: Rules,
): CorrelationAnnotation[] {
  const c = rules.correlation;

  const effectsByPerson = new Map<string, Map<string, number>>();
  for (const fit of fits) {
    for (const p of fit.personEffects) {
      let m = effectsByPerson.get(p.respondent_id);
      if (!m) {
        m = new Map<string, number>();
        effectsByPerson.set(p.respondent_id, m);
      }
      m.set(fit.category_id, p.effect);
    }
  }

  const areas = fits.map(f => f.category_id);
  const authored = new Set(structuralEdges(rules).map(e => `${e.from}->${e.to}`));

  const results: CorrelationAnnotation[] = [];
  const exploratory: Array<{ annotation: CorrelationAnnotation; p: number }> = [];

  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i]!;
      const b = areas[j]!;
      const pairs = deviationPairs(effectsByPerson, a, b, c.min_areas_per_person);
      const n = pairs.length;

      // N gate is per PAIR — respondents complete in BOTH areas of the pair.
      if (n < c.min_n) continue;

      const r = pearson(pairs);
      const p = pValue(r, n);
      const isAuthored = authored.has(`${a}->${b}`) || authored.has(`${b}->${a}`);

      if (isAuthored) {
        // Directed hypotheses: tested individually, no multiplicity correction.
        const visible = p <= c.alpha && Math.abs(r) >= c.practical_floor;
        results.push({ from: a, to: b, r, n, verdict: visible ? 'confirmed' : 'not_visible' });
      } else {
        exploratory.push({ annotation: { from: a, to: b, r, n, verdict: 'not_visible' }, p });
      }
    }
  }

  // Exploratory pairs: BH across them, PLUS a practical floor, PLUS a hard cap.
  const survivors = benjaminiHochberg(exploratory.map(e => e.p), c.alpha);
  const unexpected = exploratory
    .map((e, idx) => ({ ...e, idx }))
    .filter(e => survivors.has(e.idx) && Math.abs(e.annotation.r) >= c.practical_floor)
    .sort((x, y) => Math.abs(y.annotation.r) - Math.abs(x.annotation.r))
    .slice(0, c.max_unexpected)
    .map(e => ({ ...e.annotation, verdict: 'unexpected' as const }));

  return [...results, ...unexpected];
}
