import type { Methodology, Category, Offer } from '../methodology/schema';
import type {
  NormalizedCategory,
  Context,
  Diagnosis,
  DiagnosisCategory,
  CategoryState,
  BlindSpot,
  DisagreementFlag,
  EvidenceReceipt,
} from './types';
import { scoreFromFit } from './fit';
import { gapFor } from './gap';
import { benchmarkFor } from './benchmark';
import { disagreementFor } from './disagreement';
import { calibrationFrom, type Calibration } from './calibration';
import { analyzeConstraint, type ConstraintResult } from './constraint';
import { throughput, capacity, gap } from './throughput';
import { readDependencies } from './dependencies';
import { correlate } from './correlation';

interface Thresholds {
  break: number;
  gate: number;
  blind_spot_gap: number;
  dispersion: number;
}

function categoryState(
  cat: Category,
  score: number,
  percentile: number | null,
  t: Thresholds,
): CategoryState {
  if (cat.kind === 'stage') {
    if (score < t.break) return 'broken';
    if (percentile !== null && percentile < 25) return 'watch';
    return 'ok';
  }
  if (score < t.gate) return 'gate';
  if (percentile !== null && percentile < 25) return 'watch';
  return 'ok';
}

function meanOfItems(norm: NormalizedCategory, ids: string[]): number | null {
  const vals: number[] = [];
  for (const id of ids) {
    const v = norm.itemValues.get(id);
    if (v) vals.push(...v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function itemMean10(norm: NormalizedCategory, id: string): number | null {
  const vals = norm.itemValues.get(id) ?? [];
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) : null;
}

function selectOffer(constraint: ConstraintResult, methodology: Methodology): Offer {
  const primary = constraint.primary_constraint;
  if (!primary) return methodology.offers.no_constraint;
  if (primary.category_id === 'gen') {
    const mode = constraint.generosity_mode;
    if (mode === 'breadth') return methodology.offers.generosity.breadth;
    if (mode === 'both') return methodology.offers.generosity.both;
    return methodology.offers.generosity.depth; // depth or null fallback
  }
  const stageOffer = methodology.offers.stages[primary.category_id];
  if (!stageOffer) throw new Error(`assemble: no offer for stage "${primary.category_id}"`);
  return stageOffer;
}

function computeConfidence(
  constraint: ConstraintResult,
  categories: DiagnosisCategory[],
  methodology: Methodology,
): number {
  const { low_response_penalty, floor } = methodology.rules.confidence;
  const primary = constraint.primary_constraint;
  if (!primary) {
    const anySingle = categories.some(c => c.respondent_count === 1);
    return Math.max(floor, 1 - low_response_penalty * (anySingle ? 1 : 0));
  }
  let conf = 1.0;
  const primaryCat = categories.find(c => c.category_id === primary.category_id);
  if (primaryCat && primaryCat.respondent_count === 1) conf -= low_response_penalty;
  if (primary.category_id === 'disc') conf -= low_response_penalty;
  return Math.max(floor, conf);
}

function buildEvidenceTrail(
  constraint: ConstraintResult,
  blindSpots: BlindSpot[],
  disagreementFlags: DisagreementFlag[],
  normalized: Map<string, NormalizedCategory>,
  methodology: Methodology,
): EvidenceReceipt[] {
  const trail: EvidenceReceipt[] = [];

  const primary = constraint.primary_constraint;
  if (primary) {
    const cat = methodology.questions.categories.find(c => c.id === primary.category_id)!;
    const norm = normalized.get(primary.category_id)!;
    trail.push({
      claim: `primary_constraint:${primary.category_id}`,
      refs: cat.items.map(it => ({ kind: 'item', ref: it.id, value: itemMean10(norm, it.id) })),
    });
  }

  for (const bs of blindSpots) {
    trail.push({
      claim: `blind_spot:${bs.category_id}`,
      refs: [
        { kind: 'metric', ref: `${bs.category_id}.belief`, value: bs.belief },
        { kind: 'metric', ref: `${bs.category_id}.evidence`, value: bs.evidence },
      ],
    });
  }

  for (const d of disagreementFlags) {
    trail.push({
      claim: `dispersion:${d.category_id}`,
      refs: d.respondents.map(r => ({
        kind: 'metric',
        ref: `${d.category_id}.${r.label}`,
        value: Math.round(r.mean * 10) / 10,
      })),
    });
  }

  if (constraint.generosity_mode) {
    const genNorm = normalized.get('gen')!;
    const ids = [
      ...methodology.rules.generosity.breadth_items,
      ...methodology.rules.generosity.depth_items,
    ];
    trail.push({
      claim: `generosity_mode:${constraint.generosity_mode}`,
      refs: ids.map(id => ({ kind: 'metric', ref: id, value: itemMean10(genNorm, id) })),
    });
  }

  return trail;
}

export function assemble(
  normalized: Map<string, NormalizedCategory>,
  methodology: Methodology,
  context: Context,
): Diagnosis {
  const t = methodology.rules.thresholds;
  const categoryNames = new Map(methodology.questions.categories.map(c => [c.id, c.name]));

  const scores = new Map<string, number>();
  const categories: DiagnosisCategory[] = [];
  const blind_spots: BlindSpot[] = [];
  const disagreement_flags: DisagreementFlag[] = [];

  const calibration: Calibration = calibrationFrom(
    methodology.questions.categories.map(c => normalized.get(c.id)!.fit),
  );

  for (const cat of methodology.questions.categories) {
    const norm = normalized.get(cat.id)!;
    const score = scoreFromFit(norm.fit);
    scores.set(cat.id, score);

    const g = gapFor(norm, cat, t.blind_spot_gap);
    const cohort_percentile = benchmarkFor(cat.id, score, methodology, context.attendance_band);
    const state = categoryState(cat, score, cohort_percentile, t);

    categories.push({
      category_id: cat.id,
      kind: cat.kind,
      score,
      belief: g.belief,
      evidence: g.evidence,
      gap: g.gap,
      gap_class: g.gap_class,
      cohort_percentile,
      state,
      respondent_count: norm.fit.n,
      excluded_partial: norm.fit.excludedPartial,
      questionEffects: norm.fit.questionEffects,
    });

    if (g.gap_class === 'blind_spot' && g.belief !== null && g.evidence !== null && g.gap !== null) {
      blind_spots.push({ category_id: cat.id, belief: g.belief, evidence: g.evidence, gap: g.gap });
    }

    const disp = disagreementFor(norm.fit, calibration, norm.respondentMeans, t.dispersion);
    if (disp) disagreement_flags.push(disp);
  }

  const genNorm = normalized.get('gen')!;
  const generosityMeans = {
    breadth: meanOfItems(genNorm, methodology.rules.generosity.breadth_items),
    depth: meanOfItems(genNorm, methodology.rules.generosity.depth_items),
  };

  const constraint = analyzeConstraint(scores, generosityMeans, methodology, categoryNames);
  const dependencies = readDependencies(methodology.rules, scores, t.break);
  const correlations = correlate(
    methodology.questions.categories.map(cat => normalized.get(cat.id)!.fit),
    calibration,
    methodology.rules,
  );

  const chainScores = methodology.rules.chain.map(id => scores.get(id) ?? 0);
  const capacityValue = capacity([...scores.values()]);
  const throughputValue = throughput(chainScores, methodology.rules.throughput.min_weight);

  return {
    methodology_version: methodology.questions.version,
    throughput: throughputValue,
    capacity: capacityValue,
    gap: gap(capacityValue, throughputValue),
    categories,
    primary_constraint: constraint.primary_constraint,
    contributing: constraint.contributing,
    do_not_work_on: constraint.do_not_work_on,
    gating_conditions: constraint.gating_conditions,
    generosity_mode: constraint.generosity_mode,
    blind_spots,
    disagreement_flags,
    calibration,
    dependencies,
    correlations,
    offer: selectOffer(constraint, methodology),
    confidence: computeConfidence(constraint, categories, methodology),
    evidence_trail: buildEvidenceTrail(constraint, blind_spots, disagreement_flags, normalized, methodology),
  };
}
