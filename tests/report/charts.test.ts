import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { readingBand } from '@/lib/report/view';
import type { CategoryState } from '@/lib/engine/types';
import type { AssembledSection } from '@/lib/report/compose';
import {
  BAND_FILL,
  BAND_TEXT, BAND_NAME, verdictBandFor, textOnBand,
  statGridModel, rankListModel, verdictBlockModel, coverModel, areaIndexFrom,
} from '@/lib/report/charts';
import { ALL_FIXTURES, CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

describe('seam tokens (visual overhaul)', () => {
  it('BAND_TEXT darkens watch and reuses the fill hex elsewhere', () => {
    expect(BAND_TEXT.watch).toBe('#906722');
    expect(BAND_TEXT.severe).toBe(BAND_FILL.severe);
    expect(BAND_TEXT.broken).toBe(BAND_FILL.broken);
    expect(BAND_TEXT.holding).toBe(BAND_FILL.holding);
  });

  it('BAND_NAME spells out every band', () => {
    expect(BAND_NAME).toEqual({ severe: 'Priority', broken: 'Constraint', watch: 'Maturing', holding: 'Strength' });
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

describe('statGridModel', () => {
  const methodology = loadMethodology();

  it('lays every category into a 2-column grid inside the viewBox', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = statGridModel(facts, methodology);
      expect(model.kind).toBe('stat_grid');
      expect(model.width).toBe(500);
      expect(model.cells).toHaveLength(facts.categories.length);
      expect(model.height).toBeCloseTo(Math.ceil(facts.categories.length / 2) * 72, 5);
      for (const cell of model.cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.w).toBeLessThanOrEqual(model.width + 1e-9);
        expect(cell.y + cell.h).toBeLessThanOrEqual(model.height + 1e-9);
        expect(cell.bar.x).toBeGreaterThanOrEqual(cell.x);
        expect(cell.bar.x + cell.bar.w).toBeLessThanOrEqual(cell.x + cell.w + 1e-9);
        expect(cell.bar.y + cell.bar.h).toBeLessThanOrEqual(cell.y + cell.h + 1e-9);
      }
    }
  });

  it('keeps facts order and derives band + spelled-out label per cell', () => {
    const model = statGridModel(CAPACITY_FACTS, methodology);
    for (const [i, cell] of model.cells.entries()) {
      const cat = CAPACITY_FACTS.categories[i]!;
      const band = readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds);
      expect(cell.id).toBe(cat.id);
      expect(cell.name).toBe(cat.name);
      expect(cell.score).toBe(cat.score);
      expect(cell.percentile).toBe(cat.percentile);
      expect(cell.band).toBe(band);
      expect(cell.label).toBe(`${cat.name} · ${BAND_NAME[band]}`.toUpperCase());
    }
  });

  it('cells are 250 wide and the mini-bar scales with score', () => {
    const model = statGridModel(CAPACITY_FACTS, methodology);
    const first = model.cells[0]!;
    expect(first.w).toBeCloseTo(250, 5);
    expect(first.bar.w).toBeCloseTo((first.score / 100) * (250 - 24), 5);
  });

  it('is pure', () => {
    expect(statGridModel(CAPACITY_FACTS, methodology)).toEqual(statGridModel(CAPACITY_FACTS, methodology));
  });
});

describe('rankListModel', () => {
  it('returns null when there are no bottom items', () => {
    const empty = makeFacts({
      bottom_items: [],
      pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 },
    });
    expect(rankListModel(empty)).toBeNull();
  });

  it('ranks rows 01..NN in facts order with in-viewBox geometry', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = rankListModel(facts);
      if (facts.bottom_items.length === 0) {
        expect(model).toBeNull();
        continue;
      }
      expect(model).not.toBeNull();
      if (!model) continue;
      expect(model.rows).toHaveLength(facts.bottom_items.length);
      for (const [i, row] of model.rows.entries()) {
        const item = facts.bottom_items[i]!;
        expect(row.rank).toBe(String(i + 1).padStart(2, '0'));
        expect(row.itemId).toBe(item.item_id);
        expect(row.fullText).toBe(item.text);
        expect(row.mean).toBe(item.mean);
        expect(row.theme).toBe(item.theme);
        expect(row.themeLabel).toBe(String(item.theme).toUpperCase());
        expect(row.y + row.h).toBeLessThanOrEqual(model.height + 1e-9);
        expect(row.scoreBlock.x + row.scoreBlock.w).toBeCloseTo(model.width, 5);
        expect(row.scoreBlock.y).toBeGreaterThanOrEqual(row.y);
        expect(row.scoreBlock.y + row.scoreBlock.h).toBeLessThanOrEqual(row.y + row.h + 1e-9);
      }
    }
  });

  it('truncates very long item text with ASCII ellipsis (font subset has no …)', () => {
    const long = 'x'.repeat(200);
    const facts = makeFacts({
      bottom_items: [{ item_id: 'SYS3', category_id: 'sys', text: long, mean: 10, theme: 'systems' }],
    });
    const model = rankListModel(facts);
    expect(model).not.toBeNull();
    if (!model) return;
    expect(model.rows[0]!.text.length).toBeLessThanOrEqual(93);
    expect(model.rows[0]!.text.endsWith('...')).toBe(true);
    expect(model.rows[0]!.fullText).toBe(long);
    expect(model.rows[0]!.fullText.length).toBe(200);
  });

  it('is pure', () => {
    expect(rankListModel(CAPACITY_FACTS)).toEqual(rankListModel(CAPACITY_FACTS));
  });
});

describe('verdictBlockModel', () => {
  const methodology = loadMethodology();

  it('hero mirrors overall and stats carry the four locked labels', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = verdictBlockModel(facts, methodology);
      expect(model.kind).toBe('verdict_block');
      expect(model.hero.score).toBe(facts.overall.capacity);
      expect(model.hero.tierName).toBe(facts.overall.tier.name);
      expect(model.hero.band).toBe(verdictBandFor(facts.overall.tier.id));
      expect(model.stats.map((s) => s.label)).toEqual([
        'Areas assessed',
        'Strengths',
        'Questions at 20 or less',
        'Priority areas',
      ]);
    }
  });

  it('computes the stat values from facts', () => {
    const model = verdictBlockModel(CAPACITY_FACTS, methodology);
    const bands = CAPACITY_FACTS.categories.map((c) =>
      readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds),
    );
    expect(model.stats[0]!.value).toBe(CAPACITY_FACTS.categories.length);
    expect(model.stats[1]!.value).toBe(bands.filter((b) => b === 'holding').length);
    expect(model.stats[2]!.value).toBe(CAPACITY_FACTS.bottom_items.filter((b) => b.mean <= 20).length);
    expect(model.stats[3]!.value).toBe(bands.filter((b) => b === 'severe').length);
  });

  it('lays hero above a 2x2 dashboard inside the viewBox', () => {
    const model = verdictBlockModel(CAPACITY_FACTS, methodology);
    expect(model.hero.w).toBeCloseTo(model.width, 5);
    expect(model.stats).toHaveLength(4);
    for (const stat of model.stats) {
      expect(stat.y).toBeGreaterThanOrEqual(model.hero.h);
      expect(stat.x + stat.w).toBeLessThanOrEqual(model.width + 1e-9);
      expect(stat.y + stat.h).toBeLessThanOrEqual(model.height + 1e-9);
      expect(stat.w).toBeCloseTo(model.width / 2, 5);
    }
  });

  it('is pure', () => {
    expect(verdictBlockModel(CAPACITY_FACTS, methodology)).toEqual(verdictBlockModel(CAPACITY_FACTS, methodology));
  });
});

describe('coverModel', () => {
  const methodology = loadMethodology();

  it('builds a 4-segment band strip with a score marker', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = coverModel(facts, methodology);
      expect(model.strip.width).toBe(500);
      expect(model.strip.segments).toHaveLength(4);
      expect(model.strip.segments.map((s) => s.band)).toEqual(['severe', 'broken', 'watch', 'holding']);
      for (const [i, seg] of model.strip.segments.entries()) {
        expect(seg.w).toBeCloseTo(125, 5);
        expect(seg.x).toBeCloseTo(i * 125, 5);
        expect(seg.name).toBe(BAND_NAME[seg.band]);
      }
      expect(model.strip.marker.x).toBeCloseTo((facts.overall.capacity / 100) * 500, 5);
    }
  });

  // NOTE: the marker can land visually inside a segment that is NOT the
  // church's verdict band (e.g. a score of 59 puts the marker in the Watch
  // segment while the verdict band is Broken). This is the APPROVED mock —
  // the caption disambiguates. Do NOT "fix" by clamping the marker into the
  // verdict band's segment.

  it('mirrors the verdict and reuses the s3 xpg_read line as headline', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = coverModel(facts, methodology);
      expect(model.score).toBe(facts.overall.capacity);
      expect(model.tierName).toBe(facts.overall.tier.name);
      expect(model.band).toBe(verdictBandFor(facts.overall.tier.id));
      expect(model.headline).toBe(methodology.copy.xpg_read[facts.archetype][facts.overall.tier.id]);
      expect(model.caption).toEqual({ tierName: facts.overall.tier.name, score: facts.overall.capacity });
    }
  });

  it('builds a worst-to-best tier ladder with exactly one active row', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = coverModel(facts, methodology);
      expect(model.ladder.map((r) => r.tierId)).toEqual([
        'at_risk', 'strained', 'healthy_stretched', 'healthy_ready',
      ]);
      expect(model.ladder.map((r) => r.band)).toEqual(['severe', 'broken', 'watch', 'holding']);
      for (const row of model.ladder) {
        expect(row.name).toBe(methodology.rules.tiers[row.tierId].name);
        expect(row.active).toBe(row.tierId === facts.overall.tier.id);
      }
      expect(model.ladder.filter((r) => r.active)).toHaveLength(1);
    }
  });

  it('is pure', () => {
    expect(coverModel(CAPACITY_FACTS, methodology)).toEqual(coverModel(CAPACITY_FACTS, methodology));
  });
});

describe('areaIndexFrom (shared seam, moved from lib/report/pdf/document.tsx)', () => {
  const methodology = loadMethodology();

  it('indexes every stat grid cell by category id', () => {
    const grid = statGridModel(CAPACITY_FACTS, methodology);
    const sections: AssembledSection[] = [
      {
        id: 's3',
        source: 'fallback',
        ai: null,
        fallback: { title: 'Health dashboard', body: '', bullets: [] },
        charts: [grid],
      },
    ];
    const index = areaIndexFrom(sections);
    expect(index.size).toBe(grid.cells.length);
    const first = grid.cells[0]!;
    expect(index.get(first.id)).toEqual({ name: first.name, score: first.score, band: first.band });
  });

  it('is empty when no s3 stat grid exists', () => {
    expect(areaIndexFrom([]).size).toBe(0);
  });

  it('is defined in charts.ts and only re-exported by the PDF document', () => {
    const charts = readFileSync('lib/report/charts.ts', 'utf8');
    expect(charts).toMatch(/export type AreaIndex = Map<string, \{ name: string; score: number; band: BandKey \}>;/);
    expect(charts).toMatch(/export function areaIndexFrom\(sections: AssembledSection\[\]\): AreaIndex/);
    const doc = readFileSync('lib/report/pdf/document.tsx', 'utf8');
    expect(doc).toContain("export { areaIndexFrom, type AreaIndex } from '../charts';");
    expect(doc).not.toMatch(/export function areaIndexFrom/);
    expect(doc).not.toMatch(/export type AreaIndex/);
    // The web renderer must never import the PDF module for this.
    expect(doc).toMatch(/import \{[^}]*\bareaIndexFrom\b[^}]*\} from '\.\.\/charts';/);
  });
});
