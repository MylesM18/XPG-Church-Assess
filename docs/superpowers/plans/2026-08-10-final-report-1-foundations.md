# Final Report Redesign — Plan 1 of 5: Foundations (no AI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every deterministic foundation the 12-section executive report needs — theme tags on all 50 assessment items, tier bands, the tier/archetype selector, the facts pack, the 4 new `churches` profile columns, and the admin-gated settings form — with zero AI involvement.

**Architecture:** Annotation + pure functions layered on the existing engine: `questions.yaml` items gain a required `theme` enum (no version bump, per spec P2); `rules.yaml` gains a `tiers:` block (P1/P7); `lib/report/tier.ts` derives tier + archetype purely from `Diagnosis`; `lib/report/facts.ts` builds the JSON-serializable facts pack every later GPT/fallback section will consume; the church profile grows 4 nullable columns and an owner settings form that writes through a new `lib/data/churches.ts` seam under the existing `churches_update` RLS policy (no new RPC).

**Tech Stack:** Next.js (App Router, server actions + `useActionState`), Zod (pinned 3.25.76), js-yaml, Supabase (RLS, SQL migrations), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-final-report-redesign-design.md` (APPROVED — decomposition item 1).

## Global Constraints

- ⛔ Never push, merge, or force-push — Natalie does that. Never run `npm run test:db`, `supabase db push`, or `supabase db reset`.
- Git: commit by explicit path only; never stage `.claude/` or `docs/superpowers/plans/2026-07-25-*` / `2026-08-01-*`; use `GIT_LITERAL_PATHSPECS=1` and quoted paths for anything under `app/app/[churchId]/`.
- No new dependencies. `eslint.config.mjs` ignores `lib/ai/**` (irrelevant this plan — no `lib/ai/**` files are touched).
- **No version bumps** (spec P2): `methodology/questions.yaml` stays `version: "0.3.0"`, `methodology/rules.yaml` stays `version: "0.2.0"`. Theme tags are annotation — `response_hash` and run staleness are untouched.
- `create_church_with_admin` signature is **untouched** — new columns are post-creation settings only.
- Schema house discipline (`lib/methodology/schema.ts` lines 107–129): **named keys, never `z.record`** — a missing tier band must fail at load time.
- Zod strips unknown keys: the `theme` field lands in `ItemSchema` and `questions.yaml` **in the same commit** (Task 1), the `tiers` block in `RulesSchema` and `rules.yaml` in the same commit (Task 2).
- Anonymity discipline: nothing in this plan may put a respondent label into the facts pack (facts carry ids, scores, item text, and church-profile fields only).
- Test commands: `npx vitest run <file>` per task; full gates at the end are `npx tsc --noEmit` + `npx vitest run`.
- All paths below are relative to the repo root `~/Desktop/XPG-Church-Assess`.

---

### Task 1: Theme vocabulary — `ThemeSchema`, required `theme` on `ItemSchema`, all 50 tags in `questions.yaml`

**Files:**
- Modify: `lib/methodology/schema.ts` (ItemSchema is at lines 12–19)
- Modify: `methodology/questions.yaml` (all 50 items)
- Test: `tests/methodology/themes.test.ts` (new file — sibling of the existing per-topic files `schema/questions/rules/load/effective.test.ts`)

**Interfaces:**
- Consumes: existing `ItemSchema`, `loadMethodology()` from `lib/methodology/load.ts`.
- Produces: `export const ThemeSchema = z.enum(['systems','culture','theology','relational'])`, `export type Theme = z.infer<typeof ThemeSchema>`, and `theme: Theme` as a required field on every parsed item. Task 4 (`facts.ts`) imports `Theme` and reads `item.theme`.

- [ ] **Step 1: Write the failing test**

Create `tests/methodology/themes.test.ts`. The `EXPECTED` map below is the canonical 50-item tag table (session-5 draft, approved for implementation with Natalie spot-checking at review). Embedding it in the test makes the tags reviewable in one place and makes any yaml drift fail loudly. Rubric (spec): *systems* = process/structure/tooling/coordination · *culture* = trust/unity/atmosphere · *theology* = doctrine/gospel-clarity · *relational* = personal connection/care.

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { ItemSchema, ThemeSchema } from '../../lib/methodology/schema';

const m = loadMethodology();
const items = m.questions.categories.flatMap((c) => c.items);

// Canonical item → theme table (spec P2; Natalie spot-checks these tags at review).
const EXPECTED: Record<string, 'systems' | 'culture' | 'theology' | 'relational'> = {
  G1: 'systems', G2: 'systems', G3: 'systems', G4: 'systems', G5: 'systems', G6: 'systems', G7: 'culture',
  C1: 'relational', C2: 'relational', C3: 'relational', C4: 'systems', C5: 'culture', C6: 'culture',
  D1: 'systems', D2: 'culture', D3: 'systems', D4: 'theology', D5: 'systems', D6: 'theology',
  V1: 'culture', V2: 'systems', V3: 'systems', V4: 'systems', V5: 'culture', V6: 'culture',
  GEN1: 'culture', GEN2: 'theology', GEN3: 'culture', GEN4: 'systems', GEN5: 'systems', GEN6: 'systems',
  GOV1: 'systems', GOV2: 'systems', GOV3: 'culture', GOV4: 'systems', GOV5: 'systems', GOV6: 'systems',
  COM1: 'systems', COM2: 'systems', COM3: 'systems', COM4: 'systems', COM5: 'relational', COM6: 'relational', COM7: 'relational',
  SYS1: 'systems', SYS2: 'systems', SYS3: 'systems', SYS4: 'systems', SYS5: 'systems', SYS6: 'systems',
};

describe('item theme tags (spec P2)', () => {
  it('covers exactly the 50 items', () => {
    expect(items.length).toBe(50);
    expect(Object.keys(EXPECTED).sort()).toEqual(items.map((i) => i.id).sort());
  });
  it('every item carries its canonical theme', () => {
    for (const item of items) {
      expect(item.theme, `item ${item.id}`).toBe(EXPECTED[item.id]);
    }
  });
  it('tally matches the draft table: systems 31 · culture 10 · relational 6 · theology 3', () => {
    const tally: Record<string, number> = { systems: 0, culture: 0, theology: 0, relational: 0 };
    for (const item of items) tally[item.theme] += 1;
    expect(tally).toEqual({ systems: 31, culture: 10, relational: 6, theology: 3 });
  });
  it('ThemeSchema is the closed four-value vocabulary', () => {
    expect(ThemeSchema.options).toEqual(['systems', 'culture', 'theology', 'relational']);
  });
  it('ItemSchema rejects an item without a theme', () => {
    const real = items[0]!;
    const stripped = { ...real } as Record<string, unknown>;
    delete stripped.theme;
    expect(ItemSchema.safeParse(stripped).success).toBe(false);
    expect(ItemSchema.safeParse(real).success).toBe(true);
  });
  it('no methodology version bump: tags are annotation only', () => {
    expect(m.questions.version).toBe('0.3.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/methodology/themes.test.ts`
Expected: FAIL — either `ThemeSchema`/`ItemSchema` has no export, or `item.theme` is `undefined` (Zod strips the key while the yaml lacks it).

- [ ] **Step 3: Add `ThemeSchema` + required `theme` to `ItemSchema`**

In `lib/methodology/schema.ts`, directly above `ItemSchema` (lines 12–19), add — using the file's existing `z` import:

```ts
// Spec P2: report-layer annotation, not scoring semantics — adding/changing a tag bumps NO
// methodology version and never stales a run. The canonical item→theme map is folded into the
// report inputsHash instead (plan 3, lib/report/report-hash.ts).
export const ThemeSchema = z.enum(['systems', 'culture', 'theology', 'relational']);
export type Theme = z.infer<typeof ThemeSchema>;
```

Then add to the `ItemSchema` object, after the `text` field:

```ts
  theme: ThemeSchema,
```

If `ItemSchema` is not already exported, add `export` to its declaration (the test imports it).

- [ ] **Step 4: Tag all 50 items in `methodology/questions.yaml`**

For every item in `methodology/questions.yaml`, add one line `theme: <value>` immediately after the item's `id:` line, using the `EXPECTED` table from Step 1 verbatim (G1 → `theme: systems`, C1 → `theme: relational`, … all 50). Do **not** touch `version: "0.3.0"`, any `text`, `signal`, `anchors`, `since`, or `reflection` field. Indentation matches the sibling keys of each item.

- [ ] **Step 5: Run the new test, then the whole methodology suite**

Run: `npx vitest run tests/methodology/themes.test.ts`
Expected: PASS (all 6 tests).

Run: `npx vitest run tests/methodology/`
Expected: PASS — `questions.test.ts`, `schema.test.ts`, `load.test.ts`, `effective.test.ts` all still green (theme rides through `effectiveMethodologyForRun`'s item *filtering* automatically — items are filtered, never rebuilt).

- [ ] **Step 6: Commit (schema + yaml + test together — Zod strips unknown keys, so these are inseparable)**

```bash
git add lib/methodology/schema.ts methodology/questions.yaml tests/methodology/themes.test.ts
git commit -m "feat(methodology): theme tags on all 50 items + required theme enum (spec P2, no version bump)"
```

---

### Task 2: `tiers:` block — `rules.yaml` + `RulesSchema`

**Files:**
- Modify: `methodology/rules.yaml` (54 lines, `version: "0.2.0"` — do not bump)
- Modify: `lib/methodology/schema.ts` (RulesSchema is at lines 45–76)
- Test: `tests/methodology/tiers.test.ts` (new file)

**Interfaces:**
- Consumes: existing `RulesSchema`.
- Produces: `rules.tiers` with exactly four named bands, each `{ min: number, name: string }`, keys `healthy_ready | healthy_stretched | strained | at_risk`. Task 3 (`tier.ts`) reads `Methodology['rules']['tiers']`.

- [ ] **Step 1: Write the failing test**

Create `tests/methodology/tiers.test.ts`, mirroring the `rules.test.ts` idiom (read yaml → parse with the exported schema):

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { RulesSchema } from '../../lib/methodology/schema';

const raw = readFileSync(fileURLToPath(new URL('../../methodology/rules.yaml', import.meta.url)), 'utf8');
const parsed = yaml.load(raw) as Record<string, unknown>;
const r = RulesSchema.parse(parsed);

describe('rules.yaml tiers block (spec P1/P7)', () => {
  it('carries the four locked bands with their display names', () => {
    expect(r.tiers).toEqual({
      healthy_ready: { min: 85, name: 'Healthy & Ready' },
      healthy_stretched: { min: 70, name: 'Healthy but Stretched' },
      strained: { min: 55, name: 'Strained' },
      at_risk: { min: 0, name: 'At Risk' },
    });
  });
  it('a missing band fails at load (named keys, never z.record)', () => {
    const { at_risk: _dropped, ...partialTiers } = (parsed.tiers ?? {}) as Record<string, unknown>;
    expect(RulesSchema.safeParse({ ...parsed, tiers: partialTiers }).success).toBe(false);
  });
  it('rules.yaml version is untouched (tiers are presentation thresholds, not scoring semantics)', () => {
    expect(r.version).toBe('0.2.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/methodology/tiers.test.ts`
Expected: FAIL — `RulesSchema.parse` throws (yaml has no `tiers` yet / schema has no `tiers` key so `r.tiers` is `undefined`).

- [ ] **Step 3: Append the `tiers:` block to `methodology/rules.yaml`**

Append at the end of the file (do not touch `version: "0.2.0"` or any existing key). Bands are half-open on their lower bounds — `capacity` is fractional (the 8-area mean), so 84.6 lands in `healthy_stretched`:

```yaml

# Tier bands over Diagnosis.capacity (spec P1). Half-open lower bounds: a capacity of 84.6
# is healthy_stretched, 85.0 is healthy_ready. Dashboard/register label ONLY — the tier
# never selects the report archetype (the ToC engine stays the diagnosis brain).
tiers:
  healthy_ready:     { min: 85, name: "Healthy & Ready" }
  healthy_stretched: { min: 70, name: "Healthy but Stretched" }
  strained:          { min: 55, name: "Strained" }
  at_risk:           { min: 0,  name: "At Risk" }
```

- [ ] **Step 4: Add `tiers` to `RulesSchema`**

In `lib/methodology/schema.ts`, directly above `RulesSchema` (lines 45–76), add:

```ts
const TierBandSchema = z.object({ min: z.number(), name: z.string() });
```

Then add to the `RulesSchema` object (after `correlation`, before the closing brace) — named keys per the house discipline at lines 107–129, so a missing band fails at load:

```ts
  tiers: z.object({
    healthy_ready: TierBandSchema,
    healthy_stretched: TierBandSchema,
    strained: TierBandSchema,
    at_risk: TierBandSchema,
  }),
```

- [ ] **Step 5: Run the new test, then the whole methodology suite**

Run: `npx vitest run tests/methodology/tiers.test.ts`
Expected: PASS (3 tests).

Run: `npx vitest run tests/methodology/`
Expected: PASS — `rules.test.ts` still green (it asserts existing keys only).

- [ ] **Step 6: Commit**

```bash
git add methodology/rules.yaml lib/methodology/schema.ts tests/methodology/tiers.test.ts
git commit -m "feat(methodology): tier bands in rules.yaml + named-key TierBand schema (spec P1/P7)"
```

---

### Task 3: `lib/report/tier.ts` — `tierFor` + `archetypeFor`

**Files:**
- Create: `lib/report/tier.ts`
- Test: `tests/report/tier.test.ts` (new file; `tests/report/` already exists)

**Interfaces:**
- Consumes: `Methodology['rules']` (with `tiers` from Task 2), `Diagnosis` from `lib/engine/types.ts` (`primary_constraint: { category_id: string } | null`, `gating_conditions: GatingCondition[]`).
- Produces (Task 4 and plans 3–5 import all of these):
  - `export type TierId = 'healthy_ready' | 'healthy_stretched' | 'strained' | 'at_risk'`
  - `export interface Tier { id: TierId; name: string }`
  - `export type Archetype = 'capacity' | 'constraint' | 'foundation'`
  - `export function tierFor(capacity: number, rules: Methodology['rules']): Tier`
  - `export function archetypeFor(d: Pick<Diagnosis, 'primary_constraint' | 'gating_conditions'>): Archetype`

- [ ] **Step 1: Write the failing test**

Create `tests/report/tier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import { tierFor, archetypeFor } from '../../lib/report/tier';

const rules = loadMethodology().rules;

describe('tierFor (spec P1: half-open lower bounds over fractional capacity)', () => {
  it.each([
    [100, 'healthy_ready', 'Healthy & Ready'],
    [85, 'healthy_ready', 'Healthy & Ready'],
    [84.6, 'healthy_stretched', 'Healthy but Stretched'],
    [70, 'healthy_stretched', 'Healthy but Stretched'],
    [69.9, 'strained', 'Strained'],
    [55, 'strained', 'Strained'],
    [54.9, 'at_risk', 'At Risk'],
    [0, 'at_risk', 'At Risk'],
  ] as const)('capacity %s → %s', (capacity, id, name) => {
    expect(tierFor(capacity, rules)).toEqual({ id, name });
  });
});

describe('archetypeFor (locked decision 3: the engine picks, never GPT)', () => {
  it('constraint when a primary constraint exists — even if enablers also gate', () => {
    expect(
      archetypeFor({
        primary_constraint: { category_id: 'conn' },
        gating_conditions: [{ enabler_id: 'sys', note: 'gated' }],
      }),
    ).toBe('constraint');
  });
  it('foundation when no constraint but at least one enabler gates', () => {
    expect(
      archetypeFor({
        primary_constraint: null,
        gating_conditions: [{ enabler_id: 'gov', note: 'gated' }],
      }),
    ).toBe('foundation');
  });
  it('capacity when nothing is broken and nothing gates', () => {
    expect(archetypeFor({ primary_constraint: null, gating_conditions: [] })).toBe('capacity');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/report/tier.test.ts`
Expected: FAIL — `Cannot find module '../../lib/report/tier'`.

- [ ] **Step 3: Implement `lib/report/tier.ts`**

```ts
import type { Methodology } from '../methodology/schema';
import type { Diagnosis } from '../engine/types';

export type TierId = 'healthy_ready' | 'healthy_stretched' | 'strained' | 'at_risk';

export interface Tier {
  id: TierId;
  name: string;
}

export type Archetype = 'capacity' | 'constraint' | 'foundation';

// Descending by min — first band whose lower bound the capacity clears wins, which is
// exactly the half-open-interval semantics of spec P1 (84.6 → healthy_stretched).
const TIER_ORDER: readonly TierId[] = ['healthy_ready', 'healthy_stretched', 'strained', 'at_risk'];

/**
 * Tier label for Diagnosis.capacity (the fractional 8-area mean). Dashboard/register
 * label ONLY (spec P1) — it never selects the archetype below. Thresholds live in
 * rules.yaml `tiers`; the named-key schema guarantees every band exists at load.
 */
export function tierFor(capacity: number, rules: Methodology['rules']): Tier {
  for (const id of TIER_ORDER) {
    const band = rules.tiers[id];
    if (capacity >= band.min) return { id, name: band.name };
  }
  // Unreachable while at_risk.min is 0 and scores are non-negative — kept so a future
  // floor change cannot make this function partial.
  return { id: 'at_risk', name: rules.tiers.at_risk.name };
}

/**
 * Which of the three v1 report skeletons this diagnosis gets (locked decision 3).
 * Pure read of the ToC engine's verdict — GPT never decides a finding:
 * constraint = a stage is broken (carries "do not work on");
 * foundation = no broken stage but enabler(s) gate;
 * capacity   = neither.
 */
export function archetypeFor(d: Pick<Diagnosis, 'primary_constraint' | 'gating_conditions'>): Archetype {
  if (d.primary_constraint) return 'constraint';
  if (d.gating_conditions.length > 0) return 'foundation';
  return 'capacity';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/report/tier.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/report/tier.ts tests/report/tier.test.ts
git commit -m "feat(report): tierFor + archetypeFor — pure tier/archetype selection (spec P1, locked decision 3)"
```

---

### Task 4: `lib/report/facts.ts` — the facts pack

**Files:**
- Create: `lib/report/facts.ts`
- Modify: `lib/report/view.ts:93` (export the existing private `interp` — one-word change)
- Test: `tests/report/facts.test.ts` (new file)

**Interfaces:**
- Consumes: `Diagnosis`, `Response`, `GenerosityMode` from `lib/engine/types.ts`; `Methodology`, `Theme` from `lib/methodology/schema.ts`; `tierFor`, `archetypeFor`, `Tier`, `Archetype` from `./tier` (Task 3); `interp` from `./view`.
- Produces: `export interface FactsPack`, `export interface ChurchFacts`, `export interface ThemeClusterFact`, and `export function buildFacts(args: BuildFactsArgs): FactsPack` (exact shapes below). Plans 2–5 treat `FactsPack` as the single source of every number any report section may mention; it must stay JSON-serializable (plain objects/arrays only — it is persisted as `facts jsonb` in plan 3).
- **Methodology input is always the EFFECTIVE edition** (`deriveDiagnosisForRun(...).effectiveMethodology`) — `tests/report/route-methodology-wiring.test.ts` source-reads call sites for exactly this discipline, and the canonical item→theme map hashed in plan 3 must come from the same edition.

- [ ] **Step 1: Export `interp` from `lib/report/view.ts`**

At line 93, change `function interp(` to `export function interp(` (the JSDoc above it stays). The facts pack reuses it for pre-interpolated dependency read sentences — same reuse `buildSystem` already makes, so the two layers cannot drift, and no third copy of the token-substitution contract appears.

- [ ] **Step 2: Write the failing test**

Create `tests/report/facts.test.ts`. The fixture loads the REAL methodology (same pattern as `rules.test.ts` — no fabricated copy templates) and builds a minimal-but-typed `Diagnosis` inline; leaf types the facts pack never reads (`calibration`, `offer`, correlation/evidence internals) are satisfied with narrow casts, kept local to the fixture.

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { Diagnosis, DiagnosisCategory, Response } from '../../lib/engine/types';
import { buildFacts, type ChurchFacts } from '../../lib/report/facts';

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

// One real authored dependency edge, with scores attached the way the engine does —
// its `read` key is guaranteed to exist in copy.yaml's dependency_reads.
const realDep = methodology.rules.dependencies[0]! as unknown as Record<string, unknown>;
const depEdge = { ...realDep, fromScore: 48, toScore: 62 } as Diagnosis['dependencies'][number];

function makeDiagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    methodology_version: '0.3.0',
    throughput: 52.4,
    capacity: 63.9,
    gap: 11.5,
    categories: CAT_IDS.map((id, i) => makeCategory(id, [72, 44, 61, 58, 66, 70, 55, 68][i]!)),
    primary_constraint: { category_id: 'conn' },
    contributing: [],
    do_not_work_on: [],
    gating_conditions: [],
    generosity_mode: 'breadth',
    blind_spots: [{ category_id: 'vol', belief: 71, evidence: 49, gap: 22 }],
    disagreement_flags: [{ category_id: 'disc', spread: 2.4 } as Diagnosis['disagreement_flags'][number]],
    calibration: { spread: 1.1 } as Diagnosis['calibration'],
    dependencies: [depEdge],
    correlations: [],
    offer: { call_type: 'call', hook: 'h' } as Diagnosis['offer'],
    confidence: 0.85,
    evidence_trail: [],
    ...over,
  };
}

function resp(item_id: string, category_id: string, value: number, who: string): Response {
  return { category_id, item_id, value, respondent_label: who, respondent_id: who };
}

const CHURCH: ChurchFacts = {
  name: 'Grace Chapel',
  denomination: 'Non-denominational',
  context: null,
  attendance_band: '250_499',
  adults_band: null,
  staff_fte_band: null,
  budget_band: null,
  church_age_band: null,
  growth_trajectory: 'plateaued',
  campuses_band: null,
  facility_status: 'owned',
  leadership_history: null,
  consultant_notes: null,
};

// G1 mean 2.5 → 25; G2 mean 3 → 30; C1 mean 3 → 30 (ties with G2, C1 < G2 lexicographically);
// D1/V1/GEN1 fill out the six; V2 (mean 8.5 → 85) must be excluded from bottom_items.
const RESPONSES: Response[] = [
  resp('G1', 'guest', 2, 'a'), resp('G1', 'guest', 3, 'b'),
  resp('G2', 'guest', 3, 'a'),
  resp('C1', 'conn', 3, 'b'),
  resp('D1', 'disc', 4, 'a'),
  resp('V1', 'vol', 5, 'b'),
  resp('GEN1', 'gen', 6, 'c'),
  resp('V2', 'vol', 8, 'c'), resp('V2', 'vol', 9, 'a'),
];

const facts = buildFacts({
  diagnosis: makeDiagnosis(),
  methodology,
  responses: RESPONSES,
  church: CHURCH,
  completedAt: '2026-08-10T00:00:00Z',
});

describe('buildFacts — cover + overall', () => {
  it('counts DISTINCT respondents and carries church name + completion time', () => {
    expect(facts.cover).toEqual({
      church_name: 'Grace Chapel',
      completed_at: '2026-08-10T00:00:00Z',
      respondent_count: 3,
    });
  });
  it('overall carries capacity, throughput, gap and the derived tier', () => {
    expect(facts.overall).toEqual({
      capacity: 63.9,
      throughput: 52.4,
      gap: 11.5,
      tier: { id: 'strained', name: 'Strained' },
    });
  });
  it('archetype comes from the engine verdict', () => {
    expect(facts.archetype).toBe('constraint');
    expect(facts.primary_constraint).toEqual({
      category_id: 'conn',
      name: methodology.questions.categories.find((c) => c.id === 'conn')!.name,
    });
  });
});

describe('buildFacts — categories', () => {
  it('sorts descending by score, ties broken by id ascending', () => {
    const scores = facts.categories.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(facts.categories[0]!.id).toBe('guest'); // 72 is the top fixture score
    expect(facts.categories).toHaveLength(8);
  });
  it('carries name, kind, state, percentile and respondent_count per category', () => {
    const guest = facts.categories.find((c) => c.id === 'guest')!;
    expect(guest.kind).toBe('stage');
    expect(guest.percentile).toBe(40);
    expect(guest.respondent_count).toBe(3);
    expect(facts.categories.find((c) => c.id === 'sys')!.kind).toBe('enabler');
  });
});

describe('buildFacts — bottom items (spec S7 table source)', () => {
  it('ranks by mean ascending ×10, ties broken by item id, and caps at 6', () => {
    expect(facts.bottom_items).toHaveLength(6);
    expect(facts.bottom_items.map((b) => b.item_id)).toEqual(['G1', 'C1', 'G2', 'D1', 'V1', 'GEN1']);
    expect(facts.bottom_items[0]!.mean).toBe(25); // (2+3)/2 × 10
    expect(facts.bottom_items.map((b) => b.item_id)).not.toContain('V2');
  });
  it('each bottom item carries its statement text and theme from the effective methodology', () => {
    const g1 = facts.bottom_items[0]!;
    const g1Item = methodology.questions.categories
      .flatMap((c) => c.items)
      .find((i) => i.id === 'G1')!;
    expect(g1.text).toBe(g1Item.text);
    expect(g1.theme).toBe(g1Item.theme);
    expect(g1.category_id).toBe('guest');
  });
  it('pattern_counts always carries all four themes and sums to the bottom-item count', () => {
    expect(Object.keys(facts.pattern_counts).sort()).toEqual(['culture', 'relational', 'systems', 'theology']);
    const total = Object.values(facts.pattern_counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(facts.bottom_items.length);
  });
});

describe('buildFacts — dossier absorptions', () => {
  it('blind spots carry the display name alongside the numbers', () => {
    expect(facts.blind_spots).toEqual([
      {
        category_id: 'vol',
        name: methodology.questions.categories.find((c) => c.id === 'vol')!.name,
        belief: 71,
        evidence: 49,
        gap: 22,
      },
    ]);
  });
  it('dispersion flags carry name + spread', () => {
    expect(facts.dispersion).toEqual([
      { category_id: 'disc', name: methodology.questions.categories.find((c) => c.id === 'disc')!.name, spread: 2.4 },
    ]);
  });
  it('dependency reads are pre-interpolated sentences (no {token} left)', () => {
    expect(facts.dependencies).toHaveLength(1);
    const d = facts.dependencies[0]!;
    expect(d.from_score).toBe(48);
    expect(d.to_score).toBe(62);
    expect(d.read_sentence).not.toMatch(/\{\w+\}/);
    expect(d.read_sentence.length).toBeGreaterThan(0);
  });
  it('generosity mode and confidence pass through', () => {
    expect(facts.generosity_mode).toBe('breadth');
    expect(facts.confidence).toBe(0.85);
  });
});

describe('buildFacts — profile subset (locked decision 6: omit gracefully)', () => {
  it('keeps only non-null fields, name excluded (it lives on cover)', () => {
    expect(facts.profile).toEqual({
      denomination: 'Non-denominational',
      attendance_band: '250_499',
      growth_trajectory: 'plateaued',
      facility_status: 'owned',
    });
  });
});

describe('buildFacts — gating + themes defaults', () => {
  it('foundation-shaped diagnosis surfaces gating with enabler names and scores', () => {
    const f = buildFacts({
      diagnosis: makeDiagnosis({
        primary_constraint: null,
        gating_conditions: [{ enabler_id: 'gov', note: 'Governance gates all stages' }],
      }),
      methodology,
      responses: RESPONSES,
      church: CHURCH,
      completedAt: null,
    });
    expect(f.archetype).toBe('foundation');
    expect(f.gating).toEqual([
      {
        enabler_id: 'gov',
        name: methodology.questions.categories.find((c) => c.id === 'gov')!.name,
        score: 70,
        note: 'Governance gates all stages',
      },
    ]);
    expect(f.cover.completed_at).toBeNull();
  });
  it('themes default to empty until plan 2 supplies clusters', () => {
    expect(facts.themes).toEqual([]);
  });
  it('the pack is JSON-serializable (persisted as facts jsonb in plan 3)', () => {
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  });
  it('no respondent identifier appears anywhere in the pack', () => {
    const json = JSON.stringify(facts);
    expect(json).not.toMatch(/respondent_label|respondent_id/);
    // The fixture labels are 'a'/'b'/'c' — none may survive as a JSON string value.
    for (const who of ['"a"', '"b"', '"c"']) expect(json).not.toContain(who);
  });
});
```

Note: if `methodology.rules.dependencies[0]`'s parsed shape differs from `Diagnosis['dependencies'][number]` minus scores (expected fields: `from`, `to`, `kind`, `statement`, `read`), fix the `depEdge` construction in the red-green loop rather than weakening the assertion that `read_sentence` is fully interpolated.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/report/facts.test.ts`
Expected: FAIL — `Cannot find module '../../lib/report/facts'`.

- [ ] **Step 4: Implement `lib/report/facts.ts`**

```ts
import type { Diagnosis, GenerosityMode, Response } from '../engine/types';
import type { Methodology, Theme } from '../methodology/schema';
import { archetypeFor, tierFor, type Archetype, type Tier } from './tier';
import { interp } from './view';

/**
 * The facts pack: the single deterministic source of every number, name, and theme any
 * report section — GPT-composed or fallback — is allowed to mention (spec "FACTS PACK
 * (every number originates here)"). JSON-serializable by construction: plain objects and
 * arrays only, because plan 3 persists it verbatim as `reports.facts jsonb` and hashes
 * slices of it into per-section gate inputs.
 *
 * Anonymity: respondent labels/ids never enter the pack — respondents exist here only as
 * the distinct count on the cover and the per-category counts.
 */
export interface CategoryFact {
  id: string;
  name: string;
  kind: 'stage' | 'enabler';
  score: number;
  state: string;
  percentile: number | null;
  respondent_count: number;
}

export interface BottomItemFact {
  item_id: string;
  category_id: string;
  mean: number; // 1–10 answers × 10, rounded to the nearest integer (0–100 register)
  text: string;
  theme: Theme;
}

/** Shape plan 2's gated clustering output lands in. Empty until then. */
export interface ThemeClusterFact {
  label: string;
  gloss: string;
  support_count: number;
  item_ids: string[];
}

/** Church profile inputs — the 12 nullable `churches` profile columns plus name. */
export interface ChurchFacts {
  name: string;
  denomination: string | null;
  context: string | null;
  attendance_band: string | null;
  adults_band: string | null;
  staff_fte_band: string | null;
  budget_band: string | null;
  church_age_band: string | null;
  growth_trajectory: string | null;
  campuses_band: string | null;
  facility_status: string | null;
  leadership_history: string | null;
  consultant_notes: string | null;
}

export interface FactsPack {
  cover: { church_name: string; completed_at: string | null; respondent_count: number };
  overall: { capacity: number; throughput: number; gap: number; tier: Tier };
  archetype: Archetype;
  categories: CategoryFact[]; // sorted score desc, ties by id asc — S3's dashboard order
  bottom_items: BottomItemFact[]; // mean asc, ties by item id asc, max 6 — S7's table
  pattern_counts: Record<Theme, number>; // over bottom_items; all four keys always present (S7 gate 5)
  themes: ThemeClusterFact[];
  profile: Record<string, string>; // non-null profile fields only — absent, not empty (decision 6)
  blind_spots: Array<{ category_id: string; name: string; belief: number; evidence: number; gap: number }>;
  dispersion: Array<{ category_id: string; name: string; spread: number }>;
  dependencies: Array<{
    from: string; to: string; kind: string;
    from_name: string; to_name: string;
    from_score: number; to_score: number;
    read_sentence: string;
  }>;
  gating: Array<{ enabler_id: string; name: string; score: number; note: string }>;
  generosity_mode: GenerosityMode;
  primary_constraint: { category_id: string; name: string } | null;
  confidence: number;
}

export interface BuildFactsArgs {
  diagnosis: Diagnosis;
  /** ALWAYS the effective edition (deriveDiagnosisForRun's effectiveMethodology) — the
   *  item→theme map and statement texts must match what the run was scored against. */
  methodology: Methodology;
  responses: Response[];
  church: ChurchFacts;
  completedAt: string | null;
  themes?: ThemeClusterFact[];
}

const PROFILE_KEYS = [
  'denomination', 'context', 'attendance_band', 'adults_band', 'staff_fte_band',
  'budget_band', 'church_age_band', 'growth_trajectory', 'campuses_band',
  'facility_status', 'leadership_history', 'consultant_notes',
] as const;

const BOTTOM_ITEM_COUNT = 6;

export function buildFacts(args: BuildFactsArgs): FactsPack {
  const { diagnosis: d, methodology, responses, church, completedAt } = args;
  const names = new Map(methodology.questions.categories.map((c) => [c.id, c.name]));
  const chainSet = new Set(methodology.rules.chain);

  // Bottom items: per-item means over the EFFECTIVE methodology's item list — an orphan
  // response for an item this edition no longer carries can never surface a phantom row.
  const byItem = new Map<string, number[]>();
  for (const r of responses) {
    const bucket = byItem.get(r.item_id);
    if (bucket) bucket.push(r.value);
    else byItem.set(r.item_id, [r.value]);
  }
  const itemFacts: BottomItemFact[] = [];
  for (const cat of methodology.questions.categories) {
    for (const item of cat.items) {
      const values = byItem.get(item.id);
      if (!values || values.length === 0) continue;
      const mean = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10);
      itemFacts.push({ item_id: item.id, category_id: cat.id, mean, text: item.text, theme: item.theme });
    }
  }
  const bottomItems = itemFacts
    .sort((a, b) => a.mean - b.mean || (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0))
    .slice(0, BOTTOM_ITEM_COUNT);

  const patternCounts: Record<Theme, number> = { systems: 0, culture: 0, theology: 0, relational: 0 };
  for (const b of bottomItems) patternCounts[b.theme] += 1;

  const categories: CategoryFact[] = d.categories
    .map((c) => ({
      id: c.category_id,
      name: names.get(c.category_id) ?? c.category_id,
      kind: (chainSet.has(c.category_id) ? 'stage' : 'enabler') as CategoryFact['kind'],
      score: c.score,
      state: c.state,
      percentile: c.cohort_percentile,
      respondent_count: c.respondent_count,
    }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const scores = new Map(d.categories.map((c) => [c.category_id, c.score]));

  const profile: Record<string, string> = {};
  for (const key of PROFILE_KEYS) {
    const value = church[key];
    if (value !== null && value.length > 0) profile[key] = value;
  }

  const primaryId = d.primary_constraint?.category_id ?? null;

  return {
    cover: {
      church_name: church.name,
      completed_at: completedAt,
      respondent_count: new Set(responses.map((r) => r.respondent_id)).size,
    },
    overall: {
      capacity: d.capacity,
      throughput: d.throughput,
      gap: d.gap,
      tier: tierFor(d.capacity, methodology.rules),
    },
    archetype: archetypeFor(d),
    categories,
    bottom_items: bottomItems,
    pattern_counts: patternCounts,
    themes: args.themes ?? [],
    profile,
    blind_spots: d.blind_spots.map((b) => ({
      category_id: b.category_id,
      name: names.get(b.category_id) ?? b.category_id,
      belief: b.belief,
      evidence: b.evidence,
      gap: b.gap,
    })),
    dispersion: d.disagreement_flags.map((f) => ({
      category_id: f.category_id,
      name: names.get(f.category_id) ?? f.category_id,
      spread: f.spread,
    })),
    dependencies: d.dependencies.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      from_name: names.get(e.from) ?? e.from,
      to_name: names.get(e.to) ?? e.to,
      from_score: e.fromScore,
      to_score: e.toScore,
      // Same template + interp buildSystem uses, so the report and the dossier
      // surfaces can never phrase a dependency differently.
      read_sentence: interp(methodology.copy.dependency_reads[e.read], {
        fromName: names.get(e.from) ?? e.from,
        toName: names.get(e.to) ?? e.to,
      }),
    })),
    gating: d.gating_conditions.map((g) => ({
      enabler_id: g.enabler_id,
      name: names.get(g.enabler_id) ?? g.enabler_id,
      score: scores.get(g.enabler_id) ?? 0,
      note: g.note,
    })),
    generosity_mode: d.generosity_mode,
    primary_constraint: primaryId
      ? { category_id: primaryId, name: names.get(primaryId) ?? primaryId }
      : null,
    confidence: d.confidence,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass, plus the report suite**

Run: `npx vitest run tests/report/facts.test.ts`
Expected: PASS (all describe blocks).

Run: `npx vitest run tests/report/`
Expected: PASS — the `interp` export change is additive; `view.test.ts`, `route-call-ordering.test.ts`, `route-methodology-wiring.test.ts` all still green.

- [ ] **Step 6: Commit**

```bash
git add lib/report/facts.ts lib/report/view.ts tests/report/facts.test.ts
git commit -m "feat(report): deterministic facts pack — every report number originates here"
```

---

### Task 5: Migration — 4 nullable `churches` profile columns

**Files:**
- Create: `supabase/migrations/20260810000100_churches_profile_columns.sql`

**Interfaces:**
- Consumes: existing `public.churches` (schema in `20260715000100_schema.sql`; profile columns today: denomination, context, attendance_band, adults_band, staff_fte_band, budget_band, church_age_band, growth_trajectory).
- Produces: 4 new nullable text columns — `campuses_band`, `facility_status`, `leadership_history`, `consultant_notes` — read by Task 6's seam and written by Task 7's form. `create_church_with_admin` is untouched (spec: post-creation settings only; avoids the 12-arg drop/recreate).

No runnable DB test in this repo for the agent (⛔ never `test:db` / `db push` — Natalie applies migrations). The column list is verified indirectly: Task 6's seam select names all 4 columns and Task 7's form posts all 4 fields, both under test.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260810000100_churches_profile_columns.sql` (comment-header style per `20260807000100_responses_reflection_column.sql`):

```sql
-- Final-report redesign plan 1 (spec "Data model & schema changes"): four optional
-- church-profile columns for report calibration. All nullable — the report omits any
-- empty field gracefully (locked decision 6), and create_church_with_admin is UNTOUCHED:
-- these are post-creation settings written through the existing churches_update RLS
-- policy (admin-only, 20260715000400), no new RPC.
--
-- facility_status is free text constrained to the four known values when present
-- (owned | rented | portable | mixed); leadership_history and consultant_notes are
-- long-form notes (consultant_notes may carry roles/context the assessment doesn't
-- collect, spec P6).

alter table public.churches
  add column if not exists campuses_band text,
  add column if not exists facility_status text
    check (facility_status is null or facility_status in ('owned','rented','portable','mixed')),
  add column if not exists leadership_history text,
  add column if not exists consultant_notes text;
```

- [ ] **Step 2: Sanity-check the SQL reads clean**

Run: `cat supabase/migrations/20260810000100_churches_profile_columns.sql`
Expected: the file above, no stray characters. (No DB execution — owner applies it.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260810000100_churches_profile_columns.sql
git commit -m "feat(db): churches profile columns — campuses_band, facility_status, leadership_history, consultant_notes"
```

---

### Task 6: `lib/data/churches.ts` seam — `loadChurchProfile` + `updateChurchProfile`

**Files:**
- Modify: `lib/data/churches.ts` (65 lines — append after `createChurchWithAdmin`)
- Test: `tests/data/churches.test.ts` (append to the existing file)

**Interfaces:**
- Consumes: existing `SupabaseServerClient` type alias in the same file; `churches_update` RLS policy (admin-only USING + WITH CHECK, `20260715000400_rls_policies.sql:23`).
- Produces (Task 7 and Task 4's callers in plan 3 import these):
  - `export interface ChurchProfile` — `id`, `name`, plus the 12 nullable profile columns (exact fields below; a superset of `ChurchFacts` minus nothing — plan 3 maps it into `ChurchFacts` by dropping `id`).
  - `export type ChurchProfileUpdate = Partial<Omit<ChurchProfile, 'id' | 'name'>>`
  - `export async function loadChurchProfile(supabase: SupabaseServerClient, churchId: string): Promise<ChurchProfile | null>` — null when not visible; throws on unexpected error (same posture as `loadChurchForMember`).
  - `export async function updateChurchProfile(supabase: SupabaseServerClient, churchId: string, fields: ChurchProfileUpdate): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/data/churches.test.ts` (reuse the file's existing `ClientType` alias and `fakeClient` helper; add the two new imports to the existing import line from `@/lib/data/churches`):

```ts
// — append to the import at the top of the file:
//   loadChurchProfile, updateChurchProfile, type ChurchProfile

const PROFILE: ChurchProfile = {
  id: 'c1',
  name: 'Grace',
  denomination: null,
  context: 'urban',
  attendance_band: '100_249',
  adults_band: null,
  staff_fte_band: null,
  budget_band: null,
  church_age_band: null,
  growth_trajectory: null,
  campuses_band: '2_3',
  facility_status: 'owned',
  leadership_history: null,
  consultant_notes: null,
}

describe('loadChurchProfile()', () => {
  it('returns the full profile row when visible', async () => {
    expect(await loadChurchProfile(fakeClient(PROFILE), 'c1')).toEqual(PROFILE)
  })
  it('returns null when the church is not visible to the caller', async () => {
    expect(await loadChurchProfile(fakeClient(null), 'c1')).toBeNull()
  })
  it('scopes the lookup to the church id', async () => {
    const eqCols: string[] = []
    await loadChurchProfile(fakeClient(PROFILE, eqCols), 'c1')
    expect(eqCols).toEqual(['id'])
  })
})

function updateClient(opts: {
  error?: { message: string } | null
  calls?: Array<{ fields: unknown; eq: [string, unknown] }>
}) {
  return {
    from: () => ({
      update: (fields: unknown) => ({
        eq: async (col: string, val: unknown) => {
          opts.calls?.push({ fields, eq: [col, val] })
          return { error: opts.error ?? null }
        },
      }),
    }),
  } as unknown as ClientType
}

describe('updateChurchProfile()', () => {
  it('updates the given fields scoped to the church id', async () => {
    const calls: Array<{ fields: unknown; eq: [string, unknown] }> = []
    const res = await updateChurchProfile(updateClient({ calls }), 'c1', {
      denomination: 'Baptist',
      consultant_notes: null,
    })
    expect(res).toEqual({ error: null })
    expect(calls).toEqual([
      { fields: { denomination: 'Baptist', consultant_notes: null }, eq: ['id', 'c1'] },
    ])
  })
  it('surfaces the RLS/DB error message', async () => {
    const res = await updateChurchProfile(updateClient({ error: { message: 'denied' } }), 'c1', {})
    expect(res).toEqual({ error: 'denied' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/data/churches.test.ts`
Expected: FAIL — `loadChurchProfile` / `updateChurchProfile` / `ChurchProfile` are not exported.

- [ ] **Step 3: Implement the seam functions**

Append to `lib/data/churches.ts` (JSDoc discipline matches the file's existing exports — every export explains its seam rationale, ADR 0002):

```ts
/**
 * The church's full profile row — everything the settings form edits and the report's
 * facts pack calibrates with (spec locked decision 6). One seam function owns the column
 * list so the form, the server action, and plan 3's report wiring can never drift on
 * which fields exist (ADR 0002).
 */
export interface ChurchProfile {
  id: string
  name: string
  denomination: string | null
  context: string | null
  attendance_band: string | null
  adults_band: string | null
  staff_fte_band: string | null
  budget_band: string | null
  church_age_band: string | null
  growth_trajectory: string | null
  campuses_band: string | null
  facility_status: string | null
  leadership_history: string | null
  consultant_notes: string | null
}

export type ChurchProfileUpdate = Partial<Omit<ChurchProfile, 'id' | 'name'>>

const PROFILE_COLUMNS =
  'id, name, denomination, context, attendance_band, adults_band, staff_fte_band, ' +
  'budget_band, church_age_band, growth_trajectory, campuses_band, facility_status, ' +
  'leadership_history, consultant_notes'

/**
 * Full profile for the settings form's initial values (and plan 3's facts pack).
 * Null when RLS hides the church from the caller; unexpected errors throw rather than
 * masquerade as not-found — the same posture loadChurchForMember takes.
 */
export async function loadChurchProfile(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<ChurchProfile | null> {
  const { data, error } = await supabase
    .from('churches')
    .select(PROFILE_COLUMNS)
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  return (data as ChurchProfile | null) ?? null
}

/**
 * Direct UPDATE under the existing churches_update RLS policy (admin-only USING +
 * WITH CHECK, 20260715000400) — deliberately no new RPC (spec "Settings surface").
 * NOTE: RLS filtering means a non-admin's update matches zero rows and returns NO
 * error — callers must verify the admin role first (the settings action does).
 */
export async function updateChurchProfile(
  supabase: SupabaseServerClient,
  churchId: string,
  fields: ChurchProfileUpdate,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('churches').update(fields).eq('id', churchId)
  return { error: error?.message ?? null }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/data/churches.test.ts`
Expected: PASS — all pre-existing describes plus the two new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/data/churches.ts tests/data/churches.test.ts
git commit -m "feat(data): loadChurchProfile + updateChurchProfile seam over churches_update RLS"
```

---

### Task 7: Settings surface — server action, client form, admin-gated page

**Files:**
- Create: `app/app/[churchId]/settings/actions.ts`
- Create: `app/app/[churchId]/settings/settings-form.tsx`
- Create: `app/app/[churchId]/settings/page.tsx`
- Test: `tests/a11y/settings-form.test.ts` (new file, source-reading — pattern of `tests/a11y/get-started-form.test.ts`)
- Test: `tests/data/pages-use-seam.test.ts` (append)

**Interfaces:**
- Consumes: `loadChurchForMember`, `loadChurchProfile`, `updateChurchProfile`, `ChurchProfile`, `ChurchProfileUpdate` from `@/lib/data/churches` (Task 6); `createClient` from `@/lib/supabase/server`; `LiveStatus` from `@/components/live-status`; the admin-gate `notFound()` idiom from `app/app/[churchId]/access/page.tsx`; the `useActionState` fork source `app/get-started/form.tsx`.
- Produces: `updateChurchSettings(prev: SettingsState, formData: FormData): Promise<SettingsState>` with `SettingsState = { error: string | null; saved: boolean }`; route `/app/[churchId]/settings` (admin-only). Plan 4 links to this route from the dashboard.

- [ ] **Step 1: Write the failing tests**

Create `tests/a11y/settings-form.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) =>
  fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\/\/.*$/gm, '')

const FORM = read('app', 'app', '[churchId]', 'settings', 'settings-form.tsx')
const PAGE = read('app', 'app', '[churchId]', 'settings', 'page.tsx')
const ACTION = read('app', 'app', '[churchId]', 'settings', 'actions.ts')

const PROFILE_FIELDS = [
  'denomination', 'context', 'attendance_band', 'adults_band', 'staff_fte_band',
  'budget_band', 'church_age_band', 'growth_trajectory', 'campuses_band',
  'facility_status', 'leadership_history', 'consultant_notes',
] as const

describe('settings page is admin-gated (access/ idiom)', () => {
  it('resolves role via loadChurchForMember and 404s non-admins', () => {
    expect(PAGE).toContain('loadChurchForMember(')
    expect(PAGE).toContain("role !== 'admin'")
    expect(PAGE).toContain('notFound()')
  })
})

describe('settings form posts the full profile field set', () => {
  it('renders an input/select/textarea for all 12 profile fields', () => {
    // Fields rendered from a mapped tuple array appear in source as the single-quoted
    // tuple literal, not as name="…" (same caveat get-started-form.test.ts documents) —
    // accept either spelling.
    for (const name of PROFILE_FIELDS) {
      const present = FORM.includes(`name="${name}"`) || FORM.includes(`'${name}'`)
      expect(present, `missing field ${name}`).toBe(true)
    }
    expect(FORM).toContain('name="attendance_band"')
    expect(FORM).toContain('name="facility_status"')
  })
  it('carries the church id as a hidden field', () => {
    expect(FORM).toContain('name="church_id"')
    expect(FORM).toContain('type="hidden"')
  })
  it('facility status is the four-value select from the migration CHECK', () => {
    for (const slug of ['owned', 'rented', 'portable', 'mixed']) {
      expect(FORM, `missing facility option ${slug}`).toContain(`'${slug}'`)
    }
  })
  it('long-form fields render as textareas', () => {
    // The two long-form names live in the TEXTAREA_FIELDS tuples that feed the
    // <textarea> map — name= is a JSX binding, so assert the pieces, not the pair.
    expect(FORM).toContain('TEXTAREA_FIELDS')
    expect(FORM).toContain('<textarea')
    for (const name of ['leadership_history', 'consultant_notes']) {
      expect(FORM, `missing long-form field ${name}`).toContain(`'${name}'`)
    }
  })
  it('announces save state politely (role=status), errors via LiveStatus', () => {
    expect(FORM).toContain('role="status"')
    expect(FORM).toContain('<LiveStatus')
  })
})

describe('settings action enforces admin before writing', () => {
  it('checks the role server-side (RLS alone would silently match zero rows)', () => {
    expect(ACTION).toContain('loadChurchForMember(')
    expect(ACTION).toContain("role !== 'admin'")
  })
  it('requires attendance_band (the engine cannot benchmark without it)', () => {
    expect(ACTION).toContain('attendance_band')
    expect(ACTION).toMatch(/Weekend attendance is required/)
  })
})
```

Append to `tests/data/pages-use-seam.test.ts` — two new source reads after the existing `getStarted` const, and one new describe after the existing ones:

```ts
const settingsPage = read('app', 'app', '[churchId]', 'settings', 'page.tsx')
const settingsAction = read('app', 'app', '[churchId]', 'settings', 'actions.ts')

describe('settings surface goes through the churches seam', () => {
  it('page resolves church + role + profile via the seam', () => {
    expect(settingsPage).toContain("from '@/lib/data/churches'")
    expect(settingsPage).toContain('loadChurchForMember(')
    expect(settingsPage).toContain('loadChurchProfile(')
  })
  it('action writes via updateChurchProfile, never the raw table', () => {
    expect(settingsAction).toContain('updateChurchProfile(')
    for (const [name, src] of [['settings page', settingsPage], ['settings action', settingsAction]] as const) {
      expect(src, `${name} must not touch churches directly`).not.toContain(".from('churches')")
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/a11y/settings-form.test.ts tests/data/pages-use-seam.test.ts`
Expected: FAIL — `ENOENT` reading `app/app/[churchId]/settings/*` (the files don't exist yet).

- [ ] **Step 3: Implement the server action**

Create `app/app/[churchId]/settings/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  loadChurchForMember,
  updateChurchProfile,
  type ChurchProfileUpdate,
} from '@/lib/data/churches'

export interface SettingsState {
  error: string | null
  saved: boolean
}

// Same normalization the get-started flow applies: whitespace-only posts become NULL so
// the report's "omit gracefully when empty" check (locked decision 6) is a simple null test.
function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

export async function updateChurchSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in.', saved: false }

  const rawChurchId = formData.get('church_id')
  const churchId = typeof rawChurchId === 'string' ? rawChurchId : ''

  // Explicit admin check BEFORE the write: churches_update RLS would make a non-admin's
  // UPDATE match zero rows and report success — this turns that silent no-op into an error.
  const { church, role } = await loadChurchForMember(supabase, churchId, user.id)
  if (!church || role !== 'admin') {
    return { error: 'Only church admins can edit settings.', saved: false }
  }

  // The 12 editable profile columns, explicitly — name/id are never editable here (name is
  // set at creation; the spec scopes settings to profile intake). Explicit keys keep this
  // fully typed against ChurchProfileUpdate with no index-signature gymnastics.
  const fields: ChurchProfileUpdate = {
    denomination: emptyToNull(formData.get('denomination')),
    context: emptyToNull(formData.get('context')),
    attendance_band: emptyToNull(formData.get('attendance_band')),
    adults_band: emptyToNull(formData.get('adults_band')),
    staff_fte_band: emptyToNull(formData.get('staff_fte_band')),
    budget_band: emptyToNull(formData.get('budget_band')),
    church_age_band: emptyToNull(formData.get('church_age_band')),
    growth_trajectory: emptyToNull(formData.get('growth_trajectory')),
    campuses_band: emptyToNull(formData.get('campuses_band')),
    facility_status: emptyToNull(formData.get('facility_status')),
    leadership_history: emptyToNull(formData.get('leadership_history')),
    consultant_notes: emptyToNull(formData.get('consultant_notes')),
  }

  // The diagnosis engine keys cohort percentiles by attendance band — never null it out.
  if (!fields.attendance_band) return { error: 'Weekend attendance is required.', saved: false }

  const { error } = await updateChurchProfile(supabase, churchId, fields)
  if (error) return { error, saved: false }

  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/settings`)
  return { error: null, saved: true }
}
```

- [ ] **Step 4: Implement the client form**

Create `app/app/[churchId]/settings/settings-form.tsx` (forked from `app/get-started/form.tsx`: same `useActionState` wiring, option constants, `inputClass`, and pending-button pattern; adapted to defaultValues + the 4 new fields; plain labels instead of get-started's FieldInfo help icons — the help copy there is creation-flow-specific):

```tsx
'use client'

import { useActionState } from 'react'
import { updateChurchSettings, type SettingsState } from './actions'
import { LiveStatus } from '@/components/live-status'
import type { ChurchProfile } from '@/lib/data/churches'

const initial: SettingsState = { error: null, saved: false }

const CONTEXTS = ['urban', 'suburban', 'small_town', 'rural'] as const

// Valid cohort bands (keys mirror methodology/benchmarks.yaml) — required, the engine
// keys its cohort percentiles by this band.
const ATTENDANCE_BANDS = [
  ['under_100', 'Under 100'],
  ['100_249', '100–249'],
  ['250_499', '250–499'],
  ['500_999', '500–999'],
  ['1000_1499', '1,000–1,499'],
  ['1500_plus', '1,500+'],
] as const

const GROWTH_OPTIONS = [
  ['declining', 'Declining'],
  ['plateaued', 'Plateaued'],
  ['growing_steadily', 'Growing steadily'],
  ['growing_rapidly', 'Growing rapidly'],
] as const

// Mirrors the migration CHECK (20260810000100): owned | rented | portable | mixed.
const FACILITY_OPTIONS = [
  ['owned', 'Owned'],
  ['rented', 'Rented'],
  ['portable', 'Portable'],
  ['mixed', 'Mixed'],
] as const

const BAND_TEXT_FIELDS = [
  ['denomination', 'Denomination'],
  ['adults_band', 'Adults'],
  ['staff_fte_band', 'Staff (FTE)'],
  ['budget_band', 'Annual budget'],
  ['church_age_band', 'Church age'],
  ['campuses_band', 'Campuses'],
] as const

const TEXTAREA_FIELDS = [
  ['leadership_history', 'Leadership history', 'Tenure changes, transitions, or anything about the leadership story that context helps a reader understand.'],
  ['consultant_notes', 'Consultant notes', 'Anything else the report should know — e.g. who took the assessment (roles), current initiatives, or context the questions don’t capture.'],
] as const

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function SettingsForm({ church }: { church: ChurchProfile }) {
  const [state, formAction, pending] = useActionState(updateChurchSettings, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="church_id" value={church.id} />

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Context
        <select name="context" defaultValue={church.context ?? ''} className={inputClass}>
          <option value="">—</option>
          {CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Weekend attendance (required)
        <select
          name="attendance_band"
          defaultValue={church.attendance_band ?? ''}
          required
          className={inputClass}
        >
          <option value="" disabled>
            —
          </option>
          {ATTENDANCE_BANDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {BAND_TEXT_FIELDS.map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          {label}
          <input
            name={name}
            type="text"
            defaultValue={church[name] ?? ''}
            className={inputClass}
          />
        </label>
      ))}

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Growth trajectory
        <select
          name="growth_trajectory"
          defaultValue={church.growth_trajectory ?? ''}
          className={inputClass}
        >
          <option value="">Select…</option>
          {GROWTH_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Facility
        <select
          name="facility_status"
          defaultValue={church.facility_status ?? ''}
          className={inputClass}
        >
          <option value="">Select…</option>
          {FACILITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {TEXTAREA_FIELDS.map(([name, label, hint]) => (
        <label key={name} className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          {label}
          <span className="text-xs text-ink-soft">{hint}</span>
          <textarea
            name={name}
            rows={4}
            defaultValue={church[name] ?? ''}
            className={inputClass}
          />
        </label>
      ))}

      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {pending ? 'Saving…' : 'Save settings'}
      </button>

      <LiveStatus message={state.error} tone="error" className="font-body text-sm text-berry" />
      {state.saved && !state.error ? (
        <p role="status" className="font-body text-sm text-ink-soft">
          Settings saved.
        </p>
      ) : null}
    </form>
  )
}
```

- [ ] **Step 5: Implement the page**

Create `app/app/[churchId]/settings/page.tsx` (admin-gate idiom copied from `app/app/[churchId]/access/page.tsx`):

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadChurchForMember, loadChurchProfile } from '@/lib/data/churches'
import { SettingsForm } from './settings-form'

export default async function SettingsPage({ params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { church, role } = await loadChurchForMember(supabase, churchId, user?.id ?? '')
  if (!church) notFound()
  if (role !== 'admin') notFound()

  const profile = await loadChurchProfile(supabase, churchId)
  if (!profile) notFound()

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/app/${churchId}`}
          className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          ← Back to {church.name}
        </Link>
        <h1 className="font-display text-2xl text-ink">Church settings</h1>
        <p className="font-body text-sm text-ink-soft">
          Optional profile details that calibrate your report. Anything left blank is simply
          omitted — nothing here is required except weekend attendance.
        </p>
      </header>

      <SettingsForm church={profile} />
    </main>
  )
}
```

- [ ] **Step 6: Run the new tests, then the full suite + typecheck**

Run: `npx vitest run tests/a11y/settings-form.test.ts tests/data/pages-use-seam.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npx vitest run`
Expected: full suite green (916 pre-existing + the new tests from Tasks 1–7).

- [ ] **Step 7: Commit (bracketed paths — literal pathspecs, quoted)**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/settings/actions.ts" "app/app/[churchId]/settings/settings-form.tsx" "app/app/[churchId]/settings/page.tsx" tests/a11y/settings-form.test.ts tests/data/pages-use-seam.test.ts
git commit -m "feat(settings): admin-gated church profile settings form via the churches seam"
```

---

## Done means

- All 7 task commits on `feat/final-report-redesign` (no push — Natalie reviews).
- `npx tsc --noEmit` → 0 errors; `npx vitest run` → green; no `.claude/` or old plan docs staged.
- `methodology/questions.yaml` still `version: "0.3.0"`, `rules.yaml` still `"0.2.0"`.
- Natalie's review checklist for this PR: spot-check the 50 theme tags (the judgment calls flagged in session 5: D2, V1, V5, GEN5, COM6, COM7), the tier names/copy, and the settings-form field labels/hints.

## Explicitly NOT in this plan (later plans)

- Plan 2: `lib/ai/themes.ts`, `lib/ai/theme-gates.ts`, ai-exclusion contract rewrite.
- Plan 3: `methodology/report.yaml`, section calls/gates/fallbacks, `reports` table + `save_report` RPC + pgTAP, `report-hash.ts`, generation wiring (which is where `buildFacts` gets called with real data and `ChurchProfile` maps into `ChurchFacts`).
- Plan 4: 12-section web components, share page, dashboard link to `/settings`.
- Plan 5: PDF skeleton + guard extension.
