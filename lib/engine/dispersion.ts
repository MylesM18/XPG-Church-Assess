import type { NormalizedCategory, DispersionFlag } from './types';

export function dispersionFor(
  norm: NormalizedCategory,
  threshold: number,
): DispersionFlag | null {
  const means = norm.respondentMeans;
  if (means.length <= 1) return null;
  const vals = means.map(m => m.mean);
  const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mu) ** 2, 0) / vals.length; // population
  const stddev = Math.sqrt(variance);
  if (stddev < threshold) return null;
  return {
    category_id: norm.category_id,
    respondents: means.map(m => ({ label: m.label, mean: m.mean })),
    spread: Math.round(stddev * 100) / 100,
  };
}
