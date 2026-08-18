import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts, type FactsPack } from '../../lib/report/facts';
import { gateSection } from '../../lib/ai/section-gates';
import { S6Schema } from '../../lib/ai/sections';
import { CAPACITY_FACTS } from '../fixtures/facts';

// No importable constraintFacts/shared FactsPack fixture exists anywhere in tests/ or lib/
// (task-7-recon.md §A1, controller ruling R2) — built inline here, copying the house idiom
// verbatim from tests/report/fallback-sections.test.ts:12-119 (recon §A2), with its `@/...`
// imports converted to the lib/ai/**-relative form this subtree uses exclusively (ruling R4).

const methodology = loadMethodology();
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

const baseArgs: Omit<BuildFactsArgs, 'diagnosis'> = {
  methodology,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
  labelSource: { kind: 'known', labels: [] },
};

// constraint archetype: primary = conn, one real downstream sequence dependency (conn -> disc).
// Overall capacity lands at exactly 70 (the "Healthy but Stretched" tier boundary) via
// makeDiagnosis's untouched default.
const connDep = methodology.rules.dependencies.find((d) => d.from === 'conn' && d.to === 'disc')!;
const constraintFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 30, 66, 61, 58, 70, 55, 64][i]!, { state: id === 'conn' ? 'broken' : 'ok' }),
    ),
    primary_constraint: { category_id: 'conn' },
    dependencies: [{ ...connDep, read: 'load_bearing', fromScore: 30, toScore: 66 }],
  }),
});

// Same shape as constraintFacts but with capacity pushed under the 70 tier boundary (65,
// "Strained"), for ruling R6's sub-70 register-calibration path.
const lowCapacityConstraintFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    capacity: 65,
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 30, 66, 61, 58, 70, 55, 64][i]!, { state: id === 'conn' ? 'broken' : 'ok' }),
    ),
    primary_constraint: { category_id: 'conn' },
    dependencies: [{ ...connDep, read: 'load_bearing', fromScore: 30, toScore: 66 }],
  }),
});

// capacity archetype (no primary_constraint, no gating_conditions) also pushed under 70 — the
// vehicle for the sub-70 loop's capacity-archetype guard (fix round 1, finding 2): this fixture
// must ACCEPT its own required consolation register below 70, not reject it.
const lowCapacityFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({ capacity: 65 }),
});

// foundation archetype (no primary_constraint, gating_conditions non-empty) pushed under 70 —
// the natural vehicle for proving the sub-70 loop is non-vacuous post-guard (fix round 1,
// finding 2). See the describe block below for why 'constraint' and 'capacity' fixtures cannot
// isolate this loop but 'foundation' can.
const lowCapacityFoundationFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    capacity: 65,
    primary_constraint: null,
    gating_conditions: [{ enabler_id: 'comm', note: 'Comm gates guest and conn.' }],
    categories: CAT_IDS.map((id, i) =>
      makeCategory(id, [72, 68, 66, 61, 58, 70, 30, 64][i]!, { state: id === 'comm' ? 'gate' : 'ok' }),
    ),
  }),
});

const ctx = { facts: constraintFacts, methodology, labels: ['Priscilla Vandermeer'] };

const goodS2 = {
  summary: `Overall health sits at ${constraintFacts.overall.capacity} out of 100, in the ${constraintFacts.overall.tier.name} band. ${constraintFacts.primary_constraint!.name} is holding the rest back.`,
  what_this_is_not: 'This is not a verdict on anyone.',
  context_bullets: [],
};

// s9's own well-formed shape (S9Schema = { narrative, working_model }), digit-free so gate 2
// (scoped numeric containment) can never reject it regardless of which facts pack it's paired
// with, and clear of every banned_phrases.capacity / .foundation / .constraint entry so it is
// safe to reuse against lowCapacityFacts (capacity) and lowCapacityFoundationFacts (foundation,
// which also runs the sub-70 loop against banned_phrases.constraint since it scores under 70).
const goodS9 = {
  narrative: 'Momentum across the stages looks steady, with no single blocking bottleneck driving the picture.',
  working_model: 'Keep investing broadly across the enablers rather than concentrating effort on one area.',
};

// The valid ids are DERIVED from the pack, never hardcoded: buildFacts re-sorts
// facts.categories score-desc (ties by id asc), so a literal list would bake in that sort.
const s5Ids = constraintFacts.categories.slice(0, 3).map((c) => c.id);
const s6Ids = constraintFacts.categories.slice(3).map((c) => c.id);

// Digit-free prose (gate 2 rejects any number outside the section's own slice), clear of the
// respondent label in ctx.labels (gate 4) and of every banned_phrases.constraint entry (gate
// 3), and far under the ceilings (s5 = 2200, s6 = 6000).
const goodS5 = {
  strengths: s5Ids.map((id) => ({
    category_id: id,
    heading: 'Carrying real weight',
    body: 'This area is holding steady and gives the repair somewhere solid to stand.',
  })),
};
const goodS6 = {
  areas: s6Ids.map((id) => ({
    category_id: id,
    affirm: 'There is real work happening here already.',
    pivot: 'It sits behind the areas already carrying the church forward.',
    evidence: 'Responses point to steady but uneven practice across the team.',
    not_statement: 'This is not a sign nobody cares — the practice has not caught up yet.',
    reframe: 'Read this as room to grow rather than a failure to fix.',
    trajectory: 'Left alone, that gap will not close on its own.',
  })),
};

describe('gate 1 — field parity', () => {
  it('accepts a fully populated section', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects a section with a blank required field', () => {
    expect(gateSection('s2', { ...goodS2, what_this_is_not: '   ' }, ctx)).toMatchObject({ family: 'field parity' });
  });
  it('rejects output that does not match the schema at all', () => {
    expect(gateSection('s2', { nope: 1 }, ctx)).toMatchObject({ family: 'field parity' });
  });
});

describe('gate 1b — s5/s6 category coverage', () => {
  // s5 and s6 are the only two AI sections whose payload is an array keyed to a category, and
  // the only two whose `required_mentions` is [] (methodology/report.yaml:69,78). Nothing
  // downstream validates those ids either: both renderers use `category_id` only as a React key
  // (lib/report/pdf/document.tsx:110,125 · app/app/[churchId]/diagnosis/report/sections.tsx:70,85).
  //
  // Every payload below was ACCEPTED before this gate existed. An empty array flattens to [] and
  // `[].some()` is false, so gate 1's blank check passes; the joined text is then '', which
  // vacuously satisfies gates 2/3/4/6; and the empty `required_mentions` leaves gate 3 with no
  // content requirement precisely here. An empty s5 therefore shipped as a passing AI section
  // that rendered nothing at all.
  //
  // s5Ids/s6Ids and the goodS5/goodS6 payloads are module-scoped above: the gate-failure-detail
  // block reuses them rather than building a second set of fixtures.

  it('rejects an s5 whose strengths array is empty', () => {
    expect(gateSection('s5', { strengths: [] }, ctx)).toMatchObject({ family: 'category coverage' });
  });

  it('rejects an s6 whose areas array is empty', () => {
    expect(gateSection('s6', { areas: [] }, ctx)).toMatchObject({ family: 'category coverage' });
  });

  it('rejects an s5 that covers the same category twice', () => {
    const duplicated = { strengths: [goodS5.strengths[0]!, goodS5.strengths[0]!, goodS5.strengths[1]!] };
    expect(gateSection('s5', duplicated, ctx)).toMatchObject({ family: 'category coverage' });
  });

  // Deliberately a REAL category drawn from s6's slice rather than a fabricated string — the
  // stronger form. A known-id set built from the whole pack (ctx.facts.categories) instead of
  // this section's own registry slice would still reject a made-up id, but would ACCEPT this
  // one. s5 and s6 partition the same category list, so a cross-slice id is the realistic model
  // error, and this is the assertion that pins the set to the slice.
  it('rejects an s5 naming a category outside its own slice', () => {
    expect(s5Ids).not.toContain(s6Ids[0]!);
    const outOfSlice = { strengths: [{ ...goodS5.strengths[0]!, category_id: s6Ids[0]! }] };
    expect(gateSection('s5', outOfSlice, ctx)).toMatchObject({ family: 'category coverage' });
  });

  // Completeness, one per section. The membership + uniqueness loop above constrains only the
  // ids that ARE present, so a proper SUBSET of the slice satisfied every check and shipped as a
  // passing AI section. That is material, not cosmetic: methodology/report.yaml:65-67 has all
  // three s5 templates assert "Three areas are carrying real weight" while s5's slice is exactly
  // three (lib/ai/sections.ts:93), so a 2-of-3 response renders two strengths under a heading
  // claiming three. s6's templates read "Each area below…" (report.yaml:74-76).
  //
  // Short-by-one rather than a single entry: it is the weakest failing case, so it also pins the
  // stronger ones, and it is the realistic model error (a dropped item, not a wholesale refusal).
  it('rejects an s5 that covers only part of its slice', () => {
    const shortByOne = { strengths: goodS5.strengths.slice(0, -1) };
    expect(shortByOne.strengths).toHaveLength(s5Ids.length - 1);
    expect(gateSection('s5', shortByOne, ctx)).toMatchObject({ family: 'category coverage' });
  });

  it('rejects an s6 that covers only part of its slice', () => {
    const shortByOne = { areas: goodS6.areas.slice(0, -1) };
    expect(shortByOne.areas).toHaveLength(s6Ids.length - 1);
    expect(gateSection('s6', shortByOne, ctx)).toMatchObject({ family: 'category coverage' });
  });

  // Anti-vacuity, one per section: without these, a gate that rejected every s5 and s6 payload
  // outright would pass all six rejection tests above.
  it('accepts a well-formed s5 covering each category in its slice exactly once', () => {
    expect(gateSection('s5', goodS5, ctx)).toBeNull();
  });

  it('accepts a well-formed s6 covering each category in its slice exactly once', () => {
    expect(gateSection('s6', goodS6, ctx)).toBeNull();
  });
});

describe('gate 2 — scoped numeric containment', () => {
  it("accepts numbers present in that section's own slice", () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects an invented number', () => {
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary + ' Growth is up 37 percent.' }, ctx)).toMatchObject({ family: 'numeric containment' });
  });
  it("rejects a number that exists in the pack but not in this section's slice", () => {
    // Scoped, not global: the whole pack densely covers 0-100, so a global allowed-set would
    // let a downstream category's score be reattached to the primary. Same rationale as
    // prose.ts:70-78.
    //
    // Controller ruling R3: printed SECTION_REGISTRY.s2.slice(constraintFacts) and its number
    // set (after R1's SCALE_DENOMINATOR fix) by hand — see task-7-report.md for the full dump.
    // Deduped set: {100, 0, 2, 3, 4.5, 8, 10, 42, 60, 70, 250, 310, 499, 750, 2014, 2026}.
    // bottom_items, sorted mean asc / item_id asc, are D1=60, GEN1=60, V1=60, C1=70, G1=75.
    // bottom_items[0] (D1, mean 60) COLLIDES with overall.throughput (also 60, present in s2's
    // slice via head()) — using it here would prove nothing. bottom_items[4] (G1, mean 75) is
    // the only bottom_item value absent from the printed set — a real "elsewhere in the pack"
    // number that gate 2 must still reject when reattached to s2.
    const other = constraintFacts.bottom_items[4]!.mean;
    expect(other).toBe(75);
    expect(gateSection('s2', { ...goodS2, summary: `${goodS2.summary} And ${other}.` }, ctx)).toMatchObject({ family: 'numeric containment' });
  });
});

describe('gate 3 — required and banned mentions', () => {
  it('accepts a constraint S2 naming the tier and the primary category', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects a constraint S2 missing the tier name', () => {
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary.replace(constraintFacts.overall.tier.name, 'fine') }, ctx)).toMatchObject({ family: 'required mention' });
  });
  it('rejects capacity framing inside a constraint report', () => {
    expect(gateSection('s2', { ...goodS2, what_this_is_not: 'Every stage is carrying its load.' }, ctx)).toMatchObject({ family: 'banned phrase' });
  });
  it('accepts a stage name, which is shared vocabulary and never banned', () => {
    const withStage = { ...goodS2, what_this_is_not: `This is not a verdict on ${constraintFacts.categories[0]!.name}.` };
    expect(gateSection('s2', withStage, ctx)).toBeNull();
  });
});

describe('gate 3 — constraint-archetype primary-name requirement (fix round 1, finding 1)', () => {
  // section-gates.ts:76-78 is a SECOND, archetype-specific required-mention check, distinct
  // from the general `required_mentions` loop just above (s2's required_mentions is only
  // [tier_name] — it never lists primary_name). The reviewer mutated this branch off and all
  // 20 pre-existing tests still passed: goodS2 happens to satisfy it, but nothing exercised the
  // branch in isolation. These two tests do, by holding tier_name (the general loop's only
  // requirement) present while varying only the primary-constraint mention.
  it('accepts a constraint S2 that names the primary constraint (the general required_mentions loop alone would not have caught its absence)', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects a constraint S2 that omits the primary constraint name even though required_mentions (tier_name) is satisfied', () => {
    const withoutPrimary = {
      ...goodS2,
      summary: goodS2.summary.replace(constraintFacts.primary_constraint!.name, 'the responsible area'),
    };
    expect(withoutPrimary.summary).toContain(constraintFacts.overall.tier.name); // tier_name still present
    expect(withoutPrimary.summary).not.toContain(constraintFacts.primary_constraint!.name);
    expect(gateSection('s2', withoutPrimary, ctx)).toMatchObject({ family: 'required mention' });
  });
});

describe('gate 3 — sub-70 register calibration (product owner ruling, fix round 1, finding 2)', () => {
  // REVISED ruling: the sub-70 consolation-register loop is now guarded off for the capacity
  // archetype. Reasoning: the intent is "no consolation framing below the 70 tier boundary",
  // but a capacity-archetype report scoring below 70 is REQUIRED to use the capacity thesis
  // register ("Nothing in the chain is broken" is its own S2 template) — banning it there was a
  // false rejection. The loop was already a harmless no-op for 'constraint' (gate 3's first
  // loop reads the identical banned_phrases.constraint array and fires first), so after this
  // guard the loop does real, reachable work only for the 'foundation' archetype.
  const lowCapGoodS2 = {
    summary: `Overall health sits at ${lowCapacityConstraintFacts.overall.capacity} out of 100, in the ${lowCapacityConstraintFacts.overall.tier.name} band. ${lowCapacityConstraintFacts.primary_constraint!.name} is the constraint holding the rest back.`,
    what_this_is_not: 'This is not a verdict on anyone.',
    context_bullets: [],
  };
  const lowCapCtx = { ...ctx, facts: lowCapacityConstraintFacts };

  it('accepts "is the constraint" language in a constraint report scoring below 70 — the original regression this ruling fixed', () => {
    expect(lowCapacityConstraintFacts.overall.capacity).toBeLessThan(70);
    expect(gateSection('s2', lowCapGoodS2, lowCapCtx)).toBeNull();
  });

  // The regression guard for THIS round's fix: before the capacity-archetype guard, this exact
  // input was wrongly rejected as 'banned phrase' by the sub-70 loop.
  //
  // Deliberately uses a banned_phrases.constraint ENTRY verbatim ("every stage is carrying its
  // load"), which is also the real capacity S2 template's own thesis wording
  // (methodology/report.yaml). That is exactly the collision this guard exists for: the phrase
  // a capacity report is REQUIRED to use is on the list the sub-70 loop would otherwise apply
  // to it. Verified empirically: with the capacity-archetype guard temporarily removed this
  // input is rejected as 'banned phrase'. Only text containing the actual banned-phrase wording
  // proves the guard does anything; see the mutation table in task-7-report.md.
  it('accepts "every stage is carrying its load" in a CAPACITY report scoring below 70 — the regression this fix closes', () => {
    expect(lowCapacityFacts.archetype).toBe('capacity');
    expect(lowCapacityFacts.overall.capacity).toBeLessThan(70);
    const s2 = {
      summary: `Overall health sits at ${lowCapacityFacts.overall.capacity} out of 100, in the ${lowCapacityFacts.overall.tier.name} band. Every stage is carrying its load.`,
      what_this_is_not: 'This is not a verdict on anyone.',
      context_bullets: [],
    };
    expect(gateSection('s2', s2, { ...ctx, facts: lowCapacityFacts })).toBeNull();
  });

  // Mutation-isolation: neither test above can prove the sub-70 loop is still reachable.
  // 'constraint' is a permanent no-op (gate 3's first loop reads the same array first).
  // 'capacity' is now explicitly guarded off. Only 'foundation' exercises the loop: its first
  // loop checks banned_phrases.foundation (primary growth constraint / the area limiting the
  // rest / every stage is carrying its load / a question of capacity), which does NOT contain
  // "nothing is capping you" — that phrase lives only in banned_phrases.constraint, so only the
  // sub-70 loop can catch it here.
  it('rejects "nothing is capping you" in a FOUNDATION report scoring below 70 — proves the sub-70 loop is still reachable', () => {
    expect(lowCapacityFoundationFacts.archetype).toBe('foundation');
    expect(lowCapacityFoundationFacts.overall.capacity).toBeLessThan(70);
    const s2 = {
      summary: `Overall health sits at ${lowCapacityFoundationFacts.overall.capacity} out of 100, in the ${lowCapacityFoundationFacts.overall.tier.name} band. Nothing is capping you except the gate.`,
      what_this_is_not: 'This is not a verdict on anyone.',
      context_bullets: [],
    };
    expect(gateSection('s2', s2, { ...ctx, facts: lowCapacityFoundationFacts })).toMatchObject({ family: 'banned phrase' });
  });
});

describe('gate 3 — s9 required_mentions against a non-constraint pack (fix round A, I11)', () => {
  // s9 is the only section anywhere in report.yaml whose required_mentions contains
  // primary_name, and primary_name resolves to '' for every capacity/foundation pack (no
  // primary_constraint). No existing test anywhere gated s9 with such a pack before this —
  // tests/ai/section-gates.test.ts's other 20 calls all use 's2'/'s7', and
  // tests/report/compose.test.ts only ever gates s9 against a constraint pack.
  //
  // These two tests pin the BEHAVIOUR (a well-formed capacity/foundation s9 must pass), not the
  // `if (!needle) continue` line's current implementation: today that skip is inert —
  // `''.includes('')` is true, so `lower.includes(needle.toLowerCase())` would already pass on
  // an empty needle even without the skip. What they actually catch is the skip being inverted
  // into an unconditional rejection (`continue` -> `return 'required mention'`), which is the
  // real, proven escape — and they will keep catching a future switch away from `.includes` (to
  // word-boundary/regex matching, say) where the skip becomes genuinely load-bearing.
  it('accepts a well-formed s9 against a CAPACITY pack (primary_name resolves to "")', () => {
    expect(lowCapacityFacts.archetype).toBe('capacity');
    expect(lowCapacityFacts.primary_constraint).toBeNull();
    expect(gateSection('s9', goodS9, { ...ctx, facts: lowCapacityFacts })).toBeNull();
  });

  it('accepts a well-formed s9 against a FOUNDATION pack (primary_name resolves to "")', () => {
    expect(lowCapacityFoundationFacts.archetype).toBe('foundation');
    expect(lowCapacityFoundationFacts.primary_constraint).toBeNull();
    expect(gateSection('s9', goodS9, { ...ctx, facts: lowCapacityFoundationFacts })).toBeNull();
  });

  // Non-vacuity / positive control: without this, a `gateSection` that unconditionally
  // `return`ed `null` would also make both tests above pass. This proves s9 gating against
  // lowCapacityFacts is not simply always-null by exercising a different gate (2, scoped
  // numeric containment) on the same pack.
  it('still rejects an invented number in an otherwise well-formed s9 against the same CAPACITY pack', () => {
    const withInventedNumber = { ...goodS9, narrative: `${goodS9.narrative} Growth is up 37 percent.` };
    expect(gateSection('s9', withInventedNumber, { ...ctx, facts: lowCapacityFacts })).toMatchObject({ family: 'numeric containment' });
  });
});

describe('gate 4 — anonymity', () => {
  it('accepts prose with no respondent label', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects prose naming a respondent, case-insensitively', () => {
    expect(gateSection('s2', { ...goodS2, what_this_is_not: 'priscilla vandermeer disagreed.' }, ctx)).toMatchObject({ family: 'anonymity' });
  });
});

describe('gate 5 — S7 pattern-claim consistency', () => {
  const zeroTheology = { ...constraintFacts, pattern_counts: { systems: 4, culture: 2, theology: 0, relational: 0 } };
  it('accepts a none-claim the counts make true', () => {
    expect(gateSection('s7', { narrative: 'Systems dominate.', pattern_claim: 'None of the six lowest indicators are theological.' }, { ...ctx, facts: zeroTheology })).toBeNull();
  });
  it('rejects a none-claim the counts make false', () => {
    expect(gateSection('s7', { narrative: 'Systems dominate.', pattern_claim: 'None of the six lowest indicators are systems.' }, { ...ctx, facts: zeroTheology })).toMatchObject({ family: 'pattern claim' });
  });
  it('accepts a null pattern claim', () => {
    expect(gateSection('s7', { narrative: 'Systems dominate.', pattern_claim: null }, { ...ctx, facts: zeroTheology })).toBeNull();
  });
});

describe('gate 6 — length ceilings', () => {
  it('accepts a section within its ceiling', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects a section over its ceiling', () => {
    const ceiling = methodology.report.sections.s2.length_ceiling;
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary + 'x'.repeat(ceiling) }, ctx)).toMatchObject({ family: 'length ceiling' });
  });
});

describe('S6Schema carries all six beats', () => {
  const capacityCtx = { facts: CAPACITY_FACTS, methodology, labels: [] as readonly string[] };
  const slice = CAPACITY_FACTS.categories.slice(3);

  const area = (over: Record<string, string> = {}) => ({
    category_id: 'x', affirm: 'A.', pivot: 'B.', evidence: 'C.',
    not_statement: 'D.', reframe: 'E.', trajectory: 'F.', ...over,
  });
  const full = () => ({ areas: slice.map((c) => area({ category_id: c.id })) });

  it('requires all six beat fields', () => {
    expect(S6Schema.safeParse({ areas: [{ category_id: 'x', affirm: 'a', evidence: 'b', reframe: 'c' }] }).success)
      .toBe(false);
    expect(S6Schema.safeParse({ areas: [area()] }).success).toBe(true);
  });

  it('passes the gate on a well-formed six-beat payload covering the slice', () => {
    expect(gateSection('s6', full(), capacityCtx)).toBeNull();
  });

  it('gate 1 rejects a blank in ANY of the three new fields, not just the old three', () => {
    for (const field of ['pivot', 'not_statement', 'trajectory']) {
      const payload = { areas: slice.map((c) => area({ category_id: c.id, [field]: '   ' })) };
      expect(gateSection('s6', payload, capacityCtx), field).toMatchObject({ family: 'field parity' });
    }
  });

  it('gate 2 rejects an invented number in a new field, same as in an old one', () => {
    const payload = { areas: slice.map((c) => area({ category_id: c.id, pivot: 'It sits 9999 points behind.' })) };
    expect(gateSection('s6', payload, capacityCtx)).toMatchObject({ family: 'numeric containment' });
  });

  it('gate 4 rejects a respondent label in a new field', () => {
    const payload = { areas: slice.map((c) => area({ category_id: c.id, trajectory: 'Dana said growth is fine.' })) };
    expect(gateSection('s6', payload, { ...capacityCtx, labels: ['Dana'] })).toMatchObject({ family: 'anonymity' });
  });

  it('gate 1b still requires full slice coverage with the wider schema', () => {
    const partial = { areas: [area({ category_id: slice[0]!.id })] };
    expect(gateSection('s6', partial, capacityCtx)).toMatchObject({ family: 'category coverage' });
  });
});

describe('gate failure detail (spec §4.1)', () => {
  it('length ceiling reports actual/limit', () => {
    const ceiling = methodology.report.sections.s2.length_ceiling;
    const bloated = { ...goodS2, summary: goodS2.summary + 'x'.repeat(ceiling) };
    const f = gateSection('s2', bloated, ctx);
    expect(f?.family).toBe('length ceiling');
    expect(f?.detail).toMatch(/^\d+\/1400$/);
    expect(Number(f!.detail.split('/')[0])).toBeGreaterThan(ceiling);
  });

  it('numeric containment reports the offending number and nothing else', () => {
    const f = gateSection('s2', { ...goodS2, summary: goodS2.summary + ' Growth is up 37 percent.' }, ctx);
    expect(f).toEqual({ family: 'numeric containment', detail: '37' });
  });

  it('category coverage distinguishes empty, unknown, duplicate and missing', () => {
    expect(gateSection('s5', { strengths: [] }, ctx)).toEqual({ family: 'category coverage', detail: 'empty' });

    const unknown = { strengths: [{ category_id: 'not-a-real-id', heading: 'H', body: 'B' }] };
    expect(gateSection('s5', unknown, ctx)).toEqual({ family: 'category coverage', detail: 'unknown: not-a-real-id' });

    const dupe = { strengths: [goodS5.strengths[0]!, goodS5.strengths[0]!, goodS5.strengths[2]!] };
    const d = gateSection('s5', dupe, ctx);
    expect(d?.family).toBe('category coverage');
    expect(d?.detail).toBe(`duplicate: ${goodS5.strengths[0]!.category_id}`);

    const short = { strengths: goodS5.strengths.slice(0, 2) };
    const m = gateSection('s5', short, ctx);
    expect(m?.family).toBe('category coverage');
    expect(m?.detail).toBe(`missing: ${goodS5.strengths[2]!.category_id}`);
  });

  it('truncates an unknown category id to 24 characters', () => {
    const long = { strengths: [{ category_id: 'z'.repeat(80), heading: 'H', body: 'B' }] };
    const f = gateSection('s5', long, ctx);
    expect(f?.detail).toBe(`unknown: ${'z'.repeat(24)}`);
    expect(f!.detail.length).toBeLessThan(40);
  });

  it('required mention reports the key, never the resolved value', () => {
    const stripped = { ...goodS2, summary: goodS2.summary.replace(constraintFacts.overall.tier.name, 'fine') };
    const f = gateSection('s2', stripped, ctx);
    expect(f?.family).toBe('required mention');
    expect(f?.detail).toBe('tier_name');
    expect(f!.detail).not.toContain(constraintFacts.overall.tier.name);
  });

  it('banned phrase reports the matched phrase', () => {
    const f = gateSection('s2', { ...goodS2, what_this_is_not: 'Every stage is carrying its load.' }, ctx);
    expect(f?.family).toBe('banned phrase');
    expect(f!.detail.length).toBeGreaterThan(0);
    expect(methodology.report.banned_phrases[constraintFacts.archetype].map((p) => p.toLowerCase()))
      .toContain(f!.detail.toLowerCase());
  });

  // THE security assertion of this task. Not "an index is present" — the LABEL IS ABSENT.
  it('anonymity reports the label index and NEVER the label', () => {
    const labels = ['Alice Brown', 'priscilla vandermeer', 'Carol Danvers'];
    const leaked = { ...goodS2, what_this_is_not: 'priscilla vandermeer disagreed.' };
    const f = gateSection('s2', leaked, { ...ctx, labels });
    expect(f?.family).toBe('anonymity');
    expect(f?.detail).toBe('label 1');
    for (const label of labels) expect(f!.detail.toLowerCase()).not.toContain(label.toLowerCase());
  });

  it('field parity and pattern claim carry an empty detail', () => {
    expect(gateSection('s2', { nope: 1 }, ctx)).toEqual({ family: 'field parity', detail: '' });
    expect(gateSection('s2', { ...goodS2, what_this_is_not: '   ' }, ctx)).toEqual({ family: 'field parity', detail: '' });
    const zeroTheology = { ...constraintFacts, pattern_counts: { ...constraintFacts.pattern_counts, systems: 2 } };
    const claim = { narrative: 'Systems dominate.', pattern_claim: 'None of the six lowest indicators are systems.' };
    expect(gateSection('s7', claim, { ...ctx, facts: zeroTheology })).toEqual({ family: 'pattern claim', detail: '' });
  });

  // Non-vacuity: a gateSection that returned a constant object would pass several asserts above.
  it('still returns null for every good payload', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
    expect(gateSection('s5', goodS5, ctx)).toBeNull();
    expect(gateSection('s6', goodS6, ctx)).toBeNull();
  });
});

// Task 4a — the roadmap horizons s12 is required to state.
//
// ctx.facts (constraintFacts) cannot carry these tests: its s12 slice (head + categories)
// already contains 30 (conn's score) and 60 (overall.throughput), so two of the three horizons
// would be vacuously allowed. This pack keeps 30, 60 and 90 out of the slice entirely, and each
// horizon gets its OWN test because gate 2 returns on the FIRST offender — one combined string
// would prove only whichever number appears first.
const s12Facts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({
    capacity: 71,
    throughput: 62,
    gap: 9,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 68, 66, 61, 58, 71, 55, 64][i]!)),
  }),
});
const s12Ctx = { facts: s12Facts, methodology, labels: ['Priscilla Vandermeer'] };

/** A well-formed s12 whose only digits are the capacity and the scale denominator. */
function s12With(primary_objective: string) {
  return {
    assessment: `The church finishes at ${s12Facts.overall.capacity} out of 100, in the ${s12Facts.overall.tier.name} band.`,
    overall_percent: s12Facts.overall.capacity,
    tier_name: s12Facts.overall.tier.name,
    primary_objective,
  };
}

describe('gate 2 — s12 roadmap horizons (spec §4.4)', () => {
  it('permits the 30-day horizon in s12', () => {
    expect(gateSection('s12', s12With('Name a single owner within the first 30 days.'), s12Ctx)).toBeNull();
  });

  it('permits the 60-day horizon in s12', () => {
    expect(gateSection('s12', s12With('By 60 days that rhythm should be running weekly.'), s12Ctx)).toBeNull();
  });

  it('permits the 90-day horizon in s12', () => {
    // s12's own template says "the next ninety days"; this is that word written in digits.
    expect(gateSection('s12', s12With('Review what held at 90 days and reset from there.'), s12Ctx)).toBeNull();
  });

  it('still rejects a number in s12 that is neither in the slice nor a horizon', () => {
    expect(gateSection('s12', s12With('Name a single owner within the first 45 days.'), s12Ctx))
      .toMatchObject({ family: 'numeric containment', detail: '45' });
  });

  it('does not extend the horizons to other sections', () => {
    // 30 and 90 are both absent from s2's slice (its number set is dumped at the gate 2
    // describe above), so this stays a real rejection: the allowance is scoped to s12.
    const withThirty = { ...goodS2, summary: `${goodS2.summary} Thirty is written 30 here.` };
    expect(gateSection('s2', withThirty, ctx)).toMatchObject({ family: 'numeric containment', detail: '30' });
    const withNinety = { ...goodS2, summary: `${goodS2.summary} Ninety is written 90 here.` };
    expect(gateSection('s2', withNinety, ctx)).toMatchObject({ family: 'numeric containment', detail: '90' });
  });
});
