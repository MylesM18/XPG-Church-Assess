import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSections } from '@/lib/report/fallback-sections';
import { throughput } from '@/lib/engine/throughput';
import { structuralEdges, readDependencies } from '@/lib/engine/dependencies';
import { interp } from '@/lib/report/view';
import { ALL_FIXTURES } from './index';

const methodology = loadMethodology();

describe('facts fixtures', () => {
  it('covers all three archetypes', () => {
    const archetypes = new Set(ALL_FIXTURES.map((f) => f.facts.archetype));
    expect(archetypes).toEqual(new Set(['capacity', 'constraint', 'foundation']));
  });

  it('is not degenerate — every fixture has at least 8 respondents', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      expect(facts.cover.respondent_count, name).toBeGreaterThanOrEqual(8);
    }
  });

  it('keeps categories sorted score desc, ties by id asc — the invariant buildFacts guarantees', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sorted = [...facts.categories].sort(
        (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      expect(facts.categories, name).toEqual(sorted);
    }
  });

  it('carries all eight areas in every fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      expect(facts.categories.map((c) => c.id).sort(), name)
        .toEqual(['comm', 'conn', 'disc', 'gen', 'gov', 'guest', 'sys', 'vol']);
    }
  });

  it('keeps pattern_counts consistent with bottom_items', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const tally = { systems: 0, culture: 0, theology: 0, relational: 0 };
      for (const b of facts.bottom_items) tally[b.theme] += 1;
      expect(facts.pattern_counts, name).toEqual(tally);
    }
  });

  it('renders all 12 sections without throwing, on every fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sections = fallbackSections({ facts, methodology, reflections: [] });
      expect(Object.keys(sections), name).toHaveLength(12);
      for (const [id, body] of Object.entries(sections)) {
        expect(body.title.length, `${name}/${id}`).toBeGreaterThan(0);
        expect(body.body.length, `${name}/${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('exercises the distinguishing feature each fixture exists for', () => {
    const by = Object.fromEntries(ALL_FIXTURES.map((f) => [f.name, f.facts]));
    expect(by['capacity']!.primary_constraint).toBeNull();
    expect(by['capacity']!.gating).toHaveLength(0);
    expect(by['constraint']!.primary_constraint).not.toBeNull();
    expect(by['foundation-2']!.gating).toHaveLength(2);
    expect(by['foundation-3']!.gating).toHaveLength(3);
    const severe = by['broken-stage-severe']!;
    const severeCat = severe.categories.find((c) => c.id === severe.primary_constraint!.category_id)!;
    expect(severeCat.score).toBeLessThan(25); // rules.yaml thresholds.severe
    expect(by['high-dispersion']!.dispersion.length).toBeGreaterThan(0);
    expect(by['high-dispersion']!.blind_spots.length).toBeGreaterThan(0);
    expect(by['themes-n3']!.themes.length).toBeGreaterThan(0);
    for (const t of by['themes-n3']!.themes) expect(t.support_count).toBeGreaterThanOrEqual(3);
  });
});

// Fix round 1: producibility assertions. Each of these recomputes an expected value from the
// SAME production functions the fixtures module now calls, independently of that module's own
// internals, so a fixture that regresses to a hand-typed, production-impossible value (a
// throughput below min(chain), a dependency edge structuralEdges could never emit, a
// contradicted from_score/to_score, a read_sentence built from the wrong template, or a
// non-existent attendance-band slug) fails here even if every other assertion above still
// passes.
describe('facts fixtures are producible — never a value production could not emit', () => {
  it("overall.throughput/gap match the production throughput()/gap() functions over each fixture's own categories", () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const scoreById = new Map(facts.categories.map((c) => [c.id, c.score]));
      const chainScores = methodology.rules.chain.map((id) => scoreById.get(id)!);
      const expectedThroughput = throughput(chainScores, methodology.rules.throughput.min_weight);
      expect(facts.overall.throughput, name).toBe(expectedThroughput);
      expect(facts.overall.gap, name).toBe(facts.overall.capacity - facts.overall.throughput);
    }
  });

  it('every dependency edge is one structuralEdges emits for the real rules, with matching kind', () => {
    const structural = new Set(
      structuralEdges(methodology.rules).map((e) => `${e.from}->${e.to}:${e.kind}`),
    );
    for (const { name, facts } of ALL_FIXTURES) {
      for (const d of facts.dependencies) {
        expect(structural.has(`${d.from}->${d.to}:${d.kind}`), `${name}: ${d.from}->${d.to}:${d.kind}`).toBe(true);
      }
    }
  });

  it("each edge's from_score/to_score equal the scores of those same categories in that fixture", () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const scoreById = new Map(facts.categories.map((c) => [c.id, c.score]));
      for (const d of facts.dependencies) {
        expect(d.from_score, `${name}: ${d.from}`).toBe(scoreById.get(d.from));
        expect(d.to_score, `${name}: ${d.to}`).toBe(scoreById.get(d.to));
      }
    }
  });

  it("each edge's read_sentence equals the copy.dependency_reads template for the read its own two scores produce", () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const scoreById = new Map(facts.categories.map((c) => [c.id, c.score]));
      const canonical = readDependencies(methodology.rules, scoreById, methodology.rules.thresholds.break);
      const canonicalByKey = new Map(canonical.map((e) => [`${e.from}->${e.to}`, e]));
      for (const d of facts.dependencies) {
        const e = canonicalByKey.get(`${d.from}->${d.to}`)!;
        const expected = interp(methodology.copy.dependency_reads[e.read], {
          fromName: d.from_name,
          toName: d.to_name,
        });
        expect(d.read_sentence, `${name}: ${d.from}->${d.to}`).toBe(expected);
      }
    }
  });

  it('profile.attendance_band, when present, is a member of the real benchmark bands', () => {
    const realBands = new Set(Object.keys(methodology.benchmarks.bands));
    for (const { name, facts } of ALL_FIXTURES) {
      const band = facts.profile.attendance_band;
      if (band !== undefined) expect(realBands.has(band), name).toBe(true);
    }
  });
});
