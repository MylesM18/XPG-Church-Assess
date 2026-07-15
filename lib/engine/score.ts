import type { NormalizedCategory } from './types';

export function scoreCategory(norm: NormalizedCategory): number {
  const all: number[] = [];
  for (const vals of norm.itemValues.values()) all.push(...vals);
  if (all.length === 0) return 0;
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  return Math.round(mean * 10);
}
