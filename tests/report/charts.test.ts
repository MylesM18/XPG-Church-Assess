import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { readingBand } from '@/lib/report/view';
import type { CategoryState } from '@/lib/engine/types';
import {
  areaBarsModel, tierGaugeModel, bottomItemsModel, BAND_FILL, THEME_FILL,
  BAND_TEXT, BAND_NAME, verdictBandFor, textOnBand,
} from '@/lib/report/charts';
import { ALL_FIXTURES, CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

const methodology = loadMethodology();

describe('areaBarsModel', () => {
  it('emits one bar per area, in facts order (score desc)', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = areaBarsModel(facts, methodology);
      expect(model.bars.map((b) => b.id), name).toEqual(facts.categories.map((c) => c.id));
    }
  });

  it('keys each bar band to readingBand — never to a flat colour', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = areaBarsModel(facts, methodology);
      for (const bar of model.bars) {
        const source = facts.categories.find((c) => c.id === bar.id)!;
        expect(bar.band, `${name}/${bar.id}`).toBe(
          readingBand(source.state as CategoryState, source.score, methodology.rules.thresholds),
        );
      }
    }
  });

  it('scales bar width linearly from score, with 0 and 100 at the plot edges', () => {
    const zeroTo100 = makeFacts({
      categories: [
        { id: 'guest', name: 'Guest Experience', kind: 'stage', score: 100, state: 'ok', percentile: 99, respondent_count: 9 },
        { id: 'conn', name: 'Connection', kind: 'stage', score: 50, state: 'ok', percentile: 50, respondent_count: 9 },
        { id: 'disc', name: 'Discipleship', kind: 'stage', score: 0, state: 'broken', percentile: 1, respondent_count: 9 },
      ] as never,
    });
    const model = areaBarsModel(zeroTo100, methodology);
    const plotWidth = model.w - model.labelWidth;
    expect(model.bars[0]!.w).toBeCloseTo(plotWidth, 5);
    expect(model.bars[1]!.w).toBeCloseTo(plotWidth / 2, 5);
    expect(model.bars[2]!.w).toBe(0);
  });

  it('never places a bar outside the viewBox', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = areaBarsModel(facts, methodology);
      for (const bar of model.bars) {
        expect(bar.x, name).toBeGreaterThanOrEqual(0);
        expect(bar.x + bar.w, name).toBeLessThanOrEqual(model.w + 1e-9);
        expect(bar.y, name).toBeGreaterThanOrEqual(0);
        expect(bar.y + bar.h, name).toBeLessThanOrEqual(model.h + 1e-9);
      }
    }
  });

  it('stacks rows without overlap', () => {
    const model = areaBarsModel(CAPACITY_FACTS, methodology);
    for (let i = 1; i < model.bars.length; i += 1) {
      expect(model.bars[i]!.y).toBeGreaterThanOrEqual(model.bars[i - 1]!.y + model.bars[i - 1]!.h);
    }
  });

  it('is a pure function — same input, identical output', () => {
    expect(areaBarsModel(CAPACITY_FACTS, methodology))
      .toEqual(areaBarsModel(CAPACITY_FACTS, methodology));
  });

  it('has a fill for every band it can emit', () => {
    for (const { facts } of ALL_FIXTURES) {
      for (const bar of areaBarsModel(facts, methodology).bars) {
        expect(BAND_FILL[bar.band]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('tierGaugeModel', () => {
  it('emits one segment per rules.yaml tier, ascending, tiling 0-100 with no gap', () => {
    const model = tierGaugeModel(CAPACITY_FACTS, methodology);
    expect(model.bands.map((b) => b.id)).toEqual(['at_risk', 'strained', 'healthy_stretched', 'healthy_ready']);
    expect(model.bands[0]!.from).toBe(0);
    expect(model.bands[model.bands.length - 1]!.to).toBe(100);
    for (let i = 1; i < model.bands.length; i += 1) {
      expect(model.bands[i]!.from).toBe(model.bands[i - 1]!.to);
      expect(model.bands[i]!.x).toBeCloseTo(model.bands[i - 1]!.x + model.bands[i - 1]!.w, 5);
    }
  });

  it('places the marker at the overall capacity and labels it with the tier name', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = tierGaugeModel(facts, methodology);
      expect(model.marker.value, name).toBe(facts.overall.capacity);
      expect(model.marker.label, name).toBe(facts.overall.tier.name);
      expect(model.marker.x, name).toBeCloseTo((facts.overall.capacity / 100) * model.w, 5);
      expect(model.marker.x, name).toBeGreaterThanOrEqual(0);
      expect(model.marker.x, name).toBeLessThanOrEqual(model.w);
    }
  });

  it('clamps a marker for an out-of-range capacity rather than drawing off-canvas', () => {
    const over = makeFacts({ overall: { capacity: 140, throughput: 40, gap: 100, tier: { id: 'healthy_ready', name: 'Healthy & Ready' } } });
    const model = tierGaugeModel(over, methodology);
    expect(model.marker.x).toBe(model.w);
  });
});

describe('bottomItemsModel', () => {
  it('emits one bar per bottom item, in facts order (mean asc)', () => {
    const model = bottomItemsModel(CAPACITY_FACTS)!;
    expect(model.bars.map((b) => b.id)).toEqual(CAPACITY_FACTS.bottom_items.map((b) => b.item_id));
  });

  it('carries each item theme through, so the fill can make the pattern claim visible', () => {
    const model = bottomItemsModel(CAPACITY_FACTS)!;
    for (const bar of model.bars) {
      const source = CAPACITY_FACTS.bottom_items.find((b) => b.item_id === bar.id)!;
      expect(bar.theme).toBe(source.theme);
      expect(THEME_FILL[bar.theme]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('returns null when there are no bottom items — a chart of nothing is not a chart', () => {
    expect(bottomItemsModel(makeFacts({ bottom_items: [], pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 } }))).toBeNull();
  });

  it('never places a bar outside the viewBox, on any fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = bottomItemsModel(facts);
      if (!model) continue;
      for (const bar of model.bars) {
        expect(bar.x, name).toBeGreaterThanOrEqual(0);
        expect(bar.x + bar.w, name).toBeLessThanOrEqual(model.w + 1e-9);
        expect(bar.y + bar.h, name).toBeLessThanOrEqual(model.h + 1e-9);
      }
    }
  });
});

describe('seam tokens (visual overhaul)', () => {
  it('BAND_TEXT darkens watch and reuses the fill hex elsewhere', () => {
    expect(BAND_TEXT.watch).toBe('#906722');
    expect(BAND_TEXT.severe).toBe(BAND_FILL.severe);
    expect(BAND_TEXT.broken).toBe(BAND_FILL.broken);
    expect(BAND_TEXT.holding).toBe(BAND_FILL.holding);
  });

  it('BAND_NAME spells out every band', () => {
    expect(BAND_NAME).toEqual({ severe: 'Severe', broken: 'Broken', watch: 'Watch', holding: 'Holding' });
  });

  it('verdictBandFor maps the four tier ids and fails dark on unknown', () => {
    expect(verdictBandFor('at_risk')).toBe('severe');
    expect(verdictBandFor('strained')).toBe('broken');
    expect(verdictBandFor('healthy_stretched')).toBe('watch');
    expect(verdictBandFor('healthy_ready')).toBe('holding');
    expect(verdictBandFor('nonsense_tier')).toBe('severe');
  });

  it('textOnBand puts ink on amber and cream on everything else', () => {
    expect(textOnBand('watch')).toBe('#1A1A18');
    expect(textOnBand('severe')).toBe('#FAF7F0');
    expect(textOnBand('broken')).toBe('#FAF7F0');
    expect(textOnBand('holding')).toBe('#FAF7F0');
  });
});
