/**
 * Web-only view models for the diagnosis report (spec §5.1).
 *
 * PURE — no JSX, no @react-pdf/renderer import, no DOM. A react-pdf import here
 * would pull the PDF engine into the public share page's client bundle.
 *
 * Takes `methodology` as well as `facts` because two visuals need
 * methodology-only data: the chain stage order (rules.chain) and the
 * gate -> stage mapping (rules.enablers[].gates). Neither is in the facts pack.
 * This mirrors statGridModel, which already takes both.
 *
 * Bands are computed with readingBand, exactly as statGridModel does — NOT from
 * areaIndexFrom(sections). Same function means no drift, and this module stays a
 * pure function of facts + methodology with no dependency on assembled sections.
 *
 * Attached to ResolvedReportSections beside `cover`, NEVER to section.charts:
 * tests/report/chart-parity.test.ts hard-codes the three known chart kinds.
 */
import type { Methodology } from '../methodology/schema';
import type { CategoryState } from '../engine/types';
import type { FactsPack } from './facts';
import { readingBand } from './view';
import { verdictBandFor, type BandKey } from './charts';

/** Clamp a 0-100 score into a track percentage. */
function pct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Resolve a category id to its display name, score and reading band.
 * Returns null when the id is not in the facts pack. */
function categoryLookup(
  facts: FactsPack,
  methodology: Methodology,
  categoryId: string,
): { name: string; score: number; band: BandKey } | null {
  const cat = facts.categories.find((c) => c.id === categoryId);
  if (!cat) return null;
  return {
    name: cat.name,
    score: cat.score,
    band: readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
  };
}

export type CapacityBarsModel = {
  band: BandKey;
  capacity: number;
  throughput: number;
  capacityPct: number;
  throughputPct: number;
  gap: number;
  /** `${gap} POINTS LOST`. Null when the gap is zero or negative (spec §8). */
  gapLabel: string | null;
};

export type ConfidenceModel = {
  pct: number;
  label: string;
  respondents: number;
  areas: number;
  /** Minimum categories[].respondent_count with its area name. Area names only —
   * never respondent labels or ids (spec §10). */
  thinnest: { name: string; count: number } | null;
};

export type ConstraintRow = { id: string; name: string; score: number; note: string | null };

export type ConstraintCalloutModel = {
  eyebrow: 'PRIMARY CONSTRAINT' | 'GATING ENABLER';
  /** Panel ground. On the gating face this follows the worst (lowest-scoring)
   * gated enabler, so the panel never looks healthier than its worst row. */
  band: BandKey;
  rows: ConstraintRow[];
};

export type DumbbellRow = {
  id: string;
  name: string;
  belief: number;
  evidence: number;
  gap: number;
  band: BandKey;
  beliefPct: number;
  evidencePct: number;
};

export type DumbbellsModel = { rows: DumbbellRow[] };

export type WebVisuals = {
  s3: { capacity: CapacityBarsModel };
  s4: { constraint: ConstraintCalloutModel | null; dumbbells: DumbbellsModel | null };
  s13: { confidence: ConfidenceModel };
};

function capacityBars(facts: FactsPack): CapacityBarsModel {
  const { capacity, throughput, gap } = facts.overall;
  return {
    band: verdictBandFor(facts.overall.tier.id),
    capacity,
    throughput,
    capacityPct: pct(capacity),
    throughputPct: pct(throughput),
    gap,
    gapLabel: gap > 0 ? `${gap} POINTS LOST` : null,
  };
}

function confidenceModel(facts: FactsPack): ConfidenceModel {
  const percent = Math.round(facts.confidence * 100);
  let thinnest: { name: string; count: number } | null = null;
  for (const cat of facts.categories) {
    if (!thinnest || cat.respondent_count < thinnest.count) {
      thinnest = { name: cat.name, count: cat.respondent_count };
    }
  }
  return {
    pct: percent,
    label: `${percent}%`,
    respondents: facts.cover.respondent_count,
    areas: facts.categories.length,
    thinnest,
  };
}

function constraintCallout(
  facts: FactsPack,
  methodology: Methodology,
): ConstraintCalloutModel | null {
  const primary = facts.primary_constraint;
  if (primary) {
    const found = categoryLookup(facts, methodology, primary.category_id);
    if (found) {
      return {
        eyebrow: 'PRIMARY CONSTRAINT',
        band: found.band,
        rows: [{ id: primary.category_id, name: primary.name, score: found.score, note: null }],
      };
    }
    // No matching category means no truthful score to print, so fall through to
    // the gating face rather than render a panel with a fabricated number.
  }

  if (facts.gating.length === 0) return null;

  let worst = facts.gating[0]!;
  for (const gate of facts.gating) {
    if (gate.score < worst.score) worst = gate;
  }
  // Band comes from the gating row's OWN score, not a re-lookup in facts.categories: a
  // gating row exists only because its enabler scored below thresholds.gate, which is the
  // exact condition that assigns CategoryState 'gate' to an enabler (see categoriesFrom's
  // own convention). readingBand treats 'broken' and 'gate' identically, so this can only
  // ever land on 'severe' or 'broken' for a genuinely gated row — never 'watch'/'holding' —
  // which is what keeps the panel from ever looking healthier than its worst row.
  const worstBand = readingBand('gate', worst.score, methodology.rules.thresholds);

  return {
    eyebrow: 'GATING ENABLER',
    band: worstBand,
    rows: facts.gating.map((gate) => ({
      id: gate.enabler_id,
      name: gate.name,
      score: gate.score,
      note: gate.note,
    })),
  };
}

function dumbbells(facts: FactsPack, methodology: Methodology): DumbbellsModel | null {
  if (facts.blind_spots.length === 0) return null;
  return {
    rows: facts.blind_spots.map((spot) => ({
      id: spot.category_id,
      name: spot.name,
      belief: spot.belief,
      evidence: spot.evidence,
      gap: spot.gap,
      band: categoryLookup(facts, methodology, spot.category_id)?.band ?? 'severe',
      beliefPct: pct(spot.belief),
      evidencePct: pct(spot.evidence),
    })),
  };
}

export function webVisuals(facts: FactsPack, methodology: Methodology): WebVisuals {
  return {
    s3: { capacity: capacityBars(facts) },
    s4: {
      constraint: constraintCallout(facts, methodology),
      dumbbells: dumbbells(facts, methodology),
    },
    s13: { confidence: confidenceModel(facts) },
  };
}
