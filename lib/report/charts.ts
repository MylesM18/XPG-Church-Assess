import type { Methodology, Theme } from '../methodology/schema';
import type { CategoryState } from '../engine/types';
import type { FactsPack } from './facts';
import { readingBand } from './view';
import type { AssembledSection } from './compose';

/**
 * Chart geometry, computed once, in a fixed unit space both surfaces share.
 *
 * ⚠️ PURE. No JSX, no `@react-pdf/renderer` import, no DOM. This module is imported by BOTH
 * renderers, and a react-pdf import here would pull the PDF engine into the client bundle of the
 * public share page.
 *
 * Why geometry lives here at all: AssembledSection is { id, source, ai, fallback } and carries no
 * facts, and lib/report/resolve.ts:55 states the invariant — "no renderer reads derived NUMBERS
 * from `facts`". Chart coordinates are derived numbers, so they are computed in the deterministic
 * layer and handed to renderers as data, exactly the way fallback.bullets already rides along.
 * Parity is then structural rather than a thing two files remember to do: a geometry bug is one
 * bug in one place, and tests/report/chart-parity.test.ts asserts both renderers consume the same
 * model object.
 *
 * Coordinates are unitless viewBox numbers in the abstract, but the v2 models below are not
 * actually points-agnostic: CHART_W is picked so that 1 unit ~ 1pt at A4's 499pt content width,
 * and the PDF renderer passes a model's width straight through as `width={model.width}`. Each
 * renderer still owns its own on-page SIZE — the web SVG scales the same numbers to its own
 * viewport — but the numbers themselves are tuned for the PDF page, not dimension-free.
 */

export type BandKey = 'severe' | 'broken' | 'watch' | 'holding';

/** One palette, both surfaces. Keyed to the CORRECTED band (lib/report/view.ts readingBand), so a
 *  53/100 area is not filled the same as a 95/100 one — the visual half of the same fix. */
export const BAND_FILL: Record<BandKey, string> = {
  severe: '#8C2F1F',
  broken: '#B4552F',
  watch: '#C08A2E',
  holding: '#4A6B4F',
};

/** Bottom-item bars are filled by THEME, not by band, so S7's computed "none of the six lowest
 *  indicators are theological" claim is visible as well as stated (spec §5, priority 3). */
export const THEME_FILL: Record<Theme, string> = {
  systems: '#3F5E78',
  culture: '#7A5A86',
  theology: '#8A6A3A',
  relational: '#4A6B4F',
};

const INK = '#1A1A18';
const CREAM = '#FAF7F0';

/** Text/numeral colors on the cream ground (spec §3.2): true amber fails
 * contrast as text, so watch text darkens to #906722; other bands reuse
 * their fill hex. Renderers use BAND_TEXT for text, BAND_FILL for fills. */
export const BAND_TEXT: Record<BandKey, string> = {
  severe: '#8C2F1F',
  broken: '#B4552F',
  watch: '#906722',
  holding: '#4A6B4F',
};

/** Band color never travels alone (spec §3.1) — the spelled-out names. */
/** The reader-facing name of each reading band, mapped onto the Guide's §18 score bands
 *  (docs/brand/xpg-voice.md). The KEYS are the engine's states and never change; only these
 *  display strings do. They are the most-read strings in the whole report — every area chart is
 *  labelled `${category} · ${BAND_NAME[band]}` and the PDF cover strip prints all four — so they
 *  carry the voice more than any prose block does. "Broken"/"Severe" printed next to a pastor's
 *  own ministry area is a verdict on the people in it; "Constraint"/"Priority" names work to do. */
export const BAND_NAME: Record<BandKey, 'Priority' | 'Constraint' | 'Maturing' | 'Strength'> = {
  severe: 'Priority',
  broken: 'Constraint',
  watch: 'Maturing',
  holding: 'Strength',
};

const VERDICT_BAND: Record<string, BandKey> = {
  at_risk: 'severe',
  strained: 'broken',
  healthy_stretched: 'watch',
  healthy_ready: 'holding',
};

/** Overall tier id -> the band that tints the whole report ("the color IS
 * the diagnosis", spec §2.1). Unknown ids fail dark. */
export function verdictBandFor(tierId: string): BandKey {
  return VERDICT_BAND[tierId] ?? 'severe';
}

/** Spec §3.2: text ON amber panels is ink; on severe/broken/holding, cream. */
export function textOnBand(band: BandKey): string {
  return band === 'watch' ? INK : CREAM;
}

export type ChartModel = StatGridModel | RankListModel | VerdictBlockModel;

// ---- v2 models (visual overhaul). Unit space: 1 viewBox unit ~ 1pt at A4
// content width (595 - 2*48 = 499).
const CHART_W = 500;
const GRID_COLS = 2;
const CELL_H = 72;
const CELL_PAD = 12;
const MINI_BAR_H = 4;

const RANK_ROW_H = 44;
const RANK_ROW_GAP = 10;
const SCORE_BLOCK_W = 56;
const SCORE_BLOCK_H = 32;
const RANK_TEXT_MAX = 90;

export type StatCell = {
  id: string;
  name: string;
  score: number;
  band: BandKey;
  /** Cohort percentile for the "vs. cohort" annotation (spec §6.3). Straight
   * pass-through of CategoryFact.percentile; null when the cohort is too thin.
   * WEB ONLY — the PDF stat grid does not render it. */
  percentile: number | null;
  /** Caps label with the band spelled out (spec §3.1), e.g. 'VOLUNTEERS · HOLDING'. */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bar: { x: number; y: number; w: number; h: number };
};

export type StatGridModel = {
  kind: 'stat_grid';
  width: number;
  height: number;
  cells: StatCell[];
};

/** Spec §2.6.1 — modular 2-col stat grid: hairline cells, big band-colored
 * numerals, caps 'Name · Band' labels, a thin mini-bar in the true band fill. */
export function statGridModel(facts: FactsPack, methodology: Methodology): StatGridModel {
  const cellW = CHART_W / GRID_COLS;
  const cells = facts.categories.map((c, i): StatCell => {
    const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
    const x = (i % GRID_COLS) * cellW;
    const y = Math.floor(i / GRID_COLS) * CELL_H;
    return {
      id: c.id,
      name: c.name,
      score: c.score,
      percentile: c.percentile,
      band,
      label: `${c.name} · ${BAND_NAME[band]}`.toUpperCase(),
      x,
      y,
      w: cellW,
      h: CELL_H,
      bar: {
        x: x + CELL_PAD,
        y: y + CELL_H - CELL_PAD - MINI_BAR_H,
        w: plotWidth(c.score, cellW - 2 * CELL_PAD),
        h: MINI_BAR_H,
      },
    };
  });
  return {
    kind: 'stat_grid',
    width: CHART_W,
    height: Math.ceil(facts.categories.length / GRID_COLS) * CELL_H,
    cells,
  };
}

export type RankRow = {
  rank: string;
  itemId: string;
  text: string;
  /** The untruncated item.text. WEB ONLY — the rebuilt web rank list wraps, so
   * it never needs RANK_TEXT_MAX. The PDF keeps reading `text` (spec §6.5). */
  fullText: string;
  mean: number;
  theme: Theme;
  /** Caps theme label; renderers color it THEME_FILL[theme] (spec §2.6.2). */
  themeLabel: string;
  y: number;
  h: number;
  scoreBlock: { x: number; y: number; w: number; h: number };
};

export type RankListModel = {
  kind: 'rank_list';
  width: number;
  height: number;
  rows: RankRow[];
};

/** Spec §2.6.2 — numbered ranked punch list of the six weakest questions.
 * Truncation is a shared-seam display format (both surfaces see the same
 * string), so it does not violate the §5 prose-parity rule. ASCII '...'
 * because the font subset lacks the ellipsis glyph. */
export function rankListModel(facts: FactsPack): RankListModel | null {
  if (facts.bottom_items.length === 0) return null;
  const rows = facts.bottom_items.map((item, i): RankRow => {
    const y = i * (RANK_ROW_H + RANK_ROW_GAP);
    const text =
      item.text.length > RANK_TEXT_MAX
        ? `${item.text.slice(0, RANK_TEXT_MAX).trimEnd()}...`
        : item.text;
    return {
      rank: String(i + 1).padStart(2, '0'),
      itemId: item.item_id,
      text,
      fullText: item.text,
      mean: item.mean,
      theme: item.theme,
      themeLabel: String(item.theme).toUpperCase(),
      y,
      h: RANK_ROW_H,
      scoreBlock: {
        x: CHART_W - SCORE_BLOCK_W,
        y: y + (RANK_ROW_H - SCORE_BLOCK_H) / 2,
        w: SCORE_BLOCK_W,
        h: SCORE_BLOCK_H,
      },
    };
  });
  const n = rows.length;
  return {
    kind: 'rank_list',
    width: CHART_W,
    height: n * RANK_ROW_H + (n - 1) * RANK_ROW_GAP,
    rows,
  };
}

const HERO_H = 140;
const STAT_CELL_H = 64;

export type VerdictStat = {
  label: string;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type VerdictBlockModel = {
  kind: 'verdict_block';
  width: number;
  height: number;
  hero: { score: number; tierName: string; band: BandKey; x: number; y: number; w: number; h: number };
  stats: VerdictStat[];
};

/** Spec §2.6.3 — hero cell (giant verdict numeral + tier name) atop a 2x2
 * dashboard of context stats, all hairline-boxed. NOTE: 'Questions at 20 or
 * less' counts within bottom_items, which facts caps at 6 — it reads "of the
 * six weakest", not a whole-instrument count. */
export function verdictBlockModel(facts: FactsPack, methodology: Methodology): VerdictBlockModel {
  const bands = facts.categories.map((c) =>
    readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds),
  );
  const entries: Array<[string, number]> = [
    ['Areas assessed', facts.categories.length],
    ['Strengths', bands.filter((b) => b === 'holding').length],
    ['Questions at 20 or less', facts.bottom_items.filter((b) => b.mean <= 20).length],
    ['Priority areas', bands.filter((b) => b === 'severe').length],
  ];
  const cellW = CHART_W / 2;
  const stats = entries.map(([label, value], i): VerdictStat => ({
    label,
    value,
    x: (i % 2) * cellW,
    y: HERO_H + Math.floor(i / 2) * STAT_CELL_H,
    w: cellW,
    h: STAT_CELL_H,
  }));
  return {
    kind: 'verdict_block',
    width: CHART_W,
    height: HERO_H + 2 * STAT_CELL_H,
    hero: {
      score: facts.overall.capacity,
      tierName: facts.overall.tier.name,
      band: verdictBandFor(facts.overall.tier.id),
      x: 0,
      y: 0,
      w: CHART_W,
      h: HERO_H,
    },
    stats,
  };
}

export type CoverStripSeg = {
  band: BandKey;
  /** Derived from BAND_NAME rather than restating its union: this segment IS a band label, and
   *  a second hand-written copy of the four strings drifts the moment they are renamed. */
  name: (typeof BAND_NAME)[BandKey];
  x: number;
  w: number;
};

/** rules.tiers is a fixed four-key object, not an array (methodology/schema.ts:86-91),
 * so the ladder's worst -> best row order is hand-ordered here. It matches
 * STRIP_BANDS and verdictBandFor one-for-one. */
export const LADDER_ORDER = ['at_risk', 'strained', 'healthy_stretched', 'healthy_ready'] as const;
export type LadderTierId = (typeof LADDER_ORDER)[number];
export type CoverLadderRow = {
  tierId: LadderTierId;
  name: string;
  band: BandKey;
  /** True for the church's own tier. Renderers set aria-current on this row. */
  active: boolean;
};

export type CoverModel = {
  score: number;
  /** Label rendered with the hero numeral so it reads as the church's OVERALL score rather than
   *  a section score. Lives on the model, not in either renderer, so the web cover
   *  (report-cover.tsx) and the PDF cover (pdf/document.tsx) cannot drift apart. Both uppercase
   *  it at the render site, matching what the verdict-block renderers already do with tierName. */
  scoreLabel: string;
  tierName: string;
  band: BandKey;
  /** The s3 xpg_read line — the SAME string fallback-sections.ts:371 renders
   * as s3's first bullet (§5-sanctioned reuse; no new prose is created). */
  headline: string;
  strip: { width: number; segments: CoverStripSeg[]; marker: { x: number } };
  /** Four discrete tier steps, worst -> best (spec §6.2). WEB ONLY — the PDF
   * keeps rendering `strip`. */
  ladder: CoverLadderRow[];
  caption: { tierName: string; score: number };
};

const STRIP_BANDS: BandKey[] = ['severe', 'broken', 'watch', 'holding'];

/** Spec §2.5 — cover verdict: giant score, 4-segment band strip with an ink
 * marker at the score position, tier caption, and the xpg_read headline.
 * NOT part of the ChartModel union: the cover flows through
 * ResolvedReportSections.cover, never through section charts. */
export function coverModel(facts: FactsPack, methodology: Methodology): CoverModel {
  const segW = CHART_W / STRIP_BANDS.length;
  const band = verdictBandFor(facts.overall.tier.id);
  return {
    score: facts.overall.capacity,
    scoreLabel: 'Overall',
    tierName: facts.overall.tier.name,
    band,
    headline: methodology.copy.xpg_read[facts.archetype][facts.overall.tier.id],
    strip: {
      width: CHART_W,
      segments: STRIP_BANDS.map((b, i) => ({ band: b, name: BAND_NAME[b], x: i * segW, w: segW })),
      marker: { x: plotWidth(facts.overall.capacity, CHART_W) },
    },
    ladder: LADDER_ORDER.map((tierId) => ({
      tierId,
      name: methodology.rules.tiers[tierId].name,
      band: verdictBandFor(tierId),
      active: tierId === facts.overall.tier.id,
    })),
    caption: { tierName: facts.overall.tier.name, score: facts.overall.capacity },
  };
}

const SCALE_MAX = 100;

/** Score -> plot-space width. Clamped: a score outside 0-100 is a data bug, but a bar drawn
 *  off-canvas is a rendering bug on top of it, and only one of the two is worth shipping.
 *
 *  Same clamp-to-range as pct (lib/report/web-visuals.ts), in different units: that one
 *  returns a CSS percentage for the web's HTML tracks, this one returns plot-space pixels.
 *  A change to the clamp belongs in both. */
function plotWidth(score: number, plotW: number): number {
  const clamped = Math.min(Math.max(score, 0), SCALE_MAX);
  return (clamped / SCALE_MAX) * plotW;
}

// ---- s6 dossier lookup. Lives here (not in lib/report/pdf/document.tsx) so the web renderer
// can share it without importing the PDF module; document.tsx re-exports both names.

/** One category's dossier metadata: name, score, and reading band — shared by S6View's per-
 *  dossier lookup and SectionContent's areaIndex prop, so the shape lives in one place instead
 *  of the same inline Map<string, {...}> repeated at three call sites. */
export type AreaIndex = Map<string, { name: string; score: number; band: BandKey }>;

/** Index the s3 stat grid by category id so s6 dossiers can reuse the SAME
 * name/score/band the dashboard shows — one source of truth, no recompute. */
export function areaIndexFrom(sections: AssembledSection[]): AreaIndex {
  const index: AreaIndex = new Map();
  const s3 = sections.find((sec) => sec.id === 's3');
  const grid = s3?.charts.find((c): c is Extract<ChartModel, { kind: 'stat_grid' }> => c.kind === 'stat_grid');
  if (grid) for (const cell of grid.cells) index.set(cell.id, { name: cell.name, score: cell.score, band: cell.band });
  return index;
}
