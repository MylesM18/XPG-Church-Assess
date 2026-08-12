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

// capacity archetype (no primary_constraint, no gating_conditions) also pushed under 70, used
// only by the mutation-isolation test at the foot of the R6 describe block — see the comment
// there for why a 'constraint'-archetype fixture alone cannot prove the sub-70 loop is live.
const lowCapacityFacts: FactsPack = buildFacts({
  ...baseArgs,
  diagnosis: makeDiagnosis({ capacity: 65 }),
});

const ctx = { facts: constraintFacts, methodology, labels: ['Priscilla Vandermeer'] };

const goodS2 = {
  summary: `Overall health sits at ${constraintFacts.overall.capacity} out of 100, in the ${constraintFacts.overall.tier.name} band. ${constraintFacts.primary_constraint!.name} is holding the rest back.`,
  what_this_is_not: 'This is not a verdict on anyone.',
  context_bullets: [],
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

describe('gate 3 — sub-70 register calibration (controller ruling R6)', () => {
  // Natalie's ruling: the brief's own second banned-phrase loop was keyed to the wrong list
  // (banned_phrases.capacity — constraint-thesis phrasing) when it should key to
  // banned_phrases.constraint (the reassuring register: "healthy and ready to grow", "nothing
  // in your chain is broken", "this is a capacity conversation", "every stage is strong"). As
  // briefed, a genuinely low-scoring constraint report using its own required "X is the
  // constraint" language would have been falsely rejected below the 70 tier boundary.
  const lowCapGoodS2 = {
    summary: `Overall health sits at ${lowCapacityConstraintFacts.overall.capacity} out of 100, in the ${lowCapacityConstraintFacts.overall.tier.name} band. ${lowCapacityConstraintFacts.primary_constraint!.name} is the constraint holding the rest back.`,
    what_this_is_not: 'This is not a verdict on anyone.',
    context_bullets: [],
  };
  const lowCapCtx = { ...ctx, facts: lowCapacityConstraintFacts };

  it('accepts "is the constraint" language in a constraint report scoring below 70 — the regression this ruling fixes', () => {
    expect(lowCapacityConstraintFacts.overall.capacity).toBeLessThan(70);
    expect(gateSection('s2', lowCapGoodS2, lowCapCtx)).toBeNull();
  });

  it('still rejects consolation framing in a constraint report scoring below 70', () => {
    const withConsolation = { ...lowCapGoodS2, what_this_is_not: 'Nothing in your chain is broken, but this needs attention.' };
    expect(gateSection('s2', withConsolation, lowCapCtx)).toBe('banned phrase');
  });

  // Mutation-isolation note (kept in-suite, not just in the mutation table): for a
  // 'constraint'-archetype fixture, `banned_phrases[ctx.facts.archetype]` (gate 3's FIRST
  // loop) and `banned_phrases.constraint` (this sub-70 loop, post-ruling) are the identical
  // array — so the reject case immediately above would return 'banned phrase' via the first
  // loop even with the sub-70 loop deleted outright. That test alone cannot prove the sub-70
  // loop is live. This one can: a 'capacity'-archetype report (no primary_constraint, no
  // gating_conditions) scoring below 70, whose first loop checks banned_phrases.capacity — a
  // DIFFERENT list that does not contain "nothing in your chain is broken" — so only the
  // sub-70 loop can catch it here.
  it('bans capacity-thesis consolation language in a NON-constraint report scoring below 70 too (proves the sub-70 loop is reachable, not just redundant)', () => {
    expect(lowCapacityFacts.archetype).toBe('capacity');
    expect(lowCapacityFacts.overall.capacity).toBeLessThan(70);
    const s2 = {
      summary: `Overall health sits at ${lowCapacityFacts.overall.capacity} out of 100, in the ${lowCapacityFacts.overall.tier.name} band. Nothing in your chain is broken.`,
      what_this_is_not: 'This is not a verdict on anyone.',
      context_bullets: [],
    };
    expect(gateSection('s2', s2, { ...ctx, facts: lowCapacityFacts })).toBe('banned phrase');
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
