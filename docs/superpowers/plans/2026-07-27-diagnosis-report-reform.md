# Diagnosis Report Reform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unfair pooled-mean scoring with a fair two-way balanced decomposition where every complete respondent counts equally, and grow the diagnosis report from a single-thread constraint argument into a four-layer report covering all eight areas and how they depend on each other.

**Architecture:** Per area, take only respondents who answered all 5 questions — a complete R×5 rectangle — and decompose `answer = μ + person effect + question effect + residual` in closed form. `μ` *is* the pooled mean on a complete rectangle, so complete data produces byte-identical scores to today; the math diverges only where today is unfair. Person effects feed a calibration signal (rating style) and a deviation-based disagreement signal, replacing raw dispersion. Cover numbers become Throughput (`0.85·min(chain) + 0.15·mean(chain)`), Capacity (8-area mean) and Gap. Cross-area structure comes from 13 authored dependency edges read against actual scores, optionally annotated by leave-two-out correlation at N≥18.

**Tech Stack:** TypeScript, Next.js App Router (server components), Vitest, Zod-validated YAML methodology, Supabase Postgres + pgTAP, `@react-pdf/renderer`.

**Source spec:** `docs/superpowers/specs/2026-07-27-diagnosis-report-reform-design.md` — read it before Task 1. Section references below (`§4.1`) point into it.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Never run** `npm run test:db`, `supabase db push`, or `supabase db reset`. Migrations and pgTAP are owner-run (Natalie). Write the migration file; do not apply it.
- **Never** merge, push to `master`, or force-push without the owner.
- **Explicit git paths only** in `git add`. Never stage `.claude/` or `.superpowers/`.
- Use `GIT_LITERAL_PATHSPECS=1` for any git path containing `[churchId]` or `[categoryId]`.
- **No new dependencies.** Everything here is arithmetic already expressible in the standard library.
- **Gates, every task:** `npm run typecheck` → 0 errors · `npm run lint` → 0 errors · `npm test` → all green. A task is not done until all three are clean. For the test-count baseline see the **Baseline correction** at the end of the retraction section below: the chain is **338** on the base → **341** after Task 1 → **349** after Task 2. The figures **340, 343 and 351 are VOID.**
- CI "Vercel unstable" / `UNSTABLE` on PRs is a `cornerleague` permissions artifact, **not** a code failure.
- **Branch:** cut a fresh implementation branch from `master`. This plan's spec lives on `docs/diagnosis-report-reform-spec`; do not build on top of that docs branch. PR #31 is open and awaiting the owner's merge — leave it alone.
- **Locked decisions (spec §3) are not to be reopened.** If an implementation detail seems to conflict with one, stop and ask the owner; do not resolve it yourself.
- **Two content items belong to XPG, not to the implementer** (spec §10): the 13 dependency-edge prose statements (Task 10) and the dossier band copy (Task 14). The implementer must not invent church-health claims.

## ⚠️ RETRACTED: the "spec drift" section was wrong — read before starting

**An earlier revision of this plan claimed two spec drifts. Both were FALSE.** They were
measured against a local `master` that was 18 PRs stale (`8317b89`, PR #12, 196 tests).
The spec's original references are correct. Verified 2026-07-27 against the real
`origin/master` (`c6960f3`, PR #30) with `GIT_LITERAL_PATHSPECS=1`:

| the retracted claim | the truth on `origin/master` |
|---|---|
| ~~gate is at `actions.ts:73`~~ | the gate **is** at **`app/app/[churchId]/actions.ts:28`**, inside `generateDiagnosis()`: `if (coverage(rows, categories).coveredCount !== categories.length)` — exactly as the spec says |
| ~~`lib/coverage/assessment-cta.ts` does not exist~~ | it **exists** and is a pure, separately-tested function: `assessmentCta(result: CoverageResult, categories: Category[]): AssessmentCta`, returning state `not_started` \| `in_progress` \| `complete`. **But see the correction immediately below — Task 8 must NOT edit it.** |

`actions.ts:73` is a stale-tree artifact. Do not re-introduce it.

### ⚠️ …and this retraction was ITSELF partly wrong. Corrected 2026-07-27.

Two statements that appeared here in an earlier revision have since been disproved by
reading the real working tree. **Both corrections below are verified; do not revert them.**

**1. The SPEC names the wrong module for the admin gate — this is the dangerous one.**
`lib/coverage/assessment-cta.ts` exists, but reading it shows it governs the
**member-facing** whole-assessment CTA (*Start* / *Continue* / *Take Again*). It is **not**
the admin **"Generate diagnosis"** button. The spec's instruction that Task 8 change the
gate "there" is therefore **wrong**, and so was this section's earlier repetition of it.

> **Task 8 edits `app/app/[churchId]/page.tsx:202` and leaves
> `lib/coverage/assessment-cta.ts` completely alone.**

**2. There IS an inline `coveredCount` gate in `page.tsx`; only its line numbers were stale.**
An earlier revision claimed the inline CTA "exists only on the stale tree." **False.**
`page.tsx` **does** gate the admin "Generate diagnosis" button inline on
`result.coveredCount === categories.length` — at **line 202**, with the disabled reason at
**213-214**. What was stale was the *location* `134-146`, never the *existence*.

**Why this is called out so loudly:** the stale checkout did not only shift line numbers, it
produced a **semantic** error about which module does what. An implementer who trusted the
spec would have edited an unrelated, member-facing file and left the real admin gate intact —
a change that would have typechecked, linted, passed its tests, and shipped the bug.
Treat every remaining module-responsibility claim in this plan as suspect until verified
against the working tree.

**Baseline correction:** this branch is cut from `origin/master` `c6960f3`. The plan's
stated baseline of **340** tests came from PR #31's branch, which is still open and is
**not** in this base. Take the actual `npm test` count on a clean checkout of the base as
the baseline and require only that it **grows**; do not treat 340 as authoritative.

**The true chain is 338 on the base → 341 after Task 1 → 349 after Task 2.** The figures
**340, 343 and 351 are VOID** wherever they appear. Task 18's final gate is `≥ 390`
(349 + 47 unambiguously-new tests) **and never fewer than the count recorded at the end of
Task 2** — record that number when Task 2 lands.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `lib/engine/fit.ts` | Two-way balanced decomposition of one area's complete rectangle. Absorbs `score.ts` — score becomes `round(fit.mu × 10)`. |
| `lib/engine/calibration.ts` | Per-person rating style across the areas they completed; spread of style. |
| `lib/engine/disagreement.ts` | Deviation-based disagreement per area. **Replaces `dispersion.ts`.** |
| `lib/engine/throughput.ts` | `throughput` · `capacity` · `gap`. |
| `lib/engine/dependencies.ts` | 13 structural edges derived from `chain` + `enablers.gates`, read against this church's scores. |
| `lib/engine/correlation.ts` | Leave-two-out correlation on deviations, BH-corrected, N≥18 gated. |
| `supabase/migrations/20260728000100_rpc_get_run_responses_add_user_id.sql` | `create or replace get_run_responses`, adds `respondent_user_id`. |
| `app/app/[churchId]/diagnosis/report/cover.tsx` | Layer 1 — `CoverCard`, `VerdictHeader`, `AreaTable`. |
| `app/app/[churchId]/diagnosis/report/system.tsx` | Layer 2 — `DependencyMap`, `Calibration`, `Disagreement`, `GatingFlags`. |
| `app/app/[churchId]/diagnosis/report/dossier.tsx` | Layer 3 — `AreaDossier`. |
| `app/app/[churchId]/diagnosis/report/chain.tsx` | `ChainWalk`, `StageTile`, `EvidenceReceipt`, `CostSection`. |
| `app/app/[churchId]/diagnosis/report/shared.tsx` | `confidenceBand`, `EmptyState`, `NextStep`, `Appendix`, `StaleMethodologyNotice`. |

### Deleted files

| File | Why |
|---|---|
| `lib/engine/score.ts` | absorbed into `fit.ts` |
| `lib/engine/dispersion.ts` | replaced by `disagreement.ts` |
| `tests/engine/dispersion.test.ts` | replaced by the already-present `tests/engine/disagreement.test.ts` |
| `app/app/[churchId]/diagnosis/report.tsx` | split into `report/*.tsx` (Task 15) |
| `lib/report/copy.ts` | its three `GENEROSITY_COPY` strings move into `methodology/copy.yaml` under `dossier.generosity` (Task 13 Step 0 seeds them, Task 14 authors them); deleted in Task 16 Step 4 once both consumers are rewritten |

### Modified files

| File | Change |
|---|---|
| `lib/engine/types.ts` | `Response` +`respondent_id` · `NormalizedCategory` +`fit` · `Diagnosis` −`overall_score` +`throughput`/`capacity`/`gap`/`dependencies`/`correlations`/`calibration`, `dispersion_flags`→`disagreement_flags` |
| `lib/engine/normalize.ts` | key on `respondent_id`; build the fit; count `excludedPartial` |
| `lib/engine/assemble.ts` | wire fit + throughput + dependencies + correlation; per-area N |
| `lib/methodology/schema.ts` | `RulesSchema` +`throughput` +`dependencies` +`correlation` · `CopySchema` +`dossier` (Task 13 Step 0) |
| `methodology/rules.yaml` | +`throughput.min_weight: 0.85`, +`dependencies[]`, +correlation thresholds; version → `0.2.0` |
| `methodology/copy.yaml` | dossier band templates |
| `lib/report/view.ts` | +`cover`/`areas`/`system`, −`blindSpot`/`generosityMode` |
| `lib/report/pdf/document.tsx` | mirror the new sections |
| `app/r/[shareToken]/page.tsx` | mirror the new sections |
| `app/app/[churchId]/actions.ts:28` | gate becomes "every area has ≥1 complete respondent" |
| `app/app/[churchId]/page.tsx:202, 213-214` | same gate treatment + `excludedPartial` nudge |
| `app/app/[churchId]/diagnosis/page.tsx` | stale-payload detection |
| `lib/ai/fallback.ts` | `dispersion_flags` → `disagreement_flags` rename consumer (Task 13 Step 5). It does **not** read `overall_score` — verified against the tree — so Task 7 leaves it alone. |
| `tests/engine/helpers.ts` | emit **partial** respondents |
| `supabase/tests/11_get_run_responses_test.sql` | assert the new column |

### Explicitly untouched (spec §8.3)

`lib/engine/constraint.ts`, `lib/engine/gap.ts`, `lib/engine/benchmark.ts`. The chain walk still finds the earliest stage below `thresholds.break`; an enabler still cannot be the primary constraint. Do not rewrite production diagnostic logic.

---

## Task 1: The partial-respondent builder

The test builder has **never** emitted a partial respondent — which is exactly why this unfairness survived to production (spec §9.2). Retire the blind spot permanently before touching any math.

**Files:**
- Modify: `tests/engine/helpers.ts`
- Test: `tests/engine/helpers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `partialAnswers(methodology, categoryId, itemIds, valueOrMap, label?): Response[]` — emits responses for **only** the listed `itemIds`. `answers()` keeps its current signature and still emits every item.

- [ ] **Step 1: Read the existing builder and its test**

Read `tests/engine/helpers.ts` (26 lines) and `tests/engine/helpers.test.ts`. Note that `answers()` maps over `cat.items` unconditionally — that is the blind spot.

- [ ] **Step 2: Write the failing test**

Append to `tests/engine/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';

describe('partialAnswers', () => {
  const methodology = loadFixtureMethodology();

  it('emits only the requested items, unlike answers() which emits all five', () => {
    expect(answers(methodology, 'vol', 6, 'Pastor')).toHaveLength(5);
    const partial = partialAnswers(methodology, 'vol', ['V1'], 1, 'Elder');
    expect(partial).toHaveLength(1);
    expect(partial[0]!.item_id).toBe('V1');
    expect(partial[0]!.value).toBe(1);
    expect(partial[0]!.respondent_label).toBe('Elder');
    expect(partial[0]!.category_id).toBe('vol');
  });

  it('accepts a per-item map', () => {
    const rows = partialAnswers(methodology, 'vol', ['V1', 'V2'], { V1: 3, V2: 9 }, 'Elder');
    expect(rows.map((r) => [r.item_id, r.value])).toEqual([['V1', 3], ['V2', 9]]);
  });

  it('rejects an item id that is not in the category', () => {
    expect(() => partialAnswers(methodology, 'vol', ['G1'], 5)).toThrow(/G1/);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/engine/helpers.test.ts`
Expected: FAIL — `partialAnswers is not a function` / import error.

- [ ] **Step 4: Implement the builder**

Append to `tests/engine/helpers.ts`:

```ts
/**
 * Emits responses for ONLY the listed item ids — a PARTIAL respondent.
 * answers() always emits every item in the category, which is why no fixture
 * ever exercised partial coverage and why the pooled-mean unfairness survived
 * to production. Throws on an unknown item id so a typo cannot silently
 * produce a smaller-than-intended partial.
 */
export function partialAnswers(
  methodology: Methodology,
  categoryId: string,
  itemIds: string[],
  valueOrMap: number | Record<string, number>,
  label = 'Elder',
): Response[] {
  const cat = methodology.questions.categories.find(c => c.id === categoryId);
  if (!cat) throw new Error(`partialAnswers: unknown category "${categoryId}"`);
  const known = new Set(cat.items.map(it => it.id));
  for (const id of itemIds) {
    if (!known.has(id)) throw new Error(`partialAnswers: "${id}" is not an item of "${categoryId}"`);
  }
  return itemIds.map(id => ({
    category_id: categoryId,
    item_id: id,
    value: typeof valueOrMap === 'number' ? valueOrMap : (valueOrMap[id] ?? 5),
    respondent_label: label,
  }));
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/helpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · **341 passing** (338 on the base + 3; confirm the count only grew). The figures 340 and 343 are VOID — they descend from PR #31's branch, which is not in this base.

- [ ] **Step 7: Commit**

```bash
git add tests/engine/helpers.ts tests/engine/helpers.test.ts
git commit -m "test(engine): teach the fixture builder to emit partial respondents"
```

---

## Task 2: The two-way fit

**Files:**
- Create: `lib/engine/fit.ts`
- Test: `tests/engine/fit.test.ts`

**Interfaces:**
- Consumes: nothing (pure module — takes a plain array of cells).
- Produces:
  ```ts
  export interface FitCell { respondent_id: string; item_id: string; value: number }
  export interface AreaFit {
    category_id: string
    mu: number                                                  // 1..10, 0 when n === 0
    n: number                                                   // complete respondents
    personEffects: Array<{ respondent_id: string; effect: number }>
    questionEffects: Array<{ item_id: string; effect: number }>
    excludedPartial: number
  }
  export function fitArea(
    category_id: string,
    itemIds: string[],
    cells: FitCell[],
  ): AreaFit
  ```
  `fitArea` internally selects only respondents with a cell for **every** id in `itemIds` (the 5-of-5 rule, spec §3 decision 2); everyone else increments `excludedPartial`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/fit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fitArea, type FitCell } from '../../lib/engine/fit';

const ITEMS = ['V1', 'V2', 'V3', 'V4', 'V5'];

function rect(rows: Record<string, number[]>): FitCell[] {
  return Object.entries(rows).flatMap(([respondent_id, values]) =>
    values.map((value, i) => ({ respondent_id, item_id: ITEMS[i]!, value })),
  );
}

describe('fitArea', () => {
  it('mu equals the pooled mean on a complete rectangle', () => {
    const fit = fitArea('vol', ITEMS, rect({ a: [6, 6, 6, 6, 6], b: [2, 4, 6, 8, 10] }));
    expect(fit.n).toBe(2);
    expect(fit.mu).toBeCloseTo(6, 10); // (30 + 30) / 10
    expect(fit.excludedPartial).toBe(0);
  });

  it('person effects sum to zero', () => {
    const fit = fitArea('vol', ITEMS, rect({ a: [8, 8, 8, 8, 8], b: [4, 4, 4, 4, 4], c: [6, 6, 6, 6, 6] }));
    const sum = fit.personEffects.reduce((s, p) => s + p.effect, 0);
    expect(sum).toBeCloseTo(0, 10);
    expect(fit.personEffects.find((p) => p.respondent_id === 'a')!.effect).toBeCloseTo(2, 10);
    expect(fit.personEffects.find((p) => p.respondent_id === 'b')!.effect).toBeCloseTo(-2, 10);
  });

  it('question effects sum to zero', () => {
    const fit = fitArea('vol', ITEMS, rect({ a: [2, 4, 6, 8, 10], b: [2, 4, 6, 8, 10] }));
    const sum = fit.questionEffects.reduce((s, q) => s + q.effect, 0);
    expect(sum).toBeCloseTo(0, 10);
    expect(fit.questionEffects.find((q) => q.item_id === 'V1')!.effect).toBeCloseTo(-4, 10);
    expect(fit.questionEffects.find((q) => q.item_id === 'V5')!.effect).toBeCloseTo(4, 10);
  });

  it('residuals are balanced along both margins', () => {
    const cells = rect({ a: [3, 7, 5, 9, 1], b: [8, 2, 6, 4, 10], c: [5, 5, 9, 1, 7] });
    const fit = fitArea('vol', ITEMS, cells);
    const person = new Map(fit.personEffects.map((p) => [p.respondent_id, p.effect]));
    const question = new Map(fit.questionEffects.map((q) => [q.item_id, q.effect]));
    const resid = (c: FitCell) =>
      c.value - fit.mu - person.get(c.respondent_id)! - question.get(c.item_id)!;

    // every respondent's residuals sum to zero
    for (const r of ['a', 'b', 'c']) {
      const rowSum = cells.filter((c) => c.respondent_id === r).reduce((s, c) => s + resid(c), 0);
      expect(rowSum).toBeCloseTo(0, 10);
    }

    // every item's residuals sum to zero
    for (const i of ITEMS) {
      const colSum = cells.filter((c) => c.item_id === i).reduce((s, c) => s + resid(c), 0);
      expect(colSum).toBeCloseTo(0, 10);
    }
  });

  it('drops partial respondents and counts them', () => {
    const cells = [
      ...rect({ pastor: [6, 6, 6, 6, 6] }),
      { respondent_id: 'elder', item_id: 'V1', value: 1 },
    ];
    const fit = fitArea('vol', ITEMS, cells);
    expect(fit.n).toBe(1);
    expect(fit.excludedPartial).toBe(1);
    expect(fit.mu).toBeCloseTo(6, 10); // NOT the pooled 5.1667
  });

  it('returns an empty fit when nobody completed the area', () => {
    const fit = fitArea('vol', ITEMS, [{ respondent_id: 'elder', item_id: 'V1', value: 1 }]);
    expect(fit.n).toBe(0);
    expect(fit.mu).toBe(0);
    expect(fit.excludedPartial).toBe(1);
    expect(fit.personEffects).toEqual([]);
    expect(fit.questionEffects).toEqual([]);
  });

  it('does not assume five items', () => {
    const fit = fitArea('x', ['A', 'B', 'C'], [
      { respondent_id: 'a', item_id: 'A', value: 4 },
      { respondent_id: 'a', item_id: 'B', value: 5 },
      { respondent_id: 'a', item_id: 'C', value: 6 },
    ]);
    expect(fit.n).toBe(1);
    expect(fit.mu).toBeCloseTo(5, 10);
    expect(fit.questionEffects).toHaveLength(3);
  });

  it('ignores a duplicate cell rather than double-counting it', () => {
    const fit = fitArea('vol', ITEMS, [
      ...rect({ a: [6, 6, 6, 6, 6] }),
      { respondent_id: 'a', item_id: 'V1', value: 10 },
    ]);
    expect(fit.n).toBe(1);
    expect(fit.mu).toBeCloseTo(6, 10);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine/fit.test.ts`
Expected: FAIL — cannot resolve `../../lib/engine/fit`.

- [ ] **Step 3: Implement the fit**

Create `lib/engine/fit.ts`:

```ts
export interface FitCell {
  respondent_id: string;
  item_id: string;
  value: number;
}

export interface AreaFit {
  category_id: string;
  mu: number; // 1..10 on a non-empty block; 0 when n === 0
  n: number; // respondents who answered EVERY item
  personEffects: Array<{ respondent_id: string; effect: number }>;
  questionEffects: Array<{ item_id: string; effect: number }>;
  excludedPartial: number;
}

/**
 * Two-way balanced decomposition of one area (spec §4.1):
 *
 *   value_ri = mu + person_r + question_i + residual_ri
 *
 * Only respondents with a cell for EVERY item count (the 5-of-5 rule, spec §3
 * decision 2). That makes the block a complete rectangle with no holes, on which
 * the fit is exact and closed-form: no iteration, no convergence tolerance, no
 * shrinkage, and person-first / item-first / pooled all yield the same mu.
 *
 * SAFETY PROPERTY: on a complete rectangle mu IS the pooled mean, so when
 * everyone finished this returns exactly what the old scoreCategory() returned.
 * The math diverges from the old model only where the old model was unfair.
 *
 * Residuals are deliberately not exported — nothing in the report reads them, so
 * no dead field ships. Tests derive them from the four exported quantities.
 */
export function fitArea(category_id: string, itemIds: string[], cells: FitCell[]): AreaFit {
  const byRespondent = new Map<string, Map<string, number>>();
  const known = new Set(itemIds);

  for (const c of cells) {
    if (!known.has(c.item_id)) continue; // ignore values for unknown items
    let row = byRespondent.get(c.respondent_id);
    if (!row) {
      row = new Map<string, number>();
      byRespondent.set(c.respondent_id, row);
    }
    if (!row.has(c.item_id)) row.set(c.item_id, c.value); // first write wins; never double-count
  }

  const complete: Array<[string, Map<string, number>]> = [];
  let excludedPartial = 0;
  for (const entry of byRespondent) {
    if (entry[1].size === itemIds.length) complete.push(entry);
    else excludedPartial++;
  }

  const n = complete.length;
  if (n === 0) {
    return { category_id, mu: 0, n: 0, personEffects: [], questionEffects: [], excludedPartial };
  }

  let total = 0;
  for (const [, row] of complete) for (const id of itemIds) total += row.get(id)!;
  const mu = total / (n * itemIds.length);

  const personEffects = complete.map(([respondent_id, row]) => {
    let sum = 0;
    for (const id of itemIds) sum += row.get(id)!;
    return { respondent_id, effect: sum / itemIds.length - mu };
  });

  const questionEffects = itemIds.map(item_id => {
    let sum = 0;
    for (const [, row] of complete) sum += row.get(item_id)!;
    return { item_id, effect: sum / n - mu };
  });

  return { category_id, mu, n, personEffects, questionEffects, excludedPartial };
}

/** Area score on the report's 0..100 scale. Replaces scoreCategory(). */
export function scoreFromFit(fit: AreaFit): number {
  return Math.round(fit.mu * 10);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/fit.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · **349 passing (341 → 349, +8)**.

> ⚠️ The plan's earlier figure of 351 is VOID — it descends from PR #31's branch, which is
> not in this base. The real pre-Task-2 count on this branch is **341** (338 on the base,
> +3 from Task 1). Record the actual pre-change count and assert it grows by exactly 8.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/fit.ts tests/engine/fit.test.ts
git commit -m "feat(engine): two-way balanced fit with the 5-of-5 completeness rule"
```

---

## Task 3: Wire the fit into normalize + score, and prove the unfairness is gone

This is the task where the reported number changes. The five E2E fixtures must **not** move (spec §9.1) — that is the proof the fit is right.

**Files:**
- Modify: `lib/engine/types.ts`, `lib/engine/normalize.ts`, `lib/engine/assemble.ts`
- Delete: `lib/engine/score.ts`
- Test: `tests/engine/fairness.test.ts` (new), `tests/engine/score.test.ts` (rewrite)

**Interfaces:**
- Consumes: `fitArea`, `scoreFromFit`, `type AreaFit` from Task 2; `partialAnswers` from Task 1.
- Produces: `NormalizedCategory` gains `fit: AreaFit`. `scoreCategory` is **deleted**; `assemble` calls `scoreFromFit(norm.fit)`.

- [ ] **Step 1: Write the failing fairness test**

Create `tests/engine/fairness.test.ts`. This is the worked case from spec §1 and §4.5 — today's pooled mean is **52**, the fair answer is **60**:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import { scoreFromFit } from '../../lib/engine/fit';

describe('a partial respondent no longer outweighs a complete one', () => {
  const methodology = loadFixtureMethodology();

  it('scores 60, not the pooled 52, when an elder answered one item of five', () => {
    const responses = [
      ...answers(methodology, 'vol', 6, 'Pastor'),
      ...partialAnswers(methodology, 'vol', ['V1'], 1, 'Elder'),
    ];
    const vol = normalize(responses, methodology).get('vol')!;

    // pooled mean would be (6*5 + 1) / 6 = 5.1667 -> 52, below thresholds.break (45 is
    // not crossed here, but the five-point drag is the unfairness). The fair answer
    // counts people, not answers: only the pastor completed the area.
    expect(scoreFromFit(vol.fit)).toBe(60);
    expect(vol.fit.n).toBe(1);
    expect(vol.fit.excludedPartial).toBe(1);
  });

  it('counts both people once the elder finishes', () => {
    const responses = [
      ...answers(methodology, 'vol', 6, 'Pastor'),
      ...answers(methodology, 'vol', 1, 'Elder'),
    ];
    const vol = normalize(responses, methodology).get('vol')!;
    expect(scoreFromFit(vol.fit)).toBe(35); // (6 + 1) / 2 = 3.5
    expect(vol.fit.n).toBe(2);
    expect(vol.fit.excludedPartial).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine/fairness.test.ts`
Expected: FAIL — `NormalizedCategory` has no `fit`.

- [ ] **Step 3: Add `fit` to the type**

In `lib/engine/types.ts`, add the import and the field:

```ts
import type { AreaFit } from './fit';

export interface NormalizedCategory {
  category_id: string;
  itemValues: Map<string, number[]>; // item_id -> values across all respondents
  respondentMeans: Array<{ label: string; mean: number }>;
  respondentCount: number;
  fit: AreaFit;
}
```

`itemValues`, `respondentMeans` and `respondentCount` all stay — `gapFor()` and the existing dispersion path still read them, and `gap.ts` is explicitly untouched (spec §8.3).

- [ ] **Step 4: Build the fit in normalize**

Rewrite the body of `lib/engine/normalize.ts` so it also assembles `FitCell`s. Keyed on `respondent_label` for now — Task 4 swaps the key to `respondent_id`:

```ts
import type { Methodology } from '../methodology/schema';
import type { Response, NormalizedCategory } from './types';
import { fitArea, type FitCell } from './fit';

export function normalize(
  responses: Response[],
  methodology: Methodology,
): Map<string, NormalizedCategory> {
  const result = new Map<string, NormalizedCategory>();

  for (const cat of methodology.questions.categories) {
    const itemValues = new Map<string, number[]>();
    for (const it of cat.items) itemValues.set(it.id, []);

    const perRespondent = new Map<string, number[]>();
    const cells: FitCell[] = [];

    for (const r of responses) {
      if (r.category_id !== cat.id) continue;
      const bucket = itemValues.get(r.item_id);
      if (!bucket) continue; // ignore values for unknown items
      bucket.push(r.value);
      const rb = perRespondent.get(r.respondent_label);
      if (rb) rb.push(r.value);
      else perRespondent.set(r.respondent_label, [r.value]);
      cells.push({ respondent_id: r.respondent_label, item_id: r.item_id, value: r.value });
    }

    const respondentMeans = [...perRespondent.entries()].map(([label, vals]) => ({
      label,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));

    result.set(cat.id, {
      category_id: cat.id,
      itemValues,
      respondentMeans,
      respondentCount: perRespondent.size,
      fit: fitArea(cat.id, cat.items.map(it => it.id), cells),
    });
  }

  return result;
}
```

- [ ] **Step 5: Point assemble at the fit and delete score.ts**

In `lib/engine/assemble.ts`, replace the import `import { scoreCategory } from './score';` with `import { scoreFromFit } from './fit';`, and at line 157 replace `const score = scoreCategory(norm);` with:

```ts
    const score = scoreFromFit(norm.fit);
```

Then delete the old module:

```bash
git rm lib/engine/score.ts
```

- [ ] **Step 6: Rewrite the score test against the fit**

Replace `tests/engine/score.test.ts` wholesale (spec §9.7 — the input type changes and it must now assert the safety property):

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import { scoreFromFit } from '../../lib/engine/fit';

describe('area score', () => {
  const methodology = loadFixtureMethodology();
  const pooled = (rows: { value: number }[]) =>
    Math.round((rows.reduce((a, r) => a + r.value, 0) / rows.length) * 10);

  it('equals the pooled mean when every respondent completed the area', () => {
    const rows = [
      ...answers(methodology, 'guest', { G1: 8, G2: 6, G3: 7, G4: 9, G5: 5 }, 'Pastor'),
      ...answers(methodology, 'guest', { G1: 4, G2: 5, G3: 6, G4: 3, G5: 7 }, 'Elder'),
    ];
    const guest = normalize(rows, methodology).get('guest')!;
    expect(scoreFromFit(guest.fit)).toBe(pooled(rows));
  });

  it('diverges from the pooled mean exactly when someone is partial', () => {
    const rows = [
      ...answers(methodology, 'guest', 6, 'Pastor'),
      ...partialAnswers(methodology, 'guest', ['G1'], 1, 'Elder'),
    ];
    const guest = normalize(rows, methodology).get('guest')!;
    expect(scoreFromFit(guest.fit)).toBe(60);
    expect(scoreFromFit(guest.fit)).not.toBe(pooled(rows));
  });

  it('scores 0 when nobody completed the area', () => {
    const guest = normalize([], methodology).get('guest')!;
    expect(scoreFromFit(guest.fit)).toBe(0);
  });
});
```

- [ ] **Step 7: Run the engine suite — the five E2E fixtures must not move**

Run: `npx vitest run tests/engine/`
Expected: PASS. `healthy-church`, `leaky-bucket`, `founder-bottleneck`, `broad-but-shallow` and `faithful-remnant` assert exact scores and primary constraints and **must be untouched**. If any of them shifts, the fit is wrong — do not edit the fixture; fix `fit.ts`.

- [ ] **Step 8: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · all green.

- [ ] **Step 9: Commit**

```bash
git add lib/engine/types.ts lib/engine/normalize.ts lib/engine/assemble.ts \
        tests/engine/fairness.test.ts tests/engine/score.test.ts
git rm --cached lib/engine/score.ts 2>/dev/null || true
git commit -m "feat(engine): score areas from the two-way fit, not a pooled mean"
```

---

## Task 4: Respondent identity — the `'Member'` collision fix

Person effects are meaningless if two respondents merge into one. `respondent_label` is `coalesce(full_name, email, 'Member')`, so two members with neither name nor email **become one respondent** (spec §4.4). This is a genuine bug and a prerequisite for everything downstream.

**Files:**
- Create: `supabase/migrations/20260728000100_rpc_get_run_responses_add_user_id.sql`
- Modify: `lib/engine/types.ts`, `lib/engine/normalize.ts`, `app/app/[churchId]/actions.ts`, `supabase/tests/11_get_run_responses_test.sql`, `tests/engine/helpers.ts`
- Test: `tests/engine/normalize.test.ts`

**Interfaces:**
- Consumes: `fitArea` (Task 2).
- Produces: `Response` gains `respondent_id: string`. `normalize()` keys `perRespondent` and `FitCell.respondent_id` on `respondent_id`; `respondent_label` becomes display-only. `answers()` / `partialAnswers()` gain an optional 5th/6th arg `respondentId` defaulting to the label.

- [ ] **Step 1: Read the current RPC**

Read `supabase/migrations/20260716001000_rpc_get_run_responses.sql`. The new migration must be a `create or replace` of the **same** function with one extra returned column — same shape as PR #31's coverage-RPC migration.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260728000100_rpc_get_run_responses_add_user_id.sql`. Copy the existing function body verbatim and add `respondent_user_id` to both the `returns table (...)` list and the `select`. The source column is `responses.respondent_user_id` if it exists; otherwise use the member/user id column the table already carries — **read the table definition in `supabase/migrations/01*_schema*.sql` (or `supabase/tests/01_schema_test.sql`) before writing this** and use the real column name. Sketch:

```sql
-- get_run_responses gains respondent_user_id.
-- normalize() keyed respondents on respondent_label = coalesce(full_name, email, 'Member'),
-- so two members with neither name nor email MERGED INTO ONE respondent, corrupting
-- respondent_count, the dispersion stddev and the disagreement flag. The engine could not
-- disambiguate because this function never returned a stable identity. It does now.
create or replace function get_run_responses(p_church_id uuid)
returns table (
  category_id text,
  item_id text,
  value int,
  respondent_label text,
  respondent_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- <<< keep the existing membership check + run scoping EXACTLY as-is >>>
  return query
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id
  from responses r
  -- <<< keep the existing joins / where clause EXACTLY as-is >>>
  ;
end;
$$;

revoke all on function get_run_responses(uuid) from public, anon;
grant execute on function get_run_responses(uuid) to authenticated;
```

**Do not run it.** The owner applies migrations.

- [ ] **Step 3: Extend the pgTAP test**

In `supabase/tests/11_get_run_responses_test.sql`, bump `select plan(7);` to `select plan(8);` and add one assertion after the existing `respondent_label` assertion:

```sql
select is((select respondent_user_id from get_run_responses(
            (select id from churches where name = 'Responses Test Church')) where item_id = 'G1'),
          'c1111111-1111-1111-1111-111111111111'::uuid,
          'respondent_user_id is returned and matches the seeded member');
```

**Assert the real seeded value, not `null`.** Verified on disk at `supabase/tests/11_get_run_responses_test.sql:15,19-21`: the G1/G2/G3 rows are `respondent_kind = 'member'` with a concrete `respondent_user_id` of `'c1111111-1111-1111-1111-111111111111'` — the same id used for `set local request.jwt.claims`. There is no `'invited'`-kind row anywhere in this file (the only other insert, C1, is also `'member'`), so a `null::uuid` expectation would fail the moment the owner ran the suite. Read the seed block before writing this and use whatever id is actually there. **The owner runs `npm run test:db`; the agent never does.**

- [ ] **Step 4: Write the failing engine test**

Replace the respondent-keying section of `tests/engine/normalize.test.ts` (add if absent):

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import type { Response } from '../../lib/engine/types';

describe('normalize keys respondents on identity, not label', () => {
  const methodology = loadFixtureMethodology();

  it('keeps two unnamed members apart even though both are labelled "Member"', () => {
    const rows: Response[] = ['G1', 'G2', 'G3', 'G4', 'G5'].flatMap((item_id) => [
      { category_id: 'guest', item_id, value: 8, respondent_label: 'Member', respondent_id: 'u-1' },
      { category_id: 'guest', item_id, value: 2, respondent_label: 'Member', respondent_id: 'u-2' },
    ]);
    const guest = normalize(rows, methodology).get('guest')!;

    expect(guest.respondentCount).toBe(2);
    expect(guest.fit.n).toBe(2);
    expect(guest.fit.personEffects.map((p) => p.respondent_id).sort()).toEqual(['u-1', 'u-2']);
    expect(guest.fit.mu).toBeCloseTo(5, 10);
  });
});
```

- [ ] **Step 5: Run it to make sure it fails**

Run: `npx vitest run tests/engine/normalize.test.ts`
Expected: FAIL — `respondent_id` is not a property of `Response` (typecheck) and `respondentCount` is 1.

- [ ] **Step 6: Add the field and re-key**

In `lib/engine/types.ts`:

```ts
export interface Response {
  category_id: string;
  item_id: string;
  value: number; // 1..10
  respondent_label: string; // DISPLAY ONLY — may collide across people
  respondent_id: string; // stable identity — what the engine groups on
}
```

In `lib/engine/normalize.ts`, key both maps on identity while keeping the label for display. Replace the loop body and the `respondentMeans` build:

```ts
    const perRespondent = new Map<string, { label: string; values: number[] }>();
    const cells: FitCell[] = [];

    for (const r of responses) {
      if (r.category_id !== cat.id) continue;
      const bucket = itemValues.get(r.item_id);
      if (!bucket) continue; // ignore values for unknown items
      bucket.push(r.value);
      const rb = perRespondent.get(r.respondent_id);
      if (rb) rb.values.push(r.value);
      else perRespondent.set(r.respondent_id, { label: r.respondent_label, values: [r.value] });
      cells.push({ respondent_id: r.respondent_id, item_id: r.item_id, value: r.value });
    }

    const respondentMeans = [...perRespondent.values()].map(({ label, values }) => ({
      label,
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    }));
```

- [ ] **Step 7: Give the fixture builders an identity argument**

In `tests/engine/helpers.ts`, add a trailing `respondentId` parameter to both builders, defaulting to the label so every existing fixture keeps working unchanged:

```ts
export function answers(
  methodology: Methodology,
  categoryId: string,
  valueOrMap: number | Record<string, number>,
  label = 'Pastor',
  respondentId = label,
): Response[] {
  const cat = methodology.questions.categories.find(c => c.id === categoryId);
  if (!cat) throw new Error(`answers: unknown category "${categoryId}"`);
  return cat.items.map(it => ({
    category_id: categoryId,
    item_id: it.id,
    value: typeof valueOrMap === 'number' ? valueOrMap : (valueOrMap[it.id] ?? 5),
    respondent_label: label,
    respondent_id: respondentId,
  }));
}
```

Apply the identical `respondentId = label` addition to `partialAnswers`.

- [ ] **Step 8: Map the new column at the call site**

In `app/app/[churchId]/actions.ts`, `generateDiagnosis` does **not** map the RPC rows field by field today — there is nothing to "carry the identity through". At `actions.ts:47-51` it does an unchecked cast, with the variable named `raw`, not `responseData`:

```ts
  const { data: raw, error: respError } = await supabase.rpc('get_run_responses', {
    p_church_id: churchId,
  })
  if (respError) return { ok: false, error: respError.message }
  const responses = (raw ?? []) as Response[]
```

Replace that cast with a real `.map()`, so the new field is populated rather than assumed. Fall back to the label so a row predating the migration still produces *a* key rather than `undefined`:

```ts
  const responses: Response[] = (raw ?? []).map((r) => ({
    category_id: r.category_id,
    item_id: r.item_id,
    value: r.value,
    respondent_label: r.respondent_label,
    respondent_id: r.respondent_user_id ?? r.respondent_label,
  }))
```

This is slightly more than a field addition: today TypeScript does not check that cast against the RPC's real return shape at all, so the map is also what makes the new column's presence verifiable. Read the surrounding code first and match its existing typing style rather than pasting this verbatim.

- [ ] **Step 9: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/`
Expected: PASS. The five E2E fixtures still must not move.

- [ ] **Step 10: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · all green.

- [ ] **Step 11: Commit**

```bash
git add lib/engine/types.ts lib/engine/normalize.ts tests/engine/helpers.ts \
        tests/engine/normalize.test.ts \
        supabase/migrations/20260728000100_rpc_get_run_responses_add_user_id.sql \
        supabase/tests/11_get_run_responses_test.sql
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/actions.ts"
git commit -m "fix(engine): key respondents on identity so two unnamed members stop merging"
```

- [ ] **Step 12: Tell the owner the migration is pending**

Report explicitly: the migration file is written but **not applied**. Natalie must run `supabase db push` and `npm run test:db`. Until then the fallback (`?? r.respondent_label`) keeps the app running on the old RPC shape.

---

## Task 5: Calibration and deviation-based disagreement

Fitting each area independently lets a uniformly generous rater's *style* masquerade as area-specific disagreement. Two derived signals, not one (spec §4.2). This **replaces** `dispersionFor()`, which fires on raw spread and so reports a habitually harsh rater as conflict.

**Files:**
- Create: `lib/engine/calibration.ts`, `lib/engine/disagreement.ts`
- Delete: `lib/engine/dispersion.ts`, `tests/engine/dispersion.test.ts`
- Modify: `lib/engine/types.ts`, `lib/engine/assemble.ts`
- Test: `tests/engine/calibration.test.ts` (new), `tests/engine/disagreement.test.ts` (exists — rewrite)

**Interfaces:**
- Consumes: `AreaFit` (Task 2).
- Produces:
  ```ts
  // calibration.ts
  export interface Calibration {
    people: Array<{ respondent_id: string; style: number; areasCompleted: number }>
    spread: number // population stddev of style
  }
  export function calibrationFrom(fits: AreaFit[]): Calibration
  export function deviationsFor(fit: AreaFit, calibration: Calibration):
    Array<{ respondent_id: string; deviation: number }>

  // disagreement.ts
  export interface DisagreementFlag {
    category_id: string
    respondents: Array<{ label: string; mean: number }>
    spread: number // stddev of DEVIATION, 0..10 scale
  }
  export function disagreementFor(
    fit: AreaFit,
    calibration: Calibration,
    respondentMeans: Array<{ label: string; mean: number }>,
    threshold: number,
  ): DisagreementFlag | null
  ```

- [ ] **Step 1: Write the failing calibration test**

Create `tests/engine/calibration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calibrationFrom, deviationsFor } from '../../lib/engine/calibration';
import type { AreaFit } from '../../lib/engine/fit';

function fitOf(category_id: string, effects: Record<string, number>): AreaFit {
  return {
    category_id,
    mu: 5,
    n: Object.keys(effects).length,
    personEffects: Object.entries(effects).map(([respondent_id, effect]) => ({ respondent_id, effect })),
    questionEffects: [],
    excludedPartial: 0,
  };
}

describe('calibration', () => {
  it('style is the mean of a person effects across the areas they completed', () => {
    const c = calibrationFrom([
      fitOf('guest', { generous: 1.5, harsh: -1.5 }),
      fitOf('conn', { generous: 1.3, harsh: -1.3 }),
    ]);
    expect(c.people.find((p) => p.respondent_id === 'generous')!.style).toBeCloseTo(1.4, 10);
    expect(c.people.find((p) => p.respondent_id === 'harsh')!.style).toBeCloseTo(-1.4, 10);
    expect(c.people.find((p) => p.respondent_id === 'generous')!.areasCompleted).toBe(2);
  });

  it('averages only over areas the person actually completed', () => {
    const c = calibrationFrom([
      fitOf('guest', { a: 2, b: 0 }),
      fitOf('conn', { b: 0 }), // a did not complete conn
    ]);
    expect(c.people.find((p) => p.respondent_id === 'a')!.style).toBeCloseTo(2, 10);
    expect(c.people.find((p) => p.respondent_id === 'a')!.areasCompleted).toBe(1);
  });

  it('spread is the stddev of style', () => {
    const c = calibrationFrom([fitOf('guest', { a: 2, b: -2 })]);
    expect(c.spread).toBeCloseTo(2, 10);
  });

  it('a consistent rater deviates from their own style by zero', () => {
    const guest = fitOf('guest', { generous: 1.4, harsh: -1.4 });
    const c = calibrationFrom([guest, fitOf('conn', { generous: 1.4, harsh: -1.4 })]);
    const d = deviationsFor(guest, c);
    expect(d.find((x) => x.respondent_id === 'generous')!.deviation).toBeCloseTo(0, 10);
    expect(d.find((x) => x.respondent_id === 'harsh')!.deviation).toBeCloseTo(0, 10);
  });

  it('an area-specific opinion shows up as a non-zero deviation', () => {
    const vol = fitOf('vol', { generous: -2.6, harsh: -1.4 }); // generous suddenly harsh on vol
    const c = calibrationFrom([fitOf('guest', { generous: 1.4, harsh: -1.4 }), vol]);
    // generous style = (1.4 + -2.6) / 2 = -0.6 ; deviation on vol = -2.6 - -0.6 = -2.0
    expect(deviationsFor(vol, c).find((x) => x.respondent_id === 'generous')!.deviation)
      .toBeCloseTo(-2, 10);
  });

  it('returns an empty calibration for no fits', () => {
    const c = calibrationFrom([]);
    expect(c.people).toEqual([]);
    expect(c.spread).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine/calibration.test.ts`
Expected: FAIL — cannot resolve `../../lib/engine/calibration`.

- [ ] **Step 3: Implement calibration**

Create `lib/engine/calibration.ts`:

```ts
import type { AreaFit } from './fit';

export interface Calibration {
  people: Array<{ respondent_id: string; style: number; areasCompleted: number }>;
  spread: number; // population stddev of style
}

/**
 * A person's rating STYLE is the mean of their person effects across the areas
 * they completed — "rates +1.4 above the room on everything" (spec §4.2).
 *
 * Separating style from area-specific opinion is the whole point: without it a
 * habitually harsh rater looks like conflict in every single area. Still
 * closed-form — an average of already-computed per-area effects, not a joint refit.
 */
export function calibrationFrom(fits: AreaFit[]): Calibration {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const fit of fits) {
    for (const p of fit.personEffects) {
      const a = acc.get(p.respondent_id);
      if (a) {
        a.sum += p.effect;
        a.count++;
      } else {
        acc.set(p.respondent_id, { sum: p.effect, count: 1 });
      }
    }
  }

  const people = [...acc.entries()].map(([respondent_id, { sum, count }]) => ({
    respondent_id,
    style: sum / count,
    areasCompleted: count,
  }));

  if (people.length === 0) return { people, spread: 0 };
  const styles = people.map(p => p.style);
  const mean = styles.reduce((a, b) => a + b, 0) / styles.length;
  const variance = styles.reduce((a, s) => a + (s - mean) ** 2, 0) / styles.length;

  return { people, spread: Math.sqrt(variance) };
}

/**
 * deviation_ra = personEffect_ra - style_r — what is left after the person's
 * habitual generosity is removed. This is the ONLY quantity disagreement and
 * correlation may be computed on; raw area means correlate ~0.7 across all pairs
 * purely from rater generosity (common-method variance).
 */
export function deviationsFor(
  fit: AreaFit,
  calibration: Calibration,
): Array<{ respondent_id: string; deviation: number }> {
  const style = new Map(calibration.people.map(p => [p.respondent_id, p.style]));
  return fit.personEffects.map(p => ({
    respondent_id: p.respondent_id,
    deviation: p.effect - (style.get(p.respondent_id) ?? 0),
  }));
}
```

- [ ] **Step 4: Run the calibration tests**

Run: `npx vitest run tests/engine/calibration.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Rewrite the disagreement test**

`tests/engine/disagreement.test.ts` already exists. Replace it wholesale. Spec §9.7 requires the changed `spread` assertion to carry its reason **in the test** — so it stays a numeric assertion with the arithmetic written beside it (`toBeCloseTo(4.38, 2)` below), never a loose bound. The suite is **4** tests, and the fourth is the one that discriminates the new behaviour from the old:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from './helpers';
import { normalize } from '../../lib/engine/normalize';
import { calibrationFrom } from '../../lib/engine/calibration';
import { disagreementFor } from '../../lib/engine/disagreement';

describe('disagreement is measured after rater style is removed', () => {
  const methodology = loadFixtureMethodology();

  it('does NOT flag a uniformly harsh rater as conflict', () => {
    // Elder rates every area 3 points below the pastor. Under the old
    // dispersionFor() this raw spread fired on all eight areas and reported a
    // habitually harsh rater as disagreement. Style is constant, so every
    // deviation is zero and nothing is flagged.
    const rows = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'].flatMap((id) => [
      ...answers(methodology, id, 8, 'Pastor', 'u-pastor'),
      ...answers(methodology, id, 5, 'Elder', 'u-elder'),
    ]);
    const normalized = normalize(rows, methodology);
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));

    for (const norm of normalized.values()) {
      expect(disagreementFor(norm.fit, calibration, norm.respondentMeans, 2.0)).toBeNull();
    }
  });

  it('DOES flag one area where the same two people genuinely diverge', () => {
    const rows = [
      ...['guest', 'conn', 'disc', 'gen', 'gov', 'comm', 'sys'].flatMap((id) => [
        ...answers(methodology, id, 8, 'Pastor', 'u-pastor'),
        ...answers(methodology, id, 5, 'Elder', 'u-elder'),
      ]),
      // vol inverts: the elder rates it far above the pastor
      ...answers(methodology, 'vol', 2, 'Pastor', 'u-pastor'),
      ...answers(methodology, 'vol', 9, 'Elder', 'u-elder'),
    ];
    const normalized = normalize(rows, methodology);
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));

    const vol = normalized.get('vol')!;
    const flag = disagreementFor(vol.fit, calibration, vol.respondentMeans, 2.0);
    expect(flag).not.toBeNull();
    expect(flag!.category_id).toBe('vol');
    // The EXACT value, not a bound. `flag !== null` already entails spread >= 2.0
    // (Step 7 returns null when stddev < threshold), so a >= 2.0 assertion cannot
    // fail. 4.38 is what the deviation path produces and what the OLD raw-effect
    // path cannot: person effects on vol are -3.5/+3.5, both rating styles are
    // +-0.875, so deviations are -4.375/+4.375 -> stddev 4.375 -> 4.38.
    // An implementation that ignores `calibration` yields 3.5 and fails here.
    expect(flag!.spread).toBeCloseTo(4.38, 2);
    expect(flag!.respondents.map((r) => r.label).sort()).toEqual(['Elder', 'Pastor']);

    const guest = normalized.get('guest')!;
    expect(disagreementFor(guest.fit, calibration, guest.respondentMeans, 2.0)).toBeNull();
  });

  it('returns null below two complete respondents', () => {
    const rows = answers(methodology, 'vol', 5, 'Pastor', 'u-pastor');
    const normalized = normalize(rows, methodology);
    const vol = normalized.get('vol')!;
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));
    expect(disagreementFor(vol.fit, calibration, vol.respondentMeans, 2.0)).toBeNull();
  });

  it('does NOT flag a raw spread that is entirely rating style', () => {
    // The discriminating case. Pastor 9 / Elder 3 on all eight areas gives raw
    // person-effect stddev 3.0 — above the 2.0 threshold, so the OLD dispersionFor()
    // would flag all eight areas. Style is constant, so every deviation is 0 and
    // deviation stddev is 0. Without this test the whole suite passes against an
    // implementation whose body is stddev(fit.personEffects.map(p => p.effect)) —
    // i.e. exactly the behaviour Task 5 exists to replace.
    const rows = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'].flatMap((id) => [
      ...answers(methodology, id, 9, 'Pastor', 'u-pastor'),
      ...answers(methodology, id, 3, 'Elder', 'u-elder'),
    ]);
    const normalized = normalize(rows, methodology);
    const calibration = calibrationFrom([...normalized.values()].map((n) => n.fit));

    for (const norm of normalized.values()) {
      expect(disagreementFor(norm.fit, calibration, norm.respondentMeans, 2.0)).toBeNull();
    }
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run tests/engine/disagreement.test.ts`
Expected: FAIL — cannot resolve `../../lib/engine/disagreement`.

- [ ] **Step 7: Implement disagreement**

Create `lib/engine/disagreement.ts`:

```ts
import type { AreaFit } from './fit';
import type { Calibration } from './calibration';
import { deviationsFor } from './calibration';

export interface DisagreementFlag {
  category_id: string;
  respondents: Array<{ label: string; mean: number }>;
  spread: number; // population stddev of DEVIATION, 0..10 scale
}

/**
 * Replaces dispersionFor(). The old version took the stddev of raw respondent
 * means, so a habitually harsh rater was reported as conflict in every area.
 * This takes the stddev of deviation — person effect with the person's own
 * rating style removed — so it fires only on genuine area-specific divergence
 * (spec §4.2).
 *
 * respondents is display data and stays keyed on LABEL: it is the screen-only
 * name-to-score list, and pdf/shared strip it (lib/report/view.ts).
 */
export function disagreementFor(
  fit: AreaFit,
  calibration: Calibration,
  respondentMeans: Array<{ label: string; mean: number }>,
  threshold: number,
): DisagreementFlag | null {
  if (fit.n <= 1) return null;

  const devs = deviationsFor(fit, calibration).map(d => d.deviation);
  const mean = devs.reduce((a, b) => a + b, 0) / devs.length;
  const variance = devs.reduce((a, d) => a + (d - mean) ** 2, 0) / devs.length;
  const stddev = Math.sqrt(variance);
  if (stddev < threshold) return null;

  return {
    category_id: fit.category_id,
    respondents: respondentMeans.map(m => ({ label: m.label, mean: m.mean })),
    spread: Math.round(stddev * 100) / 100,
  };
}
```

- [ ] **Step 8: Swap the type and wire assemble**

In `lib/engine/types.ts`, replace the `DispersionFlag` interface with a re-export and keep the old name as an alias so the report layer compiles until Task 13 renames it:

```ts
export type { DisagreementFlag } from './disagreement';
/** @deprecated use DisagreementFlag — kept until the report layer is reshaped (Task 13). */
export type DispersionFlag = import('./disagreement').DisagreementFlag;
```

In `lib/engine/assemble.ts`:
- replace `import { dispersionFor } from './dispersion';` with
  `import { disagreementFor } from './disagreement';` and
  `import { calibrationFrom, type Calibration } from './calibration';`
- before the category loop, build the calibration once:
  ```ts
  const calibration = calibrationFrom(
    methodology.questions.categories.map(c => normalized.get(c.id)!.fit),
  );
  ```
- inside the loop, replace `const disp = dispersionFor(norm, t.dispersion);` with:
  ```ts
    const disp = disagreementFor(norm.fit, calibration, norm.respondentMeans, t.dispersion);
  ```
- add `calibration` to the returned `Diagnosis` (the field is declared in Task 7; if running strictly in order, add the field to `Diagnosis` here as `calibration: Calibration` and return it).

Delete the old module and its test:

```bash
git rm lib/engine/dispersion.ts tests/engine/dispersion.test.ts
```

- [ ] **Step 9: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/`
Expected: PASS. The five E2E fixtures use one respondent per area or agreeing respondents, so no dispersion flag they assert should change — **if one does, stop and report it** rather than editing the fixture.

- [ ] **Step 10: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · all green.

- [ ] **Step 11: Commit**

```bash
git add lib/engine/calibration.ts lib/engine/disagreement.ts lib/engine/types.ts \
        lib/engine/assemble.ts tests/engine/calibration.test.ts tests/engine/disagreement.test.ts
git commit -m "feat(engine): separate rating style from real disagreement"
```

---

## Task 6: Throughput, capacity and gap

**Files:**
- Create: `lib/engine/throughput.ts`
- Modify: `methodology/rules.yaml`, `lib/methodology/schema.ts`
- Test: `tests/engine/throughput.test.ts` (new), `tests/methodology/*` (existing schema test may need the new key)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function throughput(chainScores: number[], minWeight: number): number
  export function capacity(allScores: number[]): number
  export function gap(capacityValue: number, throughputValue: number): number
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/engine/throughput.test.ts`. These pin the judgement calls by name (spec §9.4):

```ts
import { describe, it, expect } from 'vitest';
import { throughput, capacity, gap } from '../../lib/engine/throughput';

const W = 0.85;

describe('throughput', () => {
  it('pins the worked example from the spec', () => {
    // guest 85 · conn 80 · disc 73 · vol 48 · gen 92
    // 0.85 * 48 + 0.15 * 75.6 = 40.8 + 11.34 = 52.14 -> 52
    expect(throughput([85, 80, 73, 48, 92], W)).toBe(52);
  });

  it('is monotone — raising any stage never lowers throughput', () => {
    const base = [85, 80, 73, 48, 92];
    for (let i = 0; i < base.length; i++) {
      for (const bump of [1, 5, 20, 52]) {
        const raised = base.slice();
        raised[i] = Math.min(100, raised[i]! + bump);
        expect(throughput(raised, W)).toBeGreaterThanOrEqual(throughput(base, W));
      }
    }
  });

  it('rewards fixing the bottleneck about 10x more than polishing a strength', () => {
    const base = [85, 80, 73, 48, 92];
    const fixed = throughput([85, 80, 73, 70, 92], W) - throughput(base, W); // vol 48 -> 70
    const polished = throughput([100, 95, 88, 48, 100], W) - throughput(base, W);
    // base:     min 48, mean 75.6 -> 0.85*48 + 0.15*75.6 = 52.14 -> 52
    // fixed:    min 70, mean 80.0 -> 0.85*70 + 0.15*80.0 = 71.50 -> 72   (delta 20)
    // polished: min 48, mean 86.2 -> 0.85*48 + 0.15*86.2 = 53.73 -> 54   (delta  2)
    expect(fixed).toBe(20);
    expect(polished).toBe(2);
    expect(fixed).toBeGreaterThan(polished * 9); // 20 > 18; the sibling test below bounds polished at <= 2
  });

  it('never pays for polishing strengths the way a harmonic mean would', () => {
    // The harmonic mean of the base chain is ~72 and rises to ~77 when only the
    // strengths improve — a +5 reward for ignoring the bottleneck, contradicting
    // the report's own "do not work on the faded stages yet". This must stay <= 2.
    const base = [85, 80, 73, 48, 92];
    expect(throughput([100, 95, 88, 48, 100], W) - throughput(base, W)).toBeLessThanOrEqual(2);
  });

  it('needs no special case when nothing is broken', () => {
    expect(throughput([90, 90, 90, 90, 90], W)).toBe(90);
  });

  it('returns 0 for an empty chain', () => {
    expect(throughput([], W)).toBe(0);
  });
});

describe('capacity and gap', () => {
  it('capacity is the mean of all eight area scores', () => {
    expect(capacity([85, 80, 73, 48, 92, 74, 81, 79])).toBe(77);
  });

  it('gap is capacity minus throughput', () => {
    expect(gap(77, 52)).toBe(25);
  });

  it('ranks a bottlenecked strong church above a uniformly weak one', () => {
    // The inversion hazard from spec §3: a pure gap ratio ranks these backwards.
    const weak = throughput([40, 40, 40, 40, 40], W);
    const bottlenecked = throughput([85, 80, 73, 48, 92], W);
    expect(bottlenecked).toBeGreaterThan(weak);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine/throughput.test.ts`
Expected: FAIL — cannot resolve `../../lib/engine/throughput`.

- [ ] **Step 3: Implement**

Create `lib/engine/throughput.ts`:

```ts
/**
 * Throughput is the single focal number on the cover (spec §3 decision 3/4).
 *
 *   throughput = minWeight * min(chain) + (1 - minWeight) * mean(chain)
 *
 * Chosen over a harmonic mean, which pays a church for polishing strengths while
 * the bottleneck is untouched, and over a pure chain minimum, which pays nothing
 * for real progress in four of five areas. The blend moves ~20:1 in favour of
 * fixing the bottleneck yet still rises whenever anything improves, and needs no
 * special case when no stage is broken.
 *
 * One-line explanation for the report: "85% of your throughput is set by your
 * weakest stage; the rest of the chain earns the other 15%."
 *
 * minWeight comes from rules.yaml (throughput.min_weight) — it is methodology,
 * not a magic number in code.
 */
export function throughput(chainScores: number[], minWeight: number): number {
  if (chainScores.length === 0) return 0;
  const min = Math.min(...chainScores);
  const mean = chainScores.reduce((a, b) => a + b, 0) / chainScores.length;
  return Math.round(minWeight * min + (1 - minWeight) * mean);
}

/**
 * Capacity is the equally-weighted mean of ALL area scores, enablers included
 * (spec §3 decision 5). Identical to what `overall_score` used to be.
 *
 * Areas are weighted equally regardless of item count. All eight categories have
 * five items today, but CategorySchema only requires .min(1), so this must never
 * be re-expressed as a mean over items.
 */
export function capacity(allScores: number[]): number {
  if (allScores.length === 0) return 0;
  return Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
}

/** "You are running a 77% church through a 52% pipe." */
export function gap(capacityValue: number, throughputValue: number): number {
  return capacityValue - throughputValue;
}
```

- [ ] **Step 4: Put the constant in the methodology**

In `methodology/rules.yaml`, add after the `generosity:` block:

```yaml
throughput:
  min_weight: 0.85
```

In `lib/methodology/schema.ts`, add to `RulesSchema` (after `generosity`):

```ts
  throughput: z.object({
    min_weight: z.number().min(0).max(1),
  }),
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/throughput.test.ts tests/methodology/`
Expected: PASS.

- [ ] **Step 6: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · all green.

- [ ] **Step 7: Commit**

```bash
git add lib/engine/throughput.ts tests/engine/throughput.test.ts \
        methodology/rules.yaml lib/methodology/schema.ts
git commit -m "feat(engine): throughput, capacity and gap as the cover numbers"
```

---

## Task 7: Rename `overall_score`, do not redefine it

`overall_score` means the 8-area mean and is about to mean throughput. Silently changing what a field means is the dangerous option — every consumer keeps compiling while reading the wrong number (spec §5.1). **Delete it** so the typechecker enumerates every consumer.

**Files:**
- Modify: `lib/engine/types.ts`, `lib/engine/assemble.ts`, `lib/report/view.ts`, `lib/report/pdf/document.tsx`, `app/r/[shareToken]/page.tsx`, `app/app/[churchId]/diagnosis/report.tsx`, `app/app/[churchId]/diagnosis/page.tsx`, `methodology/rules.yaml`, `methodology/questions.yaml`
- Test: `tests/engine/diagnose.test.ts` and the five E2E fixtures; `tests/report/*`; `tests/ai/*`

**Interfaces:**
- Consumes: `throughput`, `capacity`, `gap` (Task 6); `Calibration` (Task 5).
- Produces: `Diagnosis` loses `overall_score` and gains `throughput: number`, `capacity: number`, `gap: number`, `calibration: Calibration`.

- [ ] **Step 1: Delete the field and add the three**

In `lib/engine/types.ts`:

```ts
export interface Diagnosis {
  methodology_version: string;
  throughput: number; // the cover number — 0.85*min(chain) + 0.15*mean(chain)
  capacity: number;   // 8-area mean — what overall_score used to be
  gap: number;        // capacity - throughput
  categories: DiagnosisCategory[];
  primary_constraint: { category_id: string } | null;
  contributing: string[];
  do_not_work_on: DoNotWorkOn[];
  gating_conditions: GatingCondition[];
  generosity_mode: GenerosityMode;
  blind_spots: BlindSpot[];
  dispersion_flags: DispersionFlag[]; // renamed to disagreement_flags in Task 13 Step 5
  calibration: Calibration;
  offer: Offer;
  confidence: number;
  evidence_trail: EvidenceReceipt[];
  // Tasks 9 and 11 each append one more field to this interface:
  //   dependencies: DependencyEdge[];          (Task 9 Step 6)
  //   correlations: CorrelationAnnotation[];   (Task 11 Step 6)
  // Both are in the plan's Modified-files table; neither exists yet at Task 7 time.
}
```

Add `import type { Calibration } from './calibration';` at the top.

- [ ] **Step 2: Run the typechecker to enumerate every consumer**

Run: `npm run typecheck`
Expected: FAIL, with one error per consumer. **Write the list down** — this is the point of the rename. Expect at minimum: `lib/engine/assemble.ts`, `lib/report/view.ts`, `lib/report/pdf/document.tsx`, `app/r/[shareToken]/page.tsx`, `app/app/[churchId]/diagnosis/report.tsx`, `app/app/[churchId]/diagnosis/page.tsx`, plus tests. **`lib/ai/fallback.ts` will NOT appear** — verified against the tree, it never reads `overall_score`.

- [ ] **Step 3: Fix assemble**

In `lib/engine/assemble.ts`, replace the `overall_score` computation:

```ts
  const chainScores = methodology.rules.chain.map(id => scores.get(id) ?? 0);
  const capacityValue = capacity([...scores.values()]);
  const throughputValue = throughput(chainScores, methodology.rules.throughput.min_weight);
```

and in the returned object replace `overall_score,` with:

```ts
    throughput: throughputValue,
    capacity: capacityValue,
    gap: gap(capacityValue, throughputValue),
    calibration,
```

Add `import { throughput, capacity, gap } from './throughput';`.

- [ ] **Step 4: Fix `computeConfidence` to read per-area N**

N now varies by area (spec §4.7). `computeConfidence` keeps its shape but must read the constraint area's N. In `lib/engine/assemble.ts`, `DiagnosisCategory.respondent_count` is what it already reads — change where that value comes from in the category push (line ~174) so it is the fit's N, not the label-keyed count:

```ts
      respondent_count: norm.fit.n,
```

- [ ] **Step 5: Fix `lib/report/view.ts`**

Replace `overallScore: d.overall_score,` with the three fields. The full `cover` reshape lands in Task 13; for now the minimum that compiles and keeps meaning honest:

```ts
  throughput: d.throughput,
  capacity: d.capacity,
  gap: d.gap,
```

and change the `ReportView` interface field `overallScore: number` to those same three. There are **four** render sites, not three — update `app/app/[churchId]/diagnosis/report.tsx` `VerdictHeader`, `app/app/[churchId]/diagnosis/page.tsx:99` (`overallScore={view.overallScore}`, the same pattern as the share page and easy to miss because the typecheck error surfaces in a file this task's Files list would otherwise omit), `lib/report/pdf/document.tsx` and `app/r/[shareToken]/page.tsx` to read `view.throughput` where they read `view.overallScore` — **and confirm by eye that each site wants throughput, not capacity.** A site that was showing "overall health" as the 8-area mean should now show `throughput` on the cover; if any site is really reporting capacity, use `capacity` there.

- [ ] **Step 6: Sweep for any remaining consumer**

`lib/ai/fallback.ts` needs **no change in this task** — verified against the tree, it reads `primary_constraint`, `categories`, `evidence_trail`, `blind_spots`, `do_not_work_on`, `gating_conditions`, `dispersion_flags` and `offer.hook`, and no score field of any kind. (It does consume `dispersion_flags`, so it is touched by Task 13 Step 5's rename — not here.) Do not go hunting for an error there.

Instead, sweep the whole tree and replace anything left with the field that carries the meaning that call site intended. Do not blanket-replace with `throughput`.

```bash
grep -rn "overall_score\|overallScore" lib app tests
```

Expected after this step: **zero hits** outside a comment explaining the rename.

- [ ] **Step 7: Bump the methodology version**

Cached `diagnoses.payload` rows all carry `overall_score` and no `throughput`; rendering one through the new components would produce a blank cover and eight empty dossiers (spec §5.4). Bump the version so the mismatch is detectable.

In `methodology/questions.yaml` and `methodology/rules.yaml`, change `version: "0.1.0"` to `version: "0.2.0"`.

- [ ] **Step 8: Update the tests**

Every fixture asserting `overall_score` now asserts `capacity` (same number, same meaning) and gains a `throughput` assertion. For `tests/engine/healthy-church.test.ts` etc., add alongside the existing assertion:

```ts
    expect(d.capacity).toBe(/* the number overall_score used to assert */);
    expect(d.throughput).toBe(/* compute: round(0.85*min(chain) + 0.15*mean(chain)) */);
```

Do **not** guess the throughput number — run the fixture, read the actual value, verify by hand that it equals `Math.round(0.85 * min + 0.15 * mean)` of that fixture's chain scores, then write it in. If the hand calculation disagrees with the code, the code is wrong.

- [ ] **Step 9: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · all green. The five fixtures' **scores and primary constraints must still be unchanged**.

- [ ] **Step 10: Commit**

```bash
git add lib/engine/types.ts lib/engine/assemble.ts lib/report/view.ts \
        lib/report/pdf/document.tsx \
        methodology/rules.yaml methodology/questions.yaml tests/
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/report.tsx" \
        "app/app/[churchId]/diagnosis/page.tsx" "app/r/[shareToken]/page.tsx"
git commit -m "feat(engine)!: replace overall_score with throughput/capacity/gap"
```

---

## Task 8: The diagnosis gate

Today's gate checks that every *item* has ≥1 response from *anyone*. Under the 5-of-5 rule that is satisfiable while **zero people completed any area**, producing a report with nothing scoreable (spec §4.6).

**Files:**
- Modify: `app/app/[churchId]/actions.ts:28`, `app/app/[churchId]/page.tsx:202, 213-214`
- Create: `lib/coverage/diagnosis-gate.ts`
- Test: `tests/coverage/diagnosis-gate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface GateResult { ok: boolean; blockedAreas: string[] }
  export function diagnosisGate(
    normalized: Map<string, NormalizedCategory>,
    categories: Category[],
  ): GateResult
  ```

> **⚠️ Corrected 2026-07-27 — verified against base `c6960f3`.** An earlier revision of this
> note claimed two "spec drifts." **Both were false** — measured against a local `master` that
> was 18 PRs stale. The spec was right. Do not re-introduce `actions.ts:73` or `page.tsx:134-146`.
>
> | retracted claim | verified truth on `c6960f3` |
> |---|---|
> | ~~gate is at `actions.ts:73`~~ | the gate **is** at **`app/app/[churchId]/actions.ts:28`** — `if (coverage(rows, categories).coveredCount !== categories.length)` |
> | ~~`lib/coverage/assessment-cta.ts` does not exist~~ | it **exists** — a pure, separately-tested `assessmentCta(result, categories)` |
>
> **But read this before Step 5 — `assessment-cta.ts` is NOT this task's target.** That file
> governs the *member-facing whole-assessment* CTA (Start / Continue / Take Again). Task 8 is
> about the **admin "Generate diagnosis" button**, which is a *separate*, inline
> `result.coveredCount === categories.length` check at **`page.tsx:202`**, with its disabled
> reason at **`page.tsx:213-214`**. Change it there. Leave `assessment-cta.ts` alone — the
> spec's mention of it names the wrong file for this particular gate.

- [ ] **Step 1: Write the failing test**

Create `tests/coverage/diagnosis-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from '../engine/helpers';
import { normalize } from '../../lib/engine/normalize';
import { diagnosisGate } from '../../lib/coverage/diagnosis-gate';

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

describe('diagnosisGate', () => {
  const methodology = loadFixtureMethodology();
  const cats = methodology.questions.categories;

  it('passes when every area has at least one complete respondent', () => {
    const rows = ALL.flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-1'));
    expect(diagnosisGate(normalize(rows, methodology), cats)).toEqual({ ok: true, blockedAreas: [] });
  });

  it('blocks the area where every item is answered but nobody finished it', () => {
    // Five different people each answer exactly one item of vol. Old gate: PASS
    // (every item has a response). New gate: BLOCKED (nobody completed the area).
    const volItems = cats.find((c) => c.id === 'vol')!.items.map((it) => it.id);
    const rows = [
      ...ALL.filter((id) => id !== 'vol').flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-1')),
      ...volItems.flatMap((itemId, i) =>
        partialAnswers(methodology, 'vol', [itemId], 6, `P${i}`).map((r) => ({
          ...r,
          respondent_id: `u-p${i}`,
        })),
      ),
    ];
    const result = diagnosisGate(normalize(rows, methodology), cats);
    expect(result.ok).toBe(false);
    expect(result.blockedAreas).toEqual(['vol']);
  });

  it('lists every blocked area, not just the first', () => {
    const rows = ['guest', 'conn'].flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-1'));
    const result = diagnosisGate(normalize(rows, methodology), cats);
    expect(result.ok).toBe(false);
    expect(result.blockedAreas).toEqual(['disc', 'vol', 'gen', 'gov', 'comm', 'sys']);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/coverage/diagnosis-gate.test.ts`
Expected: FAIL — cannot resolve `../../lib/coverage/diagnosis-gate`.

- [ ] **Step 3: Implement**

Create `lib/coverage/diagnosis-gate.ts`:

```ts
import type { Category } from '@/lib/methodology/schema';
import type { NormalizedCategory } from '@/lib/engine/types';

export interface GateResult {
  ok: boolean;
  blockedAreas: string[];
}

/**
 * The diagnosis gate under the 5-of-5 rule (spec §4.6).
 *
 * The previous gate — coverage(rows).coveredCount === categories.length — checked
 * that every ITEM had at least one response from ANYONE. That is satisfiable while
 * zero people completed any area, which would produce a report with nothing
 * scoreable. Every area now needs n >= 1: at least one fully-covered respondent.
 */
export function diagnosisGate(
  normalized: Map<string, NormalizedCategory>,
  categories: Category[],
): GateResult {
  const blockedAreas = categories
    .filter(cat => (normalized.get(cat.id)?.fit.n ?? 0) < 1)
    .map(cat => cat.id);
  return { ok: blockedAreas.length === 0, blockedAreas };
}
```

- [ ] **Step 4: Move the gate in `actions.ts`**

The gate currently runs on `get_run_coverage` rows *before* responses are fetched. It must now run on the normalized responses. In `app/app/[churchId]/actions.ts`, delete the `coverage(...)` gate at **line 28** — the `if (coverage(rows, categories).coveredCount !== categories.length)` block, together with the `get_run_coverage` RPC call above it that exists only to feed it — and re-gate after `normalize()`:

```ts
  const normalized = normalize(responses, methodology)
  const gate = diagnosisGate(normalized, categories)
  if (!gate.ok) {
    const names = gate.blockedAreas
      .map((id) => categories.find((c) => c.id === id)?.name ?? id)
      .join(', ')
    return {
      ok: false,
      error: `Every area needs at least one person who answered all its questions. Still waiting on: ${names}.`,
    }
  }
```

`generateDiagnosis` currently calls `diagnose(responses, ...)`, which normalizes internally. Either call `normalize` then `assemble` directly here, or add an optional pre-normalized path. Prefer calling `normalize` + `assemble` at this call site so the gate and the diagnosis share one normalization pass — read the current body before choosing. Remove the now-unused `coverage` / `CoverageRow` imports if nothing else in the file uses them.

- [ ] **Step 5: Fix the dashboard CTA**

`app/app/[churchId]/page.tsx:202` gates the admin "Generate diagnosis" button on `result.coveredCount === categories.length`, and lines 213-214 render the disabled reason (`Answer all 8 areas first — N of 8`). That is now the wrong condition — it would enable a button that the server action rejects. This page reads coverage RPCs, not raw responses, so it cannot compute `fit.n` directly.

Note this is **not** `assessmentCta()` (page.tsx:90) — that is the separate member-facing Start/Continue/Take-Again CTA and is **not** in scope for this task. Do not modify `lib/coverage/assessment-cta.ts`.

Read the page first. Take whichever of these fits what the page already fetches:
- **(a)** the page already fetches per-member coverage — `supabase.rpc('get_member_run_coverage')` at `page.tsx:83-86`, admin-only, feeding `ctaResult`. Derive "areas with ≥1 fully-covered member" from that data — `classify(answeredCount, total)` in `lib/coverage/coverage.ts` returns `'covered'` exactly when complete, which is the same rule;
- **(b)** otherwise add the `get_run_responses` call to the page and use `diagnosisGate`.

Prefer (a) — the spec (§3 rationale) states the rule is *"count a person in an area iff their `buildMemberMatrix` cell is already green"*, so the matrix is the intended source, and the RPC is already being called on this page. Mind the distinction the page already draws: `result` is church-wide coverage, `ctaResult` is the admin's own per-member coverage. The new gate needs *per-member* data (does any single person have all 5 in each area), which is what `get_member_run_coverage` returns. Update the disabled-reason copy at lines 213-214 to match the server action's message.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/coverage/ tests/engine/`
Expected: PASS.

- [ ] **Step 7: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck 0 · lint 0 · all green.

- [ ] **Step 8: Commit**

```bash
git add lib/coverage/diagnosis-gate.ts tests/coverage/diagnosis-gate.test.ts
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/actions.ts" "app/app/[churchId]/page.tsx"
git commit -m "fix(coverage): gate diagnosis on every area having a complete respondent"
```

---

## Task 9: The authored dependency map (structure)

13 edges: four sequential from `chain`, nine from `enablers.gates` (`gov` → all five stages, `comm` → `guest`/`conn`, `sys` → `vol`/`disc`). Those derive **structurally** — the code ships the structure, not the claims (spec §6.1, §10).

**Files:**
- Create: `lib/engine/dependencies.ts`
- Modify: `lib/methodology/schema.ts`, `methodology/rules.yaml`, `lib/engine/types.ts`, `lib/engine/assemble.ts`
- Test: `tests/engine/dependencies.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type EdgeKind = 'sequence' | 'gate'
  export type EdgeRead = 'load_bearing' | 'clear' | 'at_risk' | 'both_strong'
  export interface DependencyEdge {
    from: string; to: string; kind: EdgeKind; statement: string; read: EdgeRead
    fromScore: number; toScore: number
  }
  export function structuralEdges(rules: Rules): Array<{ from: string; to: string; kind: EdgeKind }>
  export function readDependencies(
    rules: Rules, scores: Map<string, number>, breakThreshold: number,
  ): DependencyEdge[]
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/engine/dependencies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology } from './helpers';
import { structuralEdges, readDependencies } from '../../lib/engine/dependencies';

describe('dependency map', () => {
  const methodology = loadFixtureMethodology();
  const rules = methodology.rules;

  it('derives exactly 13 edges from chain + enablers.gates', () => {
    const edges = structuralEdges(rules);
    expect(edges).toHaveLength(13);
    expect(edges.filter((e) => e.kind === 'sequence')).toHaveLength(4);
    expect(edges.filter((e) => e.kind === 'gate')).toHaveLength(9);
  });

  it('expands gates: all to every chain stage', () => {
    const gov = structuralEdges(rules).filter((e) => e.from === 'gov');
    expect(gov.map((e) => e.to)).toEqual(['guest', 'conn', 'disc', 'vol', 'gen']);
  });

  it('derives the sequential edges in chain order', () => {
    const seq = structuralEdges(rules).filter((e) => e.kind === 'sequence');
    expect(seq.map((e) => `${e.from}->${e.to}`)).toEqual([
      'guest->conn', 'conn->disc', 'disc->vol', 'vol->gen',
    ]);
  });

  it('reads weak upstream + weak downstream as load-bearing', () => {
    const scores = new Map([['sys', 30], ['vol', 40], ['disc', 40]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('load_bearing');
  });

  it('reads strong upstream + weak downstream as clear — the dependency is not the explanation', () => {
    // vol must be BELOW breakThreshold 45 for "weak downstream" to hold. The spec's
    // narrative example uses 48, but 48 > 45, so that pair is the fourth branch
    // (both_strong), not `clear`. Do not "fix" readEdge() to make 48 clear — its
    // four branches match spec §6.1's table exactly.
    const scores = new Map([['sys', 74], ['vol', 40]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('clear');
  });

  it('reads strong upstream + strong downstream as both_strong — the unlisted fourth case', () => {
    const scores = new Map([['sys', 74], ['vol', 48]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('both_strong');
  });

  it('reads weak upstream + strong downstream as at risk', () => {
    const scores = new Map([['sys', 30], ['vol', 80]]);
    const edge = readDependencies(rules, scores, 45).find((e) => e.from === 'sys' && e.to === 'vol')!;
    expect(edge.read).toBe('at_risk');
  });

  it('carries the authored statement for every edge, never an invented one', () => {
    const scores = new Map(
      ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'].map((id) => [id, 60] as const),
    );
    // No `statement.length > 0` check here: DependencySchema declares
    // statement: z.string().min(1) and readDependencies throws on an edge with no
    // authored entry, so a zero-length statement fails methodology LOAD long before
    // this test runs. Restating an upstream guarantee is an unfailable assertion.
    for (const edge of readDependencies(rules, scores, 45)) {
      expect(edge.statement).not.toMatch(/TODO|TBD|\{|\}/);
    }
  });

  it('works at N=1 — it reads scores, never respondent counts', () => {
    const scores = new Map([['sys', 74], ['vol', 48]]);
    expect(readDependencies(rules, scores, 45).length).toBe(13);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine/dependencies.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Add the schema**

In `lib/methodology/schema.ts`, add before `RulesSchema`:

```ts
export const DependencyEdgeKindSchema = z.enum(['sequence', 'gate']);

export const DependencySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: DependencyEdgeKindSchema,
  statement: z.string().min(1),
});
```

and inside `RulesSchema`, after `throughput`:

```ts
  dependencies: z.array(DependencySchema).length(13),
```

Add `export type Dependency = z.infer<typeof DependencySchema>;` alongside the other type exports. The `.length(13)` is deliberate: it makes a missing authored statement a **load-time failure**, not a blank line in a customer's report.

- [ ] **Step 4: Implement**

Create `lib/engine/dependencies.ts`:

```ts
import type { Rules } from '../methodology/schema';

export type EdgeKind = 'sequence' | 'gate';

/**
 * How this church's actual scores read against the edge (spec §6.1):
 *   load_bearing — weak -> weak: this dependency is active and costing you
 *   clear        — strong -> weak: the dependency is not the explanation; look elsewhere
 *   at_risk      — weak -> strong: downstream is running on borrowed time
 *   both_strong  — nothing to say
 */
export type EdgeRead = 'load_bearing' | 'clear' | 'at_risk' | 'both_strong';

export interface DependencyEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  statement: string;
  read: EdgeRead;
  fromScore: number;
  toScore: number;
}

/**
 * The 13 edges derive STRUCTURALLY from rules.yaml: four sequential from `chain`,
 * nine from `enablers.gates`. The structure ships with the code; the prose
 * statements are XPG methodology and live in rules.yaml (spec §10).
 */
export function structuralEdges(rules: Rules): Array<{ from: string; to: string; kind: EdgeKind }> {
  const edges: Array<{ from: string; to: string; kind: EdgeKind }> = [];

  for (let i = 0; i < rules.chain.length - 1; i++) {
    edges.push({ from: rules.chain[i]!, to: rules.chain[i + 1]!, kind: 'sequence' });
  }

  for (const [enablerId, cfg] of Object.entries(rules.enablers)) {
    const targets = cfg.gates === 'all' ? rules.chain : cfg.gates;
    for (const to of targets) edges.push({ from: enablerId, to, kind: 'gate' });
  }

  return edges;
}

function readEdge(fromScore: number, toScore: number, breakThreshold: number): EdgeRead {
  const fromWeak = fromScore < breakThreshold;
  const toWeak = toScore < breakThreshold;
  if (fromWeak && toWeak) return 'load_bearing';
  if (!fromWeak && toWeak) return 'clear';
  if (fromWeak && !toWeak) return 'at_risk';
  return 'both_strong';
}

/**
 * Deterministic and works at N=1 — it reads scores, never respondent counts.
 * This is what lets the constraint section say where NOT to spend, backed by
 * structure: "Systems (74) gates Volunteers (48). Systems is holding — so systems
 * is not what's capping your volunteers."
 */
export function readDependencies(
  rules: Rules,
  scores: Map<string, number>,
  breakThreshold: number,
): DependencyEdge[] {
  const authored = new Map(rules.dependencies.map(d => [`${d.from}->${d.to}`, d]));

  return structuralEdges(rules).map(e => {
    const key = `${e.from}->${e.to}`;
    const d = authored.get(key);
    if (!d) throw new Error(`dependencies: no authored statement for edge "${key}"`);
    const fromScore = scores.get(e.from) ?? 0;
    const toScore = scores.get(e.to) ?? 0;
    return {
      from: e.from,
      to: e.to,
      kind: e.kind,
      statement: d.statement,
      read: readEdge(fromScore, toScore, breakThreshold),
      fromScore,
      toScore,
    };
  });
}
```

- [ ] **Step 5: Add placeholder statements so the schema loads**

Task 10 replaces these with owner-authored prose. So the suite can run now, add all 13 to `methodology/rules.yaml` with a **loud** marker:

```yaml
# DEPENDENCY STATEMENTS ARE XPG METHODOLOGY (spec §10).
# The `statement` values below are PLACEHOLDERS pending Natalie's authoring — see
# Task 10 of docs/superpowers/plans/2026-07-27-diagnosis-report-reform.md.
# DO NOT SHIP TO A CUSTOMER WITH THESE IN PLACE.
dependencies:
  - { from: guest, to: conn,  kind: sequence, statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: conn,  to: disc,  kind: sequence, statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: disc,  to: vol,   kind: sequence, statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: vol,   to: gen,   kind: sequence, statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: gov,   to: guest, kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: gov,   to: conn,  kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: gov,   to: disc,  kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: gov,   to: vol,   kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: gov,   to: gen,   kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: comm,  to: guest, kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: comm,  to: conn,  kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: sys,   to: vol,   kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
  - { from: sys,   to: disc,  kind: gate,     statement: "PLACEHOLDER - awaiting XPG authoring" }
```

**No test edit is needed here.** Step 1's statement test already reads `expect(edge.statement).not.toMatch(/TODO|TBD|\{|\}/)`, and `"PLACEHOLDER - awaiting XPG authoring"` contains none of those tokens, so it passes as written — deliberately, so the suite can run before the prose exists. The real tightening (`not.toMatch(/PLACEHOLDER/)`) lands in **Task 10 Step 3**, backed by Task 18's `grep -rn "PLACEHOLDER..." methodology/` gate.

- [ ] **Step 6: Wire into assemble**

In `lib/engine/assemble.ts`, after `analyzeConstraint`:

```ts
  const dependencies = readDependencies(methodology.rules, scores, t.break);
```

and add `dependencies` to the returned object. Add `dependencies: DependencyEdge[]` to `Diagnosis` in `lib/engine/types.ts` with `import type { DependencyEdge } from './dependencies';`.

- [ ] **Step 7: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/`
Expected: PASS.

- [ ] **Step 8: Full gates + commit**

```bash
npm run typecheck && npm run lint && npm test
git add lib/engine/dependencies.ts lib/engine/types.ts lib/engine/assemble.ts \
        lib/methodology/schema.ts methodology/rules.yaml tests/engine/dependencies.test.ts
git commit -m "feat(engine): 13 authored dependency edges read against actual scores"
```

---

## Task 10 — CONTENT, OWNER-AUTHORED: the 13 dependency statements

**This task is not the implementer's to complete.** The statements are XPG methodology claims about how church health works. The implementation must not invent them (spec §10).

**Files:**
- Modify: `methodology/rules.yaml` (the `dependencies[].statement` values)
- Test: `tests/engine/dependencies.test.ts`

- [ ] **Step 1: Send the owner the list to author**

Present all 13 edges with their kind and ask for one prose sentence each, in the report's voice. Give her the one worked example from the spec so the register is clear:

> `sys → vol` (gate): *"Volunteer capacity is capped by the systems that schedule, track and support it."*

The 13: `guest→conn`, `conn→disc`, `disc→vol`, `vol→gen` (sequence); `gov→guest`, `gov→conn`, `gov→disc`, `gov→vol`, `gov→gen`, `comm→guest`, `comm→conn`, `sys→vol`, `sys→disc` (gate).

- [ ] **Step 2: Paste the authored statements into `rules.yaml`**

Replace every `PLACEHOLDER - awaiting XPG authoring` with the owner's text. Delete the `DO NOT SHIP` comment block.

- [ ] **Step 3: Add the guard that placeholders can never ship**

In `tests/engine/dependencies.test.ts`, tighten the statement test:

```ts
  it('has no placeholder statements left', () => {
    for (const d of methodology.rules.dependencies) {
      expect(d.statement).not.toMatch(/PLACEHOLDER|TODO|TBD/i);
      expect(d.statement.trim().length).toBeGreaterThan(20);
    }
  });
```

- [ ] **Step 4: Gates + commit**

```bash
npm run typecheck && npm run lint && npm test
git add methodology/rules.yaml tests/engine/dependencies.test.ts
git commit -m "content(methodology): author the 13 dependency edge statements"
```

**Blocking:** Task 15 (the DependencyMap component) may be built against placeholders, but the branch **must not merge** until this task closes.

---

## Task 11: Measured correlation annotation

Computed on `deviation_ra` from Task 5, **never** on raw area means (spec §6.2). Most churches will never reach N≥18 and will render the authored map with no annotations at all — that is the intended behaviour, not a degraded one.

**Files:**
- Create: `lib/engine/correlation.ts`
- Modify: `methodology/rules.yaml`, `lib/methodology/schema.ts`, `lib/engine/assemble.ts`, `lib/engine/types.ts`
- Test: `tests/engine/correlation.test.ts`

**Interfaces:**
- Consumes: `Calibration`, `deviationsFor` (Task 5); `AreaFit` (Task 2); `structuralEdges` (Task 9).
- Produces:
  ```ts
  export interface CorrelationAnnotation {
    from: string; to: string; r: number; n: number
    verdict: 'confirmed' | 'not_visible' | 'unexpected'
  }
  export function correlate(
    fits: AreaFit[], calibration: Calibration, rules: Rules,
  ): CorrelationAnnotation[]
  ```

- [ ] **Step 1: Add the thresholds to methodology**

`methodology/rules.yaml`:

```yaml
correlation:
  min_n: 18                 # ~80% power to distinguish r ~ 0.6 from zero
  min_areas_per_person: 4   # leave-two-out style must still rest on >= 2 areas
  practical_floor: 0.5      # |r| below this is not reported however significant
  max_unexpected: 2
  alpha: 0.05
```

`lib/methodology/schema.ts`, inside `RulesSchema`:

```ts
  correlation: z.object({
    min_n: z.number().int().min(2),
    min_areas_per_person: z.number().int().min(3),
    practical_floor: z.number().min(0).max(1),
    max_unexpected: z.number().int().min(0),
    alpha: z.number().min(0).max(1),
  }),
```

- [ ] **Step 2: Write the failing test**

Create `tests/engine/correlation.test.ts`. These are the statistical-trap regressions from spec §9.5 — each fails loudly if someone later "simplifies" the fix away:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology } from './helpers';
import { correlate, benjaminiHochberg } from '../../lib/engine/correlation';
import { calibrationFrom } from '../../lib/engine/calibration';
import type { AreaFit } from '../../lib/engine/fit';

const AREAS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

/** Deterministic pseudo-random in [-1, 1) — no Math.random, so runs are reproducible. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** Builds one AreaFit per area from a people x area effect table. */
function fitsFrom(table: Array<{ id: string; effects: Record<string, number> }>): AreaFit[] {
  return AREAS.map((category_id) => {
    const people = table.filter((p) => category_id in p.effects);
    return {
      category_id,
      mu: 5,
      n: people.length,
      personEffects: people.map((p) => ({ respondent_id: p.id, effect: p.effects[category_id]! })),
      questionEffects: [],
      excludedPartial: 0,
    };
  });
}

describe('correlation', () => {
  const rules = loadFixtureMethodology().rules;

  it('returns nothing below the N gate, and something at it', () => {
    const build = (count: number) => {
      const rnd = prng(7);
      const table = Array.from({ length: count }, (_, i) => ({
        id: `u${i}`,
        effects: Object.fromEntries(AREAS.map((a) => [a, rnd() * 2])) as Record<string, number>,
      }));
      const fits = fitsFrom(table);
      return correlate(fits, calibrationFrom(fits), rules);
    };
    expect(build(17)).toEqual([]);
    // 13 = the authored pairs (Task 9's 13 structural edges, deduplicated as
    // unordered pairs). Every authored pair emits an annotation once it clears the
    // N gate, regardless of significance. `.length >= 0` is unfailable — it passes
    // for `return []`, and for an off-by-one `if (n <= c.min_n) continue` that
    // renders annotations for no church, ever. Spec §9.4 pins BOTH halves by name.
    expect(build(18)).toHaveLength(13);
  });

  it('common-method variance: strong rating styles + independent areas => 0 confirmed edges', () => {
    // Every person has a strong constant style. Raw area-mean correlation lands
    // ~0.7 on all 28 pairs from generosity alone. The deviation path must see none.
    const rnd = prng(11);
    const table = Array.from({ length: 30 }, (_, i) => {
      const style = (i % 5) - 2; // -2..2, a strong habitual offset
      return {
        id: `u${i}`,
        effects: Object.fromEntries(AREAS.map((a) => [a, style + rnd() * 0.6])) as Record<string, number>,
      };
    });
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    expect(out.filter((c) => c.verdict === 'confirmed')).toEqual([]);
  });

  it('leave-two-out: people who completed exactly two areas are excluded', () => {
    // d_a = -d_b BY CONSTRUCTION for a two-area respondent — a guaranteed perfect
    // negative correlation that means nothing.
    const rnd = prng(13);
    const table = [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `full${i}`,
        effects: Object.fromEntries(AREAS.map((a) => [a, rnd()])) as Record<string, number>,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `two${i}`,
        effects: { guest: 2, conn: -2 } as Record<string, number>,
      })),
    ];
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    const guestConn = out.find((c) => c.from === 'guest' && c.to === 'conn');
    expect(guestConn?.verdict).not.toBe('confirmed');
    expect(guestConn?.n ?? 0).toBeLessThanOrEqual(20); // the two-area people did not count
  });

  it('false-positive discipline: pure noise produces 0 unexpected edges', () => {
    const rnd = prng(17);
    const table = Array.from({ length: 40 }, (_, i) => ({
      id: `u${i}`,
      effects: Object.fromEntries(AREAS.map((a) => [a, rnd() * 2])) as Record<string, number>,
    }));
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    expect(out.filter((c) => c.verdict === 'unexpected')).toEqual([]);
  });

  it('Benjamini-Hochberg rejects most individually-significant p-values', () => {
    // BH is not reachable through correlate() on any fixture in this file: on
    // prng(17) the largest |r| is 0.4189, so practical_floor 0.5 kills every
    // candidate before BH runs, and replacing benjaminiHochberg with a
    // pass-everything stub changes no outcome in any other test here. Unit-test
    // the helper directly instead — it is pure with a hand-checkable contract.
    // BH's threshold at rank k (1-based) of m is (k/m)*alpha. With m = 20 and one
    // individually-significant p = 0.03 sitting among 19 non-significant ones, no
    // rank clears its threshold (0.03 > 0.0025 at rank 1; 0.06 > 0.05 at rank 20),
    // so BH rejects even the p that a naive p < alpha test would have accepted.
    expect(benjaminiHochberg([0.03, ...Array(19).fill(0.06)], 0.05).size).toBe(0);
    // A genuinely tiny p in the same company still survives, at rank 1 only.
    const one = benjaminiHochberg([0.0001, ...Array(19).fill(0.06)], 0.05);
    expect(one.size).toBe(1);
    expect(one.has(0)).toBe(true);
    // And a set where every p clears its own rank threshold survives whole.
    expect(benjaminiHochberg([0.001, 0.002, 0.003], 0.05).size).toBe(3);
  });

  it('practical floor holds independently of statistical significance', () => {
    // The earlier version of this test ran on pure prng(23) noise, where the
    // leave-two-out deviation structure caps |r| near 1/7 and EVERY annotation comes
    // back not_visible — so the assertion body executed zero times and vitest passed
    // a test with no assertions. Use the forced-link table instead (11 confirmed +
    // 2 unexpected under the Step 4 implementation) and prove the loop is non-empty
    // BEFORE relying on it.
    const rnd = prng(29);
    const table = Array.from({ length: 40 }, (_, i) => {
      const shared = rnd() * 2;
      const effects = Object.fromEntries(AREAS.map((a) => [a, rnd()])) as Record<string, number>;
      effects.gen = shared; effects.gov = shared; effects.comm = shared;
      return { id: `u${i}`, effects };
    });
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);

    expect(out.some((c) => c.verdict !== 'not_visible')).toBe(true); // non-vacuity guard
    for (const c of out) {
      if (c.verdict !== 'not_visible') expect(Math.abs(c.r)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('reports at most max_unexpected non-authored pairs', () => {
    const rnd = prng(29);
    const table = Array.from({ length: 40 }, (_, i) => {
      const shared = rnd() * 2;
      const effects = Object.fromEntries(AREAS.map((a) => [a, rnd()])) as Record<string, number>;
      // force a genuine link across gen/gov/comm. NOTE: gen<->gov IS authored
      // (gov.gates: all expands over the whole chain and gen), so only gen<->comm
      // and gov<->comm land in `exploratory`. The cap is exercised by the
      // surrounding prng(29) noise: 10 exploratory pairs clear BH + the practical
      // floor before .slice(0, max_unexpected) cuts them to 2. Removing .slice
      // yields 10 and fails the assertion below — that is what makes it load-bearing.
      effects.gen = shared; effects.gov = shared; effects.comm = shared;
      return { id: `u${i}`, effects };
    });
    const fits = fitsFrom(table);
    const out = correlate(fits, calibrationFrom(fits), rules);
    expect(out.filter((c) => c.verdict === 'unexpected').length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/engine/correlation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `lib/engine/correlation.ts`. The three things that must not be simplified away are the deviation basis, the leave-two-out style, and the BH + practical floor:

```ts
import type { Rules } from '../methodology/schema';
import type { AreaFit } from './fit';
import type { Calibration } from './calibration';
import { structuralEdges } from './dependencies';

export interface CorrelationAnnotation {
  from: string;
  to: string;
  r: number;
  n: number;
  verdict: 'confirmed' | 'not_visible' | 'unexpected';
}

/**
 * LEAVE-TWO-OUT (spec §6.2). A person's deviations are measured against their own
 * style, so they are mechanically constrained to sum toward zero. Someone who
 * completed exactly two areas has d_a = -d_b BY CONSTRUCTION — a guaranteed
 * perfect negative correlation that means nothing.
 *
 * For each pair (a,b) the style is recomputed EXCLUDING a and b, so deviations in
 * a and b are not mechanically linked. Requiring >= min_areas_per_person completed
 * areas keeps the leave-two-out style resting on at least two areas.
 */
function deviationPairs(
  effectsByPerson: Map<string, Map<string, number>>,
  a: string,
  b: string,
  minAreas: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [, effects] of effectsByPerson) {
    if (effects.size < minAreas) continue;
    const ea = effects.get(a);
    const eb = effects.get(b);
    if (ea === undefined || eb === undefined) continue;

    let sum = 0;
    let count = 0;
    for (const [area, e] of effects) {
      if (area === a || area === b) continue;
      sum += e;
      count++;
    }
    if (count < 2) continue; // style must rest on at least two other areas
    const style = sum / count;
    out.push([ea - style, eb - style]);
  }
  return out;
}

function pearson(pairs: Array<[number, number]>): number {
  const n = pairs.length;
  if (n < 3) return 0;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/**
 * Two-sided p-value for Pearson r via the t approximation, t = r*sqrt((n-2)/(1-r^2)).
 * Uses a normal approximation to the t tail — adequate at the n >= 18 this is gated
 * behind, and it avoids adding a stats dependency.
 */
function pValue(r: number, n: number): number {
  if (n < 3) return 1;
  const rr = Math.min(Math.abs(r), 0.999999);
  const t = rr * Math.sqrt((n - 2) / (1 - rr * rr));
  const z = t * (1 - 1 / (4 * (n - 2))) / Math.sqrt(1 + (t * t) / (2 * (n - 2)));
  // two-sided normal tail via erf approximation (Abramowitz & Stegun 7.1.26)
  const x = Math.abs(z) / Math.SQRT2;
  const tt = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt +
      0.254829592) *
      tt *
      Math.exp(-x * x);
  return Math.max(0, Math.min(1, 1 - erf));
}

/**
 * Benjamini-Hochberg. Returns the set of indices that survive at level alpha.
 * EXPORTED so Step 2's unit test can reach it: no fixture in this file makes BH
 * load-bearing through correlate() — the practical floor removes every candidate
 * first — so the only honest way to guard it is to test it directly.
 */
export function benjaminiHochberg(ps: number[], alpha: number): Set<number> {
  const ordered = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  let cutoff = -1;
  for (let k = 0; k < ordered.length; k++) {
    if (ordered[k]!.p <= ((k + 1) / ordered.length) * alpha) cutoff = k;
  }
  const survivors = new Set<number>();
  for (let k = 0; k <= cutoff; k++) survivors.add(ordered[k]!.i);
  return survivors;
}

export function correlate(
  fits: AreaFit[],
  _calibration: Calibration,
  rules: Rules,
): CorrelationAnnotation[] {
  const c = rules.correlation;

  const effectsByPerson = new Map<string, Map<string, number>>();
  for (const fit of fits) {
    for (const p of fit.personEffects) {
      let m = effectsByPerson.get(p.respondent_id);
      if (!m) {
        m = new Map<string, number>();
        effectsByPerson.set(p.respondent_id, m);
      }
      m.set(fit.category_id, p.effect);
    }
  }

  const areas = fits.map(f => f.category_id);
  const authored = new Set(structuralEdges(rules).map(e => `${e.from}->${e.to}`));

  const results: CorrelationAnnotation[] = [];
  const exploratory: Array<{ annotation: CorrelationAnnotation; p: number }> = [];

  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i]!;
      const b = areas[j]!;
      const pairs = deviationPairs(effectsByPerson, a, b, c.min_areas_per_person);
      const n = pairs.length;

      // N gate is per PAIR — respondents complete in BOTH areas of the pair.
      if (n < c.min_n) continue;

      const r = pearson(pairs);
      const p = pValue(r, n);
      const isAuthored = authored.has(`${a}->${b}`) || authored.has(`${b}->${a}`);

      if (isAuthored) {
        // Directed hypotheses: tested individually, no multiplicity correction.
        const visible = p <= c.alpha && Math.abs(r) >= c.practical_floor;
        results.push({ from: a, to: b, r, n, verdict: visible ? 'confirmed' : 'not_visible' });
      } else {
        exploratory.push({ annotation: { from: a, to: b, r, n, verdict: 'not_visible' }, p });
      }
    }
  }

  // Exploratory pairs: BH across them, PLUS a practical floor, PLUS a hard cap.
  const survivors = benjaminiHochberg(exploratory.map(e => e.p), c.alpha);
  const unexpected = exploratory
    .map((e, idx) => ({ ...e, idx }))
    .filter(e => survivors.has(e.idx) && Math.abs(e.annotation.r) >= c.practical_floor)
    .sort((x, y) => Math.abs(y.annotation.r) - Math.abs(x.annotation.r))
    .slice(0, c.max_unexpected)
    .map(e => ({ ...e.annotation, verdict: 'unexpected' as const }));

  return [...results, ...unexpected];
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run tests/engine/correlation.test.ts`
Expected: PASS — 6 tests. If the CMV or false-positive test fails, the bug is real; do not loosen the assertion.

- [ ] **Step 6: Wire into assemble**

In `lib/engine/assemble.ts`:

```ts
  const correlations = correlate(
    methodology.questions.categories.map(cat => normalized.get(cat.id)!.fit),
    calibration,
    methodology.rules,
  );
```

Add `correlations: CorrelationAnnotation[]` to `Diagnosis` and return it, with `import type { CorrelationAnnotation } from './correlation';`. This is the field's only declaration site — it is listed in the plan's Modified-files table (`lib/engine/types.ts` row) but is not in Task 7's `Diagnosis` block, because Tasks 9 and 11 each append one field. Tasks 13/15/16 consume it from here.

- [ ] **Step 7: Full gates + commit**

```bash
npm run typecheck && npm run lint && npm test
git add lib/engine/correlation.ts lib/engine/types.ts lib/engine/assemble.ts \
        lib/methodology/schema.ts methodology/rules.yaml tests/engine/correlation.test.ts
git commit -m "feat(engine): leave-two-out correlation with BH correction and a practical floor"
```

---

## Task 12: Surface `excludedPartial` to the admin

A partial respondent is dropped, not down-weighted. That dissent must not vanish silently (spec §4.5). The score gets cleaner; the admin gets told what it cost.

**Files:**
- Modify: `lib/engine/types.ts`, `lib/engine/assemble.ts`, `app/app/[churchId]/page.tsx`
- Test: `tests/engine/excluded-partial.test.ts`

**Interfaces:**
- Consumes: `AreaFit.excludedPartial` (Task 2).
- Produces: `DiagnosisCategory` gains `excluded_partial: number`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/excluded-partial.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers, partialAnswers } from './helpers';
import { diagnose } from '../../lib/engine';

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

describe('excluded partial respondents are reported, not hidden', () => {
  const methodology = loadFixtureMethodology();

  it('counts the person whose unfinished answers did not count', () => {
    const rows = [
      ...ALL.flatMap((id) => answers(methodology, id, 6, 'Pastor', 'u-pastor')),
      ...partialAnswers(methodology, 'vol', ['V1'], 1, 'Elder').map((r) => ({
        ...r,
        respondent_id: 'u-elder',
      })),
    ];
    const d = diagnose(rows, methodology, { attendance_band: '100-249' });
    const vol = d.categories.find((c) => c.category_id === 'vol')!;
    expect(vol.excluded_partial).toBe(1);
    expect(vol.respondent_count).toBe(1);
    const guest = d.categories.find((c) => c.category_id === 'guest')!;
    expect(guest.excluded_partial).toBe(0);
  });
});
```

Use whatever `attendance_band` the existing E2E fixtures use — read one before writing this.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/engine/excluded-partial.test.ts`
Expected: FAIL — `excluded_partial` is not a property.

- [ ] **Step 3: Add the field**

`lib/engine/types.ts`, in `DiagnosisCategory`:

```ts
  respondent_count: number; // complete respondents in this area (= fit.n)
  excluded_partial: number; // people with unfinished answers here that did not count
```

`lib/engine/assemble.ts`, in the `categories.push({...})`:

```ts
      excluded_partial: norm.fit.excludedPartial,
```

- [ ] **Step 4: Add the dashboard nudge**

In `app/app/[churchId]/page.tsx`, where the member-coverage matrix renders, add a line per area with a non-zero count. `buildMemberMatrix` already knows this — a member's cell is `partial` exactly when they started but did not finish. Derive it from the matrix rather than from the diagnosis, so the nudge shows **before** a diagnosis exists:

```tsx
{partialCount > 0 && (
  <p className="text-sm text-ink-muted">
    {partialCount === 1
      ? `1 person has unfinished answers in ${categoryName} that aren't counting.`
      : `${partialCount} people have unfinished answers in ${categoryName} that aren't counting.`}
  </p>
)}
```

Read the page and match its existing className vocabulary and text-component conventions rather than pasting this verbatim.

- [ ] **Step 5: Run the tests, full gates, commit**

```bash
npx vitest run tests/engine/excluded-partial.test.ts
npm run typecheck && npm run lint && npm test
git add lib/engine/types.ts lib/engine/assemble.ts tests/engine/excluded-partial.test.ts
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/page.tsx"
git commit -m "feat(dashboard): tell the admin whose unfinished answers are not counting"
```

---

## Task 13: Reshape `ReportView`

`ReportView` gains `cover`, `areas` and `system`, and loses top-level `blindSpot` and `generosityMode` (spec §7.4). Because `lib/report/pdf/document.tsx` and `app/r/[shareToken]/page.tsx` both consume `buildReportView`, content and ordering cannot drift — only layout primitives differ.

`BlindSpots` is per-category belief-vs-evidence → becomes the *Watch for* field of the area it concerns. `GenerositySplit` is specific to `gen` → becomes part of the Generosity dossier (spec §7.1). Both are **absorbed, not deleted**.

**Files:**
- Modify: `lib/report/view.ts`, `lib/engine/types.ts`, `lib/engine/assemble.ts`, `lib/ai/fallback.ts` (Step 5 rename), `methodology/copy.yaml`, `lib/methodology/schema.ts` (Step 0 scaffold), `lib/report/pdf/document.tsx`, `app/r/[shareToken]/page.tsx`, `app/app/[churchId]/diagnosis/page.tsx` (Step 4 compile-fix)
- Test: `tests/report/view.test.ts`

> The three render files are here because this task removes `view.blindSpot` and `view.generosityMode`, which all three read unconditionally today. Without a minimal fix in each, **this task's own typecheck gate cannot go green** — and Global Constraints allow no task to end red. Step 4 keeps that fix to the smallest possible edit; the layout work stays in Task 16.

**Interfaces:**
- Consumes: `Diagnosis` (Tasks 7, 9, 11, 12), `DependencyEdge`, `CorrelationAnnotation`, `Calibration`.
- Produces:
  ```ts
  export interface CoverView {
    throughput: number; capacity: number; gap: number
    constraintName: string | null
    gatedBy: Array<{ name: string; score: number }>
  }
  export interface AreaDossierView {
    category_id: string; name: string; score: number; n: number
    reading: string
    insideIt: string | null
    agreement: string | null
    position: string | null
    dependsOn: string[]
    watchFor: string | null
  }
  export interface SystemView {
    dependencies: Array<{ from: string; to: string; kind: string; statement: string
                          read: string; fromName: string; toName: string
                          fromScore: number; toScore: number }>
    correlations: CorrelationAnnotation[]
    calibrationSpread: number
    calibrationText: string // the rendered sentence — Calibration({ spread, text }) needs it,
                            // and Task 17 can only prove "no names on any surface" if it is here
    disagreement?: { text: string; respondents: Array<{ label: string; mean: number }> }
    gating?: string
  }
  // ReportView gains: cover: CoverView; areas: AreaDossierView[]; system: SystemView
  ```

- [ ] **Step 0: Ship the `copy.yaml` dossier scaffold with placeholders**

This task's `reading` and `watchFor` fields read `copy.yaml` keys, so the keys and the schema that lets them load must exist **before** Step 1's tests run — otherwise the only options are hardcoding church-health prose in TypeScript (forbidden by Global Constraints and spec §10) or letting Task 13's own tests fail. Task 9 Step 5 handles the identical situation for `rules.yaml`; this mirrors it exactly. **Placeholders only — the prose is the owner's (Task 14).**

Add to `methodology/copy.yaml`:

```yaml
# DOSSIER COPY IS XPG METHODOLOGY (spec §10).
# The values below are PLACEHOLDERS pending Natalie's authoring — see Task 14.
# DO NOT SHIP TO A CUSTOMER WITH THESE IN PLACE.
dossier:
  reading:
    stage:
      severe:  "<owner text>"
      broken:  "<owner text>"
      watch:   "<owner text>"
      holding: "<owner text>"
    enabler:
      severe:  "<owner text>"
      broken:  "<owner text>"
      watch:   "<owner text>"
      holding: "<owner text>"
  enabler_belief_only: "<owner text>"
  calibration_spread: "<owner text with {spread}>"
  generosity:
    breadth: "<owner text>"   # seed from GENEROSITY_COPY.breadth in lib/report/copy.ts
    depth:   "<owner text>"   # seed from GENEROSITY_COPY.depth
    both:    "<owner text>"   # seed from GENEROSITY_COPY.both
```

The three `generosity` values are the one exception to "placeholders only": `lib/report/copy.ts`'s `GENEROSITY_COPY` already ships three authored sentences on this exact subject. **Copy them in verbatim** rather than writing `<owner text>` — they are existing XPG copy, so they are the owner's starting text in Task 14, not the implementer's invention. (`lib/report/copy.ts` itself is retired in Task 16 Step 4, once both its consumers are rewritten.)

In `lib/methodology/schema.ts`, extend `CopySchema` — keep `version`, `blocks` and `inserts` byte-identical:

```ts
export const CopySchema = z.object({
  version: z.string().min(1),
  blocks: z.record(z.string().min(1)),
  inserts: z.record(z.string().min(1)),
  dossier: z.object({
    reading: z.object({
      stage: z.record(z.string().min(1)),
      enabler: z.record(z.string().min(1)),
    }),
    enabler_belief_only: z.string().min(1),
    calibration_spread: z.string().min(1),
    generosity: z.object({
      breadth: z.string().min(1),
      depth: z.string().min(1),
      both: z.string().min(1),
    }),
  }),
});
```

These placeholder values are non-empty strings, so Step 1's `expect(area.reading.length).toBeGreaterThan(0)` passes legitimately here — it is exercising the real `copy.yaml` lookup path, not a stub. Task 14 swaps the prose and adds the guard that no `<owner text>` survives to a customer.

- [ ] **Step 1: Write the failing test**

Create/extend `tests/report/view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import { diagnose } from '../../lib/engine';
import { fallbackProse } from '../../lib/ai/fallback';
import { buildReportView } from '../../lib/report/view';

const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
const CHAIN_THEN_ENABLERS = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];

describe('ReportView shape', () => {
  const methodology = loadFixtureMethodology();

  /**
   * Every item at `base` except the third, which sits 3 points lower.
   * A single scalar per area makes every column mean equal mu, so every
   * fit.questionEffects entry is exactly 0 and `insideIt` ("D3 sits 18 pts below
   * the rest") is structurally unexercisable. Build the FULL record — answers()
   * defaults any item missing from the map to 5, not to `base`.
   */
  const varied = (id: string, base: number): Record<string, number> =>
    Object.fromEntries(
      methodology.questions.categories
        .find((c) => c.id === id)!
        .items.map((it, i) => [it.id, i === 2 ? base - 3 : base]),
    );

  const d = diagnose(
    ALL.flatMap((id) => [
      ...answers(methodology, id, varied(id, id === 'vol' ? 4 : 8), 'Pastor', 'u-1'),
      ...answers(methodology, id, varied(id, id === 'vol' ? 5 : 7), 'Elder', 'u-2'),
    ]),
    methodology,
    { attendance_band: '100-249' },
  );
  const view = buildReportView(d, fallbackProse(d, methodology), methodology, { audience: 'screen' });

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
      expect(area.watchFor).toBe(methodology.copy.dossier.enabler_belief_only);
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
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/report/view.test.ts`
Expected: FAIL — `view.cover` is undefined.

- [ ] **Step 3: Implement the reshape**

Rewrite `lib/report/view.ts`. Keep the existing audience semantics exactly (the doc comment at lines 23-34 is still correct and must be preserved and extended). Key points:

- `areas` is built by iterating **`[...rules.chain, ...Object.keys(rules.enablers)]`**, never by sorting on score. The order is fixed so two assessments 90 days apart are directly comparable side by side (spec §7 Layer 3).
- `reading` comes from `score` + `state` + a band template in `copy.yaml` — `methodology.copy.dossier.reading[kind][band]`, where `kind` is `stage` for a chain area and `enabler` otherwise. The keys exist from Step 0; Task 14 replaces the placeholder prose.
- `insideIt` is the largest-magnitude entry in `fit.questionEffects`; `null` when `n === 0`.
- `agreement` derives from the disagreement flag for that area; `null` when `n < 2`.
- `position` is `cohort_percentile`; `null` when the benchmark is absent.
- `dependsOn` is every edge from `d.dependencies` touching this area.
- `system.disagreement` is built from `d.disagreement_flags` (the renamed field, Step 5): the flag's `text` plus its screen-only `respondents` list, `undefined` when there is no flag. Task 17 asserts it is **defined** on its fixture, so an implementation that never populates it fails there rather than passing silently.
- `watchFor` is, in priority order: the blind-spot gap for this area → the enabler-limit note for `gov`/`comm`/`sys`, which is `methodology.copy.dossier.enabler_belief_only` → the generosity mode note for `gen`, which is `methodology.copy.dossier.generosity[d.generosity_mode]` → `null`. All three come from `copy.yaml`; none is written in TypeScript.
- `system.calibrationSpread` is `d.calibration.spread`. `system.calibrationText` is `methodology.copy.dossier.calibration_spread` with `{spread}` interpolated — it is what `Calibration({ spread, text })` renders in Task 15, and putting it in the view is what lets Task 17 prove no name reaches it. **Names never travel** — see Task 17.
- `cover.gatedBy` joins `d.gating_conditions` (which already carries `enabler_id`) against `d.categories` for the score. No new field is needed (spec §5.2). The line renders only when the list is non-empty.
- When `primary_constraint` is null, `cover.constraintName` is `null` and the renderer prints `Constraint: none — every stage holding`.

- [ ] **Step 4: Land the minimal compile-fix in the three render sites**

Removing `view.blindSpot` and `view.generosityMode` breaks three files that read them unconditionally today, none of which Task 13 would otherwise touch — and Global Constraints require *this* task to end with a clean typecheck, so the fix belongs here rather than two tasks later:

- `lib/report/pdf/document.tsx` — the `{view.blindSpot && (…)}` and `{view.generosityMode !== null && (…)}` blocks
- `app/r/[shareToken]/page.tsx` — the same two blocks, **plus** the now-unused `BlindSpots` and `GenerositySplit` entries in its 10-symbol import from `@/app/app/[churchId]/diagnosis/report`
- `app/app/[churchId]/diagnosis/page.tsx` — the same two blocks

**Minimal means minimal:** delete the two render blocks and their now-unused imports, nothing else. Do not attempt any layout work — the full mirror is Task 16's. The content those blocks rendered is **not being dropped**: blind-spot text returns as the `watchFor` field of the area it concerns and the generosity note as the `gen` dossier's `watchFor`, both via `AreaDossier` in Tasks 15–16 (spec §7.1). Removing the only usages here is also what makes Task 15 Step 1's deletion of `BlindSpots`/`GenerositySplit` a genuine no-behaviour-change move — by then they are dead code.

- [ ] **Step 5: Rename `dispersion_flags` → `disagreement_flags` and drop the deprecated alias**

Task 5 Step 8 kept `export type DispersionFlag = …DisagreementFlag;` with the comment *"kept until the report layer is reshaped (Task 13)"*. This is that task, so honour the deadline:

- in `lib/engine/types.ts`, rename `Diagnosis.dispersion_flags` → `disagreement_flags` and **delete** the `@deprecated DispersionFlag` alias;
- run `npm run typecheck` and let it enumerate the consumers, exactly as in Task 7 — expect at minimum `lib/engine/assemble.ts`, `lib/ai/fallback.ts`, `lib/report/view.ts` and tests. Fix each to the new name.

Task 18's cleanup grep looks for both identifiers; if either survives, this step did not happen.

- [ ] **Step 6: Run the tests, gates, commit**

```bash
npx vitest run tests/report/
npm run typecheck && npm run lint && npm test
git add lib/report/view.ts tests/report/view.test.ts lib/engine/types.ts \
        lib/engine/assemble.ts lib/ai/fallback.ts \
        lib/report/pdf/document.tsx methodology/copy.yaml lib/methodology/schema.ts
GIT_LITERAL_PATHSPECS=1 git add "app/r/[shareToken]/page.tsx" "app/app/[churchId]/diagnosis/page.tsx"
git commit -m "feat(report): four-layer view shape with eight area dossiers"
```

---

## Task 14 — CONTENT, OWNER-AUTHORED: dossier band copy

**This task is not the implementer's to complete** (spec §10). The `Reading` field's language per score band is XPG's voice.

The keys and the schema already exist: **Task 13 Step 0 shipped the whole `dossier:` block with loud `"<owner text>"` placeholders**, exactly as Task 9 Step 5 ships `PLACEHOLDER` rows in `rules.yaml` for Task 10 to replace. This task is purely *ask → paste → guard*: it swaps placeholder strings for authored ones and adds the test that stops a placeholder shipping. It adds no keys and touches no schema.

**Files:**
- Modify: `methodology/copy.yaml`
- Test: `tests/methodology/copy.test.ts`

- [ ] **Step 1: Ask the owner for the band copy**

`copy.yaml` today has flat `blocks` and `inserts` maps. Ask Natalie for one `Reading` sentence per **(band × kind)** — four bands × two kinds = 8 strings — plus the three fixed *Watch for* notes:

Bands (from `thresholds`): `severe` (<25) · `broken` (25–44) · `watch` (45–64) · `holding` (65+). Kinds: `stage`, `enabler`.

Plus these three, which the implementation must not invent:
- the enabler blind-spot note for `gov`/`comm`/`sys` — spec §7.3 gives the intent: *"Measured on perception only — there's no countable evidence side to cross-check this against."* Confirm the exact wording with the owner.
- the generosity `breadth` / `depth` / `both` note for the `gen` dossier — **three strings, one per mode**. These are not greenfield: `lib/report/copy.ts`'s `GENEROSITY_COPY` already carries three authored sentences that ship today, and Task 13 Step 0 migrated them verbatim into `copy.yaml` as the starting text. Show Natalie what is there and ask whether it stands or gets rewritten for the dossier context. Either answer is an owner decision; the implementer neither invents nor edits them.
- the "your leaders' baseline generosity spans {n} points" calibration line.

- [ ] **Step 2: Paste the authored text into `copy.yaml`**

The `dossier:` block and its `CopySchema` entry already exist from **Task 13 Step 0**. Replace each `"<owner text>"` with the string the owner supplied — same keys, same nesting, nothing added or renamed. The `calibration_spread` value must keep its `{spread}` token; the three `generosity` values must keep their `breadth` / `depth` / `both` keys, because `lib/report/view.ts` indexes that map by `d.generosity_mode`.

- [ ] **Step 3: Add the no-placeholder guard**

In `tests/methodology/copy.test.ts`:

```ts
  it('has no placeholder dossier copy', () => {
    const { dossier } = loadFixtureMethodology().copy;
    const all = [
      ...Object.values(dossier.reading.stage),
      ...Object.values(dossier.reading.enabler),
      ...Object.values(dossier.generosity),
      ...Object.values(dossier.agreement),
      dossier.enabler_belief_only,
      dossier.calibration_spread,
    ];
    expect(all).toHaveLength(8 + 3 + 2 + 2); // every authored string is in the guard
    for (const s of all) {
      expect(s).not.toMatch(/owner text|PLACEHOLDER|TODO|TBD/i);
      expect(s.trim().length).toBeGreaterThan(20);
    }
  });

  it('covers all four bands for both category kinds, and all three generosity modes', () => {
    const { reading, generosity } = loadFixtureMethodology().copy.dossier;
    for (const kind of ['stage', 'enabler'] as const) {
      expect(Object.keys(reading[kind]).sort()).toEqual(['broken', 'holding', 'severe', 'watch']);
    }
    expect(Object.keys(generosity).sort()).toEqual(['both', 'breadth', 'depth']);
  });
```

- [ ] **Step 4: Gates + commit**

```bash
npm run typecheck && npm run lint && npm test
git add methodology/copy.yaml tests/methodology/copy.test.ts
git commit -m "content(methodology): dossier band copy"
```

**Blocking:** the branch must not merge until this closes.

---

## Task 15: Split `report.tsx` and build the new sections

`app/app/[churchId]/diagnosis/report.tsx` is 239 lines today and this roughly triples it. Split it so each file stays focused enough to edit reliably (spec §8.4). This is improving code being worked in, not a side refactor.

**Files:**
- Create: `app/app/[churchId]/diagnosis/report/{cover,system,dossier,chain,shared}.tsx`
- Delete: `app/app/[churchId]/diagnosis/report.tsx`
- Modify: `app/app/[churchId]/diagnosis/page.tsx`, `app/r/[shareToken]/page.tsx` (import-path update only — it imports ten components from the deleted module; its layout mirror lands in Task 16)
- Test: `tests/report/components.test.ts` — **`.ts`, not `.tsx`**: `vitest.config.ts` globs `tests/**/*.test.ts` and there is no DOM environment configured (Step 2)

**Interfaces:**
- Consumes: `CoverView`, `AreaDossierView`, `SystemView`, `ReportView` (Task 13).
- Produces:
  - `cover.tsx` → `CoverCard({ cover }: { cover: CoverView })`, `VerdictHeader({ verdict, confidence })`, `AreaTable({ areas }: { areas: AreaDossierView[] })`
  - `chain.tsx` → `ChainWalk`, `StageTile`, `EvidenceReceipt`, `CostSection` — **moved verbatim** from `report.tsx`
  - `system.tsx` → `DependencyMap({ system })`, `Calibration({ spread, text })`, `Disagreement({ text, respondents })`, `GatingFlags({ text })`
  - `dossier.tsx` → `AreaDossier({ area }: { area: AreaDossierView })`
  - `shared.tsx` → `confidenceBand`, `EmptyState`, `NextStep`, `Appendix`, `StaleMethodologyNotice({ churchId })`, `ReportBody({ storedVersion, currentVersion, view, churchId })` (Step 6 — the pure stale-vs-fresh branch, so it is testable without a renderer)

- [ ] **Step 1: Move the existing components with no behaviour change, and commit that alone**

Move `confidenceBand`, `EmptyState`, `NextStep`, `Appendix` → `shared.tsx`. Move `ChainWalk`, `StageTile`, `EvidenceReceipt`, `CostSection` → `chain.tsx`. Move `GatingFlags`, `Disagreement` → `system.tsx`. Update the imports in `diagnosis/page.tsx` **and in `app/r/[shareToken]/page.tsx`**, which imports from `@/app/app/[churchId]/diagnosis/report` — the module this task deletes — and would otherwise stop compiling here.

`BlindSpots` and `GenerositySplit` are simply **deleted** in this step, with no replacement needed and no behaviour change: Task 13 already removed `view.blindSpot` and `view.generosityMode` and stripped the render blocks (and the two imports) from all three consumers, so by the time this step runs both components are **dead code with zero call sites**. Their content is **absorbed into the dossier** (spec §7.1) and returns via `AreaDossier`'s `watchFor` field in Task 16 — it is not being dropped.

Run: `npm run typecheck && npm run lint && npm test` — **everything must still pass with zero behaviour change** before writing a single new component.

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/"
git commit -m "refactor(report): split report.tsx into focused section files"
```

- [ ] **Step 2: Write the failing dossier test**

**No render harness, and no new dependency to get one.** `@testing-library/react`, `jsdom` and `happy-dom` are all absent from `package.json` — there is no DOM test environment configured at all — and Global Constraints line 23 forbids adding one. `vitest.config.ts` also globs `tests/**/*.test.ts`, which does **not** match `.tsx`, so a `.tsx` test would silently never run. Therefore: **this file is `tests/report/components.test.ts`, contains no JSX, and asserts on the React element tree the components return.** They are plain function components, so `AreaDossier({ area })` returns an element tree whose `props.children` can be walked directly. Do not add a renderer; if you believe one is genuinely required, stop and ask the owner.

In the report component test file:

```ts
import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { AreaDossier } from '../../app/app/[churchId]/diagnosis/report/dossier';

/** Flattens the element tree a plain function component returns. No DOM, no renderer. */
function walk(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!isValidElement(node)) return [];
  const children = (node.props as { children?: unknown }).children;
  return [node, ...walk(children)];
}

/** Every string the tree would render, concatenated in order. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return '';
}

const area = {
  category_id: 'disc',
  name: 'Discipleship Pathway',
  score: 73,
  n: 14,
  reading: 'Discipleship is holding but not compounding.',
  insideIt: 'D3 sits 18 points below the rest of this area.',
  agreement: 'Tight — your leaders read this area the same way.',
  position: 'p62 of the benchmark prior',
  dependsOn: ['Systems (74) gates this', 'feeds Volunteers (48)'],
  watchFor: 'Belief runs 22 points ahead of the countable evidence.',
};

describe('AreaDossier', () => {
  it('renders the score, N, and all six fields inline', () => {
    const tree = AreaDossier({ area });
    const text = textOf(tree);
    expect(text).toMatch(/Discipleship Pathway/);
    expect(text).toMatch(/73/);
    expect(text).toMatch(/N=14/);
    for (const label of ['Reading', 'Inside it', 'Agreement', 'Position', 'Depends on', 'Watch for']) {
      expect(text).toContain(label);
    }
    // inline, not collapsed — no accordion element anywhere in the tree (spec §7.8)
    expect(walk(tree).some((n) => n.type === 'details')).toBe(false);
  });

  it('still renders all six labels when three fields are unavailable', () => {
    const text = textOf(AreaDossier({ area: { ...area, insideIt: null, agreement: null, watchFor: null } }));
    for (const label of ['Reading', 'Inside it', 'Agreement', 'Position', 'Depends on', 'Watch for']) {
      expect(text).toContain(label);
    }
  });
});
```

`walk` and `textOf` only descend through the tree a component **returns** — they do not invoke nested components' bodies. So `AreaDossier` must render its six labels and values itself rather than delegating each to a sub-component; that is the shape spec §7.2 asks for anyway (identical six fields, no per-field special cases). Match the project's existing test conventions for everything else — read a current `tests/report/*` file first.

- [ ] **Step 3: Run it to make sure it fails, then implement `AreaDossier`**

Identical six fields for every area, no exceptions (spec §7.2). Render fully inline — no accordions, no `<details>`. Collapsing the depth the customer is paying for defeats the point, and PDF/shared cannot collapse anyway, so inline keeps all three surfaces identical (spec §7.8). A field with no value renders its label and an explicit unavailability line, never a blank.

- [ ] **Step 4: Implement `CoverCard`, `AreaTable`, `DependencyMap`, `Calibration`**

`CoverCard` renders the spec §5.3 layout:

```
   OVERALL CHURCH HEALTH
          52%
   Capacity 77  ·  Gap 25 pts
   Constraint: Volunteers
   ⚠ Gated by: Governance (31)     ← only when gatedBy is non-empty
```

Throughput is the single focal number; capacity/gap/constraint are a supporting line beneath, **never a co-headline** (spec §3 decision 3). When `constraintName` is null, line 3 reads `Constraint: none — every stage holding` with the existing `verdict_no_constraint` copy below.

`AreaTable` is 8 rows — name, score, N, band — in the same fixed order as the dossiers.

`DependencyMap` renders all 13 edges grouped by `read`, leading with `load_bearing`. Each row shows the authored statement plus the scored read: *"Systems (74) gates Volunteers (48). Systems is holding — so systems is not what's capping your volunteers."* Correlation annotations attach to their edge when present and are simply absent otherwise — the authored map is the cake, correlation is the cherry (spec §6.3).

`Calibration` reports **shape without names on every surface** (spec §7.5).

- [ ] **Step 5: Assemble the four layers in `diagnosis/page.tsx`**

Order is fixed (spec §7):

```
LAYER 1  CoverCard · VerdictHeader · AreaTable · [PDF/Share buttons]
LAYER 2  ChainWalk · EvidenceReceipt · CostSection · DependencyMap · Calibration · Disagreement · GatingFlags
LAYER 3  AreaDossier x8  (guest, conn, disc, vol, gen, gov, comm, sys)
LAYER 4  NextStep · Appendix (thinner — the dossiers now carry the detail)
```

**No generated 30/60/90 roadmap** — a deliberate departure from the reference template (spec §7.6). Layer 4 stays constraint-first.

- [ ] **Step 6: Add the stale-payload notice**

`diagnoses.payload` is cached JSONB; every existing row is `0.1.0` and has `overall_score`, not `throughput` (spec §5.4). In `diagnosis/page.tsx`, compare the stored `methodology_version` against the loaded methodology's version. On mismatch render `StaleMethodologyNotice` — *"This report predates the current methodology — regenerate to see the new analysis"* — wired to the **existing** regenerate action, instead of rendering a broken report.

So this branch is testable without a renderer (see Step 2), put the decision in a **pure presentational component** and have the async page call it: add `ReportBody({ storedVersion, currentVersion, view, churchId })` to `shared.tsx`, returning `<StaleMethodologyNotice churchId={churchId} />` when the versions differ and the four layers otherwise. `diagnosis/page.tsx` does the data fetch and delegates; it holds no branching logic of its own.

Test it — this is the **only** coverage in the plan for spec §5.4 / §9.6, and every historical `diagnoses.payload` row hits this branch on the first render after deploy, so it must carry real assertions. Append to `tests/report/components.test.ts`, importing `ReportBody` and `StaleMethodologyNotice` from `report/shared` and `CoverCard` from `report/cover`:

```ts
  it('shows the regenerate prompt for a 0.1.0 payload instead of a half-empty report', () => {
    const stale = ReportBody({
      storedVersion: '0.1.0',
      currentVersion: '0.2.0',
      view,          // a fully-populated ReportView built from a fresh diagnose()
      churchId: 'c-1',
    });
    const types = collectTypes(stale);
    expect(types).toContain(StaleMethodologyNotice);
    expect(types).not.toContain(CoverCard);
    expect(textOf(stale)).toMatch(/predates the current methodology/i);
    expect(textOf(stale)).not.toMatch(/OVERALL CHURCH HEALTH/i);
  });

  it('renders the report, not the prompt, when the versions match', () => {
    const fresh = ReportBody({
      storedVersion: '0.2.0',
      currentVersion: '0.2.0',
      view,
      churchId: 'c-1',
    });
    const types = collectTypes(fresh);
    expect(types).toContain(CoverCard);
    expect(types).not.toContain(StaleMethodologyNotice);
  });
```

`collectTypes` is `walk(node).map((n) => n.type)` using the Step 2 walker; `textOf` is the Step 2 helper. The second test is the non-vacuity partner — without it, a `ReportBody` that always returned the notice would pass the first test.

- [ ] **Step 7: Verify in the browser**

Start the dev server via `preview_start` (never `npm run dev` in Bash), open a church with a diagnosis, and confirm: the cover shows one big number, eight dossiers render inline, and the console is clean. Screenshot for the owner.

- [ ] **Step 8: Gates + commit**

```bash
npm run typecheck && npm run lint && npm test
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/" "app/r/[shareToken]/page.tsx"
git add tests/report/
git commit -m "feat(report): four-layer report with inline area dossiers"
```

---

## Task 16: Mirror the new sections into PDF and shared

Content and ordering cannot drift because both surfaces consume `buildReportView` — only layout primitives differ (spec §7.4).

**Files:**
- Modify: `lib/report/pdf/document.tsx`, `app/r/[shareToken]/page.tsx`
- Delete: `lib/report/copy.ts` (its three `GENEROSITY_COPY` strings now live in `copy.yaml` — Step 4)
- Test: `tests/report/*`

- [ ] **Step 1: Mirror the layer order in `lib/report/pdf/document.tsx`**

Same four layers, same eight dossiers, same fixed order. `@react-pdf/renderer` primitives, not DOM ones. Dossiers are inline — PDF cannot collapse anyway.

- [ ] **Step 2: Mirror in `app/r/[shareToken]/page.tsx`**

Same, minus `nextStep` — the CTA is an admin action and a board member reading a forwarded link cannot take it. That exclusion already lives in `buildReportView`; do not re-implement it in the page.

- [ ] **Step 3: Write the drift guard**

```ts
  it('all three audiences produce the same eight areas in the same order', () => {
    const ids = (audience: ReportAudience) =>
      buildReportView(d, blocks, methodology, { audience }).areas.map((a) => a.category_id);
    expect(ids('pdf')).toEqual(ids('screen'));
    expect(ids('shared')).toEqual(ids('screen'));
  });

  it('all three audiences produce the same cover numbers', () => {
    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d, blocks, methodology, { audience });
      expect(v.cover.throughput).toBe(d.throughput);
      expect(v.cover.capacity).toBe(d.capacity);
    }
  });
```

- [ ] **Step 4: Retire `lib/report/copy.ts`**

`lib/report/copy.ts` exports `GENEROSITY_COPY` — three authored sentences (`breadth`/`depth`/`both`) that today feed `lib/report/pdf/document.tsx` and the now-deleted `app/app/[churchId]/diagnosis/report.tsx`. Those three strings were migrated verbatim into `methodology/copy.yaml` under `dossier.generosity` in Task 13 Step 0 and re-authored by the owner in Task 14, and the `gen` dossier's `watchFor` now sources from `methodology.copy.dossier.generosity[mode]` (Task 13 Step 3). By this step both consumers are rewritten, so:

- delete the `GENEROSITY_COPY` import and its render site from `lib/report/pdf/document.tsx` (`report.tsx`'s own import went with the file in Task 15);
- `grep -rn "GENEROSITY_COPY\|lib/report/copy" lib app tests` → expect zero hits;
- delete `lib/report/copy.ts`.

Leaving it alive would run a second, un-owner-gated, un-schema-validated copy source in parallel with `copy.yaml` — exactly the drift Task 14 exists to prevent.

- [ ] **Step 5: Gates + commit**

```bash
npm run typecheck && npm run lint && npm test
git add lib/report/pdf/document.tsx tests/report/
git rm --cached lib/report/copy.ts 2>/dev/null || true
GIT_LITERAL_PATHSPECS=1 git add "app/r/[shareToken]/page.tsx"
git commit -m "feat(report): mirror the four-layer report into pdf and shared"
```

---

## Task 17: Privacy and audience regression tests

Unchanged from what ships, and that must be **proven**, not assumed (spec §7.5, §9.6). No new privacy surface, no new strip path.

**Files:**
- Test: `tests/report/audience.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { loadFixtureMethodology, answers } from '../engine/helpers';
import { diagnose } from '../../lib/engine';
import { fallbackProse } from '../../lib/ai/fallback';
import { buildReportView } from '../../lib/report/view';

describe('audience privacy', () => {
  const methodology = loadFixtureMethodology();
  const ALL = ['guest', 'conn', 'disc', 'vol', 'gen', 'gov', 'comm', 'sys'];
  const d = diagnose(
    ALL.flatMap((id) => [
      ...answers(methodology, id, id === 'vol' ? 2 : 8, 'Pastor Dana', 'u-1'),
      ...answers(methodology, id, id === 'vol' ? 9 : 7, 'Elder Sam', 'u-2'),
    ]),
    methodology,
    { attendance_band: '100-249' },
  );
  const blocks = fallbackProse(d, methodology);
  const NAMES = ['Pastor Dana', 'Elder Sam'];

  it('pdf and shared carry no respondent names anywhere in the view', () => {
    for (const audience of ['pdf', 'shared'] as const) {
      const json = JSON.stringify(buildReportView(d, blocks, methodology, { audience }));
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });

  it('screen keeps the labelled respondent list under Disagreement, exactly as it ships', () => {
    const v = buildReportView(d, blocks, methodology, { audience: 'screen' });
    // No `if` guard: the fixture is built to fire. vol is 2 vs 9 while every other
    // area is 8 vs 7, so both rating styles are 0 and vol's deviation stddev is 3.5,
    // clearing any plausible thresholds.dispersion. A conditional here would pass
    // silently if buildReportView never populated system.disagreement at all.
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement!.respondents.length).toBeGreaterThan(0);
  });

  it('calibration carries no names on ANY surface, screen included', () => {
    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d, blocks, methodology, { audience });
      // Stringify the WHOLE system section, not one numeric field. The rendered
      // calibration LINE is prose (system.calibrationText) and that is where a name
      // could actually leak; a number can never contain one, so asserting on
      // calibrationSpread alone cannot fail. `disagreement` is excluded because the
      // labelled respondent list is legitimately screen-only (test above).
      const json = JSON.stringify({ ...v.system, disagreement: undefined });
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });

  it('shared still drops nextStep', () => {
    expect(buildReportView(d, blocks, methodology, { audience: 'shared' }).nextStep).toBeUndefined();
  });
});
```

The name test asserts against the **whole serialized view**, not one field — a presence check on `dispersion.respondents` would survive a leak anywhere else (see the non-vacuity discipline in spec §9.3).

- [ ] **Step 2: Run, gates, commit**

```bash
npx vitest run tests/report/audience.test.ts
npm run typecheck && npm run lint && npm test
git add tests/report/audience.test.ts
git commit -m "test(report): pin the audience privacy boundaries"
```

---

## Task 18: Final verification and PR

- [ ] **Step 1: Confirm nothing regressed**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck 0 · lint 0 · **≥ 390 passing, and never fewer than the count recorded at the end of Task 2** (record that number then; the "340 baseline" figure elsewhere in this plan is void — it descends from PR #31's branch, which is not in this base). The floor derives from 349 after Task 2 plus 47 unambiguously-new `it()` blocks across Tasks 3–17. Confirm all five E2E fixtures still assert their **original scores and primary constraints**.

- [ ] **Step 2: Confirm the two content tasks closed**

```bash
grep -rn "PLACEHOLDER\|owner text\|awaiting XPG" methodology/
```

Expected: **zero hits.** If any remain, Tasks 10 and/or 14 are not done and the branch must not merge.

- [ ] **Step 3: Confirm the rename left nothing behind**

```bash
grep -rn "overall_score\|overallScore\|dispersionFor\|scoreCategory\|dispersion_flags\|DispersionFlag" lib app tests
```

Expected: zero hits outside comments that explain the rename. `dispersion_flags` and `DispersionFlag` are in this grep because Task 13's rename step is the deadline the Task 5 deprecation note promised — if either name survives, that step did not happen.

- [ ] **Step 4: Per-task and whole-branch review**

Use `superpowers:requesting-code-review` per task during the build, then a final **Opus whole-branch review** before opening the PR.

- [ ] **Step 5: Open the PR — do not merge**

Body must call out, explicitly:
- the **pending migration** `20260728000100_rpc_get_run_responses_add_user_id.sql` — Natalie runs `supabase db push` then `npm run test:db`;
- that `methodology_version` moved to `0.2.0` and **every existing cached diagnosis will show the regenerate prompt** until re-run;
- the two owner-authored content items and their status;
- that the two previously-claimed "spec drifts" were **retracted as false** (they were measured against an 18-PR-stale `master`); the spec's `actions.ts:28` and the existence of `lib/coverage/assessment-cta.ts` were correct all along. The one real correction: Task 8's admin gate lives inline at `page.tsx:202`/`213-214`, **not** in `assessment-cta.ts`.

Never merge, push to `master`, or force-push without the owner.

---

## Self-review

Run against the spec after the plan is written; recorded here so the reviewer can check the same ground.

**Spec coverage — every section maps to a task:**

| Spec | Task |
|---|---|
| §4.1 the fit | 2, 3 |
| §4.2 calibration vs. disagreement | 5 |
| §4.3 types | 2, 5, 7 |
| §4.4 `'Member'` collision (prerequisite) | 4 |
| §4.5 honest cost of 5-of-5 / `excludedPartial` | 2, 12 |
| §4.6 gate change | 8 |
| §4.7 per-area confidence | 7 (step 4) |
| §4.8 equal area weighting | 6 (`capacity` doc comment + `fit.test.ts` "does not assume five items") |
| §5 throughput / capacity / gap | 6 |
| §5.1 rename not redefine | 7 |
| §5.2 no new field for the gate line | 13 (`cover.gatedBy` joins `gating_conditions`) |
| §5.3 cover layout | 15 |
| §5.4 stale cached payloads | 7 (version bump), 15 (step 6 notice) |
| §5.5 constant in methodology | 6 |
| §6.1 authored map | 9, 10 |
| §6.2 measured annotation | 11 |
| §6.3 reach | 11, 15 |
| §7 four layers | 13, 15 |
| §7.1 absorb BlindSpots + GenerositySplit | 13, 15 |
| §7.2 six-field dossier | 13, 15 |
| §7.3 enabler blind-spot hole named | 13, 14 |
| §7.4 view shape | 13, 16 |
| §7.5 privacy | 17 |
| §7.6 no 30/60/90 | 15 (step 5) |
| §7.8 inline rendering | 15 (step 3 asserts no `<details>`) |
| §8.1–8.2 new/modified files | File Structure |
| §8.3 untouched files | Global Constraints |
| §8.4 split `report.tsx` | 15 |
| §8.5 AI prose stays out of Layer 3 | see note below |
| §9.1 regression spine | 3 (step 7), 18 |
| §9.2 close the helpers blind spot first | 1 |
| §9.3 anti-vacuity identities | 2, 13, 17 |
| §9.4 judgement calls pinned | 6, 11 |
| §9.5 statistical traps | 11 |
| §9.6 report and audience tests | 15, 16, 17 |
| §9.7 tests requiring semantic change | 3, 4, 5, 13 |
| §10 owner-authored content | 10, 14 |

**§8.5 — dossiers are deterministic-only.** No task adds a field to `ReportBlocks` or extends `PROSE_MODE`'s surface. `fallbackProse` is touched in Task 7 only to fix `overall_score` consumers. The AI reworder keeps exactly its current scope — verdict, evidence, cost, blind spot, next step — and gains no new surface. **If any task tempts you to route a dossier field through the reworder, stop.** Eight dossiers × six fields is 48 new places for a reworder to drift and `passesFactCheck()`'s numeric-containment guardrail would not meaningfully constrain them.

**Type consistency check:** `AreaFit` (Task 2) is consumed unchanged by Tasks 3, 5, 11, 12. `Calibration` (Task 5) by 7, 11, 13. `DependencyEdge` (Task 9) by 11, 13. `scoreFromFit` replaces `scoreCategory` in exactly one place (Task 3 step 5). `respondent_id` is added once (Task 4) and used by `fitArea`'s `FitCell.respondent_id`, which already had that name in Task 2 — no rename. `disagreementFor` (Task 5) has the same 4-arg shape everywhere it appears.

**Known open item for the implementer, not a placeholder:** Task 4 step 2 requires reading the `responses` table definition to confirm the real user-id column name before writing the migration. That is a lookup against the live schema, deliberately not guessed here.

