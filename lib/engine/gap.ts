import type { Category } from '../methodology/schema';
import type { NormalizedCategory, GapClass } from './types';

export interface GapResult {
  belief: number | null;
  evidence: number | null;
  gap: number | null;
  gap_class: GapClass;
}

export function gapFor(
  norm: NormalizedCategory,
  category: Category,
  blindSpotGap: number,
): GapResult {
  const meanOf = (signal: 'belief' | 'evidence'): number | null => {
    const vals: number[] = [];
    for (const it of category.items) {
      if (it.signal !== signal) continue;
      const v = norm.itemValues.get(it.id);
      if (v) vals.push(...v);
    }
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10);
  };

  const belief = meanOf('belief');
  const evidence = meanOf('evidence');

  if (belief === null || evidence === null) {
    return { belief, evidence, gap: null, gap_class: null };
  }

  const gap = belief - evidence;
  let gap_class: GapClass;
  if (gap >= blindSpotGap) gap_class = 'blind_spot';
  else if (gap <= -blindSpotGap) gap_class = 'underrated';
  else gap_class = 'calibrated';

  return { belief, evidence, gap, gap_class };
}
