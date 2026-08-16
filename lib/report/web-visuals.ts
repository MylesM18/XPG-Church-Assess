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
import type { Methodology, Theme } from '../methodology/schema';
import type { CategoryState } from '../engine/types';
import type { FactsPack } from './facts';
import { readingBand } from './view';
import { verdictBandFor, type BandKey } from './charts';
import { roadmapEntries, type Phase } from './fallback-sections';

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

/** Canonical key order, used only to break count ties (spec §6.5). */
const THEME_ORDER: Theme[] = ['systems', 'culture', 'theology', 'relational'];

export type ThemeSplitRow = { theme: Theme; label: string; count: number; pct: number };

export type ThemeSplitModel = {
  rows: ThemeSplitRow[];
  total: number;
  /** Not "the six" — bottom_items can be fewer than six. */
  label: string;
};

export type SpreadRow = { id: string; name: string; spread: number; pct: number; band: BandKey };

export type SpreadModel = {
  rows: SpreadRow[];
  /** Self-scaling axis: max(ceil(largest spread), 4). Never clips. A true 0-10
   * axis would stub every bar (spread is a 0-10 population SD at 2dp). */
  axisMax: number;
  axisMaxLabel: string;
  threshold: number;
  thresholdPct: number;
  /** dispersion is flagged-only, so this marker is a floor every bar crosses.
   * Never "above"/"below", never pass/fail language. */
  thresholdLabel: string;
};

export type ChainGate = { id: string; name: string; score: number; note: string; band: BandKey };

export type ChainStage = {
  id: string;
  /** '01'..'05', from the stage's position in rules.chain. */
  ordinal: string;
  name: string;
  score: number;
  band: BandKey;
  /** Gate chips sit beside the stages they actually gate, not in one list at the
   * bottom — gating[] carries no mapping, rules.enablers[].gates does. */
  gates: ChainGate[];
};

export type ChainModel = { stages: ChainStage[]; reads: string[] };

/** 30 / 60 / 90 step the verdict band down in opacity — the same
 * same-hex-reduced-opacity treatment the s3 throughput bar uses. No new colours.
 *
 * Keyed by PHASE, never by the entry's position in roadmapEntries: the foundation archetype
 * emits one entry per (phase, gated enabler) pair, so three gated enablers produce NINE
 * entries ordered [30/A, 30/B, 30/C, 60/A, ...]. An index-keyed ramp gave those three
 * consecutive 30-day blocks 1 / 0.6 / 0.3 and flattened all six 60- and 90-day blocks to
 * 0.3, so opacity stopped encoding phase entirely. Phase-keyed, every 30-day block is full
 * strength, every 60-day block is 0.6 and every 90-day block is 0.3, however many there are. */
const PHASE_OPACITY: Record<Phase, number> = { align: 1, build: 0.6, scale: 0.3 };

export type PhaseRailBlock = { numeral: string; dayLabel: string; text: string; opacity: number };

export type PhaseRailModel = {
  blocks: PhaseRailBlock[];
  band: BandKey;
  /** The exact s10 bullet strings this rail replaces. The renderer subtracts
   * these from section.fallback.bullets and renders the remainder beneath the
   * rail, so s10Bullets' extra `Do not work on yet: ...` line survives verbatim.
   * Must stay byte-identical to the join in s10Bullets (fallback-sections.ts:274). */
  supersedes: string[];
};

/** rules.enablers[].gates is `'all' | string[]` (methodology/schema.ts:57).
 * The 'all' literal must be handled explicitly — it is not an array. */
function gatesStage(gates: 'all' | string[], stageId: string): boolean {
  return gates === 'all' || gates.includes(stageId);
}

export type WebVisuals = {
  s3: { capacity: CapacityBarsModel };
  s4: { constraint: ConstraintCalloutModel | null; dumbbells: DumbbellsModel | null };
  s7: { themeSplit: ThemeSplitModel | null };
  s8: { spread: SpreadModel | null };
  s9: { chain: ChainModel };
  s10: { phaseRail: PhaseRailModel | null };
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

function themeSplit(facts: FactsPack): ThemeSplitModel | null {
  const total = THEME_ORDER.reduce((sum, theme) => sum + facts.pattern_counts[theme], 0);
  if (total === 0) return null;

  const rows = THEME_ORDER.map((theme) => ({
    theme,
    label: theme.toUpperCase(),
    count: facts.pattern_counts[theme],
    pct: (facts.pattern_counts[theme] / total) * 100,
  })).sort((a, b) =>
    b.count - a.count || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme),
  );

  return { rows, total, label: 'THEME OF THE WEAKEST INDICATORS' };
}

function spreadModel(facts: FactsPack, methodology: Methodology): SpreadModel | null {
  if (facts.dispersion.length === 0) return null;

  const largest = Math.max(...facts.dispersion.map((d) => d.spread));
  const axisMax = Math.max(Math.ceil(largest), 4);
  const threshold = methodology.rules.thresholds.dispersion;

  return {
    rows: facts.dispersion.map((d) => ({
      id: d.category_id,
      name: d.name,
      spread: d.spread,
      pct: (d.spread / axisMax) * 100,
      band: categoryLookup(facts, methodology, d.category_id)?.band ?? 'severe',
    })),
    axisMax,
    axisMaxLabel: String(axisMax),
    threshold,
    thresholdPct: (threshold / axisMax) * 100,
    thresholdLabel: `THRESHOLD ${threshold.toFixed(1)}`,
  };
}

function chainModel(facts: FactsPack, methodology: Methodology): ChainModel {
  const stages: ChainStage[] = [];

  for (const stageId of methodology.rules.chain) {
    const found = categoryLookup(facts, methodology, stageId);
    // A chain stage with no category has no truthful score to print, so it is
    // dropped rather than rendered with a fabricated one.
    if (!found) continue;

    const gates: ChainGate[] = [];
    for (const gate of facts.gating) {
      const enabler = methodology.rules.enablers[gate.enabler_id];
      if (!enabler || !gatesStage(enabler.gates, stageId)) continue;
      // Band comes from the chip's OWN printed score, not a re-lookup in facts.categories:
      // a chip that prints 22 can never render a healthier band than 22 earns. This does
      // not depend on how buildFacts happens to populate gating[] (see constraintCallout's
      // identical reasoning above for the s4 panel).
      gates.push({
        id: gate.enabler_id,
        name: gate.name,
        score: gate.score,
        note: gate.note,
        band: readingBand('gate', gate.score, methodology.rules.thresholds),
      });
    }

    stages.push({
      id: stageId,
      ordinal: String(stages.length + 1).padStart(2, '0'),
      name: found.name,
      score: found.score,
      band: found.band,
      gates,
    });
  }

  return { stages, reads: facts.dependencies.map((d) => d.read_sentence) };
}

function phaseRail(facts: FactsPack, methodology: Methodology): PhaseRailModel | null {
  const entries = roadmapEntries(facts, methodology);
  if (entries.length === 0) return null;

  return {
    blocks: entries.map((entry) => ({
      numeral: entry.dayLabel.split(' ')[0] ?? entry.dayLabel,
      dayLabel: entry.dayLabel,
      text: entry.text,
      opacity: PHASE_OPACITY[entry.phase],
    })),
    band: verdictBandFor(facts.overall.tier.id),
    supersedes: entries.map((entry) => `${entry.dayLabel} — ${entry.text}`),
  };
}

export function webVisuals(facts: FactsPack, methodology: Methodology): WebVisuals {
  return {
    s3: { capacity: capacityBars(facts) },
    s4: {
      constraint: constraintCallout(facts, methodology),
      dumbbells: dumbbells(facts, methodology),
    },
    s7: { themeSplit: themeSplit(facts) },
    s8: { spread: spreadModel(facts, methodology) },
    s9: { chain: chainModel(facts, methodology) },
    s10: { phaseRail: phaseRail(facts, methodology) },
    s13: { confidence: confidenceModel(facts) },
  };
}
