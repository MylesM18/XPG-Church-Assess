import type { Methodology, Theme } from '../methodology/schema';
import type { CategoryState } from '../engine/types';
import type { FactsPack } from './facts';
import { readingBand } from './view';

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
 * Coordinates are unitless viewBox numbers. Each renderer sets its own on-page size; nothing here
 * knows about points, pixels, or page width.
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
export const BAND_NAME: Record<BandKey, 'Severe' | 'Broken' | 'Watch' | 'Holding'> = {
  severe: 'Severe',
  broken: 'Broken',
  watch: 'Watch',
  holding: 'Holding',
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

export interface Tick { value: number; x: number }

export interface AreaBar {
  id: string; name: string; score: number; band: BandKey;
  x: number; y: number; w: number; h: number;
}
export interface AreaBarsModel {
  kind: 'area_bars';
  bars: AreaBar[];
  ticks: Tick[];
  /** Space reserved left of the plot for row labels. Renderers place label text within it. */
  labelWidth: number;
  w: number; h: number;
}

export interface TierBandSeg {
  id: string; name: string; from: number; to: number; x: number; w: number;
}
export interface TierGaugeModel {
  kind: 'tier_gauge';
  bands: TierBandSeg[];
  marker: { x: number; label: string; value: number };
  w: number; h: number;
}

export interface BottomItemBar {
  id: string; text: string; mean: number; theme: Theme;
  x: number; y: number; w: number; h: number;
}
export interface BottomItemsModel {
  kind: 'bottom_items';
  bars: BottomItemBar[];
  ticks: Tick[];
  labelWidth: number;
  w: number; h: number;
}

export type ChartModel = AreaBarsModel | TierGaugeModel | BottomItemsModel;

// ---- v2 models (visual overhaul). Unit space: 1 viewBox unit ~ 1pt at A4
// content width (595 - 2*48 = 499). Old 320-unit models below die in T8.
export const CHART_W_V2 = 500;
const GRID_COLS = 2;
const CELL_H = 72;
const CELL_PAD = 12;
const MINI_BAR_H = 4;

export type StatCell = {
  id: string;
  name: string;
  score: number;
  band: BandKey;
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
  const cellW = CHART_W_V2 / GRID_COLS;
  const cells = facts.categories.map((c, i): StatCell => {
    const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
    const x = (i % GRID_COLS) * cellW;
    const y = Math.floor(i / GRID_COLS) * CELL_H;
    return {
      id: c.id,
      name: c.name,
      score: c.score,
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
    width: CHART_W_V2,
    height: Math.ceil(facts.categories.length / GRID_COLS) * CELL_H,
    cells,
  };
}

const CHART_W = 320;
const AREA_LABEL_W = 104;
const ITEM_LABEL_W = 150;
const ROW_H = 14;
const ROW_GAP = 6;
const GAUGE_H = 22;
const TICK_VALUES = [0, 25, 50, 75, 100] as const;
const SCALE_MAX = 100;

/** Score -> plot-space width. Clamped: a score outside 0-100 is a data bug, but a bar drawn
 *  off-canvas is a rendering bug on top of it, and only one of the two is worth shipping. */
function plotWidth(score: number, plotW: number): number {
  const clamped = Math.min(Math.max(score, 0), SCALE_MAX);
  return (clamped / SCALE_MAX) * plotW;
}

function ticksFor(labelWidth: number, plotW: number): Tick[] {
  return TICK_VALUES.map((value) => ({ value, x: labelWidth + (value / SCALE_MAX) * plotW }));
}

/**
 * Eight horizontal bars, one per area, in facts.categories order — which buildFacts already
 * sorted score desc with ties by id asc (facts.ts:164). Never re-sorted here: two assessments 90
 * days apart must be comparable, and one place owning the order is what makes that true.
 */
export function areaBarsModel(facts: FactsPack, methodology: Methodology): AreaBarsModel {
  const plotW = CHART_W - AREA_LABEL_W;
  const bars: AreaBar[] = facts.categories.map((c, i) => ({
    id: c.id,
    name: c.name,
    score: c.score,
    band: readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds),
    x: AREA_LABEL_W,
    y: i * (ROW_H + ROW_GAP),
    w: plotWidth(c.score, plotW),
    h: ROW_H,
  }));
  const h = facts.categories.length === 0 ? 0 : facts.categories.length * (ROW_H + ROW_GAP) - ROW_GAP;
  return { kind: 'area_bars', bars, ticks: ticksFor(AREA_LABEL_W, plotW), labelWidth: AREA_LABEL_W, w: CHART_W, h };
}

/**
 * The tier gauge: rules.yaml's four tier bands tiled across 0-100 with a marker at the overall
 * capacity. Segments are built ASCENDING by `min` (the reverse of tier.ts's descending lookup
 * order) because a gauge reads left to right, and each segment's `to` is the next band's `min`
 * so the four tile the axis with no gap and no overlap.
 */
export function tierGaugeModel(facts: FactsPack, methodology: Methodology): TierGaugeModel {
  const tiers = methodology.rules.tiers;
  const ascending = (Object.keys(tiers) as Array<keyof typeof tiers>)
    .map((id) => ({ id: String(id), name: tiers[id].name, min: tiers[id].min }))
    .sort((a, b) => a.min - b.min);

  const bands: TierBandSeg[] = ascending.map((band, i) => {
    const from = band.min;
    const to = i + 1 < ascending.length ? ascending[i + 1]!.min : SCALE_MAX;
    return {
      id: band.id,
      name: band.name,
      from,
      to,
      x: (from / SCALE_MAX) * CHART_W,
      w: ((to - from) / SCALE_MAX) * CHART_W,
    };
  });

  return {
    kind: 'tier_gauge',
    bands,
    marker: {
      x: plotWidth(facts.overall.capacity, CHART_W),
      label: facts.overall.tier.name,
      value: facts.overall.capacity,
    },
    w: CHART_W,
    h: GAUGE_H,
  };
}

/**
 * The bottom-N indicator bars, in facts.bottom_items order — buildFacts already sorted them mean
 * ascending with ties by item id ascending, capped at 6. Returns null on an empty list rather
 * than a zero-height model: a renderer branching on presence is clearer than one branching on
 * `bars.length === 0`, and there is no honest chart of no data.
 */
export function bottomItemsModel(facts: FactsPack): BottomItemsModel | null {
  if (facts.bottom_items.length === 0) return null;
  const plotW = CHART_W - ITEM_LABEL_W;
  const bars: BottomItemBar[] = facts.bottom_items.map((b, i) => ({
    id: b.item_id,
    text: b.text,
    mean: b.mean,
    theme: b.theme,
    x: ITEM_LABEL_W,
    y: i * (ROW_H + ROW_GAP),
    w: plotWidth(b.mean, plotW),
    h: ROW_H,
  }));
  const h = facts.bottom_items.length * (ROW_H + ROW_GAP) - ROW_GAP;
  return { kind: 'bottom_items', bars, ticks: ticksFor(ITEM_LABEL_W, plotW), labelWidth: ITEM_LABEL_W, w: CHART_W, h };
}
