import type { AreaFit } from './fit';
import type { Calibration } from './calibration';
import { deviationsFor } from './calibration';

export interface DisagreementFlag {
  category_id: string;
  respondents: Array<{ label: string; mean: number }>;
  spread: number; // population stddev of DEVIATION, 0..10 scale
}

/**
 * Replaces dispersionFor(). The old version took the stddev of raw respondent
 * means, so a habitually harsh rater was reported as conflict in every area.
 * This takes the stddev of deviation — person effect with the person's own
 * rating style removed — so it fires only on genuine area-specific divergence
 * (spec §4.2).
 *
 * respondents is display data and stays keyed on LABEL: it is the screen-only
 * name-to-score list, and pdf/shared strip it (lib/report/view.ts).
 */
export function disagreementFor(
  fit: AreaFit,
  calibration: Calibration,
  respondentMeans: Array<{ label: string; mean: number }>,
  threshold: number,
): DisagreementFlag | null {
  if (fit.n <= 1) return null;

  const devs = deviationsFor(fit, calibration).map(d => d.deviation);
  const mean = devs.reduce((a, b) => a + b, 0) / devs.length;
  const variance = devs.reduce((a, d) => a + (d - mean) ** 2, 0) / devs.length;
  const stddev = Math.sqrt(variance);
  if (stddev < threshold) return null;

  return {
    category_id: fit.category_id,
    respondents: respondentMeans.map(m => ({ label: m.label, mean: m.mean })),
    spread: Math.round(stddev * 100) / 100,
  };
}
