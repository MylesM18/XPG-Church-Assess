# XPG Web Report Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-15-web-report-visual-design.md` (approved 2026-08-15). Do not reopen its decisions.

**Goal:** Give the web diagnosis report its own editorial layout language — eight new HTML/CSS visuals built from facts already computed, two rebuilt SVG charts, a cover tier ladder, labelled `s6` beats, and a per-section visual dispatcher — without touching the PDF.

**Architecture:** A new **pure** module `lib/report/web-visuals.ts` exposes `webVisuals(facts, methodology)` returning a keyed record of nullable view models. It attaches to `ResolvedReportSections` **beside `cover`**, never to `section.charts` (`tests/report/chart-parity.test.ts` hard-codes three chart kinds). Three existing models in `lib/report/charts.ts` gain one field each. The renderer side replaces the blind `section.charts.map` in `sections.tsx` with an explicit `SectionVisualsAbove` / `SectionVisualsBelow` dispatcher plus an `s10` body-replacement branch, and moves the eight new components into a new `report/web-visuals.tsx`.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, TypeScript 5.5, Tailwind CSS 4, Vitest 2.0.5. **No new dependencies.**

---

## Global Constraints

Every task's requirements implicitly include this section.

- **The PDF is untouched.** No change to `lib/report/pdf/document.tsx`, the PDF renderer, or any *existing* geometry in `lib/report/charts.ts`. Adding new fields to existing models is allowed; changing existing fields is not.
- **The prose is byte-identical.** No sentence of report copy changes. The only new words on the page are chrome: section eyebrows, the six `s6` beat labels, and chart labels listed in this plan.
- **No new dependencies.** No charting library. Hand-rolled HTML/CSS only.
- **`lib/report/charts.ts` and `lib/report/web-visuals.ts` are PURE** — no JSX, no `@react-pdf/renderer` import, no DOM. A react-pdf import there pulls the PDF engine into the public share page's client bundle.
- **Never an empty frame, never a "no data" message.** A visual with no data is absent; the prose stands alone.
- **Values are always real text**, never encoded in bar width alone. Bars and tracks are `aria-hidden`. `role="list"` on every list-shaped visual. Colour is never the only carrier of meaning.
- **`tests/a11y/shared-report-heading.test.ts` must stay green.** It strips comments, then matches `/<h1(?=[\s>/])/g` across `app/r/[shareToken]/page.tsx` **and** `app/app/[churchId]/diagnosis/report/sections.tsx` and requires the sum to be **exactly 1**. The two-literal-branch `h1`/`h2` ternary at `sections.tsx:268-272` must survive every refactor in this plan.
- **Component dispatchers use literal component tags with a `never` default.** The `react-hooks/static-components` + tsc-exhaustiveness reasoning is the doc comment at `sections.tsx:190-203`. A `Map.get(...)` or variable component identifier is a real eslint error in this repo, not a theoretical one.
- **Palette — use these exact hexes, no new colours.** Band fills: severe `#8C2F1F`, broken `#B4552F`, watch `#C08A2E`, holding `#4A6B4F`. `BAND_TEXT` = the same, except watch darkens to `#906722`. Ink `#1A1A18`, ink-soft `#5A5A54`, rule `#D8D5CE`, cream `#FAF7F0`. `THEME_FILL`: systems `#3F5E78`, culture `#7A5A86`, theology `#8A6A3A`, relational `#4A6B4F`. Import them from `lib/report/charts.ts`; never re-declare a hex that already lives there.
- **"Display serif"** means the existing `font-display` class. **"Body"** means `font-body`. No new typeface.
- **Do not touch the dead subtree** — `chain.tsx`, `system.tsx`, `dossier.tsx`, `cover.tsx` in `app/app/[churchId]/diagnosis/report/`. They are the entire scope of open PR #64.
- **Do not fix the cover-strip marker-vs-segments defect.** It lives in shared geometry, so the printed cover has it too. Logged as follow-up in spec §13.
- **Git:** explicit paths only, never `git add .`, never stage `.claude/`. **Prefix every git command that names a `[churchId]` or `[categoryId]` path with `GIT_LITERAL_PATHSPECS=1`.** Do not merge, push to `master`, or force-push.
- **Never run `npm run test:db`, `supabase db push`, or `supabase db reset`.**
- **Test command:** `npx vitest run <path>` for a file, `npx vitest run <path> -t "<test name>"` for one test. Full suite: `npm test`. Types: `npm run typecheck`. Lint: `npm run lint`.
- **Branch:** `fix/report-chart-label-legibility` (currently at `497552b`). All commits land here.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `lib/report/web-visuals.ts` | **Pure.** `webVisuals(facts, methodology)` → the eight new web-only view models, keyed by section id, nullable per §8 empty states. Owns every band lookup, ordering rule, and percentage computation so no renderer derives numbers. |
| `tests/report/web-visuals.test.ts` | Unit tests for the above: one per empty state, plus chain stage ordering and gate→stage mapping. |
| `app/app/[churchId]/diagnosis/report/web-visuals.tsx` | The eight new presentational components. Reads models for **values only**. No computation. |

### Modified

| File | Change |
|---|---|
| `lib/report/charts.ts` | Add `CoverModel.ladder`, `StatCell.percentile`, `RankRow.fullText`. Nothing else. |
| `lib/report/fallback-sections.ts:238` | Add `export` to `function roadmapEntries`. Nothing else moves. |
| `lib/report/resolve.ts:34-41, 74-84` | Add `visuals: WebVisuals` to `ResolvedReportSections`; call `webVisuals` beside `coverModel`; return it. |
| `app/r/[shareToken]/page.tsx:164, 191` | Call `webVisuals` into a local; pass to `<ReportSections visuals={…}>`. |
| `app/app/[churchId]/diagnosis/page.tsx:188, 263` | Destructure `visuals` from `resolveReportSections`; pass to `<ReportSections>`. |
| `app/app/[churchId]/diagnosis/report/report-cover.tsx:23-43, 84` | Delete the `CoverStrip` SVG; render an HTML `TierLadder` in its place. |
| `app/app/[churchId]/diagnosis/report/charts.tsx:30, 63, 90` | `WebStatGrid` gains the `<n>TH PCTL` line; `WebRankList` and `WebVerdictBlock` rebuilt in HTML. `WebChart` switch unchanged. |
| `app/app/[churchId]/diagnosis/report/sections.tsx:104-138, 256-278` | New section-opener chrome; `s6` beat labels; `SectionVisualsAbove` / `SectionVisualsBelow` dispatcher; `s10` body replacement; new `visuals` prop. |
| `tests/report/charts.test.ts:63-74, 97-132, 186-224` | Assert the three new fields. |

### Untouched — verify, do not edit

- `lib/report/pdf/document.tsx` and everything under `lib/report/pdf/`.
- `lib/report/compose.ts` — `chartsForSection` and both assemblers keep their current return type `AssembledSection[]`.
- `app/api/report/[runId]/pdf/route.ts:157` — it destructures `const { sections, stale, cover } = await resolveReportSections({…})`. Adding a `visuals` field to the returned object is **additive and safe**: it is simply not destructured. **Do not thread `visuals` into the PDF route.**
- `tests/report/chart-parity.test.ts`, `tests/report/fallback-sections.test.ts`, `tests/a11y/shared-report-heading.test.ts` — must stay green unmodified.

---

## Task list

| # | Task | Deliverable |
|---|---|---|
| 1 | `StatCell.percentile` | Slate item 2 |
| 2 | `RankRow.fullText` | Slate item 3 |
| 3 | `CoverModel.ladder` | Slate item 1 |
| 4 | Export `roadmapEntries` | Slate item 4a |
| 5 | `web-visuals.ts` — module skeleton, `s3` capacity bars, `s13` confidence | Slate item 4b |
| 6 | `web-visuals.ts` — `s4` constraint callout + blind-spot dumbbells | |
| 7 | `web-visuals.ts` — `s7` theme split, `s8` disagreement spread | |
| 8 | `web-visuals.ts` — `s9` dependency chain + gates | |
| 9 | `web-visuals.ts` — `s10` phase rail | |
| 10 | Wire the seam end-to-end: `resolve.ts`, share page, diagnosis page, `ReportSections` prop, **`WebConfidence` (`s13`)** | §5.1, §6.6 |
| 11 | Cover tier ladder (`report-cover.tsx`) | §6.2 |
| 12 | Rebuild `WebVerdictBlock` + `WebStatGrid` percentile line | §6.3 |
| 13 | Rebuild `WebRankList` | §6.5 |
| 14 | New components part 1 — `WebCapacityBars` (`s3`), `WebConstraintCallout` + `WebDumbbells` (`s4`) | §6.3–6.4 |
| 15 | New components part 2 — `WebThemeSplit` (`s7`), `WebSpread` (`s8`), `WebChainRail` (`s9`), `WebPhaseRail` (`s10`) | §6.5–6.6 |
| 16 | `SectionVisualsAbove` / `SectionVisualsBelow` dispatcher + `s10` body replacement | §5.2–5.3 |
| 17 | Section opener chrome + `s6` beat labels | §6.1 |
| 18 | Full-suite verification | §12 |

> **All 18 tasks are written below and the plan is complete.** Tasks 1–10 are model work with real unit tests. Tasks 11–17 are presentational and are gated by structural `grep -c` checks plus typecheck/lint/full-suite — see "Note on testing the renderer tasks" after Task 10 for why, and why adding a DOM test harness is not an option here. Task 18 is the end-to-end verification.
>
> **Dependency order is strictly sequential.** Task 11 needs Task 3's `ladder`; Task 12 needs Task 1's `percentile`; Task 13 needs Task 2's `fullText`; Tasks 14–15 need Tasks 5–9's models and the file Task 10 creates; Task 16 needs all of 10/14/15; Task 17 edits the same file Task 16 does. Do not parallelise them.

---

### Task 1: `StatCell.percentile`

`CategoryFact.percentile` is already `number | null` (`lib/report/facts.ts:23`). This is a straight pass-through — no new derivation.

**Files:**
- Modify: `lib/report/charts.ts` (the `StatCell` type body, and the cell literal inside `statGridModel`)
- Test: `tests/report/charts.test.ts:63-74` (the `keeps facts order and derives band + spelled-out label per cell` test)

**Interfaces:**
- Consumes: `CategoryFact.percentile: number | null` from `lib/report/facts.ts`.
- Produces: `StatCell.percentile: number | null` — read by Task 12's `WebStatGrid`.

- [ ] **Step 1: Write the failing assertion**

In `tests/report/charts.test.ts`, inside the existing `it('keeps facts order and derives band + spelled-out label per cell', …)` block, add one line immediately after the `expect(cell.score).toBe(cat.score);` line:

```ts
      expect(cell.percentile).toBe(cat.percentile);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/report/charts.test.ts -t "keeps facts order and derives band"
```

Expected: FAIL — `expected undefined to be <number|null>`.

- [ ] **Step 3: Add the field**

In `lib/report/charts.ts`, in the `StatCell` type body, add the field immediately after `score: number; band: BandKey;`:

```ts
  /** Cohort percentile for the "vs. cohort" annotation (spec §6.3). Straight
   * pass-through of CategoryFact.percentile; null when the cohort is too thin.
   * WEB ONLY — the PDF stat grid does not render it. */
  percentile: number | null;
```

In `statGridModel`, in the object literal pushed into `cells`, add `percentile: c.percentile,` immediately after the `score: c.score,` line.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/report/charts.test.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. (Confirms the PDF stat grid still compiles against the widened type.)

- [ ] **Step 6: Commit**

```bash
git add lib/report/charts.ts tests/report/charts.test.ts
git commit -m "feat(report): add StatCell.percentile for the web stat grid"
```

---

### Task 2: `RankRow.fullText`

The PDF keeps rendering the 90-char `text`; the rebuilt web rank list wraps, so it renders the untruncated string.

**Files:**
- Modify: `lib/report/charts.ts` (the `RankRow` type body, and the row literal inside `rankListModel`)
- Test: `tests/report/charts.test.ts:97-132`

**Interfaces:**
- Consumes: `BottomItemFact.text: string` from `lib/report/facts.ts`.
- Produces: `RankRow.fullText: string` — the untruncated `item.text`, read by Task 13's `WebRankList`.

- [ ] **Step 1: Write the failing assertions**

In `tests/report/charts.test.ts`, inside `it('ranks rows 01..NN in facts order with in-viewBox geometry', …)`, add one line immediately after `expect(row.itemId).toBe(item.item_id);`:

```ts
        expect(row.fullText).toBe(item.text);
```

And inside `it('truncates very long item text with ASCII ellipsis (font subset has no …)', …)`, add these two lines immediately after `expect(model.rows[0]!.text.endsWith('...')).toBe(true);`:

```ts
    expect(model.rows[0]!.fullText).toBe(long);
    expect(model.rows[0]!.fullText.length).toBe(200);
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/charts.test.ts -t "rankListModel"
```

Expected: FAIL — `expected undefined to be '…'`.

- [ ] **Step 3: Add the field**

In `lib/report/charts.ts`, in the `RankRow` type body, add immediately after the `text: string;` member (keeping `text` exactly as it is):

```ts
  /** The untruncated item.text. WEB ONLY — the rebuilt web rank list wraps, so
   * it never needs RANK_TEXT_MAX. The PDF keeps reading `text` (spec §6.5). */
  fullText: string;
```

In `rankListModel`, in the row object literal, add `fullText: item.text,` immediately after the existing `text: …` property (leave the truncation expression untouched).

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/charts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/report/charts.ts tests/report/charts.test.ts
git commit -m "feat(report): add RankRow.fullText for the rebuilt web rank list"
```

---

### Task 3: `CoverModel.ladder`

`methodology.rules.tiers` is a **fixed four-key object, not an array** (`lib/methodology/schema.ts:86-91`), so the worst→best order is hand-ordered here. That order matches `STRIP_BANDS` and `verdictBandFor`: `at_risk→severe, strained→broken, healthy_stretched→watch, healthy_ready→holding`.

**Files:**
- Modify: `lib/report/charts.ts` (new `LADDER_ORDER` const, new `CoverLadderRow` type, `CoverModel` type body, `coverModel` return literal)
- Test: `tests/report/charts.test.ts:186-224` (the `coverModel` describe block)

**Interfaces:**
- Consumes: `methodology.rules.tiers` (four keys, each `{ min: number; name: string }`), `facts.overall.tier.id`, and the existing `verdictBandFor(tierId): BandKey`.
- Produces:
  ```ts
  export type CoverLadderRow = { tierId: LadderTierId; name: string; band: BandKey; active: boolean };
  export type LadderTierId = 'at_risk' | 'strained' | 'healthy_stretched' | 'healthy_ready';
  // CoverModel.ladder: CoverLadderRow[]  — always exactly 4 rows, worst → best
  ```
  Read by Task 11's `TierLadder`.

- [ ] **Step 1: Write the failing test**

In `tests/report/charts.test.ts`, inside the `describe('coverModel', …)` block, add this test immediately after the existing `it('mirrors the verdict and reuses the s3 xpg_read line as headline', …)`:

```ts
  it('builds a worst-to-best tier ladder with exactly one active row', () => {
    for (const { facts } of ALL_FIXTURES) {
      const model = coverModel(facts, methodology);
      expect(model.ladder.map((r) => r.tierId)).toEqual([
        'at_risk', 'strained', 'healthy_stretched', 'healthy_ready',
      ]);
      expect(model.ladder.map((r) => r.band)).toEqual(['severe', 'broken', 'watch', 'holding']);
      for (const row of model.ladder) {
        expect(row.name).toBe(methodology.rules.tiers[row.tierId].name);
        expect(row.active).toBe(row.tierId === facts.overall.tier.id);
      }
      expect(model.ladder.filter((r) => r.active)).toHaveLength(1);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/report/charts.test.ts -t "worst-to-best tier ladder"
```

Expected: FAIL — `Cannot read properties of undefined (reading 'map')`.

- [ ] **Step 3: Implement**

In `lib/report/charts.ts`, add above the `CoverModel` type:

```ts
/** rules.tiers is a fixed four-key object, not an array (methodology/schema.ts:86-91),
 * so the ladder's worst -> best row order is hand-ordered here. It matches
 * STRIP_BANDS and verdictBandFor one-for-one. */
export const LADDER_ORDER = ['at_risk', 'strained', 'healthy_stretched', 'healthy_ready'] as const;
export type LadderTierId = (typeof LADDER_ORDER)[number];
export type CoverLadderRow = {
  tierId: LadderTierId;
  name: string;
  band: BandKey;
  /** True for the church's own tier. Renderers set aria-current on this row. */
  active: boolean;
};
```

In the `CoverModel` type body, add after the `strip: …` member:

```ts
  /** Four discrete tier steps, worst -> best (spec §6.2). WEB ONLY — the PDF
   * keeps rendering `strip`. */
  ladder: CoverLadderRow[];
```

In `coverModel`, add to the returned object literal, immediately after the `strip: { … }` property:

```ts
    ladder: LADDER_ORDER.map((tierId) => ({
      tierId,
      name: methodology.rules.tiers[tierId].name,
      band: verdictBandFor(tierId),
      active: tierId === facts.overall.tier.id,
    })),
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/charts.test.ts && npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/report/charts.ts tests/report/charts.test.ts
git commit -m "feat(report): add CoverModel.ladder for the web cover tier ladder"
```

---

### Task 4: Export `roadmapEntries`

**Files:**
- Modify: `lib/report/fallback-sections.ts:238` — add `export` to the `function roadmapEntries` line.

**Interfaces:**
- Produces: `export function roadmapEntries(facts: FactsPack, methodology: Methodology): Array<{ dayLabel: string; text: string }>` — consumed by Task 9.

Its two existing callers (`s10Bullets` at `:274`, `s11Bullets` at `:331`) are unaffected. Nothing else moves.

- [ ] **Step 1: Write the failing test**

Create `tests/report/web-visuals.test.ts` with only this content for now:

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { roadmapEntries } from '@/lib/report/fallback-sections';
import { CAPACITY_FACTS } from '../fixtures/facts';

describe('roadmapEntries is exported for the web phase rail', () => {
  const methodology = loadMethodology();

  it('returns one {dayLabel, text} entry per populated phase', () => {
    const entries = roadmapEntries(CAPACITY_FACTS, methodology);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeLessThanOrEqual(3);
    for (const entry of entries) {
      expect(typeof entry.dayLabel).toBe('string');
      expect(typeof entry.text).toBe('string');
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });

  it('is pure', () => {
    expect(roadmapEntries(CAPACITY_FACTS, methodology)).toEqual(
      roadmapEntries(CAPACITY_FACTS, methodology),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/report/web-visuals.test.ts
```

Expected: FAIL — `roadmapEntries is not exported by lib/report/fallback-sections.ts`.

- [ ] **Step 3: Add the export**

In `lib/report/fallback-sections.ts:238`, change:

```ts
function roadmapEntries(
```

to:

```ts
export function roadmapEntries(
```

Change nothing else in the file.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/web-visuals.test.ts tests/report/fallback-sections.test.ts
```

Expected: PASS both files — `fallback-sections.test.ts` is unchanged and must stay green (the export is purely additive).

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/report/fallback-sections.ts tests/report/web-visuals.test.ts
git commit -m "feat(report): export roadmapEntries for the web phase rail"
```

---

### Task 5: `web-visuals.ts` — skeleton, `s3` capacity bars, `s13` confidence

Creates the pure seam module. Tasks 6–9 widen the `WebVisuals` type one key at a time; nothing outside `lib/report/` imports it until Task 10.

**Files:**
- Create: `lib/report/web-visuals.ts`
- Modify: `tests/report/web-visuals.test.ts` (append)

**Interfaces:**
- Consumes: `FactsPack` (`lib/report/facts.ts`), `Methodology` (`lib/methodology/schema.ts`), `readingBand(state, score, thresholds)` (`lib/report/view.ts`), `verdictBandFor(tierId)` and `BandKey` (`lib/report/charts.ts`), `CategoryState` (`lib/engine/types.ts`).
- Produces:
  ```ts
  export type CapacityBarsModel = {
    band: BandKey; capacity: number; throughput: number;
    capacityPct: number; throughputPct: number;
    gap: number; gapLabel: string | null;   // `${gap} POINTS LOST`, null when gap <= 0
  };
  export type ConfidenceModel = {
    pct: number; label: string;             // `${pct}%`
    respondents: number; areas: number;
    thinnest: { name: string; count: number } | null;
  };
  export type WebVisuals = {
    s3: { capacity: CapacityBarsModel };
    s13: { confidence: ConfidenceModel };
  };
  export function webVisuals(facts: FactsPack, methodology: Methodology): WebVisuals;
  ```
  Also produces two module-private helpers later tasks reuse: `pct(value: number): number` (clamps 0–100) and `categoryLookup(facts, methodology, categoryId): { name: string; score: number; band: BandKey } | null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/web-visuals.test.ts` (and add `makeFacts` to the existing fixtures import, and `webVisuals` as a new import from `@/lib/report/web-visuals`):

```ts
describe('webVisuals — s3 capacity bars', () => {
  const methodology = loadMethodology();

  it('mirrors overall and scales both bars on a shared 0-100 axis', () => {
    const { capacity } = webVisuals(CAPACITY_FACTS, methodology).s3;
    expect(capacity.capacity).toBe(CAPACITY_FACTS.overall.capacity);
    expect(capacity.throughput).toBe(CAPACITY_FACTS.overall.throughput);
    expect(capacity.gap).toBe(CAPACITY_FACTS.overall.gap);
    expect(capacity.capacityPct).toBeCloseTo(CAPACITY_FACTS.overall.capacity, 5);
    expect(capacity.throughputPct).toBeCloseTo(CAPACITY_FACTS.overall.throughput, 5);
    expect(capacity.band).toBe('broken');
  });

  it('prints the points-lost chip only when the gap is positive', () => {
    const positive = webVisuals(
      makeFacts({ overall: { ...CAPACITY_FACTS.overall, gap: 19 } }),
      methodology,
    ).s3.capacity;
    expect(positive.gapLabel).toBe('19 POINTS LOST');

    for (const gap of [0, -3]) {
      const model = webVisuals(
        makeFacts({ overall: { ...CAPACITY_FACTS.overall, gap } }),
        methodology,
      ).s3.capacity;
      expect(model.gapLabel).toBeNull();
    }
  });
});

describe('webVisuals — s13 confidence', () => {
  const methodology = loadMethodology();

  it('prints confidence as a whole percentage with the sample basis', () => {
    const { confidence } = webVisuals(CAPACITY_FACTS, methodology).s13;
    expect(confidence.pct).toBe(Math.round(CAPACITY_FACTS.confidence * 100));
    expect(confidence.label).toBe(`${confidence.pct}%`);
    expect(confidence.respondents).toBe(CAPACITY_FACTS.cover.respondent_count);
    expect(confidence.areas).toBe(CAPACITY_FACTS.categories.length);
  });

  it('reports the thinnest coverage by area name and count', () => {
    const { confidence } = webVisuals(CAPACITY_FACTS, methodology).s13;
    const min = Math.min(...CAPACITY_FACTS.categories.map((c) => c.respondent_count));
    expect(confidence.thinnest).not.toBeNull();
    expect(confidence.thinnest!.count).toBe(min);
    expect(CAPACITY_FACTS.categories.some(
      (c) => c.name === confidence.thinnest!.name && c.respondent_count === min,
    )).toBe(true);
  });

  it('has no thinnest row when there are no categories', () => {
    const model = webVisuals(makeFacts({ categories: [] }), methodology).s13.confidence;
    expect(model.thinnest).toBeNull();
    expect(model.areas).toBe(0);
  });
});

describe('webVisuals is pure', () => {
  const methodology = loadMethodology();

  it('returns deep-equal output for the same input', () => {
    expect(webVisuals(CAPACITY_FACTS, methodology)).toEqual(webVisuals(CAPACITY_FACTS, methodology));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/web-visuals.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/report/web-visuals"`.

- [ ] **Step 3: Create the module**

Create `lib/report/web-visuals.ts`:

```ts
/**
 * Web-only view models for the diagnosis report (spec §5.1).
 *
 * PURE — no JSX, no @react-pdf/renderer import, no DOM. A react-pdf import here
 * would pull the PDF engine into the public share page's client bundle.
 *
 * Takes `methodology` as well as `facts` because two visuals need
 * methodology-only data: the chain stage order (rules.chain) and the
 * gate -> stage mapping (rules.enablers[].gates). Neither is in the facts pack.
 * This mirrors statGridModel, which already takes both.
 *
 * Bands are computed with readingBand, exactly as statGridModel does — NOT from
 * areaIndexFrom(sections). Same function means no drift, and this module stays a
 * pure function of facts + methodology with no dependency on assembled sections.
 *
 * Attached to ResolvedReportSections beside `cover`, NEVER to section.charts:
 * tests/report/chart-parity.test.ts hard-codes the three known chart kinds.
 */
import type { Methodology } from '../methodology/schema';
import type { CategoryState } from '../engine/types';
import type { FactsPack } from './facts';
import { readingBand } from './view';
import { verdictBandFor, type BandKey } from './charts';

/** Clamp a 0-100 score into a track percentage. */
function pct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Resolve a category id to its display name, score and reading band.
 * Returns null when the id is not in the facts pack. */
function categoryLookup(
  facts: FactsPack,
  methodology: Methodology,
  categoryId: string,
): { name: string; score: number; band: BandKey } | null {
  const cat = facts.categories.find((c) => c.id === categoryId);
  if (!cat) return null;
  return {
    name: cat.name,
    score: cat.score,
    band: readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
  };
}

export type CapacityBarsModel = {
  band: BandKey;
  capacity: number;
  throughput: number;
  capacityPct: number;
  throughputPct: number;
  gap: number;
  /** `${gap} POINTS LOST`. Null when the gap is zero or negative (spec §8). */
  gapLabel: string | null;
};

export type ConfidenceModel = {
  pct: number;
  label: string;
  respondents: number;
  areas: number;
  /** Minimum categories[].respondent_count with its area name. Area names only —
   * never respondent labels or ids (spec §10). */
  thinnest: { name: string; count: number } | null;
};

export type WebVisuals = {
  s3: { capacity: CapacityBarsModel };
  s13: { confidence: ConfidenceModel };
};

function capacityBars(facts: FactsPack): CapacityBarsModel {
  const { capacity, throughput, gap } = facts.overall;
  return {
    band: verdictBandFor(facts.overall.tier.id),
    capacity,
    throughput,
    capacityPct: pct(capacity),
    throughputPct: pct(throughput),
    gap,
    gapLabel: gap > 0 ? `${gap} POINTS LOST` : null,
  };
}

function confidenceModel(facts: FactsPack): ConfidenceModel {
  const percent = Math.round(facts.confidence * 100);
  let thinnest: { name: string; count: number } | null = null;
  for (const cat of facts.categories) {
    if (!thinnest || cat.respondent_count < thinnest.count) {
      thinnest = { name: cat.name, count: cat.respondent_count };
    }
  }
  return {
    pct: percent,
    label: `${percent}%`,
    respondents: facts.cover.respondent_count,
    areas: facts.categories.length,
    thinnest,
  };
}

export function webVisuals(facts: FactsPack, methodology: Methodology): WebVisuals {
  void methodology;
  return {
    s3: { capacity: capacityBars(facts) },
    s13: { confidence: confidenceModel(facts) },
  };
}
```

> `void methodology;` is a deliberate one-line placeholder-suppressor for the unused parameter and is **deleted in Task 6**, which is the first task to use it.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/web-visuals.test.ts && npm run typecheck && npm run lint
```

Expected: PASS, no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add lib/report/web-visuals.ts tests/report/web-visuals.test.ts
git commit -m "feat(report): add pure web-visuals seam with s3 capacity bars and s13 confidence"
```

---

### Task 6: `web-visuals.ts` — `s4` constraint callout + blind-spot dumbbells

`facts.primary_constraint` is `{category_id, name}` only — **it carries no score**. The score comes from `facts.categories` and the band from `readingBand`, which is exactly why spec §5.1 rules `readingBand` over `areaIndexFrom`.

**Files:**
- Modify: `lib/report/web-visuals.ts`
- Modify: `tests/report/web-visuals.test.ts` (append)

**Interfaces:**
- Consumes: `pct`, `categoryLookup`, `WebVisuals` from Task 5. `facts.primary_constraint`, `facts.gating[]` (`{enabler_id, name, score, note}`), `facts.blind_spots[]` (`{category_id, name, belief, evidence, gap}`).
- Produces:
  ```ts
  export type ConstraintRow = { id: string; name: string; score: number; note: string | null };
  export type ConstraintCalloutModel = {
    eyebrow: 'PRIMARY CONSTRAINT' | 'GATING ENABLER';
    band: BandKey; rows: ConstraintRow[];
  };
  export type DumbbellRow = {
    id: string; name: string; belief: number; evidence: number; gap: number;
    band: BandKey; beliefPct: number; evidencePct: number;
  };
  export type DumbbellsModel = { rows: DumbbellRow[] };
  // WebVisuals gains: s4: { constraint: ConstraintCalloutModel | null; dumbbells: DumbbellsModel | null }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/web-visuals.test.ts`:

```ts
describe('webVisuals — s4 constraint callout', () => {
  const methodology = loadMethodology();

  it('prefers the primary constraint and looks its score up in categories', () => {
    const cat = CAPACITY_FACTS.categories[CAPACITY_FACTS.categories.length - 1]!;
    const facts = makeFacts({ primary_constraint: { category_id: cat.id, name: cat.name } });
    const model = webVisuals(facts, methodology).s4.constraint;
    expect(model).not.toBeNull();
    expect(model!.eyebrow).toBe('PRIMARY CONSTRAINT');
    expect(model!.rows).toHaveLength(1);
    expect(model!.rows[0]!).toEqual({ id: cat.id, name: cat.name, score: cat.score, note: null });
    expect(model!.band).toBe(
      readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
    );
  });

  it('falls back to gated enablers, one row each, banded by the lowest score', () => {
    const facts = makeFacts({
      primary_constraint: null,
      gating: [
        { enabler_id: 'comm', name: 'Communication', score: 40, note: 'Gates guest and connect' },
        { enabler_id: 'gov', name: 'Governance', score: 22, note: 'Gates everything' },
      ],
    });
    const model = webVisuals(facts, methodology).s4.constraint;
    expect(model).not.toBeNull();
    expect(model!.eyebrow).toBe('GATING ENABLER');
    expect(model!.rows.map((r) => r.id)).toEqual(['comm', 'gov']);
    expect(model!.rows[1]!.note).toBe('Gates everything');
    // Panel ground follows the worst (lowest-scoring) gated enabler.
    expect(model!.band).toBe('severe');
  });

  it('is omitted with no primary constraint and no gated enabler', () => {
    const facts = makeFacts({ primary_constraint: null, gating: [] });
    expect(webVisuals(facts, methodology).s4.constraint).toBeNull();
  });
});

describe('webVisuals — s4 blind-spot dumbbells', () => {
  const methodology = loadMethodology();

  it('plots evidence and belief on a shared 0-100 track in facts order', () => {
    const cat = CAPACITY_FACTS.categories[0]!;
    const facts = makeFacts({
      blind_spots: [
        { category_id: cat.id, name: cat.name, belief: 78, evidence: 41, gap: 37 },
      ],
    });
    const model = webVisuals(facts, methodology).s4.dumbbells;
    expect(model).not.toBeNull();
    expect(model!.rows).toHaveLength(1);
    const row = model!.rows[0]!;
    expect(row).toMatchObject({ id: cat.id, name: cat.name, belief: 78, evidence: 41, gap: 37 });
    expect(row.beliefPct).toBeCloseTo(78, 5);
    expect(row.evidencePct).toBeCloseTo(41, 5);
    expect(row.band).toBe(
      readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
    );
  });

  it('is omitted when there are no blind spots', () => {
    expect(webVisuals(makeFacts({ blind_spots: [] }), methodology).s4.dumbbells).toBeNull();
  });
});
```

Add `readingBand` and the `CategoryState` type to the test file's imports:

```ts
import { readingBand } from '@/lib/report/view';
import type { CategoryState } from '@/lib/engine/types';
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/web-visuals.test.ts -t "s4"
```

Expected: FAIL — `Cannot read properties of undefined (reading 'constraint')`.

- [ ] **Step 3: Implement**

In `lib/report/web-visuals.ts`, add after the `ConfidenceModel` type:

```ts
export type ConstraintRow = { id: string; name: string; score: number; note: string | null };

export type ConstraintCalloutModel = {
  eyebrow: 'PRIMARY CONSTRAINT' | 'GATING ENABLER';
  /** Panel ground. On the gating face this follows the worst (lowest-scoring)
   * gated enabler, so the panel never looks healthier than its worst row. */
  band: BandKey;
  rows: ConstraintRow[];
};

export type DumbbellRow = {
  id: string;
  name: string;
  belief: number;
  evidence: number;
  gap: number;
  band: BandKey;
  beliefPct: number;
  evidencePct: number;
};

export type DumbbellsModel = { rows: DumbbellRow[] };
```

Widen `WebVisuals` to:

```ts
export type WebVisuals = {
  s3: { capacity: CapacityBarsModel };
  s4: { constraint: ConstraintCalloutModel | null; dumbbells: DumbbellsModel | null };
  s13: { confidence: ConfidenceModel };
};
```

Add the two builders:

```ts
function constraintCallout(
  facts: FactsPack,
  methodology: Methodology,
): ConstraintCalloutModel | null {
  const primary = facts.primary_constraint;
  if (primary) {
    const found = categoryLookup(facts, methodology, primary.category_id);
    if (found) {
      return {
        eyebrow: 'PRIMARY CONSTRAINT',
        band: found.band,
        rows: [{ id: primary.category_id, name: primary.name, score: found.score, note: null }],
      };
    }
    // No matching category means no truthful score to print, so fall through to
    // the gating face rather than render a panel with a fabricated number.
  }

  if (facts.gating.length === 0) return null;

  let worst = facts.gating[0]!;
  for (const gate of facts.gating) {
    if (gate.score < worst.score) worst = gate;
  }
  const worstBand = categoryLookup(facts, methodology, worst.enabler_id)?.band ?? 'severe';

  return {
    eyebrow: 'GATING ENABLER',
    band: worstBand,
    rows: facts.gating.map((gate) => ({
      id: gate.enabler_id,
      name: gate.name,
      score: gate.score,
      note: gate.note,
    })),
  };
}

function dumbbells(facts: FactsPack, methodology: Methodology): DumbbellsModel | null {
  if (facts.blind_spots.length === 0) return null;
  return {
    rows: facts.blind_spots.map((spot) => ({
      id: spot.category_id,
      name: spot.name,
      belief: spot.belief,
      evidence: spot.evidence,
      gap: spot.gap,
      band: categoryLookup(facts, methodology, spot.category_id)?.band ?? 'severe',
      beliefPct: pct(spot.belief),
      evidencePct: pct(spot.evidence),
    })),
  };
}
```

In `webVisuals`, delete the `void methodology;` line and add the `s4` key:

```ts
export function webVisuals(facts: FactsPack, methodology: Methodology): WebVisuals {
  return {
    s3: { capacity: capacityBars(facts) },
    s4: {
      constraint: constraintCallout(facts, methodology),
      dumbbells: dumbbells(facts, methodology),
    },
    s13: { confidence: confidenceModel(facts) },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/web-visuals.test.ts && npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/report/web-visuals.ts tests/report/web-visuals.test.ts
git commit -m "feat(report): add s4 constraint callout and blind-spot dumbbells to web-visuals"
```

---

### Task 7: `web-visuals.ts` — `s7` theme split + `s8` disagreement spread

`facts.dispersion` is **flagged-only** (`facts.ts:219` maps `d.disagreement_flags`), so every row has already cleared the threshold. The marker is a floor every bar crosses — label it `THRESHOLD 2.0`, never pass/fail language. The threshold value is **read from `rules.thresholds.dispersion`, never hardcoded**.

**Files:**
- Modify: `lib/report/web-visuals.ts`
- Modify: `tests/report/web-visuals.test.ts` (append)

**Interfaces:**
- Consumes: `WebVisuals`, `categoryLookup` from Tasks 5–6. `facts.pattern_counts: Record<Theme, number>` (all four keys always present), `facts.dispersion[]` (`{category_id, name, spread}`), `methodology.rules.thresholds.dispersion`.
- Produces:
  ```ts
  export type ThemeSplitRow = { theme: Theme; label: string; count: number; pct: number };
  export type ThemeSplitModel = { rows: ThemeSplitRow[]; total: number; label: string };
  export type SpreadRow = { id: string; name: string; spread: number; pct: number; band: BandKey };
  export type SpreadModel = {
    rows: SpreadRow[]; axisMax: number; axisMaxLabel: string;
    threshold: number; thresholdPct: number; thresholdLabel: string;
  };
  // WebVisuals gains: s7: { themeSplit: ThemeSplitModel | null }; s8: { spread: SpreadModel | null }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/web-visuals.test.ts`:

```ts
describe('webVisuals — s7 theme split', () => {
  const methodology = loadMethodology();

  it('always renders all four themes, descending by count, ties in canonical order', () => {
    const facts = makeFacts({
      pattern_counts: { systems: 1, culture: 3, theology: 0, relational: 1 },
    });
    const model = webVisuals(facts, methodology).s7.themeSplit;
    expect(model).not.toBeNull();
    expect(model!.total).toBe(5);
    expect(model!.rows).toHaveLength(4);
    expect(model!.rows.map((r) => r.theme)).toEqual(['culture', 'systems', 'relational', 'theology']);
    expect(model!.rows.map((r) => r.count)).toEqual([3, 1, 1, 0]);
    expect(model!.rows[0]!.pct).toBeCloseTo(60, 5);
    expect(model!.rows[3]!.pct).toBeCloseTo(0, 5);
    expect(model!.rows[0]!.label).toBe('CULTURE');
    expect(model!.label).toBe('THEME OF THE WEAKEST INDICATORS');
  });

  it('is omitted when the total is zero', () => {
    const facts = makeFacts({
      bottom_items: [],
      pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 },
    });
    expect(webVisuals(facts, methodology).s7.themeSplit).toBeNull();
  });
});

describe('webVisuals — s8 disagreement spread', () => {
  const methodology = loadMethodology();

  it('self-scales the axis to at least 4 and reads the threshold from methodology', () => {
    const cat = CAPACITY_FACTS.categories[0]!;
    const facts = makeFacts({
      dispersion: [{ category_id: cat.id, name: cat.name, spread: 2.4 }],
    });
    const model = webVisuals(facts, methodology).s8.spread;
    expect(model).not.toBeNull();
    expect(model!.axisMax).toBe(4);
    expect(model!.axisMaxLabel).toBe('4');
    expect(model!.threshold).toBe(methodology.rules.thresholds.dispersion);
    expect(model!.thresholdLabel).toBe('THRESHOLD 2.0');
    expect(model!.thresholdPct).toBeCloseTo(50, 5);
    expect(model!.rows[0]!.pct).toBeCloseTo(60, 5);
    expect(model!.rows[0]!.band).toBe(
      readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
    );
  });

  it('grows the axis past 4 and never clips the largest bar', () => {
    const cat = CAPACITY_FACTS.categories[0]!;
    const facts = makeFacts({
      dispersion: [
        { category_id: cat.id, name: cat.name, spread: 5.2 },
        { category_id: cat.id, name: cat.name, spread: 3.1 },
      ],
    });
    const model = webVisuals(facts, methodology).s8.spread;
    expect(model!.axisMax).toBe(6);
    for (const row of model!.rows) {
      expect(row.pct).toBeLessThanOrEqual(100);
    }
    expect(model!.rows[0]!.pct).toBeCloseTo((5.2 / 6) * 100, 5);
  });

  it('is omitted when nothing was flagged', () => {
    expect(webVisuals(makeFacts({ dispersion: [] }), methodology).s8.spread).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/web-visuals.test.ts -t "s7 theme split"
```

Expected: FAIL — `Cannot read properties of undefined (reading 'themeSplit')`.

- [ ] **Step 3: Implement**

In `lib/report/web-visuals.ts`, add `Theme` to the schema type import:

```ts
import type { Methodology, Theme } from '../methodology/schema';
```

Add after the `DumbbellsModel` type:

```ts
/** Canonical key order, used only to break count ties (spec §6.5). */
const THEME_ORDER: Theme[] = ['systems', 'culture', 'theology', 'relational'];

export type ThemeSplitRow = { theme: Theme; label: string; count: number; pct: number };

export type ThemeSplitModel = {
  rows: ThemeSplitRow[];
  total: number;
  /** Not "the six" — bottom_items can be fewer than six. */
  label: string;
};

export type SpreadRow = { id: string; name: string; spread: number; pct: number; band: BandKey };

export type SpreadModel = {
  rows: SpreadRow[];
  /** Self-scaling axis: max(ceil(largest spread), 4). Never clips. A true 0-10
   * axis would stub every bar (spread is a 0-10 population SD at 2dp). */
  axisMax: number;
  axisMaxLabel: string;
  threshold: number;
  thresholdPct: number;
  /** dispersion is flagged-only, so this marker is a floor every bar crosses.
   * Never "above"/"below", never pass/fail language. */
  thresholdLabel: string;
};
```

Widen `WebVisuals` by adding, in section order:

```ts
  s7: { themeSplit: ThemeSplitModel | null };
  s8: { spread: SpreadModel | null };
```

Add the two builders:

```ts
function themeSplit(facts: FactsPack): ThemeSplitModel | null {
  const total = THEME_ORDER.reduce((sum, theme) => sum + facts.pattern_counts[theme], 0);
  if (total === 0) return null;

  const rows = THEME_ORDER.map((theme) => ({
    theme,
    label: theme.toUpperCase(),
    count: facts.pattern_counts[theme],
    pct: (facts.pattern_counts[theme] / total) * 100,
  })).sort((a, b) =>
    b.count - a.count || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme),
  );

  return { rows, total, label: 'THEME OF THE WEAKEST INDICATORS' };
}

function spreadModel(facts: FactsPack, methodology: Methodology): SpreadModel | null {
  if (facts.dispersion.length === 0) return null;

  const largest = Math.max(...facts.dispersion.map((d) => d.spread));
  const axisMax = Math.max(Math.ceil(largest), 4);
  const threshold = methodology.rules.thresholds.dispersion;

  return {
    rows: facts.dispersion.map((d) => ({
      id: d.category_id,
      name: d.name,
      spread: d.spread,
      pct: (d.spread / axisMax) * 100,
      band: categoryLookup(facts, methodology, d.category_id)?.band ?? 'severe',
    })),
    axisMax,
    axisMaxLabel: String(axisMax),
    threshold,
    thresholdPct: (threshold / axisMax) * 100,
    thresholdLabel: `THRESHOLD ${threshold.toFixed(1)}`,
  };
}
```

Add both keys to the `webVisuals` return, in section order:

```ts
    s7: { themeSplit: themeSplit(facts) },
    s8: { spread: spreadModel(facts, methodology) },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/web-visuals.test.ts && npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/report/web-visuals.ts tests/report/web-visuals.test.ts
git commit -m "feat(report): add s7 theme split and s8 disagreement spread to web-visuals"
```

---

### Task 8: `web-visuals.ts` — `s9` dependency chain + gates

Two source facts the plan must handle exactly:

- **Stage order is not in the facts pack.** `facts.categories` is score-sorted and `dependencies[]` is a mapped edge list with no path guarantee. The order is `methodology.rules.chain = [guest, conn, disc, vol, gen]` (`rules.yaml:2`). **This is why `webVisuals` takes `methodology`.**
- **`rules.enablers[id].gates` is `'all' | string[]`** (`lib/methodology/schema.ts:57`; `gov: all`, `comm: [guest, conn]`, `sys: [vol, disc]`). The mapping **must handle the `'all'` string literal**, not just arrays.

**Files:**
- Modify: `lib/report/web-visuals.ts`
- Modify: `tests/report/web-visuals.test.ts` (append)

**Interfaces:**
- Consumes: `categoryLookup`, `WebVisuals`. `methodology.rules.chain: string[]` (length 5), `methodology.rules.enablers: Record<string, { gates: 'all' | string[] }>`, `facts.gating[]`, `facts.dependencies[].read_sentence`.
- Produces:
  ```ts
  export type ChainGate = { id: string; name: string; score: number; note: string; band: BandKey };
  export type ChainStage = {
    id: string; ordinal: string;   // '01'..'05'
    name: string; score: number; band: BandKey; gates: ChainGate[];
  };
  export type ChainModel = { stages: ChainStage[]; reads: string[] };
  // WebVisuals gains: s9: { chain: ChainModel }   — never null (spec §8)
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/web-visuals.test.ts`:

```ts
describe('webVisuals — s9 dependency chain', () => {
  const methodology = loadMethodology();

  it('orders stages by rules.chain, not by score', () => {
    const model = webVisuals(CAPACITY_FACTS, methodology).s9.chain;
    const expected = methodology.rules.chain.filter((id) =>
      CAPACITY_FACTS.categories.some((c) => c.id === id),
    );
    expect(model.stages.map((s) => s.id)).toEqual(expected);
    expect(model.stages.map((s) => s.ordinal)).toEqual(
      expected.map((_, i) => String(i + 1).padStart(2, '0')),
    );
    for (const stage of model.stages) {
      const cat = CAPACITY_FACTS.categories.find((c) => c.id === stage.id)!;
      expect(stage.name).toBe(cat.name);
      expect(stage.score).toBe(cat.score);
      expect(stage.band).toBe(
        readingBand(cat.state as CategoryState, cat.score, methodology.rules.thresholds),
      );
    }
  });

  it("maps the 'all' gates literal to every stage and arrays to their own stages", () => {
    const facts = makeFacts({
      gating: [
        { enabler_id: 'gov', name: 'Governance', score: 22, note: 'Gates everything' },
        { enabler_id: 'comm', name: 'Communication', score: 40, note: 'Gates the front door' },
      ],
    });
    const model = webVisuals(facts, methodology).s9.chain;
    for (const stage of model.stages) {
      expect(stage.gates.map((g) => g.id)).toContain('gov');
    }
    const withComm = model.stages.filter((s) => s.gates.some((g) => g.id === 'comm'));
    expect(withComm.map((s) => s.id).sort()).toEqual(['conn', 'guest']);
    const gov = model.stages[0]!.gates.find((g) => g.id === 'gov')!;
    expect(gov).toMatchObject({ name: 'Governance', score: 22, note: 'Gates everything' });
  });

  it('carries the existing read sentences and never goes empty', () => {
    const model = webVisuals(CAPACITY_FACTS, methodology).s9.chain;
    expect(model.reads).toEqual(CAPACITY_FACTS.dependencies.map((d) => d.read_sentence));
    expect(webVisuals(makeFacts({ gating: [], dependencies: [] }), methodology).s9.chain)
      .not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/web-visuals.test.ts -t "s9 dependency chain"
```

Expected: FAIL — `Cannot read properties of undefined (reading 'chain')`.

- [ ] **Step 3: Implement**

In `lib/report/web-visuals.ts`, add after the `SpreadModel` type:

```ts
export type ChainGate = { id: string; name: string; score: number; note: string; band: BandKey };

export type ChainStage = {
  id: string;
  /** '01'..'05', from the stage's position in rules.chain. */
  ordinal: string;
  name: string;
  score: number;
  band: BandKey;
  /** Gate chips sit beside the stages they actually gate, not in one list at the
   * bottom — gating[] carries no mapping, rules.enablers[].gates does. */
  gates: ChainGate[];
};

export type ChainModel = { stages: ChainStage[]; reads: string[] };

/** rules.enablers[].gates is `'all' | string[]` (methodology/schema.ts:57).
 * The 'all' literal must be handled explicitly — it is not an array. */
function gatesStage(gates: 'all' | string[], stageId: string): boolean {
  return gates === 'all' || gates.includes(stageId);
}
```

Widen `WebVisuals` by adding, in section order:

```ts
  s9: { chain: ChainModel };
```

Add the builder:

```ts
function chainModel(facts: FactsPack, methodology: Methodology): ChainModel {
  const stages: ChainStage[] = [];

  for (const stageId of methodology.rules.chain) {
    const found = categoryLookup(facts, methodology, stageId);
    // A chain stage with no category has no truthful score to print, so it is
    // dropped rather than rendered with a fabricated one.
    if (!found) continue;

    const gates: ChainGate[] = [];
    for (const gate of facts.gating) {
      const enabler = methodology.rules.enablers[gate.enabler_id];
      if (!enabler || !gatesStage(enabler.gates, stageId)) continue;
      gates.push({
        id: gate.enabler_id,
        name: gate.name,
        score: gate.score,
        note: gate.note,
        band: categoryLookup(facts, methodology, gate.enabler_id)?.band ?? 'severe',
      });
    }

    stages.push({
      id: stageId,
      ordinal: String(stages.length + 1).padStart(2, '0'),
      name: found.name,
      score: found.score,
      band: found.band,
      gates,
    });
  }

  return { stages, reads: facts.dependencies.map((d) => d.read_sentence) };
}
```

Add the key to the `webVisuals` return, in section order:

```ts
    s9: { chain: chainModel(facts, methodology) },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/web-visuals.test.ts && npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/report/web-visuals.ts tests/report/web-visuals.test.ts
git commit -m "feat(report): add s9 dependency chain with gate-to-stage mapping to web-visuals"
```

---

### Task 9: `web-visuals.ts` — `s10` phase rail

**RULING (resolves an implementation gap the spec does not settle).** `s10Bullets` (`fallback-sections.ts:274`) maps `roadmapEntries()` to `` `${e.dayLabel} — ${e.text}` `` **and may append a `Do not work on yet: …` bullet that is not in `roadmapEntries()`**. The rail replaces the body, so that line would otherwise vanish from the web report. It is real deterministic prose, and dropping it would break the prose-parity rule.

**Ruling: the rail supersedes exactly the phase bullets and nothing else.** The model exposes `supersedes` — the exact strings the rail replaces — and the renderer (Task 15) subtracts them from `section.fallback.bullets` and renders whatever remains as an ordinary bullet list beneath the rail. No parsing, no new prose, and the `Do not work on yet` line survives verbatim.

**Files:**
- Modify: `lib/report/web-visuals.ts`
- Modify: `tests/report/web-visuals.test.ts` (append)

**Interfaces:**
- Consumes: `roadmapEntries(facts, methodology)` from Task 4, `verdictBandFor`, `WebVisuals`.
- Produces:
  ```ts
  export type PhaseRailBlock = { numeral: string; dayLabel: string; text: string; opacity: number };
  export type PhaseRailModel = { blocks: PhaseRailBlock[]; band: BandKey; supersedes: string[] };
  // WebVisuals gains: s10: { phaseRail: PhaseRailModel | null }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/web-visuals.test.ts`, adding `assembleFallbackOnly` to the imports:

```ts
import { assembleFallbackOnly } from '@/lib/report/compose';

describe('webVisuals — s10 phase rail', () => {
  const methodology = loadMethodology();

  it('renders the identical roadmapEntries data, stepping the verdict band down', () => {
    const model = webVisuals(CAPACITY_FACTS, methodology).s10.phaseRail;
    const entries = roadmapEntries(CAPACITY_FACTS, methodology);
    expect(model).not.toBeNull();
    expect(model!.blocks.map((b) => b.text)).toEqual(entries.map((e) => e.text));
    expect(model!.blocks.map((b) => b.dayLabel)).toEqual(entries.map((e) => e.dayLabel));
    expect(model!.blocks.map((b) => b.numeral)).toEqual(
      entries.map((e) => e.dayLabel.split(' ')[0]),
    );
    expect(model!.blocks.map((b) => b.opacity)).toEqual([1, 0.6, 0.3].slice(0, entries.length));
    expect(model!.band).toBe(verdictBandFor(CAPACITY_FACTS.overall.tier.id));
  });

  it('supersedes exactly the phase bullets and leaves any other s10 bullet standing', () => {
    const sections = assembleFallbackOnly({
      facts: CAPACITY_FACTS,
      methodology,
      reflections: [],
    });
    const s10 = sections.find((s) => s.id === 's10')!;
    const model = webVisuals(CAPACITY_FACTS, methodology).s10.phaseRail!;

    for (const superseded of model.supersedes) {
      expect(s10.fallback.bullets).toContain(superseded);
    }
    const remaining = s10.fallback.bullets.filter((b) => !model.supersedes.includes(b));
    expect(remaining.length).toBe(s10.fallback.bullets.length - model.supersedes.length);
    for (const bullet of remaining) {
      expect(model.supersedes).not.toContain(bullet);
    }
  });

  it('is omitted when there are no roadmap entries, so the bullets stand alone', () => {
    const facts = makeFacts({ categories: [], bottom_items: [] });
    const model = webVisuals(facts, methodology).s10.phaseRail;
    if (roadmapEntries(facts, methodology).length === 0) {
      expect(model).toBeNull();
    } else {
      expect(model!.blocks.length).toBeGreaterThan(0);
    }
  });
});
```

Add `verdictBandFor` to the test file's `@/lib/report/charts` import.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/web-visuals.test.ts -t "s10 phase rail"
```

Expected: FAIL — `Cannot read properties of undefined (reading 'phaseRail')`.

- [ ] **Step 3: Implement**

In `lib/report/web-visuals.ts`, add the import:

```ts
import { roadmapEntries } from './fallback-sections';
```

Add after the `ChainModel` type:

```ts
/** 30 / 60 / 90 step the verdict band down in opacity — the same
 * same-hex-reduced-opacity treatment the s3 throughput bar uses. No new colours. */
const PHASE_OPACITY = [1, 0.6, 0.3];

export type PhaseRailBlock = { numeral: string; dayLabel: string; text: string; opacity: number };

export type PhaseRailModel = {
  blocks: PhaseRailBlock[];
  band: BandKey;
  /** The exact s10 bullet strings this rail replaces. The renderer subtracts
   * these from section.fallback.bullets and renders the remainder beneath the
   * rail, so s10Bullets' extra `Do not work on yet: ...` line survives verbatim.
   * Must stay byte-identical to the join in s10Bullets (fallback-sections.ts:274). */
  supersedes: string[];
};
```

Widen `WebVisuals` by adding, in section order:

```ts
  s10: { phaseRail: PhaseRailModel | null };
```

Add the builder:

```ts
function phaseRail(facts: FactsPack, methodology: Methodology): PhaseRailModel | null {
  const entries = roadmapEntries(facts, methodology);
  if (entries.length === 0) return null;

  return {
    blocks: entries.map((entry, i) => ({
      numeral: entry.dayLabel.split(' ')[0] ?? entry.dayLabel,
      dayLabel: entry.dayLabel,
      text: entry.text,
      opacity: PHASE_OPACITY[i] ?? PHASE_OPACITY[PHASE_OPACITY.length - 1]!,
    })),
    band: verdictBandFor(facts.overall.tier.id),
    supersedes: entries.map((entry) => `${entry.dayLabel} — ${entry.text}`),
  };
}
```

Add the key to the `webVisuals` return, in section order:

```ts
    s10: { phaseRail: phaseRail(facts, methodology) },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/web-visuals.test.ts && npm test
```

Expected: PASS. The full suite must be green — `tests/report/fallback-sections.test.ts` in particular, which locks `s10Bullets`' current behaviour.

> If `supersedes` does not match the real bullets, the separator in `s10Bullets` is not the em dash `—` assumed here. Read `lib/report/fallback-sections.ts:274`, copy its join expression exactly, and fix `supersedes` — never change `s10Bullets`.

- [ ] **Step 5: Commit**

```bash
git add lib/report/web-visuals.ts tests/report/web-visuals.test.ts
git commit -m "feat(report): add s10 phase rail model to web-visuals"
```

---

### Task 10: Wire the seam end-to-end (with the `s13` confidence meter)

A complete vertical slice: `webVisuals` reaches both renderers and one visual actually paints. The `s13` inline branch added here is **superseded by the dispatcher in Task 16** — that is expected, not churn to avoid.

**Files:**
- Modify: `lib/report/resolve.ts:34-41` (interface) and `:74-84` (build + return)
- Modify: `app/app/[churchId]/diagnosis/page.tsx:188` (destructure) and `:263` (prop)
- Modify: `app/r/[shareToken]/page.tsx:164` (local) and `:191` (prop)
- Modify: `app/app/[churchId]/diagnosis/report/sections.tsx:256-278`
- Create: `app/app/[churchId]/diagnosis/report/web-visuals.tsx`

**Interfaces:**
- Consumes: `webVisuals(facts, methodology): WebVisuals` and `ConfidenceModel` from Tasks 5–9.
- Produces:
  - `ResolvedReportSections.visuals: WebVisuals`
  - `ReportSections` prop signature becomes `{ sections: AssembledSection[]; band: BandKey; visuals: WebVisuals }`
  - `export function WebConfidence({ model }: { model: ConfidenceModel }): JSX.Element` in `report/web-visuals.tsx` — Task 15 adds its siblings to the same file.

- [ ] **Step 1: Add the field to the resolver**

In `lib/report/resolve.ts`, add the import:

```ts
import { webVisuals, type WebVisuals } from './web-visuals';
```

In the `ResolvedReportSections` interface, add after `cover: CoverModel`:

```ts
  /** Web-only visual models (spec §5.1). Attached beside `cover`, never to
   * section.charts. The PDF route destructures this object and simply does not
   * read this field — do NOT thread it into the PDF. */
  visuals: WebVisuals
```

Immediately after the `const cover = coverModel(facts, inputs.methodology)` line, add:

```ts
  const visuals = webVisuals(facts, inputs.methodology)
```

and add `visuals` to the returned object literal, after `cover`.

> If the local holding the facts pack is not named `facts` at that point, reuse whatever expression `coverModel` is already passed as its first argument.

- [ ] **Step 2: Build the confidence component**

Create `app/app/[churchId]/diagnosis/report/web-visuals.tsx`:

```tsx
/**
 * Web-only report visuals (spec §6). Presentational only — these components read
 * models from lib/report/web-visuals.ts for VALUES and never compute anything.
 *
 * role="list" is set explicitly on every list-shaped visual: Safari/VoiceOver
 * drops the implicit list role under display:grid (see charts.tsx:25-29).
 * Tracks and bars are aria-hidden; every value is also real text.
 */
import { BAND_FILL, BAND_TEXT } from '@/lib/report/charts';
import type { ConfidenceModel } from '@/lib/report/web-visuals';

const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

const CAPS = 'font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]';
const NUM = 'font-display font-semibold leading-none';

export function WebConfidence({ model }: { model: ConfidenceModel }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className={CAPS} style={{ color: INK_SOFT }}>
          Confidence
        </p>
        <p className={`${NUM} text-[1.5rem]`} style={{ color: BAND_TEXT.holding }}>
          {model.label}
        </p>
      </div>
      <div
        aria-hidden
        className="h-2 w-full overflow-hidden"
        style={{ backgroundColor: RULE }}
      >
        <div
          className="h-full"
          style={{ width: `${model.pct}%`, backgroundColor: BAND_FILL.holding }}
        />
      </div>
      <ul role="list" className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: RULE }}>
        <li className="flex items-baseline justify-between gap-3">
          <span className={CAPS} style={{ color: INK_SOFT }}>
            Respondents
          </span>
          <span className="font-body text-[0.8125rem] text-ink">{model.respondents}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span className={CAPS} style={{ color: INK_SOFT }}>
            Areas assessed
          </span>
          <span className="font-body text-[0.8125rem] text-ink">{model.areas}</span>
        </li>
        {model.thinnest ? (
          <li className="flex items-baseline justify-between gap-3">
            <span className={CAPS} style={{ color: INK_SOFT }}>
              Thinnest coverage
            </span>
            <span className="font-body text-[0.8125rem] text-ink">
              {model.thinnest.name} · {model.thinnest.count}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Accept and render the prop**

In `app/app/[churchId]/diagnosis/report/sections.tsx`, add the imports:

```tsx
import type { WebVisuals } from '@/lib/report/web-visuals';
import { WebConfidence } from './web-visuals';
```

Change the `ReportSections` signature from

```tsx
({ sections, band }: { sections: AssembledSection[]; band: BandKey })
```

to

```tsx
({ sections, band, visuals }: { sections: AssembledSection[]; band: BandKey; visuals: WebVisuals })
```

and immediately after the `<SectionContent section={section} areaIndex={areaIndex} />` line add:

```tsx
      {section.id === 's13' ? <WebConfidence model={visuals.s13.confidence} /> : null}
```

> Temporary placement. Task 16 replaces this line with the `SectionVisualsBelow` dispatcher. **Do not touch the `index === 0` `h1`/`h2` ternary above it.**

- [ ] **Step 4: Wire both call sites**

In `app/app/[churchId]/diagnosis/page.tsx`, add `visuals` to the destructuring pattern of the `resolveReportSections` call at `:188`, and change the render at `:263` to:

```tsx
<ReportSections sections={sections} band={cover.band} visuals={visuals} />
```

In `app/r/[shareToken]/page.tsx`, add the import `import { webVisuals } from '@/lib/report/web-visuals';`, then immediately after the `assembleFallbackOnly({…})` call at `:164` add:

```tsx
  const visuals = webVisuals(facts, methodology);
```

reusing the **exact same expressions** that call already passes as its `facts` and `methodology` arguments. Change the render at `:191` to:

```tsx
<ReportSections sections={sections} band={cover.band} visuals={visuals} />
```

- [ ] **Step 5: Verify the seam and the a11y guard**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: no type errors, no lint errors, full suite PASS — including `tests/a11y/shared-report-heading.test.ts` (still exactly one `<h1`) and `tests/report/chart-parity.test.ts` (the eight visuals are outside `section.charts`, so it never sees them).

- [ ] **Step 6: Confirm the PDF route is untouched**

```bash
GIT_LITERAL_PATHSPECS=1 git diff --stat -- 'app/api/report/[runId]/pdf/route.ts' lib/report/pdf/
```

Expected: **empty output.** The route's `const { sections, stale, cover } = await resolveReportSections({…})` at `:157` simply does not destructure `visuals`; adding the field is additive and safe.

- [ ] **Step 7: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/report/resolve.ts \
  'app/app/[churchId]/diagnosis/page.tsx' \
  'app/app/[churchId]/diagnosis/report/sections.tsx' \
  'app/app/[churchId]/diagnosis/report/web-visuals.tsx' \
  'app/r/[shareToken]/page.tsx'
git commit -m "feat(report): attach webVisuals to ResolvedReportSections and render s13 confidence"
```

---

## Note on testing the renderer tasks (11–18)

Tasks 1–10 are model tasks and are tested with real unit tests. **Tasks 11–17 are presentational.** This repo has **no DOM render harness** — `tests/report/*` tests pure model functions in node env, and `tests/a11y/shared-report-heading.test.ts` reads component files as *source text* and counts regex matches. There is no React Testing Library, no jsdom setup, and **adding one would violate the no-new-dependencies constraint.**

So the gate for a presentational task is, every time:

1. The **structural assertions** written into that task — `grep -c` occurrence counts over the changed file. These are occurrence-count equalities, not presence checks: they fail both when the old code survives and when the new code is missing.
2. `npm run typecheck` — the models are fully typed, so a wrong property name is a compile error.
3. `npm run lint` — catches unused imports/consts left behind by a rebuild, and catches the `react-hooks/static-components` violation Task 16 must avoid.
4. `npm test` — the full suite, which includes the a11y heading guard and chart parity.

**Do not add a test framework, and do not skip the greps.** They are the only thing standing between a rebuild and silently keeping the old SVG.

### House style inside the files you are editing

`lib/report/*.ts` is written **with** semicolons. `app/app/[churchId]/diagnosis/report/*.tsx` is written **without** them (see the existing `const inner = cell.w - 2 * (cell.bar.x - cell.x)` in `charts.tsx`). Match the file you are in. The new file `report/web-visuals.tsx` was created semicolon-style in Task 10 — keep it that way for internal consistency, since lint enforces neither.

---

### Task 11: Cover tier ladder

Replaces the continuous `CoverStrip` gradient on the **web** cover with four discrete tier steps (spec §6.2). `CoverModel.strip` stays in the model and the PDF keeps rendering it — this task deletes only the *web* component.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/report-cover.tsx:23-43` (delete `CoverStrip`), `:84` (the call site inside `<div className="mt-4">`)

> After deleting `CoverStrip` the file shortens by ~21 lines, so the `:84` call site moves up. Find it by its content — `<CoverStrip cover={cover} />` — not by line number.

**Interfaces:**
- Consumes: `CoverModel.ladder: CoverLadderRow[]` from **Task 3** — always exactly 4 rows, worst → best, each `{ tierId, name, band, active }` with exactly one `active: true`. Plus `BAND_FILL` and `textOnBand(band)` from `lib/report/charts.ts`.
- Produces: nothing consumed by later tasks. `TierLadder` is module-private to `report-cover.tsx`.

- [ ] **Step 1: Record the "before" counts**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c 'CoverStrip' 'app/app/[churchId]/diagnosis/report/report-cover.tsx'
```

Expected: `3` — the function declaration, the `CoverStripSeg`-typed body, and the call site. (If it prints something else, note the number; Step 5 only requires it reach `0`.)

- [ ] **Step 2: Delete `CoverStrip`**

In `app/app/[churchId]/diagnosis/report/report-cover.tsx`, delete the entire `function CoverStrip(…) { … }` block at `:23-43`, including its leading doc comment if it has one.

**Keep** the local `INK` (`:6`), `INK_SOFT` (`:7`) and `CAPS_LABEL` (`:9`) constants — `ReportCover` still uses them.

- [ ] **Step 3: Add `TierLadder` in its place**

Paste this where `CoverStrip` was:

```tsx
/**
 * Four discrete tier steps, worst -> best (spec §6.2). The web cover shows which
 * of four named tiers the church landed in; the PDF keeps rendering the
 * continuous `cover.strip` gradient from the same model.
 *
 * The active row is not distinguished by colour alone: it is solid where the
 * others are washed, it is physically larger, and it carries aria-current. The
 * caption below the ladder already names the tier in words.
 *
 * The wash is a same-hex opacity layer, not a new colour — an aria-hidden fill
 * span sits behind the label so lowering the fill's opacity never dims the text.
 */
function TierLadder({ ladder }: { ladder: CoverLadderRow[] }) {
  return (
    <ul role="list" className="flex flex-col gap-px" aria-label="Health tiers, lowest to highest">
      {ladder.map((row) => (
        <li
          key={row.tierId}
          aria-current={row.active ? 'true' : undefined}
          className={
            row.active
              ? 'relative -mx-1 flex items-center px-4 py-2.5'
              : 'relative flex items-center px-3 py-2'
          }
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundColor: BAND_FILL[row.band], opacity: row.active ? 1 : 0.18 }}
          />
          <span
            className="relative font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em]"
            style={{ color: row.active ? textOnBand(row.band) : INK }}
          >
            {row.name}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Fix the imports and the call site**

In the `@/lib/report/charts` import at the top of the file: keep `BAND_FILL`, add `textOnBand`, and add `type CoverLadderRow` to the type import. If deleting `CoverStrip` left `CoverStripSeg` (or any other symbol) imported but unused, delete it — `npm run lint` names it exactly.

Then change the call site from

```tsx
<CoverStrip cover={cover} />
```

to

```tsx
<TierLadder ladder={cover.ladder} />
```

Leave the wrapping `<div className="mt-4">` and the caption line beneath it (`` `${cover.caption.tierName} · ${cover.caption.score} of 100` ``) exactly as they are.

- [ ] **Step 5: Structural check**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c 'CoverStrip' 'app/app/[churchId]/diagnosis/report/report-cover.tsx'
grep -c 'TierLadder' 'app/app/[churchId]/diagnosis/report/report-cover.tsx'
grep -c 'aria-current' 'app/app/[churchId]/diagnosis/report/report-cover.tsx'
```

Expected, in order: `0`, `2`, `1`. A non-zero first number means the old SVG survived somewhere.

- [ ] **Step 6: Gate**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean, full suite PASS. Then prove the PDF is untouched:

```bash
GIT_LITERAL_PATHSPECS=1 git diff --stat -- lib/report/pdf/ 'app/api/report/[runId]/pdf/route.ts'
```

Expected: **empty output.**

- [ ] **Step 7: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/report-cover.tsx'
git commit -m "feat(report): replace the web cover strip with a four-step tier ladder"
```

---

### Task 12: Rebuild `WebVerdictBlock` + add the `WebStatGrid` percentile line

Two edits in `charts.tsx`. `WebVerdictBlock` (`:90`) is the last SVG chart on the web that duplicates a layout HTML does better — it becomes HTML. `WebStatGrid` (`:30`) is **already HTML and is not rebuilt**; it only gains one line.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/charts.tsx:30-52` (`WebStatGrid`, insert one block), `:90-113` (`WebVerdictBlock`, full rebuild)

**Interfaces:**
- Consumes:
  ```ts
  // from lib/report/charts.ts, unchanged by this plan:
  type VerdictBlockModel = {
    kind: 'verdict_block'; width: number; height: number;
    hero: { score: number; tierName: string; band: BandKey; x: number; y: number; w: number; h: number };
    stats: VerdictStat[];                       // VerdictStat = { label, value, x, y, w, h }
  };
  type StatCell = { id; name; score; band; label; percentile: number | null; x; y; w; h; bar };
  ```
  `percentile` is **Task 1's** field. `x/y/w/h` on both models exist for the PDF — the rebuilt HTML reads **values only** and must not read them.
- Produces: nothing new exported. `WebChart`'s switch at `:115` keeps calling the same two component names and is **not edited**.

- [ ] **Step 1: Record the "before" counts**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '<svg' 'app/app/[churchId]/diagnosis/report/charts.tsx'
grep -c 'PCTL' 'app/app/[churchId]/diagnosis/report/charts.tsx'
```

Expected: `2` and `0`.

- [ ] **Step 2: Add the percentile line to `WebStatGrid`**

In `WebStatGrid`, between the `<p>` that renders `{cell.label}` and the mini-bar `<div>`, insert:

```tsx
            {cell.percentile === null ? null : (
              <p className="mt-1 font-body text-[0.625rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
                {`${cell.percentile}TH PCTL`}
              </p>
            )}
```

Change nothing else in `WebStatGrid` — in particular the bar math `const inner = cell.w - 2 * (cell.bar.x - cell.x)` and the `role="list"` comment at `:25-29` stay exactly as they are.

> The null branch is why there is never an empty frame: a thin cohort simply has no percentile line, not a "—" or a "n/a".

- [ ] **Step 3: Rebuild `WebVerdictBlock` in HTML**

Replace the whole `function WebVerdictBlock(…) { … }` body at `:90-113` with:

```tsx
/**
 * Hero verdict + a 2x2 context dashboard, as HTML (spec §6.3). Was an SVG whose
 * only job was to draw four hairline rects and place text inside them — a grid
 * with borders does that natively, and the hero numeral can then scale with the
 * viewport instead of being locked to a 500-unit viewBox.
 *
 * Reads the model for VALUES ONLY. hero.x/y/w/h and stat.x/y/w/h are PDF
 * geometry and are deliberately unread here.
 */
function WebVerdictBlock({ model }: { model: Extract<ChartModel, { kind: 'verdict_block' }> }) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border border-line p-5">
        <p
          className="font-display font-semibold leading-none"
          style={{ fontSize: 'clamp(3.5rem, 12vw, 5.25rem)', color: BAND_TEXT[model.hero.band] }}
        >
          {model.hero.score}
        </p>
        <p className="font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
          {`${model.hero.tierName} · Overall Health`.toUpperCase()}
        </p>
      </div>
      <ul
        role="list"
        className="grid grid-cols-2 border-l border-t border-line"
        aria-label="Context statistics"
      >
        {model.stats.map((stat) => (
          <li key={stat.label} className="flex flex-col border-b border-r border-line p-3">
            <p className="font-display text-2xl font-semibold leading-none text-ink">{stat.value}</p>
            <p className="mt-1 font-body text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
              {stat.label.toUpperCase()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

The caption string `` `${model.hero.tierName} · Overall Health`.toUpperCase() `` is **copied verbatim from the SVG being deleted** — it is not new prose.

- [ ] **Step 4: Gate**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean. `npm run lint` may now report `RULE`, `INK` or `INK_SOFT` as unused — **leave them for Task 13**, which deletes the last SVG and settles all four local hexes at once. If lint is configured to fail on unused vars and blocks you here, do Task 13's Step 4 now and commit the two together.

- [ ] **Step 5: Structural check**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '<svg' 'app/app/[churchId]/diagnosis/report/charts.tsx'
grep -c 'PCTL' 'app/app/[churchId]/diagnosis/report/charts.tsx'
grep -c 'clamp(3.5rem, 12vw, 5.25rem)' 'app/app/[churchId]/diagnosis/report/charts.tsx'
```

Expected, in order: `1` (only `WebRankList` left, killed in Task 13), `1`, `1`.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/charts.tsx'
git commit -m "feat(report): rebuild WebVerdictBlock in HTML and add the stat-grid percentile line"
```

---

### Task 13: Rebuild `WebRankList`

The last SVG chart on the web. Rebuilding it in HTML is what makes `RankRow.fullText` (Task 2) usable: HTML wraps, so the 90-character truncation the PDF needs is no longer forced on the web reader.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/charts.tsx:55-62` (delete the obsolete `RANK_TEXT_MAX` comment), `:63-88` (`WebRankList`, full rebuild), `:14-16` (delete the now-unused local hexes)

**Interfaces:**
- Consumes:
  ```ts
  // RankRow, from lib/report/charts.ts — fullText is Task 2's field:
  type RankRow = {
    rank: string; itemId: string; text: string; fullText: string;
    mean: number; theme: Theme; themeLabel: string;
    y: number; h: number; scoreBlock: { x: number; y: number; w: number; h: number };
  };
  ```
  Plus `THEME_FILL`, `BAND_FILL`, and the local `CREAM` const.
- Produces: nothing new exported. `WebChart`'s switch is **not edited**.

**Read `fullText`, never `text`.** Read **values only** — `y`, `h` and `scoreBlock` are PDF geometry and stay unread.

- [ ] **Step 1: Delete the obsolete comment**

Delete the whole comment block at `:55-62` — the one beginning "The two `fontSize={7.5}` labels below are deliberately NOT bumped to 12…". It documents an SVG constraint that stops existing the moment this task lands. Replace it with:

```tsx
// Rebuilt in HTML (spec §6.5). The SVG version had to truncate at RANK_TEXT_MAX=90 and set the
// question at fontSize 7.5 to fit a fixed 400-unit text slot; wrapping HTML has neither limit, so
// this reads `row.fullText` in sentence case at a real body size. lib/report/charts.ts keeps
// producing `row.text` for the PDF, which still has the fixed slot.
```

- [ ] **Step 2: Rebuild the component**

Replace the whole `function WebRankList(…) { … }` body at `:63-88` with:

```tsx
function WebRankList({ model }: { model: Extract<ChartModel, { kind: 'rank_list' }> }) {
  return (
    <ol role="list" className="flex flex-col" aria-label="Weakest questions, ranked">
      {model.rows.map((row, i) => (
        <li
          key={row.itemId}
          className={`grid grid-cols-[2.25rem_1fr_auto] items-start gap-3 py-3${
            i > 0 ? ' border-t border-line' : ''
          }`}
        >
          <span className="font-display text-[1.75rem] font-semibold leading-none text-ink-soft">
            {row.rank}
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-body text-[0.8125rem] leading-[1.5] text-ink">{row.fullText}</p>
            <p
              className="font-body text-[0.625rem] font-bold uppercase tracking-[0.1em]"
              style={{ color: THEME_FILL[row.theme] }}
            >
              {row.themeLabel}
            </p>
          </div>
          <span
            className="flex min-w-[3.5rem] items-center justify-center px-2 py-1"
            style={{ backgroundColor: BAND_FILL.severe }}
          >
            <span
              className="font-display text-[1.125rem] font-semibold leading-none"
              style={{ color: CREAM }}
            >
              {row.mean}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
```

Three deliberate departures from the SVG, all from spec §6.5:

- The rank numeral is **ink-soft, not `BAND_FILL.broken`** — it is an index, not a score, and colouring it a band made it read as a health signal.
- The question is `row.fullText` in **sentence case** — no `.toUpperCase()`. Long questions wrap.
- The score block keeps its `BAND_FILL.severe` ground and cream numeral. Spec §6.5 records this as an **accepted inherited caveat**: the ground is constant regardless of the actual mean. Do not "fix" it here.

- [ ] **Step 3: Settle the local hexes**

Delete `INK`, `INK_SOFT` and `RULE` from the local const block at `:14-16`. After Tasks 12 and 13 nothing in the file references them — the two rebuilds use the `text-ink` / `text-ink-soft` / `border-line` Tailwind tokens instead. **Keep `CREAM`** (`:17`) — the score numeral above uses it.

> If `npm run lint` reports one of the three as still used, restore just that one and leave the others deleted.

- [ ] **Step 4: Gate**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean, full suite PASS.

- [ ] **Step 5: Structural check**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '<svg' 'app/app/[churchId]/diagnosis/report/charts.tsx'
grep -c 'fullText' 'app/app/[churchId]/diagnosis/report/charts.tsx'
grep -c 'toUpperCase' 'app/app/[churchId]/diagnosis/report/charts.tsx'
grep -c 'RANK_TEXT_MAX' 'app/app/[churchId]/diagnosis/report/charts.tsx'
```

Expected, in order: `0` (no SVG left on the web), `1`, `2` (the verdict block's two — the rank list has none), `1` (the new comment mentions it once).

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/charts.tsx'
git commit -m "feat(report): rebuild WebRankList in HTML reading the untruncated question text"
```

---

### Task 14: New components, part 1 — `WebCapacityBars`, `WebConstraintCallout`, `WebDumbbells`

Three of the eight new visuals, all appended to the file **Task 10 created**. Nothing renders them yet — Task 16's dispatcher does that. They are exported so Task 16 can import them.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/web-visuals.tsx` (append three components; extend the import and const block at the top)

**Interfaces:**
- Consumes, from `lib/report/web-visuals.ts` (Tasks 5–6):
  ```ts
  type CapacityBarsModel = {
    band: BandKey; capacity: number; throughput: number;
    capacityPct: number; throughputPct: number; gap: number; gapLabel: string | null;
  };
  type ConstraintRow = { id: string; name: string; score: number; note: string | null };
  type ConstraintCalloutModel = {
    eyebrow: 'PRIMARY CONSTRAINT' | 'GATING ENABLER'; band: BandKey; rows: ConstraintRow[];
  };
  type DumbbellRow = {
    id: string; name: string; belief: number; evidence: number; gap: number;
    band: BandKey; beliefPct: number; evidencePct: number;
  };
  type DumbbellsModel = { rows: DumbbellRow[] };
  ```
  Plus `BAND_FILL`, `BAND_TEXT`, `textOnBand` from `lib/report/charts.ts`, and the `CAPS` / `NUM` / `INK_SOFT` / `RULE` locals Task 10 already put in this file.
- Produces, all read by **Task 16**:
  ```tsx
  export function WebCapacityBars({ model }: { model: CapacityBarsModel }): JSX.Element
  export function WebConstraintCallout({ model }: { model: ConstraintCalloutModel }): JSX.Element
  export function WebDumbbells({ model }: { model: DumbbellsModel }): JSX.Element
  ```
  Each takes a **non-nullable** model. Nullability is the dispatcher's job — a component that can render nothing is a component that can render an empty frame.

- [ ] **Step 1: Extend the imports and the const block**

At the top of `app/app/[churchId]/diagnosis/report/web-visuals.tsx`, change the two imports to:

```tsx
import { BAND_FILL, BAND_TEXT, textOnBand } from '@/lib/report/charts';
import type {
  CapacityBarsModel,
  ConfidenceModel,
  ConstraintCalloutModel,
  DumbbellsModel,
} from '@/lib/report/web-visuals';
```

and add one const beneath the existing `RULE`:

```tsx
const CREAM = '#FAF7F0';
```

- [ ] **Step 2: Append `WebCapacityBars`**

```tsx
/**
 * Capacity vs throughput on one shared 0-100 axis (spec §6.3) — the two bars are
 * only comparable if they share a scale, which is why the model hands over
 * pre-clamped percentages rather than raw scores.
 *
 * Throughput is the SAME hex at reduced opacity, never a second colour: it is
 * the same quantity degraded, not a different category.
 */
export function WebCapacityBars({ model }: { model: CapacityBarsModel }) {
  const bars = [
    { key: 'capacity', label: 'Capacity', value: model.capacity, pct: model.capacityPct, opacity: 1 },
    { key: 'throughput', label: 'Throughput', value: model.throughput, pct: model.throughputPct, opacity: 0.45 },
  ];
  return (
    <div className="flex flex-col gap-4">
      <ul role="list" className="flex flex-col gap-3">
        {bars.map((bar) => (
          <li key={bar.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={CAPS} style={{ color: INK_SOFT }}>
                {bar.label}
              </span>
              <span className={`${NUM} text-[1.125rem]`} style={{ color: BAND_TEXT[model.band] }}>
                {bar.value}
              </span>
            </div>
            <div aria-hidden className="h-2 w-full overflow-hidden" style={{ backgroundColor: RULE }}>
              <div
                className="h-full"
                style={{
                  width: `${bar.pct}%`,
                  backgroundColor: BAND_FILL[model.band],
                  opacity: bar.opacity,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {model.gapLabel === null ? null : (
        <p
          className={`self-start px-2 py-1 ${CAPS}`}
          style={{ backgroundColor: BAND_FILL[model.band], color: textOnBand(model.band) }}
        >
          {model.gapLabel}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Append `WebConstraintCallout`**

```tsx
/**
 * Full-bleed banded panel naming the one thing holding the church back
 * (spec §6.4). Full-bleed on narrow via the same -mx-6 px-6 sm:mx-0 pattern the
 * section opener uses, so it reads as a slab rather than a boxed aside.
 *
 * The panel ground is the model's band, which on the gating face follows the
 * WORST gated enabler — the panel never looks healthier than its worst row.
 */
export function WebConstraintCallout({ model }: { model: ConstraintCalloutModel }) {
  return (
    <div
      className="-mx-6 flex flex-col gap-3 px-6 py-5 sm:mx-0 sm:px-5"
      style={{ backgroundColor: BAND_FILL[model.band], color: textOnBand(model.band) }}
    >
      <p className={CAPS}>{model.eyebrow}</p>
      <ul role="list" className="flex flex-col gap-3">
        {model.rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[1.125rem] font-semibold leading-tight">
                {row.name}
              </span>
              <span className={`${NUM} text-[1.5rem]`}>{row.score}</span>
            </div>
            {row.note === null ? null : (
              <p className="font-body text-[0.8125rem] leading-[1.5]">{row.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Append `WebDumbbells`**

```tsx
/**
 * Belief vs evidence per area (spec §6.4). Solid dot = evidence (what the data
 * says), hollow dot = belief (what the room says), the segment between them is
 * the gap. Both numbers are printed as real text beneath — the dot positions are
 * an illustration of the gap, never the only place the values live.
 */
export function WebDumbbells({ model }: { model: DumbbellsModel }) {
  return (
    <ul role="list" className="flex flex-col gap-4">
      {model.rows.map((row) => {
        const left = Math.min(row.evidencePct, row.beliefPct);
        const right = Math.max(row.evidencePct, row.beliefPct);
        return (
          <li key={row.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className={CAPS} style={{ color: INK_SOFT }}>
                {row.name}
              </span>
              <span className="flex items-baseline gap-2">
                <span className={CAPS} style={{ color: INK_SOFT }}>
                  Gap
                </span>
                <span className={`${NUM} text-[1.125rem]`} style={{ color: BAND_TEXT[row.band] }}>
                  {row.gap}
                </span>
              </span>
            </div>
            <div aria-hidden className="relative h-3 w-full">
              <span
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style={{ backgroundColor: RULE }}
              />
              <span
                className="absolute top-1/2 h-[3px] -translate-y-1/2"
                style={{
                  left: `${left}%`,
                  width: `${right - left}%`,
                  backgroundColor: BAND_FILL[row.band],
                }}
              />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${row.evidencePct}%`, backgroundColor: BAND_FILL[row.band] }}
              />
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  left: `${row.beliefPct}%`,
                  backgroundColor: CREAM,
                  borderColor: BAND_FILL[row.band],
                }}
              />
            </div>
            <p className="font-body text-[0.6875rem] tracking-[0.04em]" style={{ color: INK_SOFT }}>
              {`Evidence ${row.evidence} · Belief ${row.belief}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
```

> `Gap`, `Evidence` and `Belief` are chart labels sanctioned by this plan (Global Constraints, "the only new words are chrome"). The evidence/belief line is **mandatory**, not decorative: without it the two dot positions would be the only carrier of those two values.

- [ ] **Step 5: Gate + structural check**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean, full suite PASS.

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '^export function Web' 'app/app/[churchId]/diagnosis/report/web-visuals.tsx'
```

Expected: `4` — `WebConfidence` from Task 10 plus these three.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/web-visuals.tsx'
git commit -m "feat(report): add capacity bars, constraint callout and blind-spot dumbbells"
```

---

### Task 15: New components, part 2 — `WebThemeSplit`, `WebSpread`, `WebChainRail`, `WebPhaseRail`

The remaining four. `WebPhaseRail` is the one with a second prop: it is the only visual that **replaces** a section body, so it has to take responsibility for the bullets it supersedes.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/web-visuals.tsx` (append four components; extend the import and const block again)

**Interfaces:**
- Consumes, from `lib/report/web-visuals.ts` (Tasks 7–9):
  ```ts
  type ThemeSplitRow = { theme: Theme; label: string; count: number; pct: number };
  type ThemeSplitModel = { rows: ThemeSplitRow[]; total: number; label: string };
  type SpreadRow = { id: string; name: string; spread: number; pct: number; band: BandKey };
  type SpreadModel = {
    rows: SpreadRow[]; axisMax: number; axisMaxLabel: string;
    threshold: number; thresholdPct: number; thresholdLabel: string;
  };
  type ChainGate = { id: string; name: string; score: number; note: string; band: BandKey };
  type ChainStage = {
    id: string; ordinal: string; name: string; score: number; band: BandKey; gates: ChainGate[];
  };
  type ChainModel = { stages: ChainStage[]; reads: string[] };
  type PhaseRailBlock = { numeral: string; dayLabel: string; text: string; opacity: number };
  type PhaseRailModel = { blocks: PhaseRailBlock[]; band: BandKey; supersedes: string[] };
  ```
  Plus `THEME_FILL` from `lib/report/charts.ts`.
- Produces, all read by **Task 16**:
  ```tsx
  export function WebThemeSplit({ model }: { model: ThemeSplitModel }): JSX.Element
  export function WebSpread({ model }: { model: SpreadModel }): JSX.Element
  export function WebChainRail({ model }: { model: ChainModel }): JSX.Element
  export function WebPhaseRail({ model, bullets }: { model: PhaseRailModel; bullets: string[] }): JSX.Element
  ```

- [ ] **Step 1: Extend the imports and the const block**

Change the two imports at the top of the file to:

```tsx
import { BAND_FILL, BAND_TEXT, THEME_FILL, textOnBand } from '@/lib/report/charts';
import type {
  CapacityBarsModel,
  ChainModel,
  ConfidenceModel,
  ConstraintCalloutModel,
  DumbbellsModel,
  PhaseRailModel,
  SpreadModel,
  ThemeSplitModel,
} from '@/lib/report/web-visuals';
```

and add two consts beneath `CREAM`:

```tsx
const INK = '#1A1A18';
/** Byte-identical to the LIST const in sections.tsx:17. Duplicated rather than
 * exported because that one is module-private chrome, not a shared token. */
const LIST = 'list-disc space-y-1 pl-5 font-body text-base leading-[1.6] text-ink';
```

- [ ] **Step 2: Append `WebThemeSplit`**

```tsx
/**
 * Which of the four themes the weakest indicators cluster in (spec §6.5).
 *
 * All four rows always render, including zero-count ones: "theology never
 * appeared" is a finding, and dropping the row would hide it. A zero row keeps
 * its label and an empty track, with the 0 in ink-soft rather than theme colour.
 *
 * No closing summary sentence — the label above is the whole frame.
 */
export function WebThemeSplit({ model }: { model: ThemeSplitModel }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={CAPS} style={{ color: INK_SOFT }}>
        {model.label}
      </p>
      <ul role="list" className="flex flex-col gap-2">
        {model.rows.map((row) => (
          <li key={row.theme} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3">
            <span className={CAPS} style={{ color: THEME_FILL[row.theme] }}>
              {row.label}
            </span>
            <span aria-hidden className="block h-2 w-full" style={{ backgroundColor: RULE }}>
              <span
                className="block h-full"
                style={{ width: `${row.pct}%`, backgroundColor: THEME_FILL[row.theme] }}
              />
            </span>
            <span
              className={`${NUM} text-right text-[1.125rem]`}
              style={{ color: row.count === 0 ? INK_SOFT : THEME_FILL[row.theme] }}
            >
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Append `WebSpread`**

```tsx
/**
 * How far apart respondents were, per flagged area (spec §6.6).
 *
 * facts.dispersion is FLAGGED-ONLY, so every bar here has already cleared the
 * threshold. The dashed marker is therefore a floor every bar crosses, and it is
 * labelled with the bare number — never "above", "below", or pass/fail language.
 *
 * The list key includes the index: two rows can legitimately share a category_id.
 */
export function WebSpread({ model }: { model: SpreadModel }) {
  return (
    <div className="flex flex-col gap-3">
      <ul role="list" className="flex flex-col gap-2">
        {model.rows.map((row, i) => (
          <li
            key={`${row.id}-${i}`}
            className="grid items-center gap-1 sm:grid-cols-[9rem_1fr_2.5rem] sm:gap-3"
          >
            <span className={CAPS} style={{ color: INK_SOFT }}>
              {row.name}
            </span>
            <span aria-hidden className="relative block h-2 w-full" style={{ backgroundColor: RULE }}>
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: `${row.pct}%`, backgroundColor: BAND_FILL[row.band] }}
              />
              <span
                className="absolute -inset-y-1 border-l border-dashed"
                style={{ left: `${model.thresholdPct}%`, borderColor: INK_SOFT }}
              />
            </span>
            <span
              className={`${NUM} text-[1.125rem] sm:text-right`}
              style={{ color: BAND_TEXT[row.band] }}
            >
              {row.spread}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3">
        <span className={CAPS} style={{ color: INK_SOFT }}>
          {model.thresholdLabel}
        </span>
        <span className={CAPS} style={{ color: INK_SOFT }}>
          {model.axisMaxLabel}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append `WebChainRail`**

```tsx
/**
 * The five-stage dependency chain as a VERTICAL rail (spec §6.5). Vertical
 * because gate chips have to sit beside the stage they gate, and a horizontal
 * rail has nowhere to put them on a phone.
 *
 * Stage order is rules.chain, resolved in the model — never score order.
 * Each gate chip carries its own band, which can differ from its stage's.
 */
export function WebChainRail({ model }: { model: ChainModel }) {
  return (
    <div className="flex flex-col gap-5">
      <ol role="list" className="relative flex flex-col gap-5">
        <span
          aria-hidden
          className="absolute bottom-3 left-3 top-3 w-px"
          style={{ backgroundColor: RULE }}
        />
        {model.stages.map((stage) => (
          <li key={stage.id} className="relative flex flex-col gap-2 pl-10">
            <span
              className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center font-body text-[0.625rem] font-bold tracking-[0.04em]"
              style={{ backgroundColor: BAND_FILL[stage.band], color: textOnBand(stage.band) }}
            >
              {stage.ordinal}
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-[1.0625rem] font-semibold text-ink">{stage.name}</p>
              <p className={`${NUM} text-[1.25rem]`} style={{ color: BAND_TEXT[stage.band] }}>
                {stage.score}
              </p>
            </div>
            {stage.gates.length === 0 ? null : (
              <ul role="list" className="flex flex-col gap-2">
                {stage.gates.map((gate) => (
                  <li
                    key={gate.id}
                    className="flex flex-col gap-0.5 border-l-2 pl-2"
                    style={{ borderColor: BAND_FILL[gate.band] }}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={CAPS} style={{ color: BAND_TEXT[gate.band] }}>
                        {gate.name}
                      </span>
                      <span
                        className="font-body text-[0.6875rem] font-bold"
                        style={{ color: BAND_TEXT[gate.band] }}
                      >
                        {gate.score}
                      </span>
                    </span>
                    <span className="font-body text-[0.8125rem] leading-[1.5] text-ink">
                      {gate.note}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {model.reads.length === 0 ? null : (
        <ul role="list" className="flex flex-col">
          {model.reads.map((read, i) => (
            <li
              key={read}
              className={`py-2 font-body text-[0.8125rem] leading-[1.5] text-ink${i > 0 ? ' border-t' : ''}`}
              style={{ borderColor: RULE }}
            >
              {read}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Decide the `reads` duplication, deterministically**

`model.reads` is `facts.dependencies[].read_sentence`. If `s9`'s fallback bullets are built from the same sentences, the rail would print them twice whenever `s9` is running on fallback copy. Settle it with one grep:

```bash
cd ~/Desktop/XPG-Church-Assess
grep -n 'read_sentence' lib/report/fallback-sections.ts
```

- **If a hit appears inside `s9Bullets` (or whatever `bulletsFor('s9')` delegates to):** delete the entire `{model.reads.length === 0 ? null : (…)}` block you just pasted. Leave `ChainModel.reads` in the model — it is tested in Task 8 and harmless unread. Add `(reads live in the s9 body, not the rail)` to this task's commit message.
- **If there is no hit:** keep the block exactly as written.

Do not guess. Run the grep.

- [ ] **Step 6: Append `WebPhaseRail`**

```tsx
/**
 * The 30/60/90 roadmap as three colour-keyed blocks (spec §6.6). This is the one
 * visual that REPLACES a section body rather than sitting beside it, so it also
 * owns the bullets it does not supersede.
 *
 * s10Bullets renders the three phase entries AND may append a
 * `Do not work on yet: ...` bullet that roadmapEntries() never produced. The
 * model's `supersedes` holds the exact strings this rail stands in for; anything
 * left over is real deterministic prose and is rendered beneath as an ordinary
 * bullet list. No parsing, no new prose, nothing silently dropped.
 *
 * Text colour flips to ink below full opacity: textOnBand is computed for the
 * band at full strength, and cream on a 30%-strength ground is unreadable.
 */
export function WebPhaseRail({ model, bullets }: { model: PhaseRailModel; bullets: string[] }) {
  const remaining = bullets.filter((bullet) => !model.supersedes.includes(bullet));
  return (
    <div className="flex flex-col gap-4">
      <ol role="list" className="flex flex-col gap-px">
        {model.blocks.map((block) => (
          <li key={block.dayLabel} className="relative px-5 py-4">
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ backgroundColor: BAND_FILL[model.band], opacity: block.opacity }}
            />
            <div
              className="relative flex flex-col gap-1"
              style={{ color: block.opacity === 1 ? textOnBand(model.band) : INK }}
            >
              <div className="flex items-baseline gap-3">
                <span className={`${NUM} text-[1.75rem]`}>{block.numeral}</span>
                <span className={CAPS}>{block.dayLabel}</span>
              </div>
              <p className="font-body text-[0.9375rem] leading-[1.6]">{block.text}</p>
            </div>
          </li>
        ))}
      </ol>
      {remaining.length === 0 ? null : (
        <ul className={LIST}>
          {remaining.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Gate + structural check**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean, full suite PASS.

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '^export function Web' 'app/app/[churchId]/diagnosis/report/web-visuals.tsx'
grep -c 'supersedes' 'app/app/[churchId]/diagnosis/report/web-visuals.tsx'
```

Expected: `8` — all eight web visuals now exist — and `2` (the doc comment plus the filter).

- [ ] **Step 8: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/web-visuals.tsx'
git commit -m "feat(report): add theme split, disagreement spread, chain rail and phase rail"
```

---

### Task 16: `SectionVisualsAbove` / `SectionVisualsBelow` dispatcher + the `s10` body replacement

The riskiest task in the plan. Three separate traps, all documented below — read all three before editing.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/sections.tsx:256-278` (the `ReportSections` map)

**Interfaces:**
- Consumes: `WebVisuals` (Tasks 5–9) via the `visuals` prop **Task 10 already added**; all eight components from Tasks 10/14/15; the existing `WebChart` and `SectionContent`.
- Produces: two module-private components, `SectionVisualsAbove` and `SectionVisualsBelow`, both `({ section, visuals }: { section: AssembledSection; visuals: WebVisuals })`. Nothing outside this file reads them.

**Trap 1 — the a11y heading guard.** `tests/a11y/shared-report-heading.test.ts` strips comments then counts `/<h1(?=[\s>/])/g` across `page.tsx` **and** this file, and requires the sum to be exactly **1**. The `index === 0` ternary at `:268-272` is that one `<h1`. It must survive this refactor **as two literal branches** — do not collapse it into a variable tag, a `Tag` alias, or `createElement`.

**Trap 2 — no variable component identifiers.** The doc comment at `:190-203` is not theoretical: `react-hooks/static-components` makes `const C = MAP.get(id); return <C …/>` a real eslint **error** in this repo. Every branch below returns a **literal component tag**, and every switch ends in a `never` default.

**Trap 3 — Task 10 left a temporary line.** `{section.id === 's13' ? <WebConfidence … /> : null}` sits just after `<SectionContent …/>`. **Delete it in Step 3** — `SectionVisualsBelow` takes over `s13`. Forgetting this renders the confidence meter twice.

- [ ] **Step 1: Extend the imports**

```tsx
import {
  WebCapacityBars,
  WebChainRail,
  WebConfidence,
  WebConstraintCallout,
  WebDumbbells,
  WebPhaseRail,
  WebSpread,
  WebThemeSplit,
} from './web-visuals'
```

replacing the single-name `import { WebConfidence } from './web-visuals'` Task 10 added.

- [ ] **Step 2: Add the two dispatchers**

Paste this immediately **above** `function ReportSections(` at `:256`:

```tsx
/**
 * Per-section visual placement (spec §5.2). Replaces the blind
 * `section.charts.map` that used to render every chart in one slot above the
 * body — the new layout needs some visuals above the prose and some below it,
 * and needs to interleave the two rebuilt charts with a new HTML component.
 *
 * Sections with no explicit placement keep exactly today's behaviour: all of
 * their charts, above the body, in model order.
 *
 * LITERAL COMPONENT TAGS ONLY, `never` in every default — see the doc comment at
 * the top of SectionContent. A Map/lookup of component identifiers is a real
 * react-hooks/static-components error in this repo, not a style preference.
 */
type AboveId = 's3' | 's4' | 's7' | 's9'
type BelowId = 's4' | 's7' | 's8' | 's13'

const ABOVE_IDS: readonly string[] = ['s3', 's4', 's7', 's9']
const BELOW_IDS: readonly string[] = ['s4', 's7', 's8', 's13']

function chartOfKind(section: AssembledSection, kind: ChartModel['kind']) {
  return section.charts.find((chart) => chart.kind === kind) ?? null
}

function SectionVisualsAbove({
  section,
  visuals,
}: {
  section: AssembledSection
  visuals: WebVisuals
}) {
  if (!ABOVE_IDS.includes(section.id)) {
    return (
      <>
        {section.charts.map((chart) => (
          <WebChart key={chart.kind} model={chart} />
        ))}
      </>
    )
  }

  const verdict = chartOfKind(section, 'verdict_block')
  const statGrid = chartOfKind(section, 'stat_grid')

  switch (section.id as AboveId) {
    case 's3':
      return (
        <>
          {verdict ? <WebChart model={verdict} /> : null}
          <WebCapacityBars model={visuals.s3.capacity} />
          {statGrid ? <WebChart model={statGrid} /> : null}
        </>
      )
    case 's4':
      return visuals.s4.constraint ? (
        <WebConstraintCallout model={visuals.s4.constraint} />
      ) : null
    case 's7':
      return visuals.s7.themeSplit ? <WebThemeSplit model={visuals.s7.themeSplit} /> : null
    case 's9':
      return <WebChainRail model={visuals.s9.chain} />
    default: {
      const exhaustive: never = section.id as never
      return exhaustive
    }
  }
}

function SectionVisualsBelow({
  section,
  visuals,
}: {
  section: AssembledSection
  visuals: WebVisuals
}) {
  if (!BELOW_IDS.includes(section.id)) return null

  const rankList = chartOfKind(section, 'rank_list')

  switch (section.id as BelowId) {
    case 's4':
      return visuals.s4.dumbbells ? <WebDumbbells model={visuals.s4.dumbbells} /> : null
    case 's7':
      return rankList ? <WebChart model={rankList} /> : null
    case 's8':
      return visuals.s8.spread ? <WebSpread model={visuals.s8.spread} /> : null
    case 's13':
      return <WebConfidence model={visuals.s13.confidence} />
    default: {
      const exhaustive: never = section.id as never
      return exhaustive
    }
  }
}
```

Add `ChartModel` to the type import from `@/lib/report/charts` at `:7`.

> `s7`'s rank list moves **below** the prose and `s3`'s two charts are **interleaved** with the capacity bars — that is the whole reason the blind map had to go. Every other section id lands in the `ABOVE_IDS.includes` early return and renders exactly what it renders today.

- [ ] **Step 3: Rewire the map**

In `ReportSections`, replace

```tsx
      {section.charts.map((chart) => (<WebChart key={chart.kind} model={chart} />))}
      <SectionContent section={section} areaIndex={areaIndex} />
      {section.id === 's13' ? <WebConfidence model={visuals.s13.confidence} /> : null}
```

with

```tsx
      <SectionVisualsAbove section={section} visuals={visuals} />
      {section.id === 's10' && visuals.s10.phaseRail ? (
        <S10PhaseBody section={section} model={visuals.s10.phaseRail} />
      ) : (
        <SectionContent section={section} areaIndex={areaIndex} />
      )}
      <SectionVisualsBelow section={section} visuals={visuals} />
```

**The `{section.id === 's13' ? … : null}` line from Task 10 is deleted here.** Leave everything else in the map — the `<section>` wrapper, the opener `<div>`, the `index === 0` `h1`/`h2` ternary, and the booking CTA at `:279-292` — untouched.

- [ ] **Step 4: Add the `s10` body replacement**

`s10` is **not an AI section** — `sections.tsx` has renderers for s2/s4/s5/s6/s7/s9/s12 and none for s10, so it always renders fallback copy. That is what makes replacing its body safe, and why `PhaseRailModel.supersedes` is defined against `section.fallback.bullets`.

The rail replaces the **bullets**, not the paragraph. Open `SectionBodyView` at `:30-47` and mirror exactly how it renders `section.fallback.body`, then hand the bullets to the rail:

```tsx
/**
 * s10 renders its roadmap as the phase rail instead of a bullet list (spec §6.6).
 * The body paragraph is untouched; the rail is handed the FULL bullet array and
 * subtracts model.supersedes itself, so s10Bullets' extra `Do not work on yet:`
 * line survives verbatim beneath the rail.
 */
function S10PhaseBody({
  section,
  model,
}: {
  section: AssembledSection
  model: PhaseRailModel
}) {
  return (
    <div className="flex flex-col gap-4">
      {section.fallback.body ? <p className={BODY}>{section.fallback.body}</p> : null}
      <WebPhaseRail model={model} bullets={section.fallback.bullets} />
    </div>
  )
}
```

Add `import type { PhaseRailModel, WebVisuals } from '@/lib/report/web-visuals'` (extending the `WebVisuals` type import Task 10 added).

> If `SectionBodyView` wraps `body` in something other than `<p className={BODY}>` — a `<div>`, multiple paragraphs split on newline — copy **its** markup here instead. The rule is that every string it would render for `s10`, except `model.supersedes`, still reaches the page.

- [ ] **Step 5: Gate — the a11y guard is the one that matters**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean, full suite PASS. If `tests/a11y/shared-report-heading.test.ts` fails, you collapsed the `h1`/`h2` ternary — restore the two literal branches.

- [ ] **Step 6: Structural check**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '<h1' 'app/app/[churchId]/diagnosis/report/sections.tsx'
grep -c 'section.charts.map' 'app/app/[churchId]/diagnosis/report/sections.tsx'
grep -c "section.id === 's13'" 'app/app/[churchId]/diagnosis/report/sections.tsx'
grep -c 'exhaustive: never' 'app/app/[churchId]/diagnosis/report/sections.tsx'
```

Expected, in order: `1` (the guard's one heading), `1` (only the one inside `SectionVisualsAbove`'s default branch — the blind one in the map is gone), `0` (Task 10's temporary line is deleted), `2` (one per dispatcher).

- [ ] **Step 7: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/sections.tsx'
git commit -m "feat(report): dispatch web visuals above/below each section and swap s10 for the phase rail"
```

---

### Task 17: Section opener chrome + `s6` beat labels

Two independent edits in `sections.tsx`, both pure chrome.

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/sections.tsx:262-273` (the opener `<div>`), `:127-132` (the six bare `<p>` beats in `S6View`), `:16-21` (one new const)

**Interfaces:**
- Consumes: `BAND_FILL`, the existing `CAPS` / `OPENER_TITLE` / `OPENER_TITLE_SIZE` / `BODY` locals, and the `index` / `sections.length` already in scope in the map.
- Produces: nothing. Both edits are local to this file.

⚠️ **The `index === 0` `h1`/`h2` ternary must survive this edit too.** It is inside the block being rewritten. Keep both literal branches.

- [ ] **Step 1: Add the ink const**

In the style-constant block at `:16-21`, add:

```tsx
const INK = '#1A1A18'
```

(`text-ink` and `text-ink-soft` are real Tailwind tokens in this repo — `charts.tsx` uses both — but there is no proven `bg-ink`, so the 2px rule sets its colour inline.)

- [ ] **Step 2: Replace the opener slab with editorial chrome**

Replace

```tsx
      <div className="-mx-6 px-6 py-3 sm:mx-0 sm:px-4"
           style={{ backgroundColor: BAND_FILL[band], color: textOnBand(band) }}>
        <p className={CAPS}>{String(index + 1).padStart(2, '0')}</p>
        {index === 0 ? (
          <h1 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h1>
        ) : (
          <h2 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h2>
        )}
      </div>
```

with

```tsx
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-[22px] w-[3px] shrink-0"
            style={{ backgroundColor: BAND_FILL[band] }}
          />
          <p className={`${CAPS} text-ink-soft`}>
            {`${String(index + 1).padStart(2, '0')} / ${sections.length}`}
          </p>
        </div>
        {index === 0 ? (
          <h1 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h1>
        ) : (
          <h2 className={OPENER_TITLE} style={OPENER_TITLE_SIZE}>{section.fallback.title}</h2>
        )}
        <span aria-hidden className="h-[2px] w-full" style={{ backgroundColor: INK }} />
      </div>
```

The band survives as a 3px tick rather than a full slab — thirteen full-width colour slabs was the thing that made the web report read as a template. `01 / 13` is a section eyebrow, explicitly sanctioned chrome.

> `textOnBand` may now be unused **in this position** but is still used by `S6View` — do not delete the import. `npm run lint` is the authority.

- [ ] **Step 3: Label the six `s6` beats**

In `S6View`, add this const above the function:

```tsx
/**
 * The six beats of an area read, labelled on the web only (spec §6.1). Six
 * unlabelled paragraphs read as one undifferentiated block; the labels are
 * chrome, and the paragraphs themselves are byte-identical to the PDF's.
 */
const S6_BEATS = [
  { key: 'affirm', label: "What's working" },
  { key: 'pivot', label: 'Where it turns' },
  { key: 'evidence', label: 'The evidence' },
  { key: 'not_statement', label: 'What this is not' },
  { key: 'reframe', label: 'Another way to see it' },
  { key: 'trajectory', label: 'If nothing changes' },
] as const
```

Then replace the six bare paragraphs at `:127-132`

```tsx
            <p className={BODY}>{area.affirm}</p>
            <p className={BODY}>{area.pivot}</p>
            <p className={BODY}>{area.evidence}</p>
            <p className={BODY}>{area.not_statement}</p>
            <p className={BODY}>{area.reframe}</p>
            <p className={BODY}>{area.trajectory}</p>
```

with

```tsx
            {S6_BEATS.map((beat) => (
              <div
                key={beat.key}
                className="grid gap-1 border-t border-line pt-2 sm:grid-cols-[7rem_1fr] sm:gap-4"
              >
                <p className={`${CAPS} text-ink-soft`}>{beat.label}</p>
                <p className={BODY}>{area[beat.key]}</p>
              </div>
            ))}
```

Stacked below `sm`, two columns from `sm` up. `CAPS` uppercases in CSS, so the labels render `WHAT'S WORKING`, `WHERE IT TURNS`, and so on. The band-headed area block above them (`:113-125`) is untouched.

> `area[beat.key]` typechecks because `S6_BEATS` is `as const` and all six keys exist on the zod-parsed area. If tsc complains, the schema's field names differ — fix `S6_BEATS`, never the schema.

- [ ] **Step 4: Gate**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: clean, full suite PASS — the a11y heading guard included.

- [ ] **Step 5: Structural check**

```bash
cd ~/Desktop/XPG-Church-Assess
grep -c '<h1' 'app/app/[churchId]/diagnosis/report/sections.tsx'
grep -c 'S6_BEATS' 'app/app/[churchId]/diagnosis/report/sections.tsx'
grep -c 'area\.affirm\|area\.pivot\|area\.evidence\|area\.not_statement\|area\.reframe\|area\.trajectory' 'app/app/[churchId]/diagnosis/report/sections.tsx'
grep -c 'sections.length' 'app/app/[churchId]/diagnosis/report/sections.tsx'
```

Expected, in order: `1`, `2` (declaration + `.map`), `0` (all six dotted accesses replaced by the indexed one), `1`.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/report/sections.tsx'
git commit -m "feat(report): replace the section slab with editorial chrome and label the s6 beats"
```

---

### Task 18: Full-suite verification

No new code. This task proves the whole plan landed and that the PDF did not move.

**Files:** none modified. This task commits **the plan document itself**.

- [ ] **Step 1: Full gate**

```bash
cd ~/Desktop/XPG-Church-Assess
npm test && npm run typecheck && npm run lint
```

Expected: full suite PASS, no type errors, no lint errors. In particular:
- `tests/a11y/shared-report-heading.test.ts` — still exactly one `<h1`.
- `tests/report/chart-parity.test.ts` — untouched and green; the eight new visuals live outside `section.charts`, so it never sees them.
- `tests/report/fallback-sections.test.ts` — untouched and green; `roadmapEntries` only gained an `export`.

> ⛔ Do **not** run `npm run test:db`, `supabase db push`, or `supabase db reset`. Nothing in this plan touches the database.

- [ ] **Step 2: Prove the PDF never moved**

```bash
GIT_LITERAL_PATHSPECS=1 git diff --stat d790680..HEAD -- \
  lib/report/pdf/ 'app/api/report/[runId]/pdf/route.ts'
```

Expected: **empty output.** This is the plan's central promise — the printed report is byte-identical.

- [ ] **Step 3: Review the whole diff for scope creep**

```bash
GIT_LITERAL_PATHSPECS=1 git diff --stat d790680..HEAD
```

Expected: **exactly** these paths, and no others —

```
lib/report/charts.ts
lib/report/fallback-sections.ts
lib/report/resolve.ts
lib/report/web-visuals.ts                                    (new)
tests/report/charts.test.ts
tests/report/web-visuals.test.ts                             (new)
app/app/[churchId]/diagnosis/page.tsx
app/app/[churchId]/diagnosis/report/charts.tsx
app/app/[churchId]/diagnosis/report/report-cover.tsx
app/app/[churchId]/diagnosis/report/sections.tsx
app/app/[churchId]/diagnosis/report/web-visuals.tsx          (new)
app/r/[shareToken]/page.tsx
docs/superpowers/specs/2026-08-15-web-report-visual-design.md (from 497552b)
docs/superpowers/plans/2026-08-15-web-report-visual-design.md
```

Anything else — especially `chain.tsx`, `system.tsx`, `dossier.tsx` or `cover.tsx` (PR #64's scope) — is scope creep. Revert it.

- [ ] **Step 4: Commit the plan document**

```bash
cd ~/Desktop/XPG-Church-Assess
git add docs/superpowers/plans/2026-08-15-web-report-visual-design.md
git commit -m "docs: add the web report visual redesign implementation plan"
```

- [ ] **Step 5: Hand back to Natalie**

Report: the branch is `fix/report-chart-label-legibility`, the full suite is green, the PDF diff is empty, and the two open follow-ups from spec §13 (the cover-strip marker-vs-segments defect, and the `WebRankList` constant `BAND_FILL.severe` score ground) are still open by design.

⛔ **Do not merge, do not push to `master`, do not force-push.** Natalie opens the PR.

---
