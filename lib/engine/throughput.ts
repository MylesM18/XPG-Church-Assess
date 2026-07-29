/**
 * Throughput is the single focal number on the cover (spec §3 decision 3/4).
 *
 *   throughput = minWeight * min(chain) + (1 - minWeight) * mean(chain)
 *
 * Chosen over a harmonic mean, which pays a church for polishing strengths while
 * the bottleneck is untouched, and over a pure chain minimum, which pays nothing
 * for real progress in four of five areas. The blend moves ~20:1 in favour of
 * fixing the bottleneck yet still rises whenever anything improves, and needs no
 * special case when no stage is broken.
 *
 * One-line explanation for the report: "85% of your throughput is set by your
 * weakest stage; the rest of the chain earns the other 15%."
 *
 * minWeight comes from rules.yaml (throughput.min_weight) — it is methodology,
 * not a magic number in code.
 */
export function throughput(chainScores: number[], minWeight: number): number {
  if (chainScores.length === 0) return 0;
  const min = Math.min(...chainScores);
  const mean = chainScores.reduce((a, b) => a + b, 0) / chainScores.length;
  return Math.round(minWeight * min + (1 - minWeight) * mean);
}

/**
 * Capacity is the equally-weighted mean of ALL area scores, enablers included
 * (spec §3 decision 5). Identical to what `overall_score` used to be.
 *
 * Areas are weighted equally regardless of item count. All eight categories have
 * five items today, but CategorySchema only requires .min(1), so this must never
 * be re-expressed as a mean over items.
 */
export function capacity(allScores: number[]): number {
  if (allScores.length === 0) return 0;
  return Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
}

/** "You are running a 77% church through a 52% pipe." */
export function gap(capacityValue: number, throughputValue: number): number {
  return capacityValue - throughputValue;
}
