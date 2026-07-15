import type { Methodology } from '../methodology/schema';
import type { DoNotWorkOn, GatingCondition, GenerosityMode } from './types';

export interface ConstraintResult {
  primary_constraint: { category_id: string } | null;
  contributing: string[];
  do_not_work_on: DoNotWorkOn[];
  gating_conditions: GatingCondition[];
  generosity_mode: GenerosityMode;
}

const GATING_NOTES: Record<string, string> = {
  gov: 'Whatever you fix will not hold until governance is addressed.',
  comm: 'Communication gates the front of the chain; upstream fixes will not land clearly until it improves.',
  sys: 'Systems gate volunteer and discipleship capacity; those fixes will not scale until systems hold.',
};

function generosityMode(
  means: { breadth: number | null; depth: number | null },
  breakThreshold: number,
): GenerosityMode {
  const breadthLow = means.breadth !== null && means.breadth * 10 < breakThreshold;
  const depthLow = means.depth !== null && means.depth * 10 < breakThreshold;
  if (breadthLow && depthLow) return 'both';
  if (breadthLow) return 'breadth';
  if (depthLow) return 'depth';
  return null;
}

export function analyzeConstraint(
  scores: Map<string, number>,
  generosityMeans: { breadth: number | null; depth: number | null },
  methodology: Methodology,
  categoryNames: Map<string, string>,
): ConstraintResult {
  const { chain, enablers, thresholds } = methodology.rules;

  const broken = chain.filter(id => (scores.get(id) ?? 0) < thresholds.break);
  const primaryId = broken.length > 0 ? broken[0]! : null;
  const primary_constraint = primaryId ? { category_id: primaryId } : null;
  const primaryIndex = primaryId ? chain.indexOf(primaryId) : -1;

  const primaryName = primaryId ? (categoryNames.get(primaryId) ?? primaryId) : '';
  const downstream = broken.filter(id => chain.indexOf(id) > primaryIndex);
  const do_not_work_on: DoNotWorkOn[] = downstream.map(id => ({
    category_id: id,
    reason: `downstream symptom of ${primaryName}`,
  }));
  const contributing = downstream.slice();

  const gating_conditions: GatingCondition[] = [];
  for (const enablerId of Object.keys(enablers)) {
    if ((scores.get(enablerId) ?? 0) < thresholds.gate) {
      gating_conditions.push({
        enabler_id: enablerId,
        note: GATING_NOTES[enablerId] ?? `${enablerId} gates part of the chain.`,
      });
    }
  }

  return {
    primary_constraint,
    contributing,
    do_not_work_on,
    gating_conditions,
    generosity_mode: generosityMode(generosityMeans, thresholds.break),
  };
}
