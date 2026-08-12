import { describe, expect, it } from 'vitest';
import { assembleFallbackOnly } from '../../lib/report/compose';
import { resolveReportView, resolveScoreability } from '../../lib/report/view';
import { loadMethodology } from '../../lib/methodology/load';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import { diagnose } from '../../lib/engine';
import { fallbackProse } from '../../lib/ai/fallback';
import { buildFacts, type ChurchFacts, type FactsPack } from '../../lib/report/facts';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import type { ReportBlocks } from '../../lib/ai/fallback';
import type { DeriveResult } from '../../lib/report/derive';

/**
 * FIXTURE_METHODOLOGY: the same real, loaded methodology every tests/report/*.test.ts file
 * uses (tests/report/stale-payload.test.ts:9, tests/report/view.test.ts:11,
 * tests/report/fallback-sections.test.ts:11 all do `loadMethodology()` the same way).
 */
const FIXTURE_METHODOLOGY = loadMethodology();

// --- FIXTURE_FACTS: built with the exact capacity-archetype fixture idiom (makeCategory /
// makeDiagnosis / CHURCH / RESPONSES / buildFacts) that tests/report/fallback-sections.test.ts
// (its `capacityFacts`, :14-104) and tests/report/compose.test.ts (its `constraintFacts` setup,
// :29-80) both already build locally — reused here rather than hand-rolled from scratch.

const CAT_IDS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'] as const;

function makeCategory(id: string, score: number, over: Partial<DiagnosisCategory> = {}): DiagnosisCategory {
  return {
    category_id: id,
    kind: (['gov', 'comm', 'sys'].includes(id) ? 'enabler' : 'stage') as DiagnosisCategory['kind'],
    score,
    belief: null,
    evidence: null,
    gap: null,
    gap_class: null,
    cohort_percentile: 40,
    state: 'ok',
    respondent_count: 3,
    excluded_partial: 0,
    questionEffects: [],
    ...over,
  };
}

function makeDiagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: '0.3.0',
    throughput: 60,
    capacity: 70,
    gap: 10,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 68, 66, 61, 58, 70, 55, 64][i]!)),
    primary_constraint: null,
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: 'both',
    blind_spots: [],
    disagreement_flags: [],
    calibration: { people: [], spread: 1.1 },
    dependencies: [],
    correlations: [],
    offer: { type: 'x', call_type: 'call', hook: 'h' },
    confidence: 0.85,
    evidence_trail: [],
    ...over,
  };
}

const CHURCH: ChurchFacts = {
  name: 'Grace Chapel',
  denomination: 'Independent',
  context: 'suburban',
  attendance_band: '250_499',
  adults_band: '310',
  staff_fte_band: '4.5',
  budget_band: '$750k',
  church_age_band: '42 years',
  growth_trajectory: 'plateaued',
  campuses_band: '2',
  facility_status: 'owned',
  leadership_history: 'Senior pastor since 2014.',
  consultant_notes: 'No major changes since the last assessment.',
};

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who };
}

const RESPONSES: Response[] = [
  resp('G1', 'guest', 7, 'a'),
  resp('G1', 'guest', 8, 'b'),
  resp('C1', 'conn', 7, 'a'),
  resp('D1', 'disc', 6, 'b'),
  resp('V1', 'vol', 6, 'c'),
  resp('GEN1', 'gen', 6, 'a'),
];

// capacity archetype (archetypeFor: no primary_constraint, no gating_conditions) — identical
// shape to fallback-sections.test.ts's capacityFacts fixture.
const FIXTURE_FACTS: FactsPack = buildFacts({
  methodology: FIXTURE_METHODOLOGY,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
  labelSource: { kind: 'known', labels: [] },
  diagnosis: makeDiagnosis({ primary_constraint: null, gating_conditions: [], generosity_mode: null }),
});

// --- NOT_SCOREABLE_FIXTURES / SCOREABLE_FIXTURE / FIXTURE_BLOCKS: mirrors
// tests/report/stale-payload.test.ts:26-44 exactly (its INCOMPLETE / UNKNOWN_BAND / OK
// constants and its loadMethodology / loadFixtureMethodology / answers / diagnose /
// fallbackProse imports) — that file's fixtures are file-local consts, not exported, so they
// cannot be imported directly and are reproduced here instead of hand-rolled from nothing.

const INCOMPLETE: DeriveResult = { ok: false, reason: 'incomplete_areas', blockedAreas: ['disc', 'vol'] };
const UNKNOWN_BAND: DeriveResult = { ok: false, reason: 'unknown_band' };

/**
 * DeriveResult (lib/report/derive.ts:38-41) has exactly two not-ok arms — 'incomplete_areas'
 * and 'unknown_band' — so this covers every `derived.reason` value there is. Typed as the
 * `ok: false` extraction (not the full DeriveResult union) so `derived.reason` narrows without
 * an extra guard at each use site — every fixture in this array really is a not-ok arm.
 */
const NOT_SCOREABLE_FIXTURES: Array<Extract<DeriveResult, { ok: false }>> = [INCOMPLETE, UNKNOWN_BAND];

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
const SCOREABLE_DIAGNOSIS: Diagnosis = diagnose(
  ALL.flatMap((id) => [
    ...answers(loadFixtureMethodology(), id, id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
    ...answers(loadFixtureMethodology(), id, id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
  ]),
  loadFixtureMethodology(),
  { attendance_band: '100_249' },
);

const SCOREABLE_FIXTURE: DeriveResult = {
  ok: true,
  diagnosis: SCOREABLE_DIAGNOSIS,
  effectiveMethodology: loadFixtureMethodology(),
};

// FIXTURE_BLOCKS: fallbackProse(diagnosis, methodology) — the same call
// tests/report/audience-parity.test.ts:51 and stale-payload.test.ts's thunk both make.
const FIXTURE_BLOCKS: ReportBlocks = fallbackProse(SCOREABLE_DIAGNOSIS, FIXTURE_METHODOLOGY);

describe('assembleFallbackOnly', () => {
  it('returns every report.yaml section, in report.yaml order, all source fallback', () => {
    const sections = assembleFallbackOnly({
      facts: FIXTURE_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections: [],
    });
    expect(sections.map((s) => s.id)).toEqual(Object.keys(FIXTURE_METHODOLOGY.report.sections));
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure.
    expect(new Set(sections.map((s) => s.source))).toEqual(new Set(['fallback']));
    expect(sections.every((s) => s.ai === null)).toBe(true);
  });

  it('gives every section a title and a body from report.yaml', () => {
    const sections = assembleFallbackOnly({
      facts: FIXTURE_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections: [],
    });
    const untitled = sections.filter((s) => !s.fallback.title);
    expect(untitled.map((s) => s.id)).toEqual([]);
  });
});

describe('resolveScoreability (D-P4-6)', () => {
  // The anti-drift boundary for the not-scoreable branch: the pages stop calling
  // resolveReportView after plan 4, so this helper is what produces the resolution they
  // render the stale-methodology notice from. It must agree with resolveReportView
  // exactly, or the two surfaces' notices silently diverge from the PDF route's.
  it('agrees with resolveReportView on every not-scoreable arm', () => {
    for (const derived of NOT_SCOREABLE_FIXTURES) {
      const viaView = resolveReportView(derived, FIXTURE_METHODOLOGY, () => FIXTURE_BLOCKS, {
        audience: 'screen',
      });
      const direct = resolveScoreability(derived);
      expect({ id: derived.reason, r: direct }).toEqual({ id: derived.reason, r: viaView });
    }
  });

  it('carries the diagnosis on the scoreable arm so callers can narrow', () => {
    const resolution = resolveScoreability(SCOREABLE_FIXTURE);
    expect(resolution.scoreable).toBe(true);
    if (resolution.scoreable) expect(resolution.diagnosis).toBe(SCOREABLE_FIXTURE.diagnosis);
  });

  it('never invokes the blocks thunk — no view is built', () => {
    let calls = 0;
    resolveReportView(SCOREABLE_FIXTURE, FIXTURE_METHODOLOGY, () => { calls++; return FIXTURE_BLOCKS; }, { audience: 'screen' });
    const before = calls;
    resolveScoreability(SCOREABLE_FIXTURE);
    expect(calls).toBe(before);
  });
});
