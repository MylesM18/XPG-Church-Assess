import type { FactsPack, CategoryFact, BottomItemFact } from '@/lib/report/facts';
import type { Theme } from '@/lib/methodology/schema';

/**
 * Hand-built FactsPack fixtures — no DB, no migration, no new deps.
 *
 * The one real dataset available (2026-08-14) is degenerate: 1 respondent, all eight areas in a
 * 53-72 band, no broken stage, no themes (k=3 kills every theme at n=1). It cannot exercise
 * blind spots, dispersion, themes, or any archetype but capacity, so nothing in the charts /
 * six-beats / band work may be validated against it alone (spec §6).
 *
 * Every fixture keeps buildFacts's own invariants so a test that passes here would pass against
 * a real pack: categories sorted score desc with ties by id asc, all eight areas present,
 * pattern_counts tallied from bottom_items, bottom_items at most 6 sorted mean asc.
 */

const STAGE_IDS = ['guest', 'conn', 'disc', 'vol', 'gen'] as const;
const ENABLER_IDS = ['gov', 'comm', 'sys'] as const;

const NAMES: Record<string, string> = {
  guest: 'Guest Experience', conn: 'Connection', disc: 'Discipleship',
  vol: 'Volunteer', gen: 'Generosity', gov: 'Governance',
  comm: 'Communication', sys: 'Systems',
};

function cat(id: string, score: number, state: string, respondentCount = 9): CategoryFact {
  return {
    id,
    name: NAMES[id] ?? id,
    kind: (STAGE_IDS as readonly string[]).includes(id) ? 'stage' : 'enabler',
    score,
    state,
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

/** Scores keyed by area id -> a sorted CategoryFact[] with per-area states derived from
 *  rules.yaml (break/gate = 45): below it a stage is 'broken' and an enabler is 'gate'. */
function categoriesFrom(scores: Record<string, number>, over: Record<string, string> = {}): CategoryFact[] {
  const all = [...STAGE_IDS, ...ENABLER_IDS].map((id) => {
    const score = scores[id]!;
    const isStage = (STAGE_IDS as readonly string[]).includes(id);
    const derived = score < 45 ? (isStage ? 'broken' : 'gate') : 'ok';
    return cat(id, score, over[id] ?? derived);
  });
  return sortCategories(all);
}

// EdgeKind is exactly 'sequence' | 'gate' (methodology/rules.yaml `dependencies[].kind`,
// lib/engine/dependencies.ts EdgeKind). FactsPack['dependencies'][].kind widens this to a
// generic string for JSON-serializability, but a genuinely valid fixture never invents a
// third value — the renderer's `kind === 'gate' ? 'gates' : 'feeds'` (lib/report/view.ts:173)
// would still read 'feeds' for any non-'gate' string, which is exactly why an invalid value
// here would type-check yet silently diverge from what buildFacts could ever produce.
const BASE_DEPENDENCIES: FactsPack['dependencies'] = [
  {
    from: 'sys', to: 'vol', kind: 'gate',
    from_name: 'Systems', to_name: 'Volunteer',
    from_score: 70, to_score: 72,
    read_sentence: 'Both are strong — nothing to flag here.',
  },
  {
    from: 'conn', to: 'disc', kind: 'sequence',
    from_name: 'Connection', to_name: 'Discipleship',
    from_score: 66, to_score: 60,
    read_sentence: 'Both are strong — nothing to flag here.',
  },
];

export function makeFacts(over: Partial<FactsPack> = {}): FactsPack {
  const categories = over.categories ?? categoriesFrom({
    guest: 72, conn: 68, disc: 60, vol: 58, gen: 56, gov: 53, comm: 51, sys: 49,
  });
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
    overall: { capacity: 58, throughput: 49, gap: 9, tier: { id: 'strained', name: 'Strained' } },
    archetype: 'capacity',
    categories,
    bottom_items: bottomItems,
    pattern_counts: tally(bottomItems),
    themes: [],
    profile: { context: 'suburban', attendance_band: '250-499', growth_trajectory: 'growing_steadily' },
    blind_spots: [],
    dispersion: [],
    dependencies: BASE_DEPENDENCIES,
    gating: [],
    generosity_mode: null,
    primary_constraint: null,
    confidence: 0.85,
  };
  const merged = { ...base, ...over };
  // pattern_counts must always agree with bottom_items, even when a caller overrode only one.
  if (over.bottom_items && !over.pattern_counts) merged.pattern_counts = tally(over.bottom_items);
  return merged;
}

/** 1. capacity — nothing broken, no gating. The sample's archetype, but at n>=8. */
export const CAPACITY_FACTS: FactsPack = makeFacts();

/** 2. constraint — one broken stage, primary constraint set, do-not-work-on edges present. */
export const CONSTRAINT_FACTS: FactsPack = makeFacts({
  archetype: 'constraint',
  categories: categoriesFrom({ guest: 78, conn: 38, disc: 55, vol: 62, gen: 58, gov: 66, comm: 60, sys: 64 }),
  overall: { capacity: 60, throughput: 38, gap: 22, tier: { id: 'strained', name: 'Strained' } },
  primary_constraint: { category_id: 'conn', name: 'Connection' },
  dependencies: [
    {
      from: 'conn', to: 'disc', kind: 'sequence',
      from_name: 'Connection', to_name: 'Discipleship',
      from_score: 38, to_score: 55,
      read_sentence: 'Connection is weak here too — this dependency is active and part of what’s costing you.',
    },
    {
      from: 'conn', to: 'vol', kind: 'sequence',
      from_name: 'Connection', to_name: 'Volunteer',
      from_score: 38, to_score: 62,
      read_sentence: 'Volunteer is strong for now, but Connection is weak — it’s running on borrowed time.',
    },
  ],
});

/** 3a. foundation — no broken stage, TWO gated enablers (ruling 8: 2 gated => 6 s10 entries). */
export const FOUNDATION_2_FACTS: FactsPack = makeFacts({
  archetype: 'foundation',
  categories: categoriesFrom({ guest: 72, conn: 68, disc: 66, vol: 64, gen: 62, gov: 40, comm: 38, sys: 70 }),
  overall: { capacity: 60, throughput: 62, gap: -2, tier: { id: 'strained', name: 'Strained' } },
  gating: [
    { enabler_id: 'gov', name: 'Governance', score: 40, note: 'Decision rights are unclear.' },
    { enabler_id: 'comm', name: 'Communication', score: 38, note: 'People do not hear what is decided.' },
  ],
});

/** 3b. foundation — THREE gated enablers (ruling 8: 3 gated => 9 s10 entries, still 3 s11). */
export const FOUNDATION_3_FACTS: FactsPack = makeFacts({
  archetype: 'foundation',
  categories: categoriesFrom({ guest: 72, conn: 68, disc: 66, vol: 64, gen: 62, gov: 40, comm: 38, sys: 42 }),
  overall: { capacity: 57, throughput: 62, gap: -5, tier: { id: 'strained', name: 'Strained' } },
  gating: [
    { enabler_id: 'gov', name: 'Governance', score: 40, note: 'Decision rights are unclear.' },
    { enabler_id: 'comm', name: 'Communication', score: 38, note: 'People do not hear what is decided.' },
    { enabler_id: 'sys', name: 'Systems', score: 42, note: 'Nothing is written down.' },
  ],
});

/** 4. broken-stage-severe — primary constraint below thresholds.severe (25), so the
 *  severe band (not merely 'broken') is the one exercised. */
export const BROKEN_STAGE_SEVERE_FACTS: FactsPack = makeFacts({
  archetype: 'constraint',
  categories: categoriesFrom({ guest: 70, conn: 18, disc: 44, vol: 52, gen: 55, gov: 60, comm: 58, sys: 62 }),
  overall: { capacity: 52, throughput: 18, gap: 34, tier: { id: 'at_risk', name: 'At Risk' } },
  primary_constraint: { category_id: 'conn', name: 'Connection' },
  confidence: 0.62,
});

/** 5. high-dispersion — disagreement flags AND blind spots present, so the reframe beat and
 *  the evidence beat's blind-spot branch both fire. */
export const HIGH_DISPERSION_FACTS: FactsPack = makeFacts({
  categories: categoriesFrom({ guest: 74, conn: 66, disc: 62, vol: 58, gen: 54, gov: 50, comm: 47, sys: 45 }),
  blind_spots: [
    { category_id: 'guest', name: 'Guest Experience', belief: 82, evidence: 55, gap: 27 },
  ],
  dispersion: [
    { category_id: 'vol', name: 'Volunteer', spread: 34 },
    { category_id: 'comm', name: 'Communication', spread: 28 },
  ],
});

/** 6. themes-n3 — >=3 respondents behind each theme, so the s8 theme branch and the k>=3
 *  anonymity guard are both exercised on real data rather than an empty array. */
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
