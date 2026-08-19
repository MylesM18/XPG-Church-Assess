import type { FactsPack, CategoryFact, BottomItemFact } from '@/lib/report/facts';
import { buildImprovementFacts } from '@/lib/report/facts';
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

function cat(
  id: string,
  score: number,
  state: string,
  respondentCount = 9,
  percentile: number | null = 40,
): CategoryFact {
  return {
    id,
    name: nameOf(id),
    kind: STAGE_ID_SET.has(id) ? 'stage' : 'enabler',
    score,
    state,
    // fix-round-1 finding, now closed: categoriesFrom (below) used to derive `state` from score
    // alone, so CategoryState 'watch' was never exercised by any fixture. categoriesFrom now
    // mirrors lib/engine/assemble.ts's categoryState exactly, including the percentile rule, so
    // 'watch' is reachable through the normal call path (see CATEGORY_WATCH_FACTS below).
    // `percentile` still defaults to 40 here — every pre-existing fixture keeps that default,
    // and 40 < 25 is false, so this default's own behaviour is unchanged; only
    // categoriesFrom's percentileOverrides (below) ever passes something under 25.
    percentile,
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

/** categories, sorted exactly as buildFacts does. `state` mirrors lib/engine/assemble.ts's
 *  categoryState EXACTLY, thresholds included: score reads rules.yaml's own break/gate
 *  thresholds (both 45 today), never a hand-typed magic number, so a future rules.yaml
 *  threshold change cannot silently desync the fixtures from production. The percentile check's
 *  `25` is a bare literal in production too (assemble.ts:37,41 — not a rules.yaml config key),
 *  so it is mirrored here as the same bare literal rather than inventing a config field that
 *  does not exist. Precedence matters and is mirrored too: the score check runs FIRST, so a
 *  broken/gating score wins over a low percentile even when both conditions hold — only a score
 *  that already clears its threshold can still read 'watch' off percentile.
 *
 *  `percentileOverrides` is additive scenario data (not production-derived — same status as
 *  blind_spots/dispersion below): a fixture that wants a category's cohort modeled as too thin
 *  to report a percentile passes `{ [id]: null }` here, and one that wants a category to read
 *  bottom-quartile passes `{ [id]: <number < 25> }`; every id not present keeps cat()'s own 40
 *  default. Every fixture that predates the percentile rule below passes no override at all
 *  (or only a null override, which the rule also leaves at 'ok'/'broken'/'gate' unchanged — see
 *  CATEGORY_WATCH_FACTS's comment for why), so this stays byte-for-byte unchanged for all of
 *  them. */
function categoriesFrom(
  scores: Record<string, number>,
  percentileOverrides: Record<string, number | null> = {},
): CategoryFact[] {
  const all = AREA_IDS.map((id) => {
    const score = scores[id]!;
    const isStage = STAGE_ID_SET.has(id);
    const threshold = isStage ? rules.thresholds.break : rules.thresholds.gate;
    const percentile = id in percentileOverrides ? percentileOverrides[id]! : 40;
    let state: string;
    if (score < threshold) {
      state = isStage ? 'broken' : 'gate';
    } else if (percentile !== null && percentile < 25) {
      state = 'watch';
    } else {
      state = 'ok';
    }
    return cat(id, score, state, undefined, percentile);
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

/**
 * `allItems` is the pack's FULL per-item mean map — what `buildFacts` actually hands
 * `buildImprovementFacts` in production. Omitted, it defaults to `bottom_items`, which is what
 * every pre-existing fixture does and why none of them could ever surface more than a couple of
 * weak questions per area: `bottom_items` is capped at six REPORT-WIDE. A fixture that wants
 * production's real volume (a 50s-60s church puts nearly every one of the instrument's 50
 * questions below the 80 standard) passes the whole map here — see FULL_ITEM_MAP_FACTS.
 */
export function makeFacts(
  over: Partial<FactsPack> = {},
  allItems?: readonly BottomItemFact[],
): FactsPack {
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
    // Derived, never hand-typed — the SAME lib/report/facts.ts helper buildFacts calls, over
    // this fixture's own categories and items. A fixture that passes no `allItems` has its item
    // universe defined by its six `bottom_items`, so its weak_items are drawn from those; see
    // FULL_ITEM_MAP_FACTS for the one that carries the whole map, as production does.
    improvement: buildImprovementFacts(categories, allItems ?? bottomItems),
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

/** 7. watch — healthy_stretched tier (hero band 'watch'), no broken stage, no gating enablers: a
 *  genuinely healthy church, just not the top tier. Every score is well clear of both the break
 *  and gate thresholds (45) and sits inside [70, 85) with room on both sides (capacity lands at
 *  77 — see the derivation below), so this is the first fixture whose capacity clears 70 at all.
 *  That reaches: verdictBandFor's 'watch' arm (charts.ts:70-75, never hit by any other fixture,
 *  which top out around capacity 60); the one band where BAND_TEXT and BAND_FILL actually
 *  differ (BAND_TEXT.watch '#906722' vs BAND_FILL.watch '#C08A2E' — every other band's two
 *  tables are byte-identical); and, via WATCH_PERCENTILES, `sys`'s percentile is modeled as null
 *  (cohort too thin) while every other category keeps cat()'s own 40 — the first fixture to
 *  produce a null percentile at all, exercising the `cell.percentile === null` branch
 *  app/app/[churchId]/diagnosis/report/charts.tsx's WebStatGrid has never had render coverage
 *  for. */
const WATCH_SCORES: Record<string, number> = {
  guest: 80, conn: 79, disc: 78, vol: 77, gen: 76, gov: 75, comm: 74, sys: 73,
};
const WATCH_PERCENTILES: Record<string, number | null> = { sys: null };
const WATCH_DERIVED = constraintFrom(WATCH_SCORES);
export const WATCH_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(WATCH_DERIVED),
  categories: categoriesFrom(WATCH_SCORES, WATCH_PERCENTILES),
  overall: overallFrom(WATCH_SCORES),
  primary_constraint: WATCH_DERIVED.primary_constraint,
  gating: WATCH_DERIVED.gating,
  dependencies: dependenciesFrom(WATCH_SCORES),
});

/** 8. holding — healthy_ready tier (hero band 'holding'), no broken stage, no gating enablers:
 *  the top tier, comfortably clear of the 85 floor (capacity lands at 91). Reaches the 'holding'
 *  verdict path no other fixture reaches (every other fixture, WATCH_FACTS included, tops out
 *  below 85). */
const HOLDING_SCORES: Record<string, number> = {
  guest: 94, conn: 93, disc: 92, vol: 91, gen: 90, gov: 89, comm: 88, sys: 87,
};
const HOLDING_DERIVED = constraintFrom(HOLDING_SCORES);
export const HOLDING_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(HOLDING_DERIVED),
  categories: categoriesFrom(HOLDING_SCORES),
  overall: overallFrom(HOLDING_SCORES),
  primary_constraint: HOLDING_DERIVED.primary_constraint,
  gating: HOLDING_DERIVED.gating,
  dependencies: dependenciesFrom(HOLDING_SCORES),
});

/** 9. category-watch — a category whose SCORE is comfortably strong but whose cohort PERCENTILE
 *  is bottom-quartile: the one case that discriminates categoryState's percentile rule from a
 *  score-only derivation. `guest` scores 90 (well clear of both thresholds.break=45 and
 *  thresholds.strong=70) but is modeled at the 12th percentile (< 25), so categoryState reads it
 *  as 'watch' rather than 'ok'. That distinction is only visible downstream because
 *  readingBand('watch', 90, thresholds) => 'watch' while readingBand('ok', 90, thresholds) =>
 *  'holding' (score >= thresholds.strong) — a LOW-scoring category would read 'watch' under
 *  either derivation and prove nothing here (see tests/report/category-state-watch.test.ts).
 *
 *  Every other category keeps cat()'s own default 40th percentile (40 < 25 is false), so this
 *  fixture's only percentile override is `guest`. The remaining scores are unremarkable and
 *  intentionally boring — no broken stage, no gated enabler — so archetype lands on 'capacity'
 *  (already covered by CAPACITY_FACTS) and nothing about tier/hero-band/archetype coverage is
 *  the point of this fixture; only the one category's engine-computed state is. Named distinctly
 *  from WATCH_FACTS on purpose: WATCH_FACTS exercises the overall hero band reading 'watch' via
 *  verdictBandFor(tier.id), a tier-level concept entirely independent of any category's own
 *  CategoryState — conflating the two names here would be misleading even though nothing
 *  mechanically stops both existing at once. */
const CATEGORY_WATCH_SCORES: Record<string, number> = {
  guest: 90, conn: 68, disc: 60, vol: 58, gen: 56, gov: 53, comm: 51, sys: 49,
};
const CATEGORY_WATCH_PERCENTILES: Record<string, number | null> = { guest: 12 };
const CATEGORY_WATCH_DERIVED = constraintFrom(CATEGORY_WATCH_SCORES);
export const CATEGORY_WATCH_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(CATEGORY_WATCH_DERIVED),
  categories: categoriesFrom(CATEGORY_WATCH_SCORES, CATEGORY_WATCH_PERCENTILES),
  overall: overallFrom(CATEGORY_WATCH_SCORES),
  primary_constraint: CATEGORY_WATCH_DERIVED.primary_constraint,
  gating: CATEGORY_WATCH_DERIVED.gating,
  dependencies: dependenciesFrom(CATEGORY_WATCH_SCORES),
});

/**
 * 11. full-item-map — the missing rung between facts.test.ts (which tests `buildImprovementFacts`
 * over a full map directly) and every RENDERING test (which sees at most a couple of weak
 * questions per area because their pack's item universe IS its six `bottom_items`).
 *
 * This is the church the recalibration exists for: DEFAULT_SCORES (49-72) answering all 50
 * questions of the real instrument, so nearly every question lands below the 80 standard and
 * `improvement.areas_needing_work` carries production's real volume. Item means are spread
 * +/-14 around the area's own score so that some questions in the strongest area DO clear 80 —
 * without that, "only sub-standard questions appear" would be vacuously true.
 *
 * `bottom_items` is derived from the same map exactly as buildFacts derives it (mean ascending,
 * ties by item id, first six), never hand-typed.
 */
const FULL_ITEM_SPREAD = [-14, -7, 0, 7, 14];
const FULL_ITEM_MAP: BottomItemFact[] = questions.categories.flatMap((c) =>
  c.items.map((it, i) =>
    item(
      it.id,
      c.id,
      Math.min(95, Math.max(15, DEFAULT_SCORES[c.id]! + FULL_ITEM_SPREAD[i % FULL_ITEM_SPREAD.length]!)),
      it.theme,
      it.text,
    ),
  ),
);
const FULL_ITEM_BOTTOM = [...FULL_ITEM_MAP]
  .sort((a, b) => a.mean - b.mean || (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0))
  .slice(0, 6);
export const FULL_ITEM_MAP_FACTS: FactsPack = makeFacts({ bottom_items: FULL_ITEM_BOTTOM }, FULL_ITEM_MAP);

/**
 * 12. mostly-strong — five of eight areas at or above the 80 standard.
 *
 * The shape `strongestAreas` behaves differently on: its top-3 FLOOR stops mattering and it
 * returns all five. Every other fixture sits below 80 everywhere, so `strongest_areas.length`
 * is 3 in all of them and any test comparing it against s5's hardcoded `categories.slice(0, 3)`
 * passes without proving anything (tests/report/charts.test.ts's "agrees with the section that
 * names the strengths in prose" was exactly that).
 */
const MOSTLY_STRONG_SCORES: Record<string, number> = {
  guest: 91, conn: 88, disc: 85, vol: 83, gen: 80, gov: 62, comm: 58, sys: 54,
};
const MOSTLY_STRONG_DERIVED = constraintFrom(MOSTLY_STRONG_SCORES);
export const MOSTLY_STRONG_FACTS: FactsPack = makeFacts({
  archetype: archetypeFromDerived(MOSTLY_STRONG_DERIVED),
  categories: categoriesFrom(MOSTLY_STRONG_SCORES),
  overall: overallFrom(MOSTLY_STRONG_SCORES),
  primary_constraint: MOSTLY_STRONG_DERIVED.primary_constraint,
  gating: MOSTLY_STRONG_DERIVED.gating,
  dependencies: dependenciesFrom(MOSTLY_STRONG_SCORES),
});

export const ALL_FIXTURES: ReadonlyArray<{ name: string; facts: FactsPack }> = [
  { name: 'capacity', facts: CAPACITY_FACTS },
  { name: 'constraint', facts: CONSTRAINT_FACTS },
  { name: 'foundation-2', facts: FOUNDATION_2_FACTS },
  { name: 'foundation-3', facts: FOUNDATION_3_FACTS },
  { name: 'broken-stage-severe', facts: BROKEN_STAGE_SEVERE_FACTS },
  { name: 'high-dispersion', facts: HIGH_DISPERSION_FACTS },
  { name: 'themes-n3', facts: THEMES_N3_FACTS },
  { name: 'watch', facts: WATCH_FACTS },
  { name: 'holding', facts: HOLDING_FACTS },
  { name: 'category-watch', facts: CATEGORY_WATCH_FACTS },
  { name: 'full-item-map', facts: FULL_ITEM_MAP_FACTS },
  { name: 'mostly-strong', facts: MOSTLY_STRONG_FACTS },
];
