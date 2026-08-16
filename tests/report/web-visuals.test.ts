import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { roadmapEntries } from '@/lib/report/fallback-sections';
import { webVisuals } from '@/lib/report/web-visuals';
import { CAPACITY_FACTS, CONSTRAINT_FACTS, FOUNDATION_3_FACTS, makeFacts } from '../fixtures/facts';
import { readingBand } from '@/lib/report/view';
import { verdictBandFor } from '@/lib/report/charts';
import { assembleFallbackOnly } from '@/lib/report/compose';
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

describe('webVisuals — s10 phase rail', () => {
  const methodology = loadMethodology();

  it('renders the identical roadmapEntries data, stepping the verdict band down', () => {
    const model = webVisuals(CAPACITY_FACTS, methodology).s10.phaseRail;
    const entries = roadmapEntries(CAPACITY_FACTS, methodology);
    expect(model).not.toBeNull();
    expect(model!.blocks.map((b) => b.text)).toEqual(entries.map((e) => e.text));
    expect(model!.blocks.map((b) => b.dayLabel)).toEqual(entries.map((e) => e.dayLabel));
    expect(model!.blocks.map((b) => b.numeral)).toEqual(
      entries.map((e) => e.dayLabel.split(' ')[0]),
    );
    expect(model!.blocks.map((b) => b.opacity)).toEqual([1, 0.6, 0.3].slice(0, entries.length));
    expect(model!.band).toBe(verdictBandFor(CAPACITY_FACTS.overall.tier.id));
  });

  it('supersedes exactly the phase bullets and leaves any other s10 bullet standing', () => {
    const sections = assembleFallbackOnly({
      facts: CAPACITY_FACTS,
      methodology,
      reflections: [],
    });
    const s10 = sections.find((s) => s.id === 's10')!;
    const model = webVisuals(CAPACITY_FACTS, methodology).s10.phaseRail!;

    for (const superseded of model.supersedes) {
      expect(s10.fallback.bullets).toContain(superseded);
    }
    const remaining = s10.fallback.bullets.filter((b) => !model.supersedes.includes(b));
    expect(remaining.length).toBe(s10.fallback.bullets.length - model.supersedes.length);
    for (const bullet of remaining) {
      expect(model.supersedes).not.toContain(bullet);
    }
  });

  it('is omitted when there are no roadmap entries, so the bullets stand alone', () => {
    const facts = makeFacts({ categories: [], bottom_items: [] });
    const model = webVisuals(facts, methodology).s10.phaseRail;
    if (roadmapEntries(facts, methodology).length === 0) {
      expect(model).toBeNull();
    } else {
      expect(model!.blocks.length).toBeGreaterThan(0);
    }
  });

  // FIX ROUND 1 additions (Natalie's ruling — strengthen additively; the three tests
  // above stay byte-identical). Both new findings were the same shape of bug: a fixture
  // that structurally could never reach the branch the test claimed to exercise, so the
  // assertion inside that branch never ran. Each addition below picks a fixture that is
  // GUARANTEED (by construction, not by luck) to reach the branch under test, and asserts
  // the guarantee explicitly before relying on it, so a regression in the fixture itself
  // fails loudly instead of the test quietly passing on the wrong path again.

  it('exercises the RULING for real: the Do-not-work-on-yet bullet survives, unsuperseded, when the constraint path actually appends one', () => {
    // CONSTRAINT_FACTS (tests/fixtures/facts/index.ts) is archetype 'constraint' with conn
    // (38, below the 45 break threshold) as the first broken chain stage, and rules.yaml's
    // conn -> disc structural edge means facts.dependencies always carries an edge FROM the
    // primary constraint's own category — the exact condition s10Bullets checks
    // (fallback-sections.ts:276-280) before appending `Do not work on yet: ...`.
    const sections = assembleFallbackOnly({ facts: CONSTRAINT_FACTS, methodology, reflections: [] });
    const s10 = sections.find((s) => s.id === 's10')!;
    const doNotWorkOnYet = s10.fallback.bullets.find((b) => b.startsWith('Do not work on yet:'));

    // 1. Assert the bullet is actually present — fail loudly if the fixture ever stops
    // producing it, rather than letting every assertion below pass vacuously on an empty set.
    expect(doNotWorkOnYet).toBeDefined();

    const model = webVisuals(CONSTRAINT_FACTS, methodology).s10.phaseRail;
    expect(model).not.toBeNull();

    // 2. It must not be one of the strings the rail claims to supersede.
    expect(model!.supersedes).not.toContain(doNotWorkOnYet);

    // 3. Subtracting supersedes from the real bullets must leave a non-empty remainder
    // containing exactly this one bullet — the renderer's own subtraction, replayed here.
    const remaining = s10.fallback.bullets.filter((b) => !model!.supersedes.includes(b));
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining).toEqual([doNotWorkOnYet]);
  });

  // REWRITTEN (whole-branch fix wave). This test previously asserted the index-keyed ramp
  // ("clamps opacity to 0.3 past the third block"): blocks[0..2] = 1 / 0.6 / 0.3 and every
  // block from index 3 on = 0.3. That pinned the DEFECT, not the intent — on the nine-entry
  // foundation rail it meant three consecutive "30 days" blocks stepping down through the
  // whole ramp while all six 60- and 90-day blocks sat flat at 0.3, so opacity no longer
  // encoded phase. Opacity is now keyed off the entry's own phase, and this test asserts
  // that property instead: one opacity per phase, shared by every entry in that phase.
  it('keys opacity to the PHASE, not the array position, when more than three phase entries fire (foundation, multiple gated enablers)', () => {
    // FOUNDATION_3_FACTS has THREE gated enablers (ruling 8: 3 gated => 9 roadmap entries,
    // 3 phases x 3 enablers), so this is guaranteed to exceed the ramp's three values.
    const entries = roadmapEntries(FOUNDATION_3_FACTS, methodology);
    expect(entries.length).toBeGreaterThan(3);

    const model = webVisuals(FOUNDATION_3_FACTS, methodology).s10.phaseRail;
    expect(model).not.toBeNull();
    expect(model!.blocks.length).toBe(entries.length);

    // Pair each block's opacity with its OWN entry's phase by index, so a block that took
    // another phase's opacity cannot pass. The three values and their order are unchanged.
    const expected: Record<string, number> = { align: 1, build: 0.6, scale: 0.3 };
    const byPhase = new Map<string, number[]>();
    model!.blocks.forEach((block, i) => {
      const { phase } = entries[i]!;
      expect(block.opacity).toBe(expected[phase]);
      byPhase.set(phase, [...(byPhase.get(phase) ?? []), block.opacity]);
    });

    // All three phases really are present with more than one entry each — otherwise the
    // per-block check above could be satisfied by a three-entry rail that never exercises
    // the many-entries-per-phase case this test exists for.
    expect([...byPhase.keys()].sort()).toEqual(['align', 'build', 'scale']);
    expect(byPhase.get('align')).toEqual([1, 1, 1]);
    expect(byPhase.get('build')).toEqual([0.6, 0.6, 0.6]);
    expect(byPhase.get('scale')).toEqual([0.3, 0.3, 0.3]);
  });
});
