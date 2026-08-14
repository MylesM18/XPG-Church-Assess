import type { FactsPack, CategoryFact, BottomItemFact } from '@/lib/report/facts';
import type { Theme } from '@/lib/methodology/schema';
import { loadMethodology } from '@/lib/methodology/load';
import { throughput, capacity, gap } from '@/lib/engine/throughput';
import { tierFor, archetypeFor } from '@/lib/report/tier';
import { readDependencies } from '@/lib/engine/dependencies';
import { analyzeConstraint } from '@/lib/engine/constraint';
import { interp } from '@/lib/report/view';

/**
 * Hand-built FactsPack fixtures — no DB, no migration, no new deps.
 *
 * The one real dataset available (2026-08-14) is degenerate: 1 respondent, all eight areas in a
 * 53-72 band, no broken stage, no themes (k=3 kills every theme at n=1). It cannot exercise
 * blind spots, dispersion, themes, or any archetype but capacity, so nothing in the charts /
 * six-beats / band work may be validated against it alone (spec §6).
 *
 * FIX ROUND 1 (Natalie's ruling): a fixture may only hand-type its RAW inputs — category
 * scores, respondent counts, profile, items, themes. Every field production computes rather
 * than stores (overall.{capacity,throughput,gap,tier}, primary_constraint, gating, dependencies,
 * category name/state/kind) is derived here by calling the SAME production functions buildFacts
 * (or its caller, lib/engine/assemble.ts) calls, over that fixture's own raw scores — never
 * typed in by hand. Round 1 caught: a typed-in throughput below the mathematical floor
 * (throughput can never fall below min(chain)); dependency edges whose from_score/to_score
 * contradicted the fixture's own categories; a dependency edge (conn->vol) structuralEdges
 * could never emit; a dependency read_sentence using the wrong template for its own scores; and
 * a profile.attendance_band value outside the real slug set. See task-3-report.md "Fix round 1"
 * for the full list, including two more the derivation caught for free (gating notes and
 * category/enabler display names that were hand-typed to different text than the methodology
 * actually carries).
 *
 * Every fixture still keeps buildFacts's own invariants so a test that passes here would pass
 * against a real pack: categories sorted score desc with ties by id asc, all eight areas
 * present, pattern_counts tallied from bottom_items, bottom_items at most 6 sorted mean asc.
 */

const methodology = loadMethodology();
const { rules, copy, questions } = methodology;

/** category id -> display name, sourced from questions.yaml exactly as buildFacts does
 *  (lib/report/facts.ts:127) — never a hand-typed duplicate that can drift from the real copy. */
const NAMES = new Map(questions.categories.map((c) => [c.id, c.name]));
const nameOf = (id: string): string => NAMES.get(id) ?? id;

const STAGE_ID_SET = new Set<string>(rules.chain);
const AREA_IDS = [...rules.chain, ...Object.keys(rules.enablers)];

function cat(id: string, score: number, state: string, respondentCount = 9): CategoryFact {
  return {
    id,
    name: nameOf(id),
    kind: STAGE_ID_SET.has(id) ? 'stage' : 'enabler',
    score,
    state,
    // Deferred (fix-round-1 finding, explicitly left unfixed this round): every category here
    // reads either 'ok' or 'broken'/'gate' at this fixed percentile, so CategoryState 'watch' is
    // never exercised by any fixture. Logged, not fixed.
    percentile: 40,
    respondent_count: respondentCount,
  };
}

/** Sorts exactly as buildFacts does (facts.ts:164). Never localeCompare. */
function sortCategories(cats: CategoryFact[]): CategoryFact[] {
  return [...cats].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function item(itemId: string, categoryId: string, mean: number, theme: Theme, text: string): BottomItemFact {
  return { item_id: itemId, category_id: categoryId, mean, text, theme };
}

function tally(items: BottomItemFact[]): Record<Theme, number> {
  const counts: Record<Theme, number> = { systems: 0, culture: 0, theology: 0, relational: 0 };
  for (const b of items) counts[b.theme] += 1;
  return counts;
}

/** categories, sorted exactly as buildFacts does. `state` is derived from rules.yaml's own
 *  break/gate thresholds (both 45 today), never a hand-typed magic number, so a future
 *  rules.yaml threshold change cannot silently desync the fixtures from production. */
function categoriesFrom(scores: Record<string, number>): CategoryFact[] {
  const all = AREA_IDS.map((id) => {
    const score = scores[id]!;
    const isStage = STAGE_ID_SET.has(id);
    const threshold = isStage ? rules.thresholds.break : rules.thresholds.gate;
    const state = score < threshold ? (isStage ? 'broken' : 'gate') : 'ok';
    return cat(id, score, state);
  });
  return sortCategories(all);
}

/** overall.{capacity,throughput,gap,tier} — the SAME lib/engine/throughput.ts functions and
 *  lib/report/tier.ts:tierFor that buildFacts's caller (lib/engine/assemble.ts) runs. Never a
 *  typed-in literal: fix-round-1 finding 1 was a throughput value below min(chain), which
 *  throughput() can mathematically never produce (it is minWeight*min + (1-minWeight)*mean, and
 *  mean >= min always). */
function overallFrom(scores: Record<string, number>): FactsPack['overall'] {
  const chainScores = rules.chain.map((id) => scores[id]!);
  const allScores = AREA_IDS.map((id) => scores[id]!);
  const capacityValue = capacity(allScores);
  const throughputValue = throughput(chainScores, rules.throughput.min_weight);
  return {
    capacity: capacityValue,
    throughput: throughputValue,
    gap: gap(capacityValue, throughputValue),
    tier: tierFor(capacityValue, rules),
  };
}

/** primary_constraint + gating, via the SAME lib/engine/constraint.ts:analyzeConstraint
 *  buildFacts's caller runs: first broken chain stage (score < thresholds.break) wins primary,
 *  enablers below thresholds.gate are gating, with the SAME GATING_NOTES text production emits
 *  (fix-round-1 catch: the brief's hand-typed gating notes and enabler/category display names
 *  were both values production would never emit for these ids — GATING_NOTES and questions.yaml
 *  are fixed lookups keyed only by id, not freely rewritable per fixture).
 *
 *  generosityMeans is {null, null} — no fixture models raw GEN item responses, so
 *  generosity_mode itself stays an explicit scenario input on FactsPack (see makeFacts), not a
 *  derived one; only primary_constraint/gating are read off this call's result. */
function constraintFrom(scores: Record<string, number>): {
  primary_constraint: FactsPack['primary_constraint'];
  gating: FactsPack['gating'];
} {
  const scoresMap = new Map(Object.entries(scores));
  const result = analyzeConstraint(scoresMap, { breadth: null, depth: null }, methodology, NAMES);
  const primary_constraint = result.primary_constraint
    ? { category_id: result.primary_constraint.category_id, name: nameOf(result.primary_constraint.category_id) }
    : null;
  const gatingList = result.gating_conditions.map((g) => ({
    enabler_id: g.enabler_id,
    name: nameOf(g.enabler_id),
    score: scores[g.enabler_id] ?? 0,
    note: g.note,
  }));
  return { primary_constraint, gating: gatingList };
}

/** archetypeFor (lib/report/tier.ts) reads `Diagnosis`'s field name `gating_conditions`;
 *  constraintFrom above returns FactsPack's field name `gating` for the same list. This
 *  adapts between the two so archetype, too, is always derived from the same
 *  primary_constraint/gating a fixture actually carries, never hand-typed. */
function archetypeFromDerived(derived: {
  primary_constraint: FactsPack['primary_constraint'];
  gating: FactsPack['gating'];
}): FactsPack['archetype'] {
  return archetypeFor({ primary_constraint: derived.primary_constraint, gating_conditions: derived.gating });
}

/** dependencies — the SAME lib/engine/dependencies.ts:readDependencies buildFacts's caller runs
 *  (structuralEdges(rules) for the 13-edge set + kind, readEdge for the state read), reduced to
 *  FactsPack's shape via facts.ts:224-238's own template + interp. Fix-round-1 findings: the
 *  brief hand-wrote 2 edges whose from_score/to_score contradicted the fixture's own categories
 *  (worst case: a broken primary constraint's edge reading "both are strong"), one hand-picked
 *  edge (conn->vol) that structuralEdges could never emit at all (conn/vol are not
 *  chain-adjacent and conn is not an enabler — deriving the edge set removes it automatically,
 *  never reintroduced), and a read_sentence built from the wrong EdgeRead template for its own
 *  scores. Deriving the full 13-edge set also matches production shape exactly: a real
 *  FactsPack.dependencies is always all 13 structural edges (lib/engine/assemble.ts:202 calls
 *  readDependencies unfiltered) — the brief's 2-3 hand-picked edges were never realistic in
 *  cardinality either, not just in values. */
function dependenciesFrom(scores: Record<string, number>): FactsPack['dependencies'] {
  const scoresMap = new Map(Object.entries(scores));
  const edges = readDependencies(rules, scoresMap, rules.thresholds.break);
  return edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    from_name: nameOf(e.from),
    to_name: nameOf(e.to),
    from_score: e.fromScore,
    to_score: e.toScore,
    read_sentence: interp(copy.dependency_reads[e.read], {
      fromName: nameOf(e.from),
      toName: nameOf(e.to),
    }),
  }));
}

const DEFAULT_SCORES: Record<string, number> = {
  guest: 72, conn: 68, disc: 60, vol: 58, gen: 56, gov: 53, comm: 51, sys: 49,
};
const DEFAULT_CONSTRAINT = constraintFrom(DEFAULT_SCORES);

export function makeFacts(over: Partial<FactsPack> = {}): FactsPack {
  const categories = over.categories ?? categoriesFrom(DEFAULT_SCORES);
  const bottomItems = over.bottom_items ?? [
    item('S2', 'sys', 42, 'systems', 'We have a written process for onboarding a new volunteer.'),
    item('C4', 'comm', 45, 'culture', 'People know where to find out what is happening.'),
    item('G1', 'gov', 48, 'systems', 'Decision rights are written down.'),
    item('V3', 'vol', 51, 'relational', 'Volunteers are thanked by name by someone who knows them.'),
    item('N2', 'gen', 54, 'theology', 'We teach why we give, not only that we should.'),
    item('D3', 'disc', 55, 'relational', 'Every new believer is paired with someone further along.'),
  ];
  const base: FactsPack = {
    cover: { church_name: 'Test Church', completed_at: '2026-08-14', respondent_count: 9 },
    overall: overallFrom(DEFAULT_SCORES),
    archetype: archetypeFromDerived(DEFAULT_CONSTRAINT),
    categories,
    bottom_items: bottomItems,
    pattern_counts: tally(bottomItems),
    themes: [],
    profile: { context: 'suburban', attendance_band: '250_499', growth_trajectory: 'growing_steadily' },
    blind_spots: [],
    dispersion: [],
    dependencies: dependenciesFrom(DEFAULT_SCORES),
    gating: DEFAULT_CONSTRAINT.gating,
    generosity_mode: null,
    primary_constraint: DEFAULT_CONSTRAINT.primary_constraint,
    confidence: 0.85,
  };
  const merged = { ...base, ...over };
  // pattern_counts must always agree with bottom_items, even when a caller overrode only one.
  if (over.bottom_items && !over.pattern_counts) merged.pattern_counts = tally(over.bottom_items);
  return merged;
}

/** 1. capacity — nothing broken, no gating. The sample's archetype, but at n>=8. Every derived
 *  field here (overall, dependencies, gating, primary_constraint, archetype) comes from
 *  DEFAULT_SCORES via makeFacts()'s own base — no override needed. */
export const CAPACITY_FACTS: FactsPack = makeFacts();

/** 2. constraint — one broken stage, primary constraint set, do-not-work-on edges present. */
const CONSTRAINT_SCORES: Record<string, number> = {
  guest: 78, conn: 38, disc: 55, vol: 62, gen: 58, gov: 66, comm: 60, sys: 64,
};
const CONSTRAINT_DERIVED = constraintFrom(CONSTRAINT_SCORES);
export const CONSTRAINT_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(CONSTRAINT_DERIVED),
  categories: categoriesFrom(CONSTRAINT_SCORES),
  overall: overallFrom(CONSTRAINT_SCORES),
  primary_constraint: CONSTRAINT_DERIVED.primary_constraint,
  gating: CONSTRAINT_DERIVED.gating,
  dependencies: dependenciesFrom(CONSTRAINT_SCORES),
});

/** 3a. foundation — no broken stage, TWO gated enablers (ruling 8: 2 gated => 6 s10 entries). */
const FOUNDATION_2_SCORES: Record<string, number> = {
  guest: 72, conn: 68, disc: 66, vol: 64, gen: 62, gov: 40, comm: 38, sys: 70,
};
const FOUNDATION_2_DERIVED = constraintFrom(FOUNDATION_2_SCORES);
export const FOUNDATION_2_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(FOUNDATION_2_DERIVED),
  categories: categoriesFrom(FOUNDATION_2_SCORES),
  overall: overallFrom(FOUNDATION_2_SCORES),
  primary_constraint: FOUNDATION_2_DERIVED.primary_constraint,
  gating: FOUNDATION_2_DERIVED.gating,
  dependencies: dependenciesFrom(FOUNDATION_2_SCORES),
});

/** 3b. foundation — THREE gated enablers (ruling 8: 3 gated => 9 s10 entries, still 3 s11). */
const FOUNDATION_3_SCORES: Record<string, number> = {
  guest: 72, conn: 68, disc: 66, vol: 64, gen: 62, gov: 40, comm: 38, sys: 42,
};
const FOUNDATION_3_DERIVED = constraintFrom(FOUNDATION_3_SCORES);
export const FOUNDATION_3_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(FOUNDATION_3_DERIVED),
  categories: categoriesFrom(FOUNDATION_3_SCORES),
  overall: overallFrom(FOUNDATION_3_SCORES),
  primary_constraint: FOUNDATION_3_DERIVED.primary_constraint,
  gating: FOUNDATION_3_DERIVED.gating,
  dependencies: dependenciesFrom(FOUNDATION_3_SCORES),
});

/** 4. broken-stage-severe — primary constraint below thresholds.severe (25), so the severe band
 *  (not merely 'broken') is the one exercised. */
const BROKEN_STAGE_SEVERE_SCORES: Record<string, number> = {
  guest: 70, conn: 18, disc: 44, vol: 52, gen: 55, gov: 60, comm: 58, sys: 62,
};
const BROKEN_STAGE_SEVERE_DERIVED = constraintFrom(BROKEN_STAGE_SEVERE_SCORES);
export const BROKEN_STAGE_SEVERE_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(BROKEN_STAGE_SEVERE_DERIVED),
  categories: categoriesFrom(BROKEN_STAGE_SEVERE_SCORES),
  overall: overallFrom(BROKEN_STAGE_SEVERE_SCORES),
  primary_constraint: BROKEN_STAGE_SEVERE_DERIVED.primary_constraint,
  gating: BROKEN_STAGE_SEVERE_DERIVED.gating,
  dependencies: dependenciesFrom(BROKEN_STAGE_SEVERE_SCORES),
  confidence: 0.62,
});

/** 5. high-dispersion — disagreement flags AND blind spots present, so the reframe beat and the
 *  evidence beat's blind-spot branch both fire. blind_spots/dispersion are scenario inputs with
 *  no producing function available to fixtures (they read off Diagnosis.blind_spots /
 *  disagreement_flags, which need per-respondent belief/evidence answers this fixture format
 *  does not model) — kept as explicit, hand-typed scenario data, same as the brief. */
const HIGH_DISPERSION_SCORES: Record<string, number> = {
  guest: 74, conn: 66, disc: 62, vol: 58, gen: 54, gov: 50, comm: 47, sys: 45,
};
const HIGH_DISPERSION_DERIVED = constraintFrom(HIGH_DISPERSION_SCORES);
export const HIGH_DISPERSION_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(HIGH_DISPERSION_DERIVED),
  categories: categoriesFrom(HIGH_DISPERSION_SCORES),
  overall: overallFrom(HIGH_DISPERSION_SCORES),
  primary_constraint: HIGH_DISPERSION_DERIVED.primary_constraint,
  gating: HIGH_DISPERSION_DERIVED.gating,
  dependencies: dependenciesFrom(HIGH_DISPERSION_SCORES),
  blind_spots: [
    { category_id: 'guest', name: 'Guest Experience', belief: 82, evidence: 55, gap: 27 },
  ],
  dispersion: [
    { category_id: 'vol', name: 'Volunteer', spread: 34 },
    { category_id: 'comm', name: 'Communication', spread: 28 },
  ],
});

/** 6. themes-n3 — >=3 respondents behind each theme, so the s8 theme branch and the k>=3
 *  anonymity guard are both exercised on real data rather than an empty array. Uses
 *  DEFAULT_SCORES (no category override), so overall/dependencies/gating/primary_constraint/
 *  archetype all come from makeFacts()'s own base — only cover and themes are scenario inputs
 *  here. */
export const THEMES_N3_FACTS: FactsPack = makeFacts({
  cover: { church_name: 'Test Church', completed_at: '2026-08-14', respondent_count: 11 },
  themes: [
    {
      label: 'Nobody owns follow-up',
      gloss: 'Leaders describe guest follow-up as everyone’s job and therefore no one’s.',
      support_count: 4,
      item_ids: ['S2', 'G1'],
      verbatims: [],
    },
    {
      label: 'Decisions do not travel',
      gloss: 'Decisions are made but not communicated past the room they were made in.',
      support_count: 3,
      item_ids: ['C4'],
      verbatims: [],
    },
  ],
});

export const ALL_FIXTURES: ReadonlyArray<{ name: string; facts: FactsPack }> = [
  { name: 'capacity', facts: CAPACITY_FACTS },
  { name: 'constraint', facts: CONSTRAINT_FACTS },
  { name: 'foundation-2', facts: FOUNDATION_2_FACTS },
  { name: 'foundation-3', facts: FOUNDATION_3_FACTS },
  { name: 'broken-stage-severe', facts: BROKEN_STAGE_SEVERE_FACTS },
  { name: 'high-dispersion', facts: HIGH_DISPERSION_FACTS },
  { name: 'themes-n3', facts: THEMES_N3_FACTS },
];
