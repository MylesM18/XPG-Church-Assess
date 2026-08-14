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

// Task 10: a 1-respondent facts pack, built the same way FIXTURE_FACTS above is but with every
// response keyed to a single respondent_id — the exact surface the s8 anonymity gap lived on
// (task-10-brief.md: "the public share page always renders" the fallback path via
// assembleFallbackOnly, and at one respondent that was one person's answers, fully
// attributable, on a link anyone can forward).
const ONE_RESPONDENT_RESPONSES: Response[] = [
  resp('G1', 'guest', 7, 'solo'),
  resp('C1', 'conn', 7, 'solo'),
  resp('D1', 'disc', 6, 'solo'),
  resp('V1', 'vol', 6, 'solo'),
  resp('GEN1', 'gen', 6, 'solo'),
];

const ONE_RESPONDENT_FACTS: FactsPack = buildFacts({
  methodology: FIXTURE_METHODOLOGY,
  responses: ONE_RESPONDENT_RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
  labelSource: { kind: 'known', labels: [] },
  diagnosis: makeDiagnosis({ primary_constraint: null, gating_conditions: [], generosity_mode: null }),
});

describe('assembleFallbackOnly', () => {
  // Task 10: the s8 fallback anonymity gap. G6 is a real reflection-prompted item (category
  // guest, methodology/questions.yaml) — the same one tests/report/fallback-sections.test.ts's
  // reflectionItemId already established, so buildOutreachVoices would surface these entries if
  // the k-threshold guard were not in place, proving the guard is what suppresses them here.
  it('suppresses verbatim reflections in s8 at one respondent — the surface the public share page always renders', () => {
    const reflections = [
      { item_id: 'G6', reflection: 'I greeted the guest and walked them to the coffee table.' },
      { item_id: 'G6', reflection: 'Nobody followed up with the family who visited in June.' },
    ];
    const sections = assembleFallbackOnly({
      facts: ONE_RESPONDENT_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections,
    });
    const s8 = sections.find((s) => s.id === 's8')!;
    for (const r of reflections) {
      expect(s8.fallback.bullets.join(' ')).not.toContain(r.reflection);
    }
  });


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

  // Task 5: charts are attached on this permanently-fallback path — the public share page
  // never goes through assembleReport, so if the attach point lived only there, the share page
  // would silently render s3/s7 without their charts.
  it('attaches the tier gauge then area bars charts to s3, and the bottom-items chart to s7', () => {
    const sections = assembleFallbackOnly({
      facts: FIXTURE_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections: [],
    });
    const s3 = sections.find((s) => s.id === 's3')!;
    const s7 = sections.find((s) => s.id === 's7')!;
    expect(s3.charts.map((c) => c.kind)).toEqual(['tier_gauge', 'area_bars']);
    expect(s7.charts.map((c) => c.kind)).toEqual(['bottom_items']);
  });

  it('gives every non-s3/s7 section no charts', () => {
    const sections = assembleFallbackOnly({
      facts: FIXTURE_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections: [],
    });
    const withCharts = sections.filter((s) => s.id !== 's3' && s.id !== 's7' && s.charts.length > 0);
    expect(withCharts.map((s) => s.id)).toEqual([]);
  });
});

describe('resolveScoreability (D-P4-6)', () => {
  // The anti-drift boundary for the not-scoreable branch: the pages stop calling
  // resolveReportView after plan 4, so this helper is what produces the resolution they
  // render the stale-methodology notice from. It must agree with resolveReportView
  // exactly, or the two surfaces' notices silently diverge from the PDF route's.
  //
  // FIX ROUND 1 (controller's Step 6 mutation, proven by execution): resolveReportView's
  // not-scoreable arm now DELEGATES to resolveScoreability (view.ts) — so for as long as
  // that delegation stands, `direct` and `viaView` below are the SAME code path wearing two
  // names. This assertion CANNOT fail on its own for any mutation of the shared gate logic —
  // a controller mutation of resolveScoreability's `blockedAreas` line proved this
  // concretely (5/5 green under the mutation, hand-reverted). It is kept anyway because it
  // still catches real drift: if a future author ever un-delegates resolveReportView and
  // re-inlines its own gate, this is the test that notices the two diverge again. The
  // literal-value test directly below is what actually pins resolveScoreability's own output
  // today, independent of resolveReportView.
  it('agrees with resolveReportView on every not-scoreable arm', () => {
    for (const derived of NOT_SCOREABLE_FIXTURES) {
      const viaView = resolveReportView(derived, FIXTURE_METHODOLOGY, () => FIXTURE_BLOCKS, {
        audience: 'screen',
      });
      const direct = resolveScoreability(derived);
      expect({ id: derived.reason, r: direct }).toEqual({ id: derived.reason, r: viaView });
    }
  });

  // The real value pin (fix round 1): literal expected values, not another function's output,
  // so a mutation of resolveScoreability's own logic cannot hide behind the delegation above.
  // Whole-object toEqual per fixture — not a loop with one assertion per iteration (Lesson 1:
  // an assertion inside a loop reports only the FIRST failure) — so both arms are checked and
  // a failure on either is reported directly. The unknown_band expectation matches what
  // tests/report/stale-payload.test.ts:67 already pins for resolveReportView, so the two
  // files cannot silently drift apart on that arm's shape.
  it('pins each not-scoreable resolution against a literal expected value', () => {
    expect(resolveScoreability(INCOMPLETE)).toEqual({
      scoreable: false,
      reason: 'incomplete_areas',
      blockedAreas: ['disc', 'vol'],
    });
    expect(resolveScoreability(UNKNOWN_BAND)).toEqual({
      scoreable: false,
      reason: 'unknown_band',
      blockedAreas: [],
    });
  });

  it('carries the diagnosis on the scoreable arm so callers can narrow', () => {
    const resolution = resolveScoreability(SCOREABLE_FIXTURE);
    expect(resolution.scoreable).toBe(true);
    if (resolution.scoreable) expect(resolution.diagnosis).toBe(SCOREABLE_FIXTURE.diagnosis);
  });

  // FIX ROUND 1: the original version of this test spied on a `calls` counter incremented by
  // a thunk that was only ever passed to resolveReportView, never to resolveScoreability —
  // whose signature is `(derived: DeriveResult) => ScoreabilityResolution`, with no blocks
  // parameter it could invoke at all. `expect(calls).toBe(before)` was therefore vacuous: it
  // could not fail no matter what resolveScoreability's body did, because resolveScoreability
  // structurally has no reference to that closure to call. "Never invokes a blocks thunk" is a
  // type-level guarantee here (no parameter exists to invoke it through), not something a spy
  // at this call site can observe. What IS runtime-observable, and is the actual behavioral
  // difference this helper exists to provide (its own doc comment in view.ts: "calling
  // resolveReportView purely to read a boolean would build an entire unused ReportView"), is
  // that the returned resolution carries no `view` key at all — pinned here directly via
  // whole-object equality instead of a spy that could never fire.
  it('returns diagnosis only on the scoreable arm — no view key is ever present', () => {
    const resolution = resolveScoreability(SCOREABLE_FIXTURE);
    expect(resolution).toEqual({ scoreable: true, diagnosis: SCOREABLE_FIXTURE.diagnosis });
  });
});
