import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { roadmapEntries } from '@/lib/report/fallback-sections';
import { webVisuals } from '@/lib/report/web-visuals';
import { CAPACITY_FACTS, makeFacts } from '../fixtures/facts';
import { readingBand } from '@/lib/report/view';
import type { CategoryState } from '@/lib/engine/types';

describe('roadmapEntries is exported for the web phase rail', () => {
  const methodology = loadMethodology();

  it('returns one {dayLabel, text} entry per populated phase', () => {
    const entries = roadmapEntries(CAPACITY_FACTS, methodology);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeLessThanOrEqual(3);
    for (const entry of entries) {
      expect(typeof entry.dayLabel).toBe('string');
      expect(typeof entry.text).toBe('string');
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });

  it('is pure', () => {
    expect(roadmapEntries(CAPACITY_FACTS, methodology)).toEqual(
      roadmapEntries(CAPACITY_FACTS, methodology),
    );
  });
});

describe('webVisuals — s3 capacity bars', () => {
  const methodology = loadMethodology();

  it('mirrors overall and scales both bars on a shared 0-100 axis', () => {
    const { capacity } = webVisuals(CAPACITY_FACTS, methodology).s3;
    expect(capacity.capacity).toBe(CAPACITY_FACTS.overall.capacity);
    expect(capacity.throughput).toBe(CAPACITY_FACTS.overall.throughput);
    expect(capacity.gap).toBe(CAPACITY_FACTS.overall.gap);
    expect(capacity.capacityPct).toBeCloseTo(CAPACITY_FACTS.overall.capacity, 5);
    expect(capacity.throughputPct).toBeCloseTo(CAPACITY_FACTS.overall.throughput, 5);
    expect(capacity.band).toBe('broken');
  });

  it('prints the points-lost chip only when the gap is positive', () => {
    const positive = webVisuals(
      makeFacts({ overall: { ...CAPACITY_FACTS.overall, gap: 19 } }),
      methodology,
    ).s3.capacity;
    expect(positive.gapLabel).toBe('19 POINTS LOST');

    for (const gap of [0, -3]) {
      const model = webVisuals(
        makeFacts({ overall: { ...CAPACITY_FACTS.overall, gap } }),
        methodology,
      ).s3.capacity;
      expect(model.gapLabel).toBeNull();
    }
  });
});

describe('webVisuals — s13 confidence', () => {
  const methodology = loadMethodology();

  it('prints confidence as a whole percentage with the sample basis', () => {
    const { confidence } = webVisuals(CAPACITY_FACTS, methodology).s13;
    expect(confidence.pct).toBe(Math.round(CAPACITY_FACTS.confidence * 100));
    expect(confidence.label).toBe(`${confidence.pct}%`);
    expect(confidence.respondents).toBe(CAPACITY_FACTS.cover.respondent_count);
    expect(confidence.areas).toBe(CAPACITY_FACTS.categories.length);
  });

  it('reports the thinnest coverage by area name and count', () => {
    const { confidence } = webVisuals(CAPACITY_FACTS, methodology).s13;
    const min = Math.min(...CAPACITY_FACTS.categories.map((c) => c.respondent_count));
    expect(confidence.thinnest).not.toBeNull();
    expect(confidence.thinnest!.count).toBe(min);
    expect(CAPACITY_FACTS.categories.some(
      (c) => c.name === confidence.thinnest!.name && c.respondent_count === min,
    )).toBe(true);
  });

  it('has no thinnest row when there are no categories', () => {
    const model = webVisuals(makeFacts({ categories: [] }), methodology).s13.confidence;
    expect(model.thinnest).toBeNull();
    expect(model.areas).toBe(0);
  });
});

describe('webVisuals is pure', () => {
  const methodology = loadMethodology();

  it('returns deep-equal output for the same input', () => {
    expect(webVisuals(CAPACITY_FACTS, methodology)).toEqual(webVisuals(CAPACITY_FACTS, methodology));
  });
});

describe('webVisuals — s4 constraint callout', () => {
  const methodology = loadMethodology();

  it('prefers the primary constraint and looks its score up in categories', () => {
    const cat = CAPACITY_FACTS.categories[CAPACITY_FACTS.categories.length - 1]!;
    const facts = makeFacts({ primary_constraint: { category_id: cat.id, name: cat.name } });
    const model = webVisuals(facts, methodology).s4.constraint;
    expect(model).not.toBeNull();
    expect(model!.eyebrow).toBe('PRIMARY CONSTRAINT');
    expect(model!.rows).toHaveLength(1);
    expect(model!.rows[0]!).toEqual({ id: cat.id, name: cat.name, score: cat.score, note: null });
    expect(model!.band).toBe(
      readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
    );
  });

  it('falls back to gated enablers, one row each, banded by the lowest score', () => {
    const facts = makeFacts({
      primary_constraint: null,
      gating: [
        { enabler_id: 'comm', name: 'Communication', score: 40, note: 'Gates guest and connect' },
        { enabler_id: 'gov', name: 'Governance', score: 22, note: 'Gates everything' },
      ],
    });
    const model = webVisuals(facts, methodology).s4.constraint;
    expect(model).not.toBeNull();
    expect(model!.eyebrow).toBe('GATING ENABLER');
    expect(model!.rows.map((r) => r.id)).toEqual(['comm', 'gov']);
    expect(model!.rows[1]!.note).toBe('Gates everything');
    // Panel ground follows the worst (lowest-scoring) gated enabler.
    expect(model!.band).toBe('severe');
  });

  it('is omitted with no primary constraint and no gated enabler', () => {
    const facts = makeFacts({ primary_constraint: null, gating: [] });
    expect(webVisuals(facts, methodology).s4.constraint).toBeNull();
  });
});

describe('webVisuals — s4 blind-spot dumbbells', () => {
  const methodology = loadMethodology();

  it('plots evidence and belief on a shared 0-100 track in facts order', () => {
    const cat = CAPACITY_FACTS.categories[0]!;
    const facts = makeFacts({
      blind_spots: [
        { category_id: cat.id, name: cat.name, belief: 78, evidence: 41, gap: 37 },
      ],
    });
    const model = webVisuals(facts, methodology).s4.dumbbells;
    expect(model).not.toBeNull();
    expect(model!.rows).toHaveLength(1);
    const row = model!.rows[0]!;
    expect(row).toMatchObject({ id: cat.id, name: cat.name, belief: 78, evidence: 41, gap: 37 });
    expect(row.beliefPct).toBeCloseTo(78, 5);
    expect(row.evidencePct).toBeCloseTo(41, 5);
    expect(row.band).toBe(
      readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
    );
  });

  it('is omitted when there are no blind spots', () => {
    expect(webVisuals(makeFacts({ blind_spots: [] }), methodology).s4.dumbbells).toBeNull();
  });
});

describe('webVisuals — s7 theme split', () => {
  const methodology = loadMethodology();

  it('always renders all four themes, descending by count, ties in canonical order', () => {
    const facts = makeFacts({
      pattern_counts: { systems: 1, culture: 3, theology: 0, relational: 1 },
    });
    const model = webVisuals(facts, methodology).s7.themeSplit;
    expect(model).not.toBeNull();
    expect(model!.total).toBe(5);
    expect(model!.rows).toHaveLength(4);
    expect(model!.rows.map((r) => r.theme)).toEqual(['culture', 'systems', 'relational', 'theology']);
    expect(model!.rows.map((r) => r.count)).toEqual([3, 1, 1, 0]);
    expect(model!.rows[0]!.pct).toBeCloseTo(60, 5);
    expect(model!.rows[3]!.pct).toBeCloseTo(0, 5);
    expect(model!.rows[0]!.label).toBe('CULTURE');
    expect(model!.label).toBe('THEME OF THE WEAKEST INDICATORS');
  });

  it('is omitted when the total is zero', () => {
    const facts = makeFacts({
      bottom_items: [],
      pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 },
    });
    expect(webVisuals(facts, methodology).s7.themeSplit).toBeNull();
  });
});

describe('webVisuals — s8 disagreement spread', () => {
  const methodology = loadMethodology();

  it('self-scales the axis to at least 4 and reads the threshold from methodology', () => {
    const cat = CAPACITY_FACTS.categories[0]!;
    const facts = makeFacts({
      dispersion: [{ category_id: cat.id, name: cat.name, spread: 2.4 }],
    });
    const model = webVisuals(facts, methodology).s8.spread;
    expect(model).not.toBeNull();
    expect(model!.axisMax).toBe(4);
    expect(model!.axisMaxLabel).toBe('4');
    expect(model!.threshold).toBe(methodology.rules.thresholds.dispersion);
    expect(model!.thresholdLabel).toBe('THRESHOLD 2.0');
    expect(model!.thresholdPct).toBeCloseTo(50, 5);
    expect(model!.rows[0]!.pct).toBeCloseTo(60, 5);
    expect(model!.rows[0]!.band).toBe(
      readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
    );
  });

  it('grows the axis past 4 and never clips the largest bar', () => {
    const cat = CAPACITY_FACTS.categories[0]!;
    const facts = makeFacts({
      dispersion: [
        { category_id: cat.id, name: cat.name, spread: 5.2 },
        { category_id: cat.id, name: cat.name, spread: 3.1 },
      ],
    });
    const model = webVisuals(facts, methodology).s8.spread;
    expect(model!.axisMax).toBe(6);
    for (const row of model!.rows) {
      expect(row.pct).toBeLessThanOrEqual(100);
    }
    expect(model!.rows[0]!.pct).toBeCloseTo((5.2 / 6) * 100, 5);
  });

  it('is omitted when nothing was flagged', () => {
    expect(webVisuals(makeFacts({ dispersion: [] }), methodology).s8.spread).toBeNull();
  });
});

describe('webVisuals — s9 dependency chain', () => {
  const methodology = loadMethodology();

  it('orders stages by rules.chain, not by score', () => {
    const model = webVisuals(CAPACITY_FACTS, methodology).s9.chain;
    const expected = methodology.rules.chain.filter((id) =>
      CAPACITY_FACTS.categories.some((c) => c.id === id),
    );
    expect(model.stages.map((s) => s.id)).toEqual(expected);
    expect(model.stages.map((s) => s.ordinal)).toEqual(
      expected.map((_, i) => String(i + 1).padStart(2, '0')),
    );
    for (const stage of model.stages) {
      const cat = CAPACITY_FACTS.categories.find((c) => c.id === stage.id)!;
      expect(stage.name).toBe(cat.name);
      expect(stage.score).toBe(cat.score);
      expect(stage.band).toBe(
        readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
      );
    }
  });

  it("maps the 'all' gates literal to every stage and arrays to their own stages", () => {
    const facts = makeFacts({
      gating: [
        { enabler_id: 'gov', name: 'Governance', score: 22, note: 'Gates everything' },
        { enabler_id: 'comm', name: 'Communication', score: 40, note: 'Gates the front door' },
      ],
    });
    const model = webVisuals(facts, methodology).s9.chain;
    for (const stage of model.stages) {
      expect(stage.gates.map((g) => g.id)).toContain('gov');
    }
    const withComm = model.stages.filter((s) => s.gates.some((g) => g.id === 'comm'));
    expect(withComm.map((s) => s.id).sort()).toEqual(['conn', 'guest']);
    const gov = model.stages[0]!.gates.find((g) => g.id === 'gov')!;
    expect(gov).toMatchObject({ name: 'Governance', score: 22, note: 'Gates everything' });
  });

  it('carries the existing read sentences and never goes empty', () => {
    const model = webVisuals(CAPACITY_FACTS, methodology).s9.chain;
    expect(model.reads).toEqual(CAPACITY_FACTS.dependencies.map((d) => d.read_sentence));
    expect(webVisuals(makeFacts({ gating: [], dependencies: [] }), methodology).s9.chain)
      .not.toBeNull();
  });

  it("bands each gate chip from its OWN printed score, not a re-lookup by enabler id", () => {
    const facts = makeFacts({
      gating: [
        { enabler_id: 'gov', name: 'Governance', score: 22, note: 'Gates everything' },
        { enabler_id: 'comm', name: 'Communication', score: 40, note: 'Gates the front door' },
      ],
    });
    const model = webVisuals(facts, methodology).s9.chain;
    const gov = model.stages[0]!.gates.find((g) => g.id === 'gov')!;
    expect(gov.band).toBe('severe');
    const stageWithComm = model.stages.find((s) => s.gates.some((g) => g.id === 'comm'))!;
    const comm = stageWithComm.gates.find((g) => g.id === 'comm')!;
    expect(comm.band).toBe('broken');
  });
});
