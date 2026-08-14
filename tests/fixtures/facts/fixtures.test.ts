import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSections } from '@/lib/report/fallback-sections';
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

  it('renders all 13 sections without throwing, on every fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sections = fallbackSections({ facts, methodology, reflections: [] });
      expect(Object.keys(sections), name).toHaveLength(13);
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
