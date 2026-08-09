import { describe, it, expect } from 'vitest';
import { buildReportView } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';
import type { Diagnosis } from '@/lib/engine/types';
import type { ReportBlocks } from '@/lib/ai/fallback';
import type { Methodology } from '@/lib/methodology/schema';
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
    dependency_note: 'Dependencies are a working model.',
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

  it('drops respondent names for the screen audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'screen' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
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
  it('drops respondent names from system.disagreement for the screen audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks(), methodology, { audience: 'screen' });
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement?.respondents).toEqual([]);
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

  // Coverage lock for the session-19 view.ts threading: appendix.dependencyNote must mirror
  // blocks.dependency_note verbatim. Goes red if the `dependencyNote: blocks.dependency_note`
  // line is ever dropped from buildReportView (it would then be undefined, not the note string).
  it('threads the dependency note onto the appendix', () => {
    const b = blocks();
    const v = buildReportView(diagnosis(), b, methodology, { audience: 'screen' });
    expect(v.appendix.dependencyNote).toBe(b.dependency_note);
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

  it('labels a healthy area "Strong", not "Holding" (display rename, spec §7)', () => {
    // The healthy reading band's DISPLAY label changed from "Holding" to "Strong"
    // (band KEY 'holding' is unchanged — internal id, not user-facing). No area may
    // still render the old "Holding" label, and the high-scoring fixture areas must
    // now read "Strong".
    const labels = view.areas.map((a) => a.readingLabel);
    expect(labels).toContain('Strong');
    expect(labels).not.toContain('Holding');
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

/**
 * Pushes a synthetic 0.3.0-only, reflection-prompted item ('X9') onto the FIRST category
 * of `m`. Mirrors tests/report/derive.test.ts's withOutreachItem in shape and intent.
 *
 * Task brief's literal snippet indexes `aug.questions.categories[0].items` and later
 * `m.questions.categories[0].id` / `area.outreachVoices![0].itemId` with no non-null
 * assertions. This repo's tsconfig sets `noUncheckedIndexedAccess: true`, so every one of
 * those bare index accesses is `T | undefined` and fails to compile (verified directly:
 * `npx tsc --noEmit` on the brief's literal text reports "Object is possibly 'undefined'"
 * at each site). The `!` assertions below are the fix, matching this file's own established
 * convention for the identical access (tests/methodology/effective.test.ts:89,95,100,109,114
 * — `eff.questions.categories[0]!.items...`). The brief's redundant
 * `as (typeof aug.questions.categories)[number]['items'][number]` cast is dropped: it
 * type-asserts the pushed object, not the actual undefined-index problem, and
 * tests/report/derive.test.ts's withOutreachItem pushes an identically-shaped literal with
 * no cast at all — contextual typing already narrows `signal: 'evidence'` correctly.
 */
function withReflectionItem(m: Methodology): Methodology {
  const aug = structuredClone(m);
  aug.questions.categories[0]!.items.push({
    id: 'X9', text: 'q', signal: 'evidence', since: '0.3.0',
    anchors: { lo: 'l', mid: 'm', hi: 'h' }, reflection: 'Tell us.',
  });
  return aug;
}

describe('outreachVoices', () => {
  const reflections = [
    { item_id: 'X9', reflection: '  zebra story  ' },
    { item_id: 'X9', reflection: 'apple story' },
    { item_id: 'X9', reflection: '   ' },
    { item_id: 'X9', reflection: null },
  ];

  it('groups, trims, drops empties and sorts deterministically', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'screen', reflections });
    const area = view.areas.find((a) => a.category_id === m.questions.categories[0]!.id)!;
    expect(area.outreachVoices).toHaveLength(1);
    expect(area.outreachVoices![0]!.itemId).toBe('X9');
    expect(area.outreachVoices![0]!.reflectionPrompt).toBe('Tell us.');
    expect(area.outreachVoices![0]!.entries).toEqual(['apple story', 'zebra story']);
  });

  it('omits the field entirely when no reflections are given', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'screen' });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  it('never populates voices on the shared audience', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'shared', reflections });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  it('omits groups whose entries are all empty', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, {
      audience: 'screen',
      reflections: [{ item_id: 'X9', reflection: '   ' }],
    });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  it('ignores reflections for items the methodology does not prompt', () => {
    const view = buildReportView(diagnosis(), blocks(), methodology, {
      audience: 'screen',
      reflections: [{ item_id: 'X9', reflection: 'orphan' }],
    });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  // Distinct from the 'orphan' case above (an item id absent from the methodology
  // entirely — the pre-0.3.0 safety net). This is a real, present item ('G1') that simply
  // has no reflection PROMPT of its own — questions.yaml only puts `reflection:` on G6/G7 in
  // the guest category. A stray reflection row for a non-prompted item (plausible: e.g. a
  // prompt removed from a later methodology edition while old response rows persist) must
  // still be ignored. The `.toBeUndefined()` guard on `promptless.reflection` pins the
  // fixture's own premise, so a future edit to questions.yaml that added a prompt to G1
  // would fail loudly here instead of silently making this test vacuous.
  it('ignores a reflection row keyed to a real item that has no reflection prompt of its own', () => {
    const m = withReflectionItem(methodology);
    const promptless = m.questions.categories[0]!.items[0]!;
    expect(promptless.reflection).toBeUndefined();
    const view = buildReportView(diagnosis(), blocks(), m, {
      audience: 'screen',
      reflections: [{ item_id: promptless.id, reflection: 'should not appear' }],
    });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  // --- Additional coverage beyond the brief's literal Step 1 block ------------------
  // The brief's own sort fixture ('apple story' vs 'zebra story') sorts IDENTICALLY under
  // both a plain lexicographic compare and .localeCompare() — it cannot tell them apart.
  // Requirement #1 (task instructions) is explicit that localeCompare must never be used,
  // so this test uses a pair where the two algorithms disagree: every uppercase code point
  // (e.g. 'B' = U+0042) sorts below every lowercase one (e.g. 'a' = U+0061) under plain '<',
  // but a locale-aware/case-insensitive collation alphabetizes 'apple' before 'Banana'.
  it('sorts by plain code-unit order, not locale-aware collation', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, {
      audience: 'screen',
      reflections: [
        { item_id: 'X9', reflection: 'apple story' },
        { item_id: 'X9', reflection: 'Banana tale' },
      ],
    });
    const area = view.areas.find((a) => a.category_id === m.questions.categories[0]!.id)!;
    expect(area.outreachVoices![0]!.entries).toEqual(['Banana tale', 'apple story']);
  });

  // Requirement #2's hazard is specifically NON-space whitespace: Postgres btrim() with no
  // second argument strips only the ASCII space (0x20), so a reflection of literal '\n\n' or
  // '\t' survives the DB layer (Task 4's CHECK constraint doesn't trim; Task 5's RPC only
  // nullifies it if btrim leaves '' behind, which it won't for these two). A filter that
  // checks `.length > 0` without trimming — or that reimplements btrim's ASCII-only
  // behavior instead of using JS's full-Unicode `.trim()` — would let these leak into the
  // report as blank-looking quote bubbles. These two tests use the exact characters named in
  // the task brief, not just plain spaces (which any naive implementation already handles).
  it('drops entries that are blank after a full Unicode trim, using tab and newline (not just spaces)', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, {
      audience: 'screen',
      reflections: [
        { item_id: 'X9', reflection: '\n\n' },
        { item_id: 'X9', reflection: '\t' },
        { item_id: 'X9', reflection: 'valid story' },
      ],
    });
    const area = view.areas.find((a) => a.category_id === m.questions.categories[0]!.id)!;
    expect(area.outreachVoices).toHaveLength(1);
    expect(area.outreachVoices![0]!.entries).toEqual(['valid story']);
  });

  it('omits the group when every entry is blank via tab/newline whitespace only', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, {
      audience: 'screen',
      reflections: [
        { item_id: 'X9', reflection: '\n\n' },
        { item_id: 'X9', reflection: '\t' },
      ],
    });
    for (const area of view.areas) expect(area.outreachVoices).toBeUndefined();
  });

  // The brief's own rationale for buildAreas's conditional spread is "an area without voices
  // has no undefined-valued key" — a claim about key PRESENCE that toBeUndefined() alone
  // cannot distinguish from "key present, value undefined" (e.g. an unconditional
  // `outreachVoices: voices.get(categoryId)`, which is undefined for any category absent
  // from the Map). hasOwnProperty pins the stronger claim directly.
  it('leaves the outreachVoices key absent, not present-but-undefined, on areas with no voices', () => {
    const m = withReflectionItem(methodology);
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'screen' });
    const area = view.areas.find((a) => a.category_id === m.questions.categories[0]!.id)!;
    expect(Object.prototype.hasOwnProperty.call(area, 'outreachVoices')).toBe(false);
  });

  // Whole-branch review Fix 1: the filter used `r.reflection !== null`, so an entry whose
  // `reflection` key is entirely ABSENT (not `null` — genuinely missing) has
  // `r.reflection === undefined`, and `undefined !== null` is `true`. That absent-key entry
  // then survived the filter and reached `(r.reflection as string).trim()`, throwing
  // `TypeError: Cannot read properties of undefined (reading 'trim')`. This is reachable in
  // production: all three producers build this array from an untyped `supabase.rpc()` result
  // cast through a hand-written interface, so a `reflection` column that hasn't been migrated
  // in yet arrives as a genuinely missing key, not a `null` value — TypeScript cannot catch
  // this because the cast asserts the shape rather than checking it. The `as unknown as ...`
  // cast below reproduces exactly that shape: a literal with no `reflection` property at all.
  it('skips a reflection entry whose reflection key is entirely absent, rather than throwing', () => {
    const m = withReflectionItem(methodology);
    const missingKey = { item_id: 'X9' } as unknown as { item_id: string; reflection: string | null };
    const reflections = [missingKey, { item_id: 'X9', reflection: 'valid story' }];
    expect(() =>
      buildReportView(diagnosis(), blocks(), m, { audience: 'screen', reflections }),
    ).not.toThrow();
    const view = buildReportView(diagnosis(), blocks(), m, { audience: 'screen', reflections });
    const area = view.areas.find((a) => a.category_id === m.questions.categories[0]!.id)!;
    expect(area.outreachVoices).toHaveLength(1);
    expect(area.outreachVoices![0]!.entries).toEqual(['valid story']);
  });
});
