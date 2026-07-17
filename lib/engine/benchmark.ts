import type { Methodology, BandBenchmark } from '../methodology/schema';

export function percentile(value: number, band: BandBenchmark): number {
  const xs = [0, band.p25, band.p50, band.p75, 100];
  const ys = [0, 25, 50, 75, 100];
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const y0 = ys[i]!;
    const y1 = ys[i + 1]!;
    if (value >= x0 && value <= x1) {
      if (x1 === x0) return y0;
      return Math.round(y0 + ((value - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return 100;
}

// True only when `band` is an OWN key of the cohort benchmarks. Uses hasOwnProperty
// (not the `in` operator) so inherited Object.prototype names — 'constructor',
// '__proto__', 'toString', … — are correctly rejected instead of slipping past the
// guard and reaching benchmarkFor(), which would throw on the missing priors.
export function isKnownBand(methodology: Methodology, band: string): boolean {
  return Object.prototype.hasOwnProperty.call(methodology.benchmarks.bands, band);
}

export function benchmarkFor(
  categoryId: string,
  value: number,
  methodology: Methodology,
  attendanceBand: string,
): number {
  const band = methodology.benchmarks.bands[attendanceBand];
  if (!band) throw new Error(`benchmark: unknown attendance_band "${attendanceBand}"`);
  const priors = band[categoryId];
  if (!priors) throw new Error(`benchmark: no priors for "${categoryId}" in band "${attendanceBand}"`);
  return percentile(value, priors);
}
