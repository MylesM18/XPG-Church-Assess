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

export type WebVisuals = {
  s3: { capacity: CapacityBarsModel };
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

export function webVisuals(facts: FactsPack, methodology: Methodology): WebVisuals {
  void methodology;
  return {
    s3: { capacity: capacityBars(facts) },
    s13: { confidence: confidenceModel(facts) },
  };
}
