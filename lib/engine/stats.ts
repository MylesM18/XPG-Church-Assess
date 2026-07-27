/**
 * Population standard deviation: mean, then mean squared deviation from the
 * mean (variance), then sqrt. Extracted from calibration.ts (stddev of
 * style) and disagreement.ts (stddev of deviation), which computed this
 * identical three-step block on different inputs. Same reduce order as the
 * original — mean via `reduce((a,b)=>a+b,0)/length`, then variance via
 * `reduce((a,x)=>a+(x-mean)**2,0)/length`, then `Math.sqrt` — so float
 * results (including rounding-sensitive downstream values) are unchanged.
 *
 * Both existing call sites guard against calling this with an empty array
 * before they reach it (calibrationFrom returns early for zero people;
 * disagreementFor returns early for fit.n <= 1). This function treats an
 * empty input as 0 rather than NaN anyway, so it stays safe for any future
 * direct caller (e.g. Task 11's correlation / Benjamini–Hochberg work).
 */
export function populationStdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}
