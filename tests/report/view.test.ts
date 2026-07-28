import { describe, it, expect } from 'vitest';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import type { Diagnosis } from '@/lib/engine/types';
import type { ReportBlocks } from '@/lib/ai/fallback';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import { diagnose } from '../../lib/engine';
import { fallbackProse } from '../../lib/ai/fallback';

const methodology = loadMethodology();

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: methodology.questions.version,
    throughput: 55,
    capacity: 60,
    gap: 5,
    categories: [
      { category_id: 'guest_experience', kind: 'stage', score: 30, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
      { category_id: 'connections', kind: 'stage', score: 70, belief: null, evidence: null,
        gap: null, gap_class: null, cohort_percentile: null, state: 'ok', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
    ],
    primary_constraint: { category_id: 'guest_experience' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: null,
    blind_spots: [],
    disagreement_flags: [],
    calibration: { people: [], spread: 0 },
    dependencies: [],
    correlations: [],
    offer: { call_type: 'Diagnostic call', hook: 'Lets walk the chain together.' },
    confidence: 0.8,
    evidence_trail: [
      { claim: 'primary_constraint:guest_experience',
        refs: [{ kind: 'item', ref: 'G1', value: 3 }] },
    ],
    ...over,
  } as Diagnosis;
}

function blocks(over: Partial<ReportBlocks> = {}): ReportBlocks {
  return {
    verdict: 'Guest Experience is the constraint. It scored 30 out of 100.',
    next_step: 'Start with the first weekend touchpoint.',
    benchmark_note: 'Benchmarks are provisional priors.',
    ...over,
  };
}

const WITH_DISPERSION = {
  disagreement_flags: [{
    category_id: 'guest_experience',
    respondents: [{ label: 'Dana Okafor', mean: 3.1 }, { label: 'Sam Reyes', mean: 7.4 }],
    spread: 2.2,
  }],
};

describe('buildReportView', () => {
  it('resolves the verdict, score, confidence and chain stages', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.verdict).toContain('Guest Experience');
    expect(v.throughput).toBe(55);
    expect(v.capacity).toBe(60);
    expect(v.gap).toBe(5);
    expect(v.confidence).toBe(0.8);
    expect(v.stages.length).toBeGreaterThan(0);
  });

  it('attaches evidence refs from the primary-constraint receipt', () => {
    const v = buildReportView(diagnosis(), blocks({ evidence: 'Two of three guest items are low.' }),
      methodology, { audience: 'screen' });
    expect(v.evidence?.refs).toEqual([{ kind: 'item', ref: 'G1', value: 3 }]);
  });

  it('omits optional sections whose blocks are absent', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.evidence).toBeUndefined();
    expect(v.cost).toBeUndefined();
    expect(v.gating).toBeUndefined();
    expect(v.dispersion).toBeUndefined();
  });

  it('keeps respondent names for the screen audience', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'screen' });
    expect(v.dispersion?.respondents.map((r) => r.label)).toEqual(['Dana Okafor', 'Sam Reyes']);
  });

  it('drops respondent names for the pdf audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'pdf' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
  });

  it('produces no phantom sections when there is no structural constraint', () => {
    const v = buildReportView(
      diagnosis({ primary_constraint: null, evidence_trail: [] }), blocks(), methodology,
      { audience: 'pdf' },
    );
    expect(v.evidence).toBeUndefined();
    expect(v.verdict).toBeTruthy();
    expect(v.appendix.categories.length).toBe(2);
    // M4 (whole-branch review, T13-a): constraintName must be null, not the id 'null' or an
    // empty string, when there is nothing to name.
    expect(v.cover.constraintName).toBeNull();
  });

  it('drops respondent names for the shared audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'shared' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
  });

  // system.disagreement carries the identical respondent list as the top-level
  // dispersion field (built independently from d.disagreement_flags[0], not from
  // blocks.dispersion — see lib/report/view.ts's buildSystem), so it needs its own
  // audience-gating coverage: nothing here proves it mirrors dispersion's stripping
  // unless it is asserted directly. Mirrors the three tests immediately above.
  it('keeps respondent names in system.disagreement for the screen audience', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks(), methodology, { audience: 'screen' });
    expect(v.system.disagreement?.respondents.map((r) => r.label)).toEqual(['Dana Okafor', 'Sam Reyes']);
  });

  it('drops respondent names from system.disagreement for the pdf audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks(), methodology, { audience: 'pdf' });
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement?.respondents).toEqual([]);
  });

  it('drops respondent names from system.disagreement for the shared audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks(), methodology, { audience: 'shared' });
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement?.respondents).toEqual([]);
  });

  it('drops the next-step CTA for the shared audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'shared' });
    expect(v.nextStep).toBeUndefined();
  });

  // Asserted separately from 'shared' on purpose: a future change to one audience must not
  // be able to silently redefine the other.
  it('keeps the next-step CTA for the pdf audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'pdf' });
    expect(v.nextStep?.text).toBe('Start with the first weekend touchpoint.');
  });

  it('keeps the next-step CTA for the screen audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.nextStep?.text).toBe('Start with the first weekend touchpoint.');
  });

  it('mirrors the gating note onto system.gating', () => {
    const v = buildReportView(diagnosis(), blocks({ gating: 'Address governance before anything else.' }),
      methodology, { audience: 'screen' });
    expect(v.system.gating).toBe('Address governance before anything else.');
    expect(v.system.gating).toBe(v.gating);
  });

  // M4 (whole-branch review, T13-a): cover.gatedBy and cover.constraintName had NO assertions
  // anywhere — both would pass today with a raw id ('gov') where a display name belongs, since
  // buildCover's `names.get(id) ?? id` silently falls back to the id when resolution fails.
  // This file's own `diagnosis()`/`blocks()` factories use ids ('guest_experience',
  // 'connections') that do not exist in the real production methodology (a pre-existing,
  // separately-noted fixture drift — see progress.md), so reusing them here would make name
  // resolution silently fail and the "not a raw id" assertions below would be worthless.
  // Built with REAL production category ids ('guest', 'gov' — methodology/questions.yaml) so
  // resolution can actually be exercised, not merely typechecked.
  it('resolves gatedBy to display names and scores, not raw enabler ids', () => {
    const withGating = diagnosis({
      primary_constraint: { category_id: 'guest' },
      evidence_trail: [],
      categories: [
        { category_id: 'guest', kind: 'stage', score: 30, belief: null, evidence: null,
          gap: null, gap_class: null, cohort_percentile: null, state: 'broken', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
        { category_id: 'gov', kind: 'enabler', score: 31, belief: null, evidence: null,
          gap: null, gap_class: null, cohort_percentile: null, state: 'gate', respondent_count: 2, excluded_partial: 0, questionEffects: [] },
      ],
      gating_conditions: [{ enabler_id: 'gov', note: 'Governance is below the gate line.' }],
    });
    const v = buildReportView(withGating, blocks(), methodology, { audience: 'screen' });

    // Empirical: gatedBy must actually be populated before the assertions below mean
    // anything — confirmed by running this fixture, not assumed from reading buildCover.
    expect(v.cover.gatedBy).toHaveLength(1);
    expect(v.cover.gatedBy[0]).toEqual({ name: 'Governance / Accountability', score: 31 });
    expect(v.cover.gatedBy[0]?.name).not.toBe('gov');

    expect(v.cover.constraintName).toBe('Guest Experience');
    expect(v.cover.constraintName).not.toBe('guest');
  });
});

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
const CHAIN_THEN_ENABLERS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

describe('ReportView shape', () => {
  const fixtureMethodology = loadFixtureMethodology();

  /**
   * Every item at `base` except the third, which sits 3 points lower.
   * A single scalar per area makes every column mean equal mu, so every
   * fit.questionEffects entry is exactly 0 and `insideIt` ("D3 sits 18 pts below
   * the rest") is structurally unexercisable. Build the FULL record — answers()
   * defaults any item missing from the map to 5, not to `base`.
   */
  const varied = (id: string, base: number): Record<string, number> =>
    Object.fromEntries(
      fixtureMethodology.questions.categories
        .find((c) => c.id === id)!
        .items.map((it, i) => [it.id, i === 2 ? base - 3 : base]),
    );

  const d = diagnose(
    ALL.flatMap((id) => [
      ...answers(fixtureMethodology, id, varied(id, id === 'vol' ? 4 : 8), 'Pastor', 'u-1'),
      ...answers(fixtureMethodology, id, varied(id, id === 'vol' ? 5 : 7), 'Elder', 'u-2'),
    ]),
    fixtureMethodology,
    // NOTE: the plan/brief text for this fixture literally reads '100-249' (hyphen).
    // methodology/benchmarks.yaml keys attendance bands with an UNDERSCORE
    // ('100_249', confirmed against every other fixture in this suite, e.g.
    // tests/engine/excluded-partial.test.ts). benchmarkFor() throws on an unknown
    // band, so the hyphenated literal would crash diagnose() before this file's
    // own tests ever ran. Corrected here; intent (100-249 attendance) unchanged.
    { attendance_band: '100_249' },
  );
  const view = buildReportView(d, fallbackProse(d, fixtureMethodology), fixtureMethodology, { audience: 'screen' });

  it('carries all three cover numbers', () => {
    expect(view.cover.throughput).toBe(d.throughput);
    expect(view.cover.capacity).toBe(d.capacity);
    expect(view.cover.gap).toBe(d.capacity - d.throughput);
  });

  it('has exactly eight dossiers in fixed chain-then-enabler order', () => {
    expect(view.areas).toHaveLength(8);
    expect(view.areas.map((a) => a.category_id)).toEqual(CHAIN_THEN_ENABLERS);
  });

  it('populates every one of the six dossier fields or explicitly marks it unavailable', () => {
    // Occurrence-count equality, not a presence check (spec §9.3). The shape test
    // `field === null || typeof field === 'string'` is satisfied by an implementation
    // that returns null for all four fields on all eight areas — i.e. "populated OR
    // unavailable" met entirely by "unavailable". Count instead.
    expect(view.areas).toHaveLength(8);
    for (const area of view.areas) {
      expect(area.reading.length).toBeGreaterThan(0);         // works at N=1
      expect(area.dependsOn.length).toBeGreaterThan(0);       // works at N=1
      expect(area.name.length).toBeGreaterThan(0);
    }
    // Every area has n = 2 and a non-zero questionEffects spread (the fixture varies
    // one item per area), so insideIt is derivable everywhere; agreement needs n >= 2,
    // also everywhere; the benchmark ships today, so position is everywhere too.
    expect(view.areas.filter((a) => a.insideIt !== null)).toHaveLength(8);
    expect(view.areas.filter((a) => a.agreement !== null)).toHaveLength(8);
    expect(view.areas.filter((a) => a.position !== null)).toHaveLength(8);
    // watchFor is legitimately absent on some areas — but absent must mean null,
    // never undefined and never '', because absent is a decision the renderer sees.
    for (const area of view.areas) {
      expect(area.watchFor === null || (typeof area.watchFor === 'string' && area.watchFor.length > 0)).toBe(true);
    }
    // gov/comm/sys always carry the enabler note, gen always carries the generosity
    // note, so at least four of the eight are non-null on any data.
    expect(view.areas.filter((a) => a.watchFor !== null).length).toBeGreaterThanOrEqual(4);
  });

  it('names the enabler blind-spot hole rather than leaving it empty', () => {
    // gov, comm and sys are 100% belief items, so gapFor() structurally returns
    // evidence: null and blind-spot detection is impossible for all three.
    // Compare against the LOADED value, not a literal. Task 14 Step 1 explicitly
    // invites the owner to reword this note; a hardcoded /perception only/i would
    // break a test in a task she is not editing.
    for (const id of ['gov', 'comm', 'sys']) {
      const area = view.areas.find((a) => a.category_id === id)!;
      expect(area.watchFor).toBe(fixtureMethodology.copy.dossier.enabler_belief_only);
    }
  });

  it('renders all 13 dependency edges with resolved display names', () => {
    expect(view.system.dependencies).toHaveLength(13);
    for (const e of view.system.dependencies) {
      expect(e.fromName).not.toBe(e.from); // resolved through questions.yaml names
      expect(e.statement.length).toBeGreaterThan(0);
    }
  });

  it('no longer exposes a top-level blindSpot or generosityMode', () => {
    expect('blindSpot' in view).toBe(false);
    expect('generosityMode' in view).toBe(false);
  });

  // --- Additional coverage beyond the brief's literal Step 1 block ---------------
  // The tests above run entirely on real diagnose() output. gov/comm/sys can never
  // structurally carry a blind spot there (no evidence items in the methodology, so
  // gapFor() always returns evidence: null for them — see the previous test's own
  // comment), which means a watchFor priority-order bug that only swaps the
  // blind-spot check against the enabler-limit check is invisible to any test built
  // solely on this fixture: both orderings reach the same branch for every real
  // category, because the two conditions never coexist in real engine output. These
  // two tests close that gap directly.

  it('prioritizes a blind-spot note over the enabler-limit note when both are structurally present', () => {
    // sys is an enabler (gov/comm/sys are 100% belief items in the real
    // methodology, so it can never carry a REAL blind spot) — forcing one here via
    // a Diagnosis override isolates watchFor's PRIORITY ORDER from that structural
    // impossibility. buildReportView takes Diagnosis as plain data, so this is a
    // legitimate unit-level probe of the function's contract, not a scenario that
    // has to be reachable through the real engine.
    const withForcedBlindSpot: Diagnosis = {
      ...d,
      blind_spots: [...d.blind_spots, { category_id: 'sys', belief: 80, evidence: 20, gap: 60 }],
    };
    const v2 = buildReportView(
      withForcedBlindSpot, fallbackProse(d, fixtureMethodology), fixtureMethodology, { audience: 'screen' },
    );
    const area = v2.areas.find((a) => a.category_id === 'sys')!;
    // Not a hardcoded sentence: copy.blocks.blind_spot is existing XPG copy Task 14
    // does not reword (it is not part of the dossier scaffold), but pinning the
    // exact rendered string here would still break on any future edit to that
    // template. The belief/evidence/gap numbers are the load-bearing part —
    // they are what proves the blind-spot branch actually ran, and this
    // discriminates mutation M1 identically to the literal-string version.
    expect(area.watchFor).not.toBe(fixtureMethodology.copy.dossier.enabler_belief_only);
    expect(area.watchFor).toContain('80');
    expect(area.watchFor).toContain('20');
    expect(area.watchFor).toContain('60');
  });

  it('interpolates the calibration spread into calibrationText rather than leaving the token literal', () => {
    expect(view.system.calibrationText).not.toMatch(/\{spread\}/);
    expect(view.system.calibrationText).toContain(String(d.calibration.spread));
  });
});
