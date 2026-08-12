import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type BuildFactsArgs, type ChurchFacts, type FactsPack } from '../../lib/report/facts';
import { gateSection } from '../../lib/ai/section-gates';

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

describe('gate 1 — field parity', () => {
  it('accepts a fully populated section', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects a section with a blank required field', () => {
    expect(gateSection('s2', { ...goodS2, what_this_is_not: '   ' }, ctx)).toBe('field parity');
  });
  it('rejects output that does not match the schema at all', () => {
    expect(gateSection('s2', { nope: 1 }, ctx)).toBe('field parity');
  });
});

describe('gate 2 — scoped numeric containment', () => {
  it("accepts numbers present in that section's own slice", () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects an invented number', () => {
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary + ' Growth is up 37 percent.' }, ctx)).toBe('numeric containment');
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
    expect(gateSection('s2', { ...goodS2, summary: `${goodS2.summary} And ${other}.` }, ctx)).toBe('numeric containment');
  });
});

describe('gate 3 — required and banned mentions', () => {
  it('accepts a constraint S2 naming the tier and the primary category', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects a constraint S2 missing the tier name', () => {
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary.replace(constraintFacts.overall.tier.name, 'fine') }, ctx)).toBe('required mention');
  });
  it('rejects capacity framing inside a constraint report', () => {
    expect(gateSection('s2', { ...goodS2, what_this_is_not: 'Nothing in your chain is broken.' }, ctx)).toBe('banned phrase');
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
    expect(gateSection('s2', withoutPrimary, ctx)).toBe('required mention');
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
  // Deliberately uses the banned_phrases.constraint ENTRY verbatim ("nothing in your chain is
  // broken"), not report.yaml's real capacity S2 template text ("Nothing in the chain is
  // broken" — no "your", methodology/report.yaml:31). Those two strings differ and do not
  // substring-match each other. Verified empirically: with the capacity-archetype guard
  // temporarily removed, a section using the real template's "no your" wording still returned
  // null — the mutation was invisible, i.e. that wording can never have exercised this branch
  // at all. Only text containing the actual banned-phrase wording proves the guard does
  // anything; see the mutation table in task-7-report.md for the confirming run.
  it('accepts "nothing in your chain is broken" in a CAPACITY report scoring below 70 — the regression this fix closes', () => {
    expect(lowCapacityFacts.archetype).toBe('capacity');
    expect(lowCapacityFacts.overall.capacity).toBeLessThan(70);
    const s2 = {
      summary: `Overall health sits at ${lowCapacityFacts.overall.capacity} out of 100, in the ${lowCapacityFacts.overall.tier.name} band. Nothing in your chain is broken.`,
      what_this_is_not: 'This is not a verdict on anyone.',
      context_bullets: [],
    };
    expect(gateSection('s2', s2, { ...ctx, facts: lowCapacityFacts })).toBeNull();
  });

  // Mutation-isolation: neither test above can prove the sub-70 loop is still reachable.
  // 'constraint' is a permanent no-op (gate 3's first loop reads the same array first).
  // 'capacity' is now explicitly guarded off. Only 'foundation' exercises the loop: its first
  // loop checks banned_phrases.foundation (healthy and ready to grow / your primary constraint
  // / is the constraint / this is a capacity conversation), which does NOT contain "every stage
  // is strong" — that phrase lives only in banned_phrases.constraint, so only the sub-70 loop
  // can catch it here.
  it('rejects "every stage is strong" in a FOUNDATION report scoring below 70 — proves the sub-70 loop is still reachable', () => {
    expect(lowCapacityFoundationFacts.archetype).toBe('foundation');
    expect(lowCapacityFoundationFacts.overall.capacity).toBeLessThan(70);
    const s2 = {
      summary: `Overall health sits at ${lowCapacityFoundationFacts.overall.capacity} out of 100, in the ${lowCapacityFoundationFacts.overall.tier.name} band. Every stage is strong except the gate.`,
      what_this_is_not: 'This is not a verdict on anyone.',
      context_bullets: [],
    };
    expect(gateSection('s2', s2, { ...ctx, facts: lowCapacityFoundationFacts })).toBe('banned phrase');
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
    expect(gateSection('s9', withInventedNumber, { ...ctx, facts: lowCapacityFacts })).toBe('numeric containment');
  });
});

describe('gate 4 — anonymity', () => {
  it('accepts prose with no respondent label', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects prose naming a respondent, case-insensitively', () => {
    expect(gateSection('s2', { ...goodS2, what_this_is_not: 'priscilla vandermeer disagreed.' }, ctx)).toBe('anonymity');
  });
});

describe('gate 5 — S7 pattern-claim consistency', () => {
  const zeroTheology = { ...constraintFacts, pattern_counts: { systems: 4, culture: 2, theology: 0, relational: 0 } };
  it('accepts a none-claim the counts make true', () => {
    expect(gateSection('s7', { narrative: 'Systems dominate.', pattern_claim: 'None of the six lowest indicators are theological.' }, { ...ctx, facts: zeroTheology })).toBeNull();
  });
  it('rejects a none-claim the counts make false', () => {
    expect(gateSection('s7', { narrative: 'Systems dominate.', pattern_claim: 'None of the six lowest indicators are systems.' }, { ...ctx, facts: zeroTheology })).toBe('pattern claim');
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
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary + 'x'.repeat(ceiling) }, ctx)).toBe('length ceiling');
  });
});
