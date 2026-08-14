# XPG Final Report — Quality Pass + Data Visualisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the deterministic report's score-blind band reads, make composer-vs-fallback observable, and add SVG charts plus three missing s6 prose beats to both report surfaces from one shared geometry seam.

**Architecture:** A new pure module `lib/report/charts.ts` computes all chart geometry in a fixed unit space from the facts pack. `assembleReport` / `assembleFallbackOnly` attach the resulting models to each `AssembledSection`, and the PDF (`@react-pdf/renderer` `Svg`) and web (`<svg>`) renderers consume the *same numbers* through their own primitives — so parity is structural, not maintained by discipline. Everything score-shaped (`readingBand`) is corrected first, because the corrected bands feed the chart bar fills.

**Tech Stack:** Next.js (App Router), TypeScript, Zod 3.25.76 (imported as `zod/v4`), `@react-pdf/renderer` 4.5.1, Vitest, YAML methodology files under `methodology/`.

**Source spec:** `docs/superpowers/specs/2026-08-13-final-report-quality-pass-design.md` (committed `2c3a5fc`). Read it before Task 1.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch:** `feat/report-quality-charts`, already created off `origin/master` @ `291ecb0`. Do not create another.
- **Never stage** these three known-untracked entries: `.claude/`, `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`, `docs/superpowers/plans/2026-08-01-assessment-deadlines.md`. Every `git add` in this plan uses **explicit file paths**. Never `git add -A`, never `git add .`.
- **NO methodology version bump.** Do not touch `version:` in any file under `methodology/`.
- **NO `report.yaml:version` bump — this is a hard stop.** `report.yaml:version` is a component of `inputsHash` (`lib/report/report-hash.ts`). Bumping it stales every persisted report at once, and `rpc_save_report.sql:45`'s unfixed `on conflict do nothing` means a stale row cannot be overwritten — every church would be pinned to 100% fallback permanently. If any beat turns out to need a `report.yaml` section-template change, **STOP AND ESCALATE to Natalie**. Do not bump to get unblocked.
- **`copy.yaml` is safe to edit.** It is *not* in `inputsHash`. All new copy goes there.
- **NO new migration.** No SQL files, no `supabase/migrations/` additions.
- **NO new dependencies.** `zod` stays pinned `3.25.76`. Do not run `npm install <pkg>`.
- **PDF charts use `@react-pdf/renderer` SVG primitives only** (`Svg, G, Rect, Line, Text, Path, Circle, Polygon, Defs, Tspan` — all verified present at 4.5.1). No canvas, no image rasterisation, no chart library.
- **AI prose scope:** s6 templates / prompt shaping / `S6Schema` / the s6 gate only. **Do NOT touch `SYSTEM_PROMPT` register** or `methodology/report.yaml`'s `style_spine`.
- **Both surfaces, always.** Any renderer change lands in *both* `lib/report/pdf/document.tsx` and `app/app/[churchId]/diagnosis/report/sections.tsx`.
- **The agent never runs** `npm run test:db`, `supabase db push`, `supabase db reset`. Never merges. Never pushes or force-pushes without Natalie's explicit say-so.
- **Gates for every task:** `npm test` (vitest) and `npm run typecheck` (tsc). `npm run lint` too, except that `eslint.config.mjs:12` globally ignores `lib/ai/**` — a green lint proves nothing about files there, so `tsc` + vitest are the real gates for `lib/ai/*`.
- **Determinism:** never `localeCompare` in report code (locale/ICU-dependent, breaks cross-machine reproducibility). Plain lexicographic `(a < b ? -1 : a > b ? 1 : 0)`.
- **Anonymity:** respondent labels/ids never enter the facts pack, a chart model, a bullet, or a rendered sentence.

## Known repo facts you will need (do not re-derive)

- The 2026-08-14 sample PDF is **100% deterministic fallback** — `.env.local` has no `OPENAI_API_KEY`, so `new OpenAI()` throws in `lib/ai/sections.ts:119` and `lib/ai/themes.ts:160`, every AI section returns null, and `facts.themes` is `[]`. Never diagnose report prose from that PDF.
- `methodology/rules.yaml` thresholds today: `break: 45`, `severe: 25`, `gate: 45`, `blind_spot_gap: 20`, `dispersion: 2.0`.
- `methodology/rules.yaml` tiers: `healthy_ready min 85`, `healthy_stretched min 70`, `strained min 55`, `at_risk min 0`.
- `copy.blocks` and `copy.inserts` are `z.record(z.string().min(1))` in `lib/methodology/schema.ts:154-155` — **flat strings only**. A band-keyed or theme-keyed object cannot live under them. New keyed copy therefore gets its own named top-level `copy` key with its own schema, exactly the pattern `dossier.reading` and `dependency_reads` already use. This is a `schema.ts` (code) change, not a `report.yaml` change, so it does not trip the §2 hazard.
- `growth_trajectory` option values (`app/app/[churchId]/settings/settings-form.tsx:23-28`): `declining`, `plateaued`, `growing_steadily`, `growing_rapidly`.
- `facts.profile` holds **non-null fields only** — an unset `growth_trajectory` is absent from the record, not empty-string.
- `facts.categories` is pre-sorted **score descending, ties by id ascending** (`lib/report/facts.ts:164`).
- `MIN_SUPPORT = 3` is exported from `lib/ai/theme-gates.ts:24`. That module imports only `../report/anonymity` and two type-only imports — **no OpenAI SDK**, so importing it from `lib/report/*` does not pull the SDK into the share-page bundle.
- `Theme` is `'systems' | 'culture' | 'theology' | 'relational'`, exported from `lib/methodology/schema.ts`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `lib/report/charts.ts` | Pure chart geometry. Three model builders, no JSX, no `@react-pdf/renderer` import, no DOM. The single source of every chart number. |
| `lib/report/pdf/charts.tsx` | PDF chart primitives — renders a `ChartModel` with `@react-pdf/renderer` `Svg`. |
| `app/app/[churchId]/diagnosis/report/charts.tsx` | Web chart primitives — renders the *same* `ChartModel` with DOM `<svg>`. |
| `tests/fixtures/facts/index.ts` | Six hand-built `FactsPack` fixtures + the shared builder helpers. No DB, no migration. |
| `tests/report/charts.test.ts` | Geometry unit tests across all six fixtures. |
| `tests/report/chart-parity.test.ts` | Asserts both renderers consume the identical model object. |
| `tests/report/s6-beats.test.ts` | The six-beat deterministic bullet. |
| `tests/report/observability.test.ts` | The `[report]` section-sources log line + missing-key warning. |

**Modified:**

| File | Change |
|---|---|
| `methodology/rules.yaml` | `thresholds.strong: 70` added. **No `version:` change.** |
| `methodology/copy.yaml` | `beats.*`, `xpg_read.*`, `s8_below_threshold` added. **No `version:` change.** |
| `lib/methodology/schema.ts` | `thresholds.strong`; `BeatsSchema`, `XpgReadSchema`; `CopySchema` gains `beats`, `xpg_read`, `s8_below_threshold`. |
| `lib/report/view.ts` | `readingBand` becomes score-aware; third param widens from `severeThreshold: number` to the whole `thresholds` object. |
| `lib/report/fallback-sections.ts` | `bandRead` call-site update; three new beat functions; `s6Bullet` grows to six beats; `s8Bullets` k-guard; s3 bullets slimmed. |
| `lib/report/compose.ts` | `AssembledSection` gains `charts: ChartModel[]`; both assemblers populate it; `composeReport` logs a section-sources summary. |
| `lib/ai/sections.ts` | `S6Schema` grows to six fields; missing-`OPENAI_API_KEY` warn-once. |
| `lib/ai/section-gates.ts` | s6 gate covers the three new fields (already covered by the generic gates — verified by test, see Task 9). |
| `lib/report/pdf/document.tsx` | Renders `section.charts`; `S6View` grows to six `<Text>`. |
| `app/app/[churchId]/diagnosis/report/sections.tsx` | Renders `section.charts`; `S6View` grows to six `<p>`. |

---

## Task 1: Score-aware `readingBand`

Spec §7.1. Lands first: every chart bar fill is keyed to the corrected band.

Today `readingBand` returns `holding` for **every** non-broken, non-watch state regardless of score, so Governance at 53/100 is told *"This is strong."* The fix adds a `strong` threshold: an `ok`-state area only reads `holding` once it clears it; below that it reads `watch`.

**Files:**
- Modify: `methodology/rules.yaml` (thresholds block, lines 26-31)
- Modify: `lib/methodology/schema.ts:66-72` (thresholds shape)
- Modify: `lib/report/view.ts:107-111` (`readingBand`), `:298` (call site)
- Modify: `lib/report/fallback-sections.ts:51-54` (`bandRead` call site)
- Test: `tests/report/view.test.ts` (extend)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `readingBand(state: DiagnosisCategory['state'], score: number, thresholds: Methodology['rules']['thresholds']): ReadingBand` — **note the widened third parameter**. Every later task that calls it passes `methodology.rules.thresholds`, never `.severe`. `ReadingBand` stays `'severe' | 'broken' | 'watch' | 'holding'` (no fifth band, so `copy.dossier.reading` needs no new keys).

- [ ] **Step 1: Write the failing test**

Append to `tests/report/view.test.ts`:

```ts
import { readingBand } from '@/lib/report/view';
import { loadMethodology } from '@/lib/methodology/load';

describe('readingBand is score-aware', () => {
  const thresholds = loadMethodology().rules.thresholds;

  it('does not call a mid-range ok area strong', () => {
    // The sample report's Governance: state 'ok', score 53. Before this change it read
    // 'holding' -> "This is strong." at 53/100.
    expect(readingBand('ok', 53, thresholds)).toBe('watch');
  });

  it('calls an ok area at or above the strong threshold holding', () => {
    expect(readingBand('ok', thresholds.strong, thresholds)).toBe('holding');
    expect(readingBand('ok', 72, thresholds)).toBe('holding');
    expect(readingBand('ok', 100, thresholds)).toBe('holding');
  });

  it('keeps the existing broken/severe split', () => {
    expect(readingBand('broken', 24, thresholds)).toBe('severe');
    expect(readingBand('broken', 25, thresholds)).toBe('broken');
    expect(readingBand('gate', 24, thresholds)).toBe('severe');
    expect(readingBand('gate', 44, thresholds)).toBe('broken');
  });

  it('passes an explicit watch state straight through', () => {
    expect(readingBand('watch', 95, thresholds)).toBe('watch');
  });

  it('never returns holding below the strong threshold, for any state', () => {
    for (let score = 0; score < thresholds.strong; score += 1) {
      for (const state of ['ok', 'watch', 'broken', 'gate'] as const) {
        expect(readingBand(state, score, thresholds)).not.toBe('holding');
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/view.test.ts -t "readingBand is score-aware"
```

Expected: FAIL. `thresholds.strong` is `undefined`, so `readingBand('ok', 53, thresholds)` returns `'holding'`, not `'watch'`.

- [ ] **Step 3: Add the threshold to `methodology/rules.yaml`**

In the `thresholds:` block (currently lines 26-31), add one line. **Do not touch `version:` anywhere in this file.**

```yaml
thresholds:
  break: 45
  severe: 25
  gate: 45
  blind_spot_gap: 20
  dispersion: 2.0
  # An `ok`-state area only reads "This is strong" once it clears this. Below it the area
  # reads 'watch' instead — a 53/100 area is not strong, and readingBand used to say it was
  # because it was state-driven only. Set to the healthy_stretched tier floor so the per-area
  # register and the overall tier register agree on where "strong" begins.
  strong: 70
```

- [ ] **Step 4: Widen the schema**

`lib/methodology/schema.ts:66-72` — add `strong` to the thresholds object:

```ts
  thresholds: z.object({
    break: z.number(),
    severe: z.number(),
    gate: z.number(),
    blind_spot_gap: z.number(),
    dispersion: z.number(),
    strong: z.number(),
  }),
```

- [ ] **Step 5: Make `readingBand` score-aware**

`lib/report/view.ts` — replace the function at `:107-111` (keep the doc comment above it, updating its last sentence as shown):

```ts
/**
 * Reading band from score + state (spec §7.2 table). `state` is 'broken' (stage)
 * or 'gate' (enabler) for every "not holding" category — thresholds.severe splits
 * that single state into the finer severe/broken bands the copy needs. 'watch'
 * passes straight through.
 *
 * The final arm is SCORE-AWARE, not state-only: a category can be 'ok' (nothing in the
 * engine flagged it) and still be nowhere near strong. Before this, every non-broken
 * non-watch area got 'holding' -> "This is strong.", so a 53/100 area and a 100/100 area
 * read identically. Anything below thresholds.strong now reads 'watch' instead. This also
 * keys the chart bar fills (lib/report/charts.ts), so a wrong band here is a wrong colour
 * there too — one function, one fix, both surfaces, both media.
 */
export function readingBand(
  state: DiagnosisCategory['state'],
  score: number,
  thresholds: Methodology['rules']['thresholds'],
): ReadingBand {
  if (state === 'broken' || state === 'gate') return score < thresholds.severe ? 'severe' : 'broken';
  if (state === 'watch') return 'watch';
  return score < thresholds.strong ? 'watch' : 'holding';
}
```

- [ ] **Step 6: Update both call sites**

`lib/report/view.ts:298` inside `buildAreas` — `thresholds` is already destructured from `methodology.rules` at `:285`:

```ts
    const band = readingBand(state, score, thresholds);
```

`lib/report/fallback-sections.ts:51-54` — `bandRead`:

```ts
function bandRead(c: CategoryFact, methodology: Methodology): string {
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
  return methodology.copy.dossier.reading[c.kind][band];
}
```

- [ ] **Step 7: Run the tests**

```bash
npx vitest run tests/report/view.test.ts tests/report/fallback-sections.test.ts tests/methodology
```

Expected: the new block PASSES. **Existing tests that asserted the literal string "This is strong" for a mid-range area will now fail** — that is the intended behaviour change, not a regression. For each such failure, update the expectation to the `watch` copy (`copy.dossier.reading.<kind>.watch`) and add a one-line comment naming this task. Do **not** weaken an assertion to `expect.any(String)` to make it pass.

- [ ] **Step 8: Full gate**

```bash
npm test && npm run typecheck
```

Expected: both green. `tsc` is what proves you found every `readingBand` call site — the widened third parameter makes a missed one a compile error.

- [ ] **Step 9: Commit**

```bash
git add methodology/rules.yaml lib/methodology/schema.ts lib/report/view.ts lib/report/fallback-sections.ts tests/report/view.test.ts tests/report/fallback-sections.test.ts
git commit -m "fix(report): make readingBand score-aware so a 53/100 area is not called strong"
```

---

## Task 2: Composer-vs-fallback observability

Spec §7.2. Today "the model is off" and "the model ran and every section was rejected" are indistinguishable in the output — which is exactly how the sample PDF was mistaken for composed prose.

**Files:**
- Modify: `lib/ai/sections.ts:113-149` (`composeSection`)
- Modify: `lib/report/compose.ts:60-69` (`composeReport` tail)
- Test: `tests/report/observability.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `summariseSectionSources(sources: Record<SectionId, SectionSource>): string`, exported from `lib/report/compose.ts`. Returns e.g. `'ai 5/13 · fallback: s6, s7, s9, s10, s11, s12, appendix, s1'` — no church data, no scores, ids only.

- [ ] **Step 1: Write the failing test**

Create `tests/report/observability.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { summariseSectionSources } from '@/lib/report/compose';
import type { SectionId, SectionSource } from '@/lib/report/compose';

afterEach(() => { vi.restoreAllMocks(); });

function sources(over: Partial<Record<SectionId, SectionSource>>): Record<SectionId, SectionSource> {
  const ids: SectionId[] = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','appendix'];
  return Object.fromEntries(ids.map((id) => [id, over[id] ?? 'fallback'])) as Record<SectionId, SectionSource>;
}

describe('summariseSectionSources', () => {
  it('reports the ai count and names every fallback section', () => {
    const line = summariseSectionSources(sources({ s2: 'ai', s4: 'ai' }));
    expect(line).toContain('ai 2/13');
    expect(line).toContain('s6');
    expect(line).not.toContain('s2');
  });

  it('makes an all-fallback report unmistakable', () => {
    const line = summariseSectionSources(sources({}));
    expect(line).toContain('ai 0/13');
  });

  it('makes an all-ai report unmistakable and lists no fallbacks', () => {
    const all = sources({});
    for (const id of Object.keys(all) as SectionId[]) all[id] = 'ai';
    const line = summariseSectionSources(all);
    expect(line).toContain('ai 13/13');
    expect(line).toContain('fallback: none');
  });

  it('carries no church data — ids and counts only', () => {
    const line = summariseSectionSources(sources({ s2: 'ai' }));
    expect(line).toMatch(/^ai \d+\/\d+ · fallback: [a-z0-9, ]+$/);
  });
});

describe('composeSection warns once when the API key is absent', () => {
  it('logs a distinct key-absent warning, not a generic request failure', async () => {
    vi.resetModules();
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { composeSection } = await import('@/lib/ai/sections');
    const { loadMethodology } = await import('@/lib/methodology/load');
    const { CAPACITY_FACTS } = await import('../fixtures/facts');

    await composeSection('s2', CAPACITY_FACTS, loadMethodology());
    await composeSection('s4', CAPACITY_FACTS, loadMethodology());

    const keyWarnings = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('OPENAI_API_KEY'));
    expect(keyWarnings).toHaveLength(1);
    expect(keyWarnings[0]).toContain('[report]');

    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });
});
```

> The second `describe` imports `../fixtures/facts`, built in Task 3. **Run Task 3 before this test can pass.** Write both `describe` blocks now; expect the second to fail on a missing module until Task 3 lands, then re-run.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/observability.test.ts
```

Expected: FAIL — `summariseSectionSources is not a function`, and the second block fails on the missing fixtures module.

- [ ] **Step 3: Add the summary helper and log line**

`lib/report/compose.ts` — add above `composeReport`:

```ts
/**
 * One line that makes "the model is off" distinguishable from "the model ran". Before this,
 * a 100% fallback report and a fully composed one produced identical logs, and a fallback-only
 * PDF was mistaken for composed prose (spec §0). Ids and counts only — never a score, a church
 * name, or any section text.
 */
export function summariseSectionSources(sources: Record<SectionId, SectionSource>): string {
  const entries = Object.entries(sources) as Array<[SectionId, SectionSource]>;
  const fellBack = entries.filter(([, source]) => source === 'fallback').map(([id]) => id);
  const aiCount = entries.length - fellBack.length;
  return `ai ${aiCount}/${entries.length} · fallback: ${fellBack.length > 0 ? fellBack.join(', ') : 'none'}`;
}
```

Then, in `composeReport`, replace the final `return { sections, section_sources };` (`:69`) with:

```ts
  console.info(`[report] section_sources: ${summariseSectionSources(section_sources)}`);

  return { sections, section_sources };
```

- [ ] **Step 4: Add the warn-once key check**

`lib/ai/sections.ts` — add above `composeSection`:

```ts
/** Warn-once latch. A 13-section report would otherwise emit the same line seven times. */
let missingKeyWarned = false;

/**
 * `new OpenAI()` throws on a missing key, which composeSection's catch resolves to a generic
 * "request failed" — indistinguishable from a network blip, and the reason the fallback-only
 * sample report read as composed prose for weeks (spec §0/§7.2). Name the actual cause once.
 */
function warnIfKeyAbsent(): void {
  if (missingKeyWarned || process.env.OPENAI_API_KEY) return;
  missingKeyWarned = true;
  console.warn('[report] OPENAI_API_KEY absent — every AI section will fall back to the deterministic spine');
}
```

Then inside `composeSection`'s `try`, make it the first statement, before `new OpenAI()` (`:118-119`):

```ts
  try {
    warnIfKeyAbsent();
    const client = new OpenAI();
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/report/observability.test.ts
```

Expected: the `summariseSectionSources` block PASSES. The `composeSection` block still fails on `../fixtures/facts` — that is expected until Task 3.

- [ ] **Step 6: Full gate**

```bash
npm test && npm run typecheck
```

Expected: `tsc` green; the one known failure is the fixtures import in `observability.test.ts`. Note it and move on — Task 3 closes it.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/sections.ts lib/report/compose.ts tests/report/observability.test.ts
git commit -m "feat(report): make composer-vs-fallback observable in logs"
```

---

## Task 3: The six `FactsPack` fixtures

Spec §6. The sample dataset is degenerate (1 respondent, all eight areas in a 53–72 `holding` band, no broken stage) and cannot exercise blind spots, dispersion, themes, or any constraint/foundation archetype. Nothing later in this plan may be validated against it alone.

**Files:**
- Create: `tests/fixtures/facts/index.ts`
- Test: `tests/fixtures/facts/fixtures.test.ts` (create — the fixtures must themselves be valid)

**Interfaces:**
- Consumes: nothing.
- Produces, all from `tests/fixtures/facts`:
  - `CAPACITY_FACTS`, `CONSTRAINT_FACTS`, `FOUNDATION_2_FACTS`, `FOUNDATION_3_FACTS`, `BROKEN_STAGE_SEVERE_FACTS`, `HIGH_DISPERSION_FACTS`, `THEMES_N3_FACTS` — each a `FactsPack`.
  - `ALL_FIXTURES: ReadonlyArray<{ name: string; facts: FactsPack }>` — what every later task's tests iterate.
  - `makeFacts(over: Partial<FactsPack>): FactsPack` — the builder. Later tasks use it for one-off edge cases.

- [ ] **Step 1: Write the failing test**

Create `tests/fixtures/facts/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSections } from '@/lib/report/fallback-sections';
import { ALL_FIXTURES } from './index';

const methodology = loadMethodology();

describe('facts fixtures', () => {
  it('covers all three archetypes', () => {
    const archetypes = new Set(ALL_FIXTURES.map((f) => f.facts.archetype));
    expect(archetypes).toEqual(new Set(['capacity', 'constraint', 'foundation']));
  });

  it('is not degenerate — every fixture has at least 8 respondents', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      expect(facts.cover.respondent_count, name).toBeGreaterThanOrEqual(8);
    }
  });

  it('keeps categories sorted score desc, ties by id asc — the invariant buildFacts guarantees', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sorted = [...facts.categories].sort(
        (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      expect(facts.categories, name).toEqual(sorted);
    }
  });

  it('carries all eight areas in every fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      expect(facts.categories.map((c) => c.id).sort(), name)
        .toEqual(['comm', 'conn', 'disc', 'gen', 'gov', 'guest', 'sys', 'vol']);
    }
  });

  it('keeps pattern_counts consistent with bottom_items', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const tally = { systems: 0, culture: 0, theology: 0, relational: 0 };
      for (const b of facts.bottom_items) tally[b.theme] += 1;
      expect(facts.pattern_counts, name).toEqual(tally);
    }
  });

  it('renders all 13 sections without throwing, on every fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sections = fallbackSections({ facts, methodology, reflections: [] });
      expect(Object.keys(sections), name).toHaveLength(13);
      for (const [id, body] of Object.entries(sections)) {
        expect(body.title.length, `${name}/${id}`).toBeGreaterThan(0);
        expect(body.body.length, `${name}/${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('exercises the distinguishing feature each fixture exists for', () => {
    const by = Object.fromEntries(ALL_FIXTURES.map((f) => [f.name, f.facts]));
    expect(by['capacity']!.primary_constraint).toBeNull();
    expect(by['capacity']!.gating).toHaveLength(0);
    expect(by['constraint']!.primary_constraint).not.toBeNull();
    expect(by['foundation-2']!.gating).toHaveLength(2);
    expect(by['foundation-3']!.gating).toHaveLength(3);
    const severe = by['broken-stage-severe']!;
    const severeCat = severe.categories.find((c) => c.id === severe.primary_constraint!.category_id)!;
    expect(severeCat.score).toBeLessThan(25); // rules.yaml thresholds.severe
    expect(by['high-dispersion']!.dispersion.length).toBeGreaterThan(0);
    expect(by['high-dispersion']!.blind_spots.length).toBeGreaterThan(0);
    expect(by['themes-n3']!.themes.length).toBeGreaterThan(0);
    for (const t of by['themes-n3']!.themes) expect(t.support_count).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/fixtures/facts/fixtures.test.ts
```

Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write the fixtures**

Create `tests/fixtures/facts/index.ts`:

```ts
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

const BASE_DEPENDENCIES: FactsPack['dependencies'] = [
  {
    from: 'sys', to: 'vol', kind: 'gate',
    from_name: 'Systems', to_name: 'Volunteer',
    from_score: 70, to_score: 72,
    read_sentence: 'Both are strong — nothing to flag here.',
  },
  {
    from: 'conn', to: 'disc', kind: 'feed',
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
      from: 'conn', to: 'disc', kind: 'feed',
      from_name: 'Connection', to_name: 'Discipleship',
      from_score: 38, to_score: 55,
      read_sentence: 'Connection is weak here too — this dependency is active and part of what’s costing you.',
    },
    {
      from: 'conn', to: 'vol', kind: 'feed',
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
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/fixtures/facts/fixtures.test.ts tests/report/observability.test.ts
```

Expected: both PASS — the fixtures test in full, and `observability.test.ts`'s second block now that `../fixtures/facts` resolves.

If `fallbackSections` throws on a fixture, **the fixture is wrong, not the renderer** — fix the fixture. The one exception: `generosity_mode: null` with `archetype: 'capacity'` must resolve through `roadmapEntries`'s `?? 'both'` fallback (`fallback-sections.ts:175`). If it throws there, that is a real bug — record it and escalate rather than papering over it in the fixture.

- [ ] **Step 5: Full gate**

```bash
npm test && npm run typecheck
```

Expected: both green, including the previously-failing `observability.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/facts/index.ts tests/fixtures/facts/fixtures.test.ts
git commit -m "test(report): add six FactsPack fixtures as the validation substrate"
```

---

## Task 4: `lib/report/charts.ts` — the shared geometry seam

Spec §1. Pure functions in a fixed viewBox unit space, so both surfaces consume identical numbers. A geometry bug is then one bug in one place.

**Files:**
- Create: `lib/report/charts.ts`
- Test: `tests/report/charts.test.ts` (create)

**Interfaces:**
- Consumes: `readingBand` (Task 1, widened signature); the fixtures (Task 3).
- Produces, all exported from `lib/report/charts.ts`:
  - `type BandKey = 'severe' | 'broken' | 'watch' | 'holding'`
  - `interface Tick { value: number; x: number }`
  - `interface AreaBar { id: string; name: string; score: number; band: BandKey; x: number; y: number; w: number; h: number }`
  - `interface AreaBarsModel { kind: 'area_bars'; bars: AreaBar[]; ticks: Tick[]; labelWidth: number; w: number; h: number }`
  - `interface TierBandSeg { id: string; name: string; from: number; to: number; x: number; w: number }`
  - `interface TierGaugeModel { kind: 'tier_gauge'; bands: TierBandSeg[]; marker: { x: number; label: string; value: number }; w: number; h: number }`
  - `interface BottomItemBar { id: string; text: string; mean: number; theme: Theme; x: number; y: number; w: number; h: number }`
  - `interface BottomItemsModel { kind: 'bottom_items'; bars: BottomItemBar[]; ticks: Tick[]; labelWidth: number; w: number; h: number }`
  - `type ChartModel = AreaBarsModel | TierGaugeModel | BottomItemsModel`
  - `areaBarsModel(facts: FactsPack, methodology: Methodology): AreaBarsModel`
  - `tierGaugeModel(facts: FactsPack, methodology: Methodology): TierGaugeModel`
  - `bottomItemsModel(facts: FactsPack): BottomItemsModel | null` — null when `facts.bottom_items` is empty
  - `BAND_FILL: Record<BandKey, string>` and `THEME_FILL: Record<Theme, string>` — hex strings, so both renderers use one palette

- [ ] **Step 1: Write the failing test**

Create `tests/report/charts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { readingBand } from '@/lib/report/view';
import type { CategoryState } from '@/lib/engine/types';
import {
  areaBarsModel, tierGaugeModel, bottomItemsModel, BAND_FILL, THEME_FILL,
} from '@/lib/report/charts';
import { ALL_FIXTURES, CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

const methodology = loadMethodology();

describe('areaBarsModel', () => {
  it('emits one bar per area, in facts order (score desc)', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = areaBarsModel(facts, methodology);
      expect(model.bars.map((b) => b.id), name).toEqual(facts.categories.map((c) => c.id));
    }
  });

  it('keys each bar band to readingBand — never to a flat colour', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = areaBarsModel(facts, methodology);
      for (const bar of model.bars) {
        const source = facts.categories.find((c) => c.id === bar.id)!;
        expect(bar.band, `${name}/${bar.id}`).toBe(
          readingBand(source.state as CategoryState, source.score, methodology.rules.thresholds),
        );
      }
    }
  });

  it('scales bar width linearly from score, with 0 and 100 at the plot edges', () => {
    const zeroTo100 = makeFacts({
      categories: [
        { id: 'guest', name: 'Guest Experience', kind: 'stage', score: 100, state: 'ok', percentile: 99, respondent_count: 9 },
        { id: 'conn', name: 'Connection', kind: 'stage', score: 50, state: 'ok', percentile: 50, respondent_count: 9 },
        { id: 'disc', name: 'Discipleship', kind: 'stage', score: 0, state: 'broken', percentile: 1, respondent_count: 9 },
      ] as never,
    });
    const model = areaBarsModel(zeroTo100, methodology);
    const plotWidth = model.w - model.labelWidth;
    expect(model.bars[0]!.w).toBeCloseTo(plotWidth, 5);
    expect(model.bars[1]!.w).toBeCloseTo(plotWidth / 2, 5);
    expect(model.bars[2]!.w).toBe(0);
  });

  it('never places a bar outside the viewBox', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = areaBarsModel(facts, methodology);
      for (const bar of model.bars) {
        expect(bar.x, name).toBeGreaterThanOrEqual(0);
        expect(bar.x + bar.w, name).toBeLessThanOrEqual(model.w + 1e-9);
        expect(bar.y, name).toBeGreaterThanOrEqual(0);
        expect(bar.y + bar.h, name).toBeLessThanOrEqual(model.h + 1e-9);
      }
    }
  });

  it('stacks rows without overlap', () => {
    const model = areaBarsModel(CAPACITY_FACTS, methodology);
    for (let i = 1; i < model.bars.length; i += 1) {
      expect(model.bars[i]!.y).toBeGreaterThanOrEqual(model.bars[i - 1]!.y + model.bars[i - 1]!.h);
    }
  });

  it('is a pure function — same input, identical output', () => {
    expect(areaBarsModel(CAPACITY_FACTS, methodology))
      .toEqual(areaBarsModel(CAPACITY_FACTS, methodology));
  });

  it('has a fill for every band it can emit', () => {
    for (const { facts } of ALL_FIXTURES) {
      for (const bar of areaBarsModel(facts, methodology).bars) {
        expect(BAND_FILL[bar.band]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('tierGaugeModel', () => {
  it('emits one segment per rules.yaml tier, ascending, tiling 0-100 with no gap', () => {
    const model = tierGaugeModel(CAPACITY_FACTS, methodology);
    expect(model.bands.map((b) => b.id)).toEqual(['at_risk', 'strained', 'healthy_stretched', 'healthy_ready']);
    expect(model.bands[0]!.from).toBe(0);
    expect(model.bands[model.bands.length - 1]!.to).toBe(100);
    for (let i = 1; i < model.bands.length; i += 1) {
      expect(model.bands[i]!.from).toBe(model.bands[i - 1]!.to);
      expect(model.bands[i]!.x).toBeCloseTo(model.bands[i - 1]!.x + model.bands[i - 1]!.w, 5);
    }
  });

  it('places the marker at the overall capacity and labels it with the tier name', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = tierGaugeModel(facts, methodology);
      expect(model.marker.value, name).toBe(facts.overall.capacity);
      expect(model.marker.label, name).toBe(facts.overall.tier.name);
      expect(model.marker.x, name).toBeCloseTo((facts.overall.capacity / 100) * model.w, 5);
      expect(model.marker.x, name).toBeGreaterThanOrEqual(0);
      expect(model.marker.x, name).toBeLessThanOrEqual(model.w);
    }
  });

  it('clamps a marker for an out-of-range capacity rather than drawing off-canvas', () => {
    const over = makeFacts({ overall: { capacity: 140, throughput: 40, gap: 100, tier: { id: 'healthy_ready', name: 'Healthy & Ready' } } });
    const model = tierGaugeModel(over, methodology);
    expect(model.marker.x).toBe(model.w);
  });
});

describe('bottomItemsModel', () => {
  it('emits one bar per bottom item, in facts order (mean asc)', () => {
    const model = bottomItemsModel(CAPACITY_FACTS)!;
    expect(model.bars.map((b) => b.id)).toEqual(CAPACITY_FACTS.bottom_items.map((b) => b.item_id));
  });

  it('carries each item theme through, so the fill can make the pattern claim visible', () => {
    const model = bottomItemsModel(CAPACITY_FACTS)!;
    for (const bar of model.bars) {
      const source = CAPACITY_FACTS.bottom_items.find((b) => b.item_id === bar.id)!;
      expect(bar.theme).toBe(source.theme);
      expect(THEME_FILL[bar.theme]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('returns null when there are no bottom items — a chart of nothing is not a chart', () => {
    expect(bottomItemsModel(makeFacts({ bottom_items: [], pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 } }))).toBeNull();
  });

  it('never places a bar outside the viewBox, on any fixture', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const model = bottomItemsModel(facts);
      if (!model) continue;
      for (const bar of model.bars) {
        expect(bar.x, name).toBeGreaterThanOrEqual(0);
        expect(bar.x + bar.w, name).toBeLessThanOrEqual(model.w + 1e-9);
        expect(bar.y + bar.h, name).toBeLessThanOrEqual(model.h + 1e-9);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/charts.test.ts
```

Expected: FAIL — cannot resolve `@/lib/report/charts`.

- [ ] **Step 3: Write the module**

Create `lib/report/charts.ts`:

```ts
import type { Methodology, Theme } from '../methodology/schema';
import type { CategoryState } from '../engine/types';
import type { FactsPack } from './facts';
import { readingBand } from './view';

/**
 * Chart geometry, computed once, in a fixed unit space both surfaces share.
 *
 * ⚠️ PURE. No JSX, no `@react-pdf/renderer` import, no DOM. This module is imported by BOTH
 * renderers, and a react-pdf import here would pull the PDF engine into the client bundle of the
 * public share page.
 *
 * Why geometry lives here at all: AssembledSection is { id, source, ai, fallback } and carries no
 * facts, and lib/report/resolve.ts:55 states the invariant — "no renderer reads derived NUMBERS
 * from `facts`". Chart coordinates are derived numbers, so they are computed in the deterministic
 * layer and handed to renderers as data, exactly the way fallback.bullets already rides along.
 * Parity is then structural rather than a thing two files remember to do: a geometry bug is one
 * bug in one place, and tests/report/chart-parity.test.ts asserts both renderers consume the same
 * model object.
 *
 * Coordinates are unitless viewBox numbers. Each renderer sets its own on-page size; nothing here
 * knows about points, pixels, or page width.
 */

export type BandKey = 'severe' | 'broken' | 'watch' | 'holding';

/** One palette, both surfaces. Keyed to the CORRECTED band (lib/report/view.ts readingBand), so a
 *  53/100 area is not filled the same as a 95/100 one — the visual half of the same fix. */
export const BAND_FILL: Record<BandKey, string> = {
  severe: '#8C2F1F',
  broken: '#B4552F',
  watch: '#C08A2E',
  holding: '#4A6B4F',
};

/** Bottom-item bars are filled by THEME, not by band, so S7's computed "none of the six lowest
 *  indicators are theological" claim is visible as well as stated (spec §5, priority 3). */
export const THEME_FILL: Record<Theme, string> = {
  systems: '#3F5E78',
  culture: '#7A5A86',
  theology: '#8A6A3A',
  relational: '#4A6B4F',
};

export interface Tick { value: number; x: number }

export interface AreaBar {
  id: string; name: string; score: number; band: BandKey;
  x: number; y: number; w: number; h: number;
}
export interface AreaBarsModel {
  kind: 'area_bars';
  bars: AreaBar[];
  ticks: Tick[];
  /** Space reserved left of the plot for row labels. Renderers place label text within it. */
  labelWidth: number;
  w: number; h: number;
}

export interface TierBandSeg {
  id: string; name: string; from: number; to: number; x: number; w: number;
}
export interface TierGaugeModel {
  kind: 'tier_gauge';
  bands: TierBandSeg[];
  marker: { x: number; label: string; value: number };
  w: number; h: number;
}

export interface BottomItemBar {
  id: string; text: string; mean: number; theme: Theme;
  x: number; y: number; w: number; h: number;
}
export interface BottomItemsModel {
  kind: 'bottom_items';
  bars: BottomItemBar[];
  ticks: Tick[];
  labelWidth: number;
  w: number; h: number;
}

export type ChartModel = AreaBarsModel | TierGaugeModel | BottomItemsModel;

const CHART_W = 320;
const AREA_LABEL_W = 104;
const ITEM_LABEL_W = 150;
const ROW_H = 14;
const ROW_GAP = 6;
const GAUGE_H = 22;
const TICK_VALUES = [0, 25, 50, 75, 100] as const;
const SCALE_MAX = 100;

/** Score -> plot-space width. Clamped: a score outside 0-100 is a data bug, but a bar drawn
 *  off-canvas is a rendering bug on top of it, and only one of the two is worth shipping. */
function plotWidth(score: number, plotW: number): number {
  const clamped = Math.min(Math.max(score, 0), SCALE_MAX);
  return (clamped / SCALE_MAX) * plotW;
}

function ticksFor(labelWidth: number, plotW: number): Tick[] {
  return TICK_VALUES.map((value) => ({ value, x: labelWidth + (value / SCALE_MAX) * plotW }));
}

/**
 * Eight horizontal bars, one per area, in facts.categories order — which buildFacts already
 * sorted score desc with ties by id asc (facts.ts:164). Never re-sorted here: two assessments 90
 * days apart must be comparable, and one place owning the order is what makes that true.
 */
export function areaBarsModel(facts: FactsPack, methodology: Methodology): AreaBarsModel {
  const plotW = CHART_W - AREA_LABEL_W;
  const bars: AreaBar[] = facts.categories.map((c, i) => ({
    id: c.id,
    name: c.name,
    score: c.score,
    band: readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds),
    x: AREA_LABEL_W,
    y: i * (ROW_H + ROW_GAP),
    w: plotWidth(c.score, plotW),
    h: ROW_H,
  }));
  const h = facts.categories.length === 0 ? 0 : facts.categories.length * (ROW_H + ROW_GAP) - ROW_GAP;
  return { kind: 'area_bars', bars, ticks: ticksFor(AREA_LABEL_W, plotW), labelWidth: AREA_LABEL_W, w: CHART_W, h };
}

/**
 * The tier gauge: rules.yaml's four tier bands tiled across 0-100 with a marker at the overall
 * capacity. Segments are built ASCENDING by `min` (the reverse of tier.ts's descending lookup
 * order) because a gauge reads left to right, and each segment's `to` is the next band's `min`
 * so the four tile the axis with no gap and no overlap.
 */
export function tierGaugeModel(facts: FactsPack, methodology: Methodology): TierGaugeModel {
  const tiers = methodology.rules.tiers;
  const ascending = (Object.keys(tiers) as Array<keyof typeof tiers>)
    .map((id) => ({ id: String(id), name: tiers[id].name, min: tiers[id].min }))
    .sort((a, b) => a.min - b.min);

  const bands: TierBandSeg[] = ascending.map((band, i) => {
    const from = band.min;
    const to = i + 1 < ascending.length ? ascending[i + 1]!.min : SCALE_MAX;
    return {
      id: band.id,
      name: band.name,
      from,
      to,
      x: (from / SCALE_MAX) * CHART_W,
      w: ((to - from) / SCALE_MAX) * CHART_W,
    };
  });

  return {
    kind: 'tier_gauge',
    bands,
    marker: {
      x: plotWidth(facts.overall.capacity, CHART_W),
      label: facts.overall.tier.name,
      value: facts.overall.capacity,
    },
    w: CHART_W,
    h: GAUGE_H,
  };
}

/**
 * The bottom-N indicator bars, in facts.bottom_items order — buildFacts already sorted them mean
 * ascending with ties by item id ascending, capped at 6. Returns null on an empty list rather
 * than a zero-height model: a renderer branching on presence is clearer than one branching on
 * `bars.length === 0`, and there is no honest chart of no data.
 */
export function bottomItemsModel(facts: FactsPack): BottomItemsModel | null {
  if (facts.bottom_items.length === 0) return null;
  const plotW = CHART_W - ITEM_LABEL_W;
  const bars: BottomItemBar[] = facts.bottom_items.map((b, i) => ({
    id: b.item_id,
    text: b.text,
    mean: b.mean,
    theme: b.theme,
    x: ITEM_LABEL_W,
    y: i * (ROW_H + ROW_GAP),
    w: plotWidth(b.mean, plotW),
    h: ROW_H,
  }));
  const h = facts.bottom_items.length * (ROW_H + ROW_GAP) - ROW_GAP;
  return { kind: 'bottom_items', bars, ticks: ticksFor(ITEM_LABEL_W, plotW), labelWidth: ITEM_LABEL_W, w: CHART_W, h };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/report/charts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Prove the module stayed pure**

```bash
grep -nE "@react-pdf|from 'react'|document\.|window\." lib/report/charts.ts
```

Expected: **no output**. Any hit means the seam leaked a rendering concern into the geometry layer — fix it before committing.

- [ ] **Step 6: Full gate**

```bash
npm test && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add lib/report/charts.ts tests/report/charts.test.ts
git commit -m "feat(report): add pure chart geometry module shared by both surfaces"
```

---

## Task 5: Attach chart models to `AssembledSection`

Spec §1. Both assemblers compute the models alongside `fallbacks`, so the share page (which is permanently fallback-only via `assembleFallbackOnly`) gets charts too. Charts never read `section.source` — they are the one part of the report that cannot degrade.

> **Deviation from the spec, recorded deliberately:** the spec writes `chart: ChartModel | null`, but §3 requires s3 to carry **two** charts (the tier gauge and the area bars). The field is therefore `charts: ChartModel[]` — same seam, same attach point, accommodating a requirement the spec itself states. Empty array means no charts.

**Files:**
- Modify: `lib/report/compose.ts:85-134` (`AssembledSection`, `assembleFallbackOnly`, `assembleReport`)
- Test: `tests/report/compose.test.ts` (extend), `tests/report/assemble-fallback-only.test.ts` (extend)

**Interfaces:**
- Consumes: `areaBarsModel`, `tierGaugeModel`, `bottomItemsModel`, `ChartModel` (Task 4); the fixtures (Task 3).
- Produces:
  - `AssembledSection` gains `charts: ChartModel[]`.
  - `chartsForSection(id: SectionId, facts: FactsPack, methodology: Methodology): ChartModel[]`, exported from `lib/report/compose.ts` — s3 → `[tierGauge, areaBars]`, s7 → `[bottomItems]` (or `[]` when null), everything else → `[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/report/compose.test.ts`:

```ts
import { chartsForSection, assembleFallbackOnly, assembleReport } from '@/lib/report/compose';
import { loadMethodology } from '@/lib/methodology/load';
import { ALL_FIXTURES, CAPACITY_FACTS, makeFacts } from '../fixtures/facts';

describe('chart models on AssembledSection', () => {
  const methodology = loadMethodology();

  it('gives s3 the tier gauge then the area bars, in that order', () => {
    const charts = chartsForSection('s3', CAPACITY_FACTS, methodology);
    expect(charts.map((c) => c.kind)).toEqual(['tier_gauge', 'area_bars']);
  });

  it('gives s7 the bottom-items chart', () => {
    expect(chartsForSection('s7', CAPACITY_FACTS, methodology).map((c) => c.kind)).toEqual(['bottom_items']);
  });

  it('gives s7 no chart when there are no bottom items', () => {
    const empty = makeFacts({ bottom_items: [], pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 } });
    expect(chartsForSection('s7', empty, methodology)).toEqual([]);
  });

  it('gives every other section no charts', () => {
    for (const id of ['s1','s2','s4','s5','s6','s8','s9','s10','s11','s12','appendix'] as const) {
      expect(chartsForSection(id, CAPACITY_FACTS, methodology), id).toEqual([]);
    }
  });

  it('attaches charts on the fallback-only path too — the share page is permanently fallback', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const sections = assembleFallbackOnly({ facts, methodology, reflections: [] });
      const s3 = sections.find((s) => s.id === 's3')!;
      expect(s3.source, name).toBe('fallback');
      expect(s3.charts.map((c) => c.kind), name).toEqual(['tier_gauge', 'area_bars']);
    }
  });

  it('attaches identical charts whether the section is ai or fallback', () => {
    const viaAssemble = assembleReport({
      facts: CAPACITY_FACTS, methodology, reflections: [], persisted: null, liveInputsHash: 'x',
    });
    const viaFallbackOnly = assembleFallbackOnly({ facts: CAPACITY_FACTS, methodology, reflections: [] });
    for (const id of ['s3', 's7'] as const) {
      expect(viaAssemble.find((s) => s.id === id)!.charts)
        .toEqual(viaFallbackOnly.find((s) => s.id === id)!.charts);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/compose.test.ts -t "chart models on AssembledSection"
```

Expected: FAIL — `chartsForSection` is not exported; `s3.charts` is `undefined`.

- [ ] **Step 3: Implement**

`lib/report/compose.ts` — add the import at the top:

```ts
import { areaBarsModel, bottomItemsModel, tierGaugeModel, type ChartModel } from './charts';
```

Add above `assembleFallbackOnly`:

```ts
/**
 * Which charts a section carries. `charts`, not a single `chart`, because s3 needs two (the tier
 * gauge over the overall capacity, then the eight area bars). An empty array is the common case.
 *
 * Called by BOTH assemblers, so the public share page — permanently fallback-only by design —
 * gets the identical models the authenticated page does. Charts deliberately never read
 * `section.source`: they are the one part of the report that cannot degrade when the model is
 * unavailable, which is the whole reason s3 stayed out of AI_SECTION_IDS (spec §3).
 */
export function chartsForSection(
  id: SectionId,
  facts: FactsPack,
  methodology: Methodology,
): ChartModel[] {
  if (id === 's3') return [tierGaugeModel(facts, methodology), areaBarsModel(facts, methodology)];
  if (id === 's7') {
    const model = bottomItemsModel(facts);
    return model ? [model] : [];
  }
  return [];
}
```

Extend the interface at `:85-90`:

```ts
export interface AssembledSection {
  id: SectionId;
  source: SectionSource;
  ai: unknown | null;
  fallback: SectionBody;
  /** Derived chart geometry (lib/report/charts.ts). Usually empty. Never source-dependent. */
  charts: ChartModel[];
}
```

In `assembleFallbackOnly`, replace the mapped return (`:100-103`):

```ts
  return (Object.keys(args.methodology.report.sections) as SectionId[]).map((id) => {
    const fallback = fallbacks[id];
    const charts = chartsForSection(id, args.facts, args.methodology);
    return { id, source: 'fallback' as const, ai: null, fallback, charts };
  });
```

In `assembleReport`, replace the mapped body (`:122-133`):

```ts
  return (Object.keys(args.methodology.report.sections) as SectionId[]).map((id) => {
    const fallback = fallbacks[id];
    const charts = chartsForSection(id, args.facts, args.methodology);
    if (!(AI_SECTION_IDS as readonly string[]).includes(id)) return { id, source: 'fallback' as const, ai: null, fallback, charts };
    const raw = stored[id];
    if (raw === undefined) return { id, source: 'fallback' as const, ai: null, fallback, charts };
    // Re-validate. A reports row outlives the code that wrote it and `sections` is untyped
    // jsonb, so a shape mismatch is this section's fallback, never a crash.
    const check = SECTION_REGISTRY[id as AiSectionId].schema.safeParse(raw);
    return check.success
      ? { id, source: 'ai' as const, ai: check.data, fallback, charts }
      : { id, source: 'fallback' as const, ai: null, fallback, charts };
  });
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/report/compose.test.ts tests/report/assemble-fallback-only.test.ts
```

Expected: PASS. Any existing test constructing an `AssembledSection` literal now fails to typecheck on the missing `charts` — add `charts: []` to each.

- [ ] **Step 5: Full gate**

```bash
npm test && npm run typecheck
```

Expected: green. `tsc` is what finds every `AssembledSection` literal in tests and app code.

- [ ] **Step 6: Commit**

```bash
git add lib/report/compose.ts tests/report/compose.test.ts tests/report/assemble-fallback-only.test.ts
git commit -m "feat(report): attach chart models to every assembled section"
```

---

## Task 6: Render the charts on both surfaces

Spec §1/§3/§5. Two renderers, one model. The web one uses DOM `<svg>`; the PDF one uses `@react-pdf/renderer`'s `Svg` primitives (verified available at 4.5.1: `Svg, G, Rect, Line, Text, Path, Circle, Polygon, Defs, Tspan`).

**Files:**
- Create: `lib/report/pdf/charts.tsx`
- Create: `app/app/[churchId]/diagnosis/report/charts.tsx`
- Modify: `lib/report/pdf/document.tsx` (import + render in the section loop)
- Modify: `app/app/[churchId]/diagnosis/report/sections.tsx` (import + render in the section loop)
- Test: `tests/report/chart-parity.test.ts` (create)

**Interfaces:**
- Consumes: `ChartModel`, `BAND_FILL`, `THEME_FILL` (Task 4); `AssembledSection.charts` (Task 5).
- Produces:
  - `lib/report/pdf/charts.tsx` exports `PdfChart({ model }: { model: ChartModel })`.
  - `app/app/[churchId]/diagnosis/report/charts.tsx` exports `WebChart({ model }: { model: ChartModel })`.
  - Both handle all three `kind`s with an exhaustive `switch` whose default arm is `const _exhaustive: never = model`.

- [ ] **Step 1: Write the failing test**

Create `tests/report/chart-parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadMethodology } from '@/lib/methodology/load';
import { assembleFallbackOnly } from '@/lib/report/compose';
import { ALL_FIXTURES } from '../fixtures/facts';

const methodology = loadMethodology();
const PDF_CHARTS = 'lib/report/pdf/charts.tsx';
const WEB_CHARTS = 'app/app/[churchId]/diagnosis/report/charts.tsx';

describe('chart renderer parity', () => {
  it('both renderers consume the SAME model object — geometry is never recomputed per surface', () => {
    for (const src of [PDF_CHARTS, WEB_CHARTS]) {
      const text = readFileSync(src, 'utf8');
      // The whole point of the seam: a renderer that calls a model builder is computing its own
      // geometry, and the two surfaces can then silently disagree.
      expect(text, src).not.toMatch(/areaBarsModel\s*\(|tierGaugeModel\s*\(|bottomItemsModel\s*\(/);
      expect(text, src).toMatch(/BAND_FILL/);
    }
  });

  it('the PDF renderer uses react-pdf SVG primitives and the web one does not import react-pdf', () => {
    expect(readFileSync(PDF_CHARTS, 'utf8')).toMatch(/from '@react-pdf\/renderer'/);
    expect(readFileSync(WEB_CHARTS, 'utf8')).not.toMatch(/@react-pdf\/renderer/);
  });

  it('both renderers handle all three chart kinds', () => {
    for (const src of [PDF_CHARTS, WEB_CHARTS]) {
      const text = readFileSync(src, 'utf8');
      for (const kind of ['area_bars', 'tier_gauge', 'bottom_items']) {
        expect(text, `${src} / ${kind}`).toContain(`'${kind}'`);
      }
      expect(text, src).toContain('_exhaustive');
    }
  });

  it('every chart a section carries has a kind both renderers switch on', () => {
    const known = new Set(['area_bars', 'tier_gauge', 'bottom_items']);
    for (const { name, facts } of ALL_FIXTURES) {
      for (const section of assembleFallbackOnly({ facts, methodology, reflections: [] })) {
        for (const chart of section.charts) {
          expect(known.has(chart.kind), `${name}/${section.id}`).toBe(true);
        }
      }
    }
  });

  it('both section renderers render section.charts', () => {
    expect(readFileSync('lib/report/pdf/document.tsx', 'utf8')).toContain('section.charts');
    expect(readFileSync('app/app/[churchId]/diagnosis/report/sections.tsx', 'utf8')).toContain('section.charts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/chart-parity.test.ts
```

Expected: FAIL — neither chart file exists.

- [ ] **Step 3: Write the PDF renderer**

Create `lib/report/pdf/charts.tsx`:

```tsx
import { Svg, G, Rect, Line, Text as SvgText, Polygon } from '@react-pdf/renderer';
import { BAND_FILL, THEME_FILL, type ChartModel } from '../charts';

/**
 * The PDF half of the chart seam. Consumes a ChartModel computed in lib/report/charts.ts and
 * NEVER recomputes geometry — every x/y/w/h here comes off the model. Its web twin
 * (app/app/[churchId]/diagnosis/report/charts.tsx) draws the identical numbers with DOM <svg>,
 * which is what makes parity structural rather than a thing two files remember to do.
 */

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';
const LABEL_SIZE = 7;
const TICK_SIZE = 6;

function AreaBars({ model }: { model: Extract<ChartModel, { kind: 'area_bars' }> }) {
  return (
    <Svg viewBox={`0 0 ${model.w} ${model.h + 12}`} style={{ width: '100%', height: model.h + 12 }}>
      <G>
        {model.ticks.map((tick) => (
          <Line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
        ))}
        {model.bars.map((bar) => (
          <G key={bar.id}>
            <SvgText x={0} y={bar.y + bar.h - 3} fill={INK} style={{ fontSize: LABEL_SIZE }}>{bar.name}</SvgText>
            <Rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={BAND_FILL[bar.band]} />
            <SvgText x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} style={{ fontSize: LABEL_SIZE }}>
              {String(bar.score)}
            </SvgText>
          </G>
        ))}
        {model.ticks.map((tick) => (
          <SvgText key={tick.value} x={tick.x} y={model.h + 9} fill={INK_SOFT} style={{ fontSize: TICK_SIZE }}>
            {String(tick.value)}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

function TierGauge({ model }: { model: Extract<ChartModel, { kind: 'tier_gauge' }> }) {
  const markerY = model.h;
  return (
    <Svg viewBox={`0 0 ${model.w} ${model.h + 16}`} style={{ width: '100%', height: model.h + 16 }}>
      <G>
        {model.bands.map((band, i) => (
          <G key={band.id}>
            <Rect x={band.x} y={0} width={band.w} height={model.h} fill={i % 2 === 0 ? '#EFEDE7' : '#E3E0D8'} />
            <SvgText x={band.x + 2} y={model.h - 6} fill={INK_SOFT} style={{ fontSize: TICK_SIZE }}>{band.name}</SvgText>
          </G>
        ))}
        <Polygon
          points={`${model.marker.x - 4},${markerY + 8} ${model.marker.x + 4},${markerY + 8} ${model.marker.x},${markerY}`}
          fill={INK}
        />
        <SvgText x={Math.min(model.marker.x + 6, model.w - 40)} y={markerY + 14} fill={INK} style={{ fontSize: LABEL_SIZE }}>
          {`${model.marker.value} · ${model.marker.label}`}
        </SvgText>
      </G>
    </Svg>
  );
}

function BottomItems({ model }: { model: Extract<ChartModel, { kind: 'bottom_items' }> }) {
  return (
    <Svg viewBox={`0 0 ${model.w} ${model.h + 12}`} style={{ width: '100%', height: model.h + 12 }}>
      <G>
        {model.ticks.map((tick) => (
          <Line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
        ))}
        {model.bars.map((bar) => (
          <G key={bar.id}>
            <SvgText x={0} y={bar.y + bar.h - 3} fill={INK} style={{ fontSize: TICK_SIZE }}>{bar.id}</SvgText>
            <Rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={THEME_FILL[bar.theme]} />
            <SvgText x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} style={{ fontSize: TICK_SIZE }}>
              {`${bar.mean} · ${bar.theme}`}
            </SvgText>
          </G>
        ))}
      </G>
    </Svg>
  );
}

export function PdfChart({ model }: { model: ChartModel }) {
  switch (model.kind) {
    case 'area_bars':
      return <AreaBars model={model} />;
    case 'tier_gauge':
      return <TierGauge model={model} />;
    case 'bottom_items':
      return <BottomItems model={model} />;
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 4: Write the web renderer**

Create `app/app/[churchId]/diagnosis/report/charts.tsx`:

```tsx
import { BAND_FILL, THEME_FILL, type ChartModel } from '@/lib/report/charts'

/**
 * The web half of the chart seam. Consumes the SAME ChartModel the PDF renderer does
 * (lib/report/pdf/charts.tsx) and NEVER recomputes geometry — every x/y/w/h comes off the model.
 * Different primitives, identical numbers.
 *
 * Charts render on the public share page too: assembleFallbackOnly attaches the same models, and
 * chartsForSection never reads section.source. The share page is permanently fallback-only, so
 * the charts are the one part of it that is not a degraded view of the real report.
 */

const INK = '#1A1A18'
const INK_SOFT = '#5A5A54'
const RULE = '#D8D5CE'

function AreaBars({ model }: { model: Extract<ChartModel, { kind: 'area_bars' }> }) {
  return (
    <svg viewBox={`0 0 ${model.w} ${model.h + 12}`} className="w-full h-auto" role="img"
         aria-label="Area scores out of 100, highest first">
      {model.ticks.map((tick) => (
        <line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
      ))}
      {model.bars.map((bar) => (
        <g key={bar.id}>
          <text x={0} y={bar.y + bar.h - 3} fill={INK} fontSize={7}>{bar.name}</text>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={BAND_FILL[bar.band]} />
          <text x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} fontSize={7}>{bar.score}</text>
        </g>
      ))}
      {model.ticks.map((tick) => (
        <text key={tick.value} x={tick.x} y={model.h + 9} fill={INK_SOFT} fontSize={6}>{tick.value}</text>
      ))}
    </svg>
  )
}

function TierGauge({ model }: { model: Extract<ChartModel, { kind: 'tier_gauge' }> }) {
  const markerY = model.h
  return (
    <svg viewBox={`0 0 ${model.w} ${model.h + 16}`} className="w-full h-auto" role="img"
         aria-label={`Overall ${model.marker.value} out of 100 — ${model.marker.label}`}>
      {model.bands.map((band, i) => (
        <g key={band.id}>
          <rect x={band.x} y={0} width={band.w} height={model.h} fill={i % 2 === 0 ? '#EFEDE7' : '#E3E0D8'} />
          <text x={band.x + 2} y={model.h - 6} fill={INK_SOFT} fontSize={6}>{band.name}</text>
        </g>
      ))}
      <polygon
        points={`${model.marker.x - 4},${markerY + 8} ${model.marker.x + 4},${markerY + 8} ${model.marker.x},${markerY}`}
        fill={INK}
      />
      <text x={Math.min(model.marker.x + 6, model.w - 40)} y={markerY + 14} fill={INK} fontSize={7}>
        {`${model.marker.value} · ${model.marker.label}`}
      </text>
    </svg>
  )
}

function BottomItems({ model }: { model: Extract<ChartModel, { kind: 'bottom_items' }> }) {
  return (
    <svg viewBox={`0 0 ${model.w} ${model.h + 12}`} className="w-full h-auto" role="img"
         aria-label="Lowest scoring indicators, coloured by theme">
      {model.ticks.map((tick) => (
        <line key={tick.value} x1={tick.x} y1={0} x2={tick.x} y2={model.h} strokeWidth={0.5} stroke={RULE} />
      ))}
      {model.bars.map((bar) => (
        <g key={bar.id}>
          <text x={0} y={bar.y + bar.h - 3} fill={INK} fontSize={6}>{bar.id}</text>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={THEME_FILL[bar.theme]} />
          <text x={bar.x + bar.w + 4} y={bar.y + bar.h - 3} fill={INK_SOFT} fontSize={6}>
            {`${bar.mean} · ${bar.theme}`}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function WebChart({ model }: { model: ChartModel }) {
  switch (model.kind) {
    case 'area_bars':
      return <AreaBars model={model} />
    case 'tier_gauge':
      return <TierGauge model={model} />
    case 'bottom_items':
      return <BottomItems model={model} />
    default: {
      const _exhaustive: never = model
      return _exhaustive
    }
  }
}
```

- [ ] **Step 5: Wire both section loops**

`lib/report/pdf/document.tsx` — add to the imports after line 7:

```tsx
import { PdfChart } from './charts';
```

Add a style to the `StyleSheet.create` block:

```ts
  chart: { marginTop: 6, marginBottom: 6 },
```

Then, in the `sections.map` at `:242-248`, render the charts between the heading and the content:

```tsx
        {sections.map((section, index) => (
          <View key={section.id} style={s.section}>
            <Text style={index === 0 ? s.h1 : s.h2}>{section.fallback.title}</Text>
            {section.charts.map((chart) => (
              <View key={chart.kind} style={s.chart}>
                <PdfChart model={chart} />
              </View>
            ))}
            <SectionContent section={section} />
            {stale && section.id === 'appendix' && <Text style={s.caveat}>{STALE_CAVEAT}</Text>}
          </View>
        ))}
```

`app/app/[churchId]/diagnosis/report/sections.tsx` — add to the imports:

```tsx
import { WebChart } from './charts'
```

Then, in the `sections.map` at `:207-216`:

```tsx
      {sections.map((section, index) => (
        <section key={section.id} className="flex flex-col gap-8 max-w-2xl">
          {index === 0 ? (
            <h1 className="font-display text-ink">{section.fallback.title}</h1>
          ) : (
            <h2 className="font-display text-ink">{section.fallback.title}</h2>
          )}
          {section.charts.map((chart) => (
            <WebChart key={chart.kind} model={chart} />
          ))}
          <SectionContent section={section} />
        </section>
      ))}
```

> ⚠️ Do **not** convert the `index === 0 ? <h1> : <h2>` branches into a dynamic tag. `tests/a11y/shared-report-heading.test.ts` counts literal `<h1` in this file's source text.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/report/chart-parity.test.ts tests/report/pdf-document.test.ts tests/report/pdf-sections.test.ts tests/report/components.test.ts tests/a11y
```

Expected: PASS.

- [ ] **Step 7: Prove the PDF actually renders with SVG in it**

```bash
npx vitest run tests/report/pdf-document.test.ts
```

If no existing test renders the document to a buffer, add one to `tests/report/pdf-document.test.ts` that renders `<ReportDocument>` over `assembleFallbackOnly(CAPACITY_FACTS…)` and asserts the resulting buffer is non-empty. A geometry model that typechecks but crashes `@react-pdf/renderer` at draw time is the exact failure this catches.

- [ ] **Step 8: Full gate**

```bash
npm test && npm run typecheck && npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add lib/report/pdf/charts.tsx lib/report/pdf/document.tsx "app/app/[churchId]/diagnosis/report/charts.tsx" "app/app/[churchId]/diagnosis/report/sections.tsx" tests/report/chart-parity.test.ts tests/report/pdf-document.test.ts
git commit -m "feat(report): render shared chart models on both surfaces"
```

> The two bracketed paths **must** be quoted. If git still misreads them, prefix the command with `GIT_LITERAL_PATHSPECS=1`.

---

## Task 7: s3 Executive Health Dashboard — slim the bullets, add the XPG read

Spec §3. s3 is **not** in `AI_SECTION_IDS`, so this is pure deterministic work. The chart now carries the eight scores; the eight `Name: score — bandRead` bullets are redundant beside it.

**Files:**
- Modify: `methodology/copy.yaml` (new `xpg_read` block). **No `version:` change.**
- Modify: `lib/methodology/schema.ts` (`XpgReadSchema`, `CopySchema.xpg_read`)
- Modify: `lib/report/fallback-sections.ts` (`bulletsFor` case `'s3'`)
- Test: `tests/report/fallback-sections.test.ts` (extend), `tests/methodology/copy-yaml.test.ts` or the nearest existing methodology test

**Interfaces:**
- Consumes: `readingBand` (Task 1); `facts.overall.tier.id`, `facts.archetype`.
- Produces: `copy.xpg_read[archetype][tierId]` — a `Record<Archetype, Record<TierId, string>>` in YAML, validated by `XpgReadSchema`. Consumed only by `bulletsFor`'s `'s3'` case.

- [ ] **Step 1: Write the failing test**

Append to `tests/report/fallback-sections.test.ts`:

```ts
import { ALL_FIXTURES, CAPACITY_FACTS } from '../fixtures/facts';

describe('s3 executive dashboard', () => {
  it('emits exactly one bullet — the XPG read — with the chart carrying the scores', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const s3 = fallbackSection('s3', { facts, methodology, reflections: [] });
      expect(s3.bullets, name).toHaveLength(1);
      expect(s3.bullets[0]!.length, name).toBeGreaterThan(0);
    }
  });

  it('reads the XPG line off archetype x tier, not off a single flat string', () => {
    const seen = new Set(
      ALL_FIXTURES.map(({ facts }) => fallbackSection('s3', { facts, methodology, reflections: [] }).bullets[0]!),
    );
    // The fixtures span 3 archetypes and >=2 tiers, so a hardcoded line would collapse to one.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('matches copy.yaml exactly for a known archetype/tier pair', () => {
    const s3 = fallbackSection('s3', { facts: CAPACITY_FACTS, methodology, reflections: [] });
    expect(s3.bullets[0]).toBe(
      methodology.copy.xpg_read[CAPACITY_FACTS.archetype][CAPACITY_FACTS.overall.tier.id],
    );
  });

  it('no longer repeats the eight per-area score lines the chart now shows', () => {
    const s3 = fallbackSection('s3', { facts: CAPACITY_FACTS, methodology, reflections: [] });
    for (const c of CAPACITY_FACTS.categories) {
      expect(s3.bullets.join(' ')).not.toContain(`${c.name}: ${c.score} out of 100`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/fallback-sections.test.ts -t "s3 executive dashboard"
```

Expected: FAIL — s3 currently returns 8 bullets and `methodology.copy.xpg_read` is undefined.

- [ ] **Step 3: Add the copy**

Append to `methodology/copy.yaml` (top level). **Do not touch `version:`.**

```yaml
# One deterministic XPG read per archetype x tier, for S3's Executive Health Dashboard.
# S3 is not an AI section and never will be — the dashboard is the numbers layer, and it must
# not degrade to prose when the model is unavailable (spec §3). Tier ids are rules.yaml's
# `tiers` keys; archetypes are lib/report/tier.ts's Archetype union.
xpg_read:
  capacity:
    healthy_ready: "Nothing in the chain is broken and the numbers are strong across the board. The question in front of you is not what to repair — it is what to build next."
    healthy_stretched: "Nothing in the chain is broken, but the whole system is running near its limit. Adding load before adding capacity is how a healthy church becomes a strained one."
    strained: "No single stage is broken, but nothing is comfortable either. This is a whole-system capacity conversation, not a repair one — spread thin is its own diagnosis."
    at_risk: "No single stage has failed, yet every one of them is running low at once. Treat this as a capacity floor, not a list of separate problems."
  constraint:
    healthy_ready: "One stage is holding the rest back while everything around it is strong. Fixing it is the highest-leverage move available to you this year."
    healthy_stretched: "One stage is broken inside an otherwise healthy system. Everything downstream of it is running on what little gets through — that is where the ceiling is."
    strained: "One stage is broken and the system around it has no slack to absorb it. Fix the constraint before anything downstream of it gets attention or budget."
    at_risk: "A broken stage sits inside a system that is already low everywhere. Work the constraint first — spreading effort evenly now would improve nothing measurably."
  foundation:
    healthy_ready: "No stage is broken, but an enabler is capping what the strong parts can reach. The ground has to hold before the building goes higher."
    healthy_stretched: "Your stages hold; the enablers underneath them do not. Every area leaning on those enablers is capped at their level, whatever its own score says."
    strained: "Nothing is broken outright, but the enablers underneath everything are the ceiling. Work the ground before the stages — they cannot rise above it."
    at_risk: "The enablers holding up every other area are the binding limit. Any stage-level gain now is temporary until the ground beneath it changes."
```

- [ ] **Step 4: Add the schema**

`lib/methodology/schema.ts` — add above `CopySchema`:

```ts
// Named keys, not z.record — the same rationale as DossierReadingBandSchema above. The four tier
// ids (rules.yaml `tiers`) and the three archetypes (lib/report/tier.ts) are both closed sets,
// and lib/report/fallback-sections.ts indexes them directly, so a z.record would load with any
// subset and let a missing pair surface as `undefined` in a rendered dashboard bullet.
const XpgReadTiersSchema = z.object({
  healthy_ready: z.string().min(1),
  healthy_stretched: z.string().min(1),
  strained: z.string().min(1),
  at_risk: z.string().min(1),
});

export const XpgReadSchema = z.object({
  capacity: XpgReadTiersSchema,
  constraint: XpgReadTiersSchema,
  foundation: XpgReadTiersSchema,
});
```

Add to `CopySchema` (after `dependency_reads`):

```ts
  xpg_read: XpgReadSchema,
```

Add the type export beside the others:

```ts
export type XpgRead = z.infer<typeof XpgReadSchema>;
```

- [ ] **Step 5: Slim the s3 bullets**

`lib/report/fallback-sections.ts` — replace the `'s3'` case at `:273-274`:

```ts
    case 's3':
      // ONE bullet, not eight. The eight `Name: score — bandRead` lines this used to emit are
      // now the areaBarsModel chart (lib/report/charts.ts) on both surfaces, with the bar fill
      // keyed to the same corrected readingBand — printing them again beside the chart is the
      // same data twice. What the chart cannot say is what the shape MEANS, which is this line.
      return [methodology.copy.xpg_read[facts.archetype][facts.overall.tier.id]];
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/report/fallback-sections.test.ts tests/methodology
```

Expected: PASS. Existing s3 tests asserting eight bullets now fail — update them to the one-bullet contract, with a comment naming this task. Do not delete a test to make it pass.

- [ ] **Step 7: Full gate**

```bash
npm test && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add methodology/copy.yaml lib/methodology/schema.ts lib/report/fallback-sections.ts tests/report/fallback-sections.test.ts
git commit -m "feat(report): s3 dashboard — chart carries the scores, copy carries the read"
```

---

## Task 8: The three missing s6 beats — deterministic side

Spec §4. The blueprint's micro-template is affirm → pivot → evidence → not-statement → reframe → trajectory. Only affirm / evidence / reframe have sources today; `fallback-sections.ts:84-96` documents the other three as structurally absent. This closes that — the genuine new work of this pass.

**Rule carried forward, non-negotiable:** an absent input **drops its beat**. Never emit an empty sentence, never throw on an undefined lookup. `s6Bullet` must be non-empty in every case (affirm always resolves).

**Files:**
- Modify: `methodology/copy.yaml` (new `beats` block). **No `version:` change.**
- Modify: `lib/methodology/schema.ts` (`BeatsSchema`, `CopySchema.beats`)
- Modify: `lib/report/fallback-sections.ts` (three new beat functions + `s6Bullet`)
- Test: `tests/report/s6-beats.test.ts` (create)

**Interfaces:**
- Consumes: `readingBand` (Task 1); the fixtures (Task 3).
- Produces, all private to `lib/report/fallback-sections.ts`:
  - `pivotBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null`
  - `notStatementBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null`
  - `trajectoryBeat(facts: FactsPack, methodology: Methodology): string | null`
  - `s6Bullet` unchanged in signature; its beat list grows to six in order.
- New copy contract: `copy.beats.pivot[band]`, `copy.beats.not_statement[theme]`, `copy.beats.trajectory[value]`.

- [ ] **Step 1: Write the failing test**

Create `tests/report/s6-beats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSection } from '@/lib/report/fallback-sections';
import { ALL_FIXTURES, CAPACITY_FACTS, HIGH_DISPERSION_FACTS, makeFacts } from '../fixtures/facts';

const methodology = loadMethodology();
const s6 = (facts = CAPACITY_FACTS) => fallbackSection('s6', { facts, methodology, reflections: [] }).bullets;

describe('s6 six-beat bullet', () => {
  it('is never empty on any fixture — affirm always resolves', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      const bullets = fallbackSection('s6', { facts, methodology, reflections: [] }).bullets;
      expect(bullets.length, name).toBe(facts.categories.slice(3).length);
      for (const bullet of bullets) expect(bullet.trim().length, name).toBeGreaterThan(0);
    }
  });

  it('never emits a double space, a leading space, or a dangling separator', () => {
    for (const { name, facts } of ALL_FIXTURES) {
      for (const bullet of fallbackSection('s6', { facts, methodology, reflections: [] }).bullets) {
        expect(bullet, name).not.toMatch(/ {2}/);
        expect(bullet, name).toBe(bullet.trim());
      }
    }
  });

  it('emits the pivot beat, keyed by the area band', () => {
    const bullets = s6(HIGH_DISPERSION_FACTS);
    const pivots = Object.values(methodology.copy.beats.pivot);
    expect(bullets.some((b) => pivots.some((p) => b.includes(p.split('{')[0]!.trim())))).toBe(true);
  });

  it('emits the trajectory beat when growth_trajectory is set', () => {
    const line = methodology.copy.beats.trajectory['growing_steadily']!;
    expect(s6().some((b) => b.includes(line))).toBe(true);
  });

  it('DROPS the trajectory beat when growth_trajectory is absent — never an empty sentence', () => {
    const noTrajectory = makeFacts({ profile: { context: 'suburban', attendance_band: '250-499' } });
    const withTrajectory = s6();
    const without = s6(noTrajectory);
    for (const line of Object.values(methodology.copy.beats.trajectory)) {
      expect(without.join(' ')).not.toContain(line);
    }
    expect(without.join(' ').length).toBeLessThan(withTrajectory.join(' ').length);
    for (const bullet of without) expect(bullet.trim().length).toBeGreaterThan(0);
  });

  it('does not throw on an unknown trajectory value — it drops the beat', () => {
    const weird = makeFacts({ profile: { growth_trajectory: 'not_a_real_option' } });
    expect(() => s6(weird)).not.toThrow();
    for (const bullet of s6(weird)) expect(bullet.trim().length).toBeGreaterThan(0);
  });

  it('emits the not-statement beat keyed to this area’s dominant bottom-item theme', () => {
    // CAPACITY_FACTS gives sys two bottom items, both `systems`.
    const sysBullet = s6().find((b) => b.includes('Systems'));
    expect(sysBullet).toBeDefined();
    expect(sysBullet!).toContain(methodology.copy.beats.not_statement.systems);
  });

  it('DROPS the not-statement beat for an area with no bottom items', () => {
    const noItems = makeFacts({ bottom_items: [], pattern_counts: { systems: 0, culture: 0, theology: 0, relational: 0 } });
    for (const line of Object.values(methodology.copy.beats.not_statement)) {
      expect(s6(noItems).join(' ')).not.toContain(line);
    }
  });

  it('orders the beats affirm -> pivot -> evidence -> not_statement -> reframe -> trajectory', () => {
    // vol carries a dispersion flag AND a bottom item in HIGH_DISPERSION_FACTS, so all six fire.
    const bullet = fallbackSection('s6', { facts: HIGH_DISPERSION_FACTS, methodology, reflections: [] })
      .bullets.find((b) => b.includes('Volunteer'))!;
    const affirmIdx = bullet.indexOf(methodology.copy.dossier.reading.stage.watch.slice(0, 20));
    const trajectoryIdx = bullet.indexOf(methodology.copy.beats.trajectory['growing_steadily']!);
    expect(affirmIdx).toBeGreaterThanOrEqual(0);
    expect(trajectoryIdx).toBeGreaterThan(affirmIdx);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/s6-beats.test.ts
```

Expected: FAIL — `methodology.copy.beats` is undefined.

- [ ] **Step 3: Add the copy**

Append to `methodology/copy.yaml` (top level). **Do not touch `version:`.**

```yaml
# The three s6 micro-template beats that had no data source until now (spec §4). The full beat
# order is affirm -> pivot -> evidence -> not_statement -> reframe -> trajectory; affirm /
# evidence / reframe already read from dossier.reading, blocks.blind_spot and inserts.dispersion.
#
# An absent input DROPS its beat. Never write a line here that only makes sense when some other
# beat is also present.
beats:
  # Keyed by the same reading band as dossier.reading. {rank} is this area's position among the
  # eight (1 = highest score); {delta} is how many points it sits below the mean of the top three,
  # always a non-negative integer (the top three themselves emit no pivot beat).
  pivot:
    severe: "It ranks {rank} of eight and sits {delta} points below your strongest three — this is not a gap to close, it is a floor to build."
    broken: "It ranks {rank} of eight, {delta} points below your strongest three, and that distance is the finding."
    watch: "It ranks {rank} of eight, {delta} points behind your strongest three — close enough to look fine, far enough to matter."
    holding: "It ranks {rank} of eight and trails your strongest three by {delta} points, which is a difference in degree, not in kind."
  # Keyed by the dominant theme among THIS area's lowest-scoring indicators. Says what the
  # weakness is not, so a leader does not reach for the wrong instrument.
  not_statement:
    systems: "What is weak here is process, not conviction — nobody needs persuading, something needs writing down."
    culture: "What is weak here is habit, not capability — the people can do this; it is not yet what they do."
    theology: "What is weak here is understanding, not effort — people are working hard without a clear reason why."
    relational: "What is weak here is connection, not competence — the work happens, it just does not happen between people."
  # Keyed by the church's growth_trajectory profile value (settings-form.tsx GROWTH_OPTIONS).
  # An unset or unrecognised value drops the beat entirely.
  trajectory:
    declining: "Against a declining trajectory, this is the area where decline shows up first."
    plateaued: "Against a flat trajectory, this is one of the places the plateau is being held in place."
    growing_steadily: "Against steady growth, this is the area that growth will find first."
    growing_rapidly: "Against rapid growth, this is the area most likely to be overrun before it is ready."
```

- [ ] **Step 4: Add the schema**

`lib/methodology/schema.ts` — add above `CopySchema`:

```ts
// pivot: named keys (the closed ReadingBand set), same rationale as DossierReadingBandSchema.
// not_statement: named keys (the closed Theme set), same rationale.
// trajectory: z.record ON PURPOSE — its keys are the churches.growth_trajectory column's
// vocabulary, which lives in a migration CHECK and settings-form.tsx, not here. Naming them
// would be a third place to keep in sync, and an unrecognised value must DROP the beat at
// render time (spec §4's "an absent input drops its beat"), never fail methodology load for
// every church at once.
const BeatsSchema = z.object({
  pivot: DossierReadingBandSchema,
  not_statement: z.object({
    systems: z.string().min(1),
    culture: z.string().min(1),
    theology: z.string().min(1),
    relational: z.string().min(1),
  }),
  trajectory: z.record(z.string().min(1)),
});
```

Add to `CopySchema` (after `xpg_read`):

```ts
  beats: BeatsSchema,
```

- [ ] **Step 5: Implement the three beats**

`lib/report/fallback-sections.ts` — add these three functions immediately after `reframeBeat` (`:82`):

```ts
/**
 * S6's "pivot" beat: where this area sits relative to the church's own top three.
 *
 * facts.categories is already sorted score desc (ties by id asc, buildFacts:164), so rank is
 * just the index + 1 and the top three are slice(0, 3) — the SAME three s5 renders as strengths.
 * Returns null for those three: an area cannot pivot against a group it belongs to, and "0 points
 * behind your strongest three" is the empty sentence this beat design forbids.
 */
function pivotBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const rank = facts.categories.findIndex((cc) => cc.id === c.id) + 1;
  if (rank <= 3) return null;
  const topThree = facts.categories.slice(0, 3);
  if (topThree.length === 0) return null;
  const topMean = topThree.reduce((sum, cc) => sum + cc.score, 0) / topThree.length;
  const delta = Math.round(topMean - c.score);
  if (delta <= 0) return null;
  const band = readingBand(c.state as CategoryState, c.score, methodology.rules.thresholds);
  return interp(methodology.copy.beats.pivot[band], { rank: String(rank), delta: String(delta) });
}

/**
 * S6's "not-statement" beat: what this area's weakness is NOT, keyed by the dominant theme among
 * its own lowest-scoring indicators (facts.bottom_items, already the global bottom 6). An area
 * with none of them in the bottom 6 has no measured evidence of what its weakness is made of, so
 * the beat drops rather than guessing.
 *
 * Ties break by theme name ascending — deterministic, never localeCompare, because two runs of
 * the same report must produce byte-identical prose.
 */
function notStatementBeat(c: CategoryFact, facts: FactsPack, methodology: Methodology): string | null {
  const mine = facts.bottom_items.filter((b) => b.category_id === c.id);
  if (mine.length === 0) return null;
  const counts = new Map<Theme, number>();
  for (const b of mine) counts.set(b.theme, (counts.get(b.theme) ?? 0) + 1);
  const dominant = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )[0]![0];
  return methodology.copy.beats.not_statement[dominant] ?? null;
}

/**
 * S6's "trajectory" beat: the area read against where the church as a whole is heading.
 *
 * facts.profile carries NON-NULL fields only (facts.ts:173-190), so an unset growth_trajectory is
 * simply absent from the record — and an unrecognised value (an older row, a vocabulary change in
 * the migration CHECK) resolves to undefined in the z.record lookup. Both drop the beat. Neither
 * throws, and neither emits a sentence about a trajectory nobody stated.
 */
function trajectoryBeat(facts: FactsPack, methodology: Methodology): string | null {
  const trajectory = facts.profile.growth_trajectory;
  if (!trajectory) return null;
  return methodology.copy.beats.trajectory[trajectory] ?? null;
}
```

Add `Theme` and `CategoryState` to the existing imports at the top of the file:

```ts
import type { CategoryState } from '../engine/types';
import type { Methodology, Offer, SectionId, Theme } from '../methodology/schema';
```

Then replace `s6Bullet` (`:84-96`) — doc comment and all:

```ts
/**
 * S6's per-area bullet: the full six-beat micro-template, joined by a space, in blueprint order —
 * affirm -> pivot -> evidence -> not_statement -> reframe -> trajectory.
 *
 * pivot, not_statement and trajectory were previously omitted as "structurally absent": they had
 * no lookup anywhere in the facts pack or copy.yaml. They now do (copy.beats.*, plus
 * facts.categories ranking, facts.bottom_items themes and facts.profile.growth_trajectory
 * respectively), so all six are live.
 *
 * The original rule is unchanged and load-bearing: AN ABSENT INPUT DROPS ITS BEAT. Every beat
 * function returns string | null, the filter below removes the nulls, and no beat ever emits an
 * empty sentence or throws on an undefined lookup. affirm always resolves (readingBand never
 * fails to produce a band), so this bullet is never empty — the invariant s6's renderers and
 * gate 1's blank check both rely on.
 */
function s6Bullet(c: CategoryFact, facts: FactsPack, methodology: Methodology): string {
  const beats = [
    bandRead(c, methodology),
    pivotBeat(c, facts, methodology),
    evidenceBeat(c, facts, methodology),
    notStatementBeat(c, facts, methodology),
    reframeBeat(c, facts, methodology),
    trajectoryBeat(facts, methodology),
  ];
  return beats.filter((b): b is string => !!b).join(' ');
}
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/report/s6-beats.test.ts tests/report/fallback-sections.test.ts
```

Expected: PASS. Existing s6 tests asserting the three-beat string will fail — update them to the six-beat contract with a comment naming this task.

- [ ] **Step 7: Confirm no `report.yaml` change was needed**

```bash
git diff --stat methodology/report.yaml
```

Expected: **empty output**. If `report.yaml` changed, revert it and **STOP AND ESCALATE** per the global constraint — do not bump `version:` to get unblocked.

- [ ] **Step 8: Full gate**

```bash
npm test && npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add methodology/copy.yaml lib/methodology/schema.ts lib/report/fallback-sections.ts tests/report/s6-beats.test.ts tests/report/fallback-sections.test.ts
git commit -m "feat(report): give s6 its three missing beats (pivot, not-statement, trajectory)"
```

---

## Task 9: The three missing s6 beats — AI side

Spec §4. Extend `S6Schema` from three fields to six, and confirm the gate constrains the new ones the same way it constrains the old.

⚠️ `sections.ts`'s existing comment warns that listing a beat with no data source **compels the model to invent text** that then counts against `length_ceiling`, numeric containment and banned phrases. Task 8 gave all three a data source, so that warning is now satisfied — but the comment must be rewritten, not deleted, so the reasoning survives.

⚠️ `eslint.config.mjs:12` globally ignores `lib/ai/**`. Lint proves nothing here. `tsc` and vitest are the gates.

**Files:**
- Modify: `lib/ai/sections.ts:30-42` (`S6Schema` + its comment), `:94` (the s6 registry slice)
- Modify: `lib/report/pdf/document.tsx:120-134` (`S6View`)
- Modify: `app/app/[churchId]/diagnosis/report/sections.tsx:80-94` (`S6View`)
- Test: `tests/ai/section-gates.test.ts` (extend — use the nearest existing gate test file), `tests/report/pdf-sections.test.ts` / `tests/report/components.test.ts`

**Interfaces:**
- Consumes: the fixtures (Task 3); the six-beat order (Task 8).
- Produces: `S6Schema` = `{ areas: Array<{ category_id, affirm, pivot, evidence, not_statement, reframe, trajectory }> }`, every field `z.string()` (required, non-nullable, per this file's strict-structured-output discipline).

- [ ] **Step 1: Write the failing test**

Append to the s6 gate test file (`tests/ai/section-gates.test.ts`, or the nearest existing one — find it with `grep -rln "gateSection" tests/`):

```ts
import { S6Schema } from '@/lib/ai/sections';
import { gateSection } from '@/lib/ai/section-gates';
import { loadMethodology } from '@/lib/methodology/load';
import { CAPACITY_FACTS } from '../fixtures/facts';

describe('S6Schema carries all six beats', () => {
  const methodology = loadMethodology();
  const ctx = { facts: CAPACITY_FACTS, methodology, labels: [] as readonly string[] };
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
    expect(gateSection('s6', full(), ctx)).toBeNull();
  });

  it('gate 1 rejects a blank in ANY of the three new fields, not just the old three', () => {
    for (const field of ['pivot', 'not_statement', 'trajectory']) {
      const payload = { areas: slice.map((c) => area({ category_id: c.id, [field]: '   ' })) };
      expect(gateSection('s6', payload, ctx), field).toBe('field parity');
    }
  });

  it('gate 2 rejects an invented number in a new field, same as in an old one', () => {
    const payload = { areas: slice.map((c) => area({ category_id: c.id, pivot: 'It sits 9999 points behind.' })) };
    expect(gateSection('s6', payload, ctx)).toBe('numeric containment');
  });

  it('gate 4 rejects a respondent label in a new field', () => {
    const payload = { areas: slice.map((c) => area({ category_id: c.id, trajectory: 'Dana said growth is fine.' })) };
    expect(gateSection('s6', payload, { ...ctx, labels: ['Dana'] })).toBe('anonymity');
  });

  it('gate 1b still requires full slice coverage with the wider schema', () => {
    const partial = { areas: [area({ category_id: slice[0]!.id })] };
    expect(gateSection('s6', partial, ctx)).toBe('category coverage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ai/section-gates.test.ts -t "S6Schema carries all six beats"
```

Expected: FAIL — `S6Schema` accepts the three-field object and rejects nothing about the new fields.

- [ ] **Step 3: Widen `S6Schema`**

`lib/ai/sections.ts` — replace lines 30-42 (comment and schema together):

```ts
// SIX beats, as report.yaml's s6 prose always described. This was three for as long as pivot,
// not_statement and trajectory had no data source anywhere in the facts pack or copy.yaml:
// every field here is required and non-nullable under zodTextFormat's strict structured outputs
// and gate 1 rejects any blank among them, so listing a sourceless beat COMPELS the model to
// invent text for it — text that then counts against length_ceiling, numeric containment and
// banned phrases, each an extra chance to lose the section to fallback.
//
// All three now have deterministic sources (copy.beats.* plus, respectively, the facts.categories
// ranking, this area's facts.bottom_items themes, and facts.profile.growth_trajectory — see
// pivotBeat / notStatementBeat / trajectoryBeat in lib/report/fallback-sections.ts), and the
// fallback draft the model rewords already carries all six. THE RULE IS UNCHANGED: do not add a
// seventh beat here before it has a data source.
export const S6Schema = z.object({
  areas: z.array(z.object({
    category_id: z.string(),
    affirm: z.string(),
    pivot: z.string(),
    evidence: z.string(),
    not_statement: z.string(),
    reframe: z.string(),
    trajectory: z.string(),
  })),
});
```

- [ ] **Step 4: Widen the s6 registry slice**

`lib/ai/sections.ts:94` — the model now needs the inputs the three new beats are built from, or gate 2 (numeric containment, scoped to *this section's slice*) will reject any pivot sentence carrying a rank or a delta:

```ts
  s6:  { schema: S6Schema,  maxOutputTokens: 8000, slice: (f) => ({ ...head(f), categories: f.categories.slice(3), blind_spots: f.blind_spots, dispersion: f.dispersion, top_three: f.categories.slice(0, 3), bottom_items: f.bottom_items, growth_trajectory: f.profile.growth_trajectory ?? null }) },
```

> ⚠️ Gate 1b reads its known-id set off `SECTION_REGISTRY.s6.slice(facts).categories` (`section-gates.ts:75`). That is still `f.categories.slice(3)` — `top_three` is a **separate key** and must not be merged into `categories`, or gate 1b would start accepting s5's three areas in s6.

- [ ] **Step 5: Grow both `S6View` renderers to six beats**

`lib/report/pdf/document.tsx:120-134`:

```tsx
function S6View({ ai, fallback }: AiRendererProps) {
  const parsed = S6Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  return (
    <>
      {parsed.data.areas.map((area) => (
        <View key={area.category_id} style={s.block}>
          <Text style={s.body}>{area.affirm}</Text>
          <Text style={s.body}>{area.pivot}</Text>
          <Text style={s.body}>{area.evidence}</Text>
          <Text style={s.body}>{area.not_statement}</Text>
          <Text style={s.body}>{area.reframe}</Text>
          <Text style={s.body}>{area.trajectory}</Text>
        </View>
      ))}
    </>
  );
}
```

`app/app/[churchId]/diagnosis/report/sections.tsx:80-94`:

```tsx
function S6View({ ai, fallback }: AiRendererProps) {
  const parsed = S6Schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.areas.map((area) => (
        <div key={area.category_id}>
          <p className="font-body text-ink-soft">{area.affirm}</p>
          <p className="font-body text-ink-soft">{area.pivot}</p>
          <p className="font-body text-ink-soft">{area.evidence}</p>
          <p className="font-body text-ink-soft">{area.not_statement}</p>
          <p className="font-body text-ink-soft">{area.reframe}</p>
          <p className="font-body text-ink-soft">{area.trajectory}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Check the s6 length ceiling has headroom**

Doubling the beats per area roughly doubles s6's rendered length, and gate 6 rejects the whole section past `report.yaml`'s `s6.length_ceiling`.

```bash
grep -n -A6 "^  s6:" methodology/report.yaml
```

Then compute the deterministic s6 length on the widest fixture:

```bash
npx vitest run tests/report/s6-beats.test.ts --reporter=verbose
```

Add this assertion to `tests/report/s6-beats.test.ts` and run it:

```ts
it('the six-beat fallback fits inside the s6 length ceiling on every fixture', () => {
  const ceiling = methodology.report.sections.s6.length_ceiling;
  for (const { name, facts } of ALL_FIXTURES) {
    const joined = fallbackSection('s6', { facts, methodology, reflections: [] }).bullets.join(' ');
    expect(joined.length, `${name} (ceiling ${ceiling})`).toBeLessThanOrEqual(ceiling);
  }
});
```

If it **fails**: the ceiling lives in `report.yaml`. Raising `s6.length_ceiling` is a value change, **not** a `version:` change — that is permitted, and it is the correct fix. Raise it to the smallest round number above the observed max and add a comment naming this task. **Still do not touch `report.yaml`'s `version:`.**

- [ ] **Step 7: Run the tests**

```bash
npx vitest run tests/ai tests/report
```

Expected: PASS.

- [ ] **Step 8: Full gate**

```bash
npm test && npm run typecheck
```

Expected: green. `tsc` is the real gate for `lib/ai/**` — a green `npm run lint` there is meaningless.

- [ ] **Step 9: Commit**

```bash
git add lib/ai/sections.ts lib/report/pdf/document.tsx "app/app/[churchId]/diagnosis/report/sections.tsx" tests/ai/section-gates.test.ts tests/report/s6-beats.test.ts methodology/report.yaml
git commit -m "feat(report): extend S6Schema, slice, gate and both renderers to six beats"
```

> Drop `methodology/report.yaml` from the `git add` if Step 6 did not need to raise the ceiling. Verify with `git status --short` before committing that none of the three forbidden untracked entries is staged.

---

## Task 10: Close the s8 fallback anonymity gap

Spec §5, priority 4.2. The **theme** path enforces k≥3 via `MIN_SUPPORT`. The **fallback** path (`fallback-sections.ts:117-121`) prints every reflection verbatim with its prompt and **no threshold at all** — and that path is what the **public share page always renders** (`assembleFallbackOnly`). In the sample report that is one person's four answers, fully attributable, on a link anyone can forward.

**Known limitation, to be stated in the code comment and the PR body:** the `reflections` array reaching `fallbackSections` is deliberately **keyless** (item_id + text, no respondent id — `resolve.ts:24-28`), so the renderer cannot count distinct *writers*. The guard therefore uses `facts.cover.respondent_count`, the run's distinct respondent count. That is a weaker k than the theme path's writer-based one, but it is the only k available at this layer without threading respondent identity into a renderer — which is the precise thing the keyless array exists to prevent. A strict improvement over no threshold.

**Files:**
- Modify: `methodology/copy.yaml` (`s8_below_threshold`). **No `version:` change.**
- Modify: `lib/methodology/schema.ts` (`CopySchema.s8_below_threshold`)
- Modify: `lib/report/fallback-sections.ts:106-121` (`s8Bullets`)
- Test: `tests/report/anonymity.test.ts` (extend)

**Interfaces:**
- Consumes: `MIN_SUPPORT` from `lib/ai/theme-gates.ts` (verified: that module imports only `../report/anonymity` plus two type-only imports — **no OpenAI SDK**, so this does not pull the SDK into the share-page bundle); the fixtures (Task 3).
- Produces: `s8Bullets` behaviour change only. No new export.

- [ ] **Step 1: Write the failing test**

Append to `tests/report/anonymity.test.ts`:

```ts
import { MIN_SUPPORT } from '@/lib/ai/theme-gates';
import { fallbackSection } from '@/lib/report/fallback-sections';
import { loadMethodology } from '@/lib/methodology/load';
import { makeFacts, THEMES_N3_FACTS } from '../fixtures/facts';

describe('s8 fallback path enforces a k threshold', () => {
  const methodology = loadMethodology();
  const REFLECTIONS = [
    { item_id: 'G1', reflection: 'I greeted the guest and walked them to the coffee table.' },
    { item_id: 'G1', reflection: 'Nobody followed up with the family who visited in June.' },
  ];
  const s8 = (facts: ReturnType<typeof makeFacts>, reflections = REFLECTIONS) =>
    fallbackSection('s8', { facts, methodology, reflections }).bullets;

  it('suppresses verbatim reflections below the threshold', () => {
    const tooFew = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: MIN_SUPPORT - 1 } });
    const bullets = s8(tooFew);
    for (const r of REFLECTIONS) expect(bullets.join(' ')).not.toContain(r.reflection);
  });

  it('emits the neutral copy line instead of nothing at all', () => {
    const tooFew = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: 1 } });
    expect(s8(tooFew)).toEqual([methodology.copy.s8_below_threshold]);
  });

  it('still prints reflections at or above the threshold', () => {
    const enough = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: MIN_SUPPORT } });
    const bullets = s8(enough).join(' ');
    for (const r of REFLECTIONS) expect(bullets).toContain(r.reflection);
  });

  it('never suppresses the THEME path — it already enforces k>=3 itself', () => {
    const bullets = s8(THEMES_N3_FACTS);
    expect(bullets.join(' ')).toContain(THEMES_N3_FACTS.themes[0]!.label);
    expect(bullets).not.toEqual([methodology.copy.s8_below_threshold]);
  });

  it('emits the neutral line, not an empty section, when there are no reflections at all', () => {
    const enough = makeFacts({ cover: { church_name: 'T', completed_at: null, respondent_count: 9 } });
    expect(s8(enough, [])).toEqual([methodology.copy.s8_below_threshold]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report/anonymity.test.ts -t "s8 fallback path enforces a k threshold"
```

Expected: FAIL — reflections print at any respondent count, and `copy.s8_below_threshold` is undefined.

- [ ] **Step 3: Add the copy**

Append to `methodology/copy.yaml` (top level). **Do not touch `version:`.**

```yaml
# S8's below-threshold line. Shown instead of verbatim reflections when too few people responded
# for a quote to be unattributable — including on the public share page, which renders the
# fallback path permanently.
s8_below_threshold: "Not enough responses yet to report what leaders are saying without identifying who said it. This section fills in as more of your team completes the assessment."
```

- [ ] **Step 4: Add the schema**

`lib/methodology/schema.ts` — add to `CopySchema` (after `beats`):

```ts
  s8_below_threshold: z.string().min(1),
```

- [ ] **Step 5: Guard the fallback path**

`lib/report/fallback-sections.ts` — add the import at the top:

```ts
import { MIN_SUPPORT } from '../ai/theme-gates';
```

> `theme-gates.ts` imports only `../report/anonymity` and two type-only imports — no OpenAI SDK, so this is safe for the share-page bundle. If that ever changes, copy the constant locally rather than dropping the guard.

Then replace `s8Bullets` (`:106-121`) entirely:

```ts
/**
 * S8's bullets, with the SAME k>=3 philosophy on both paths.
 *
 * The theme path already enforces it: clusterThemes -> theme-gates drops any cluster under
 * MIN_SUPPORT distinct supporting respondents, so facts.themes is k-safe by construction.
 *
 * The fallback path did NOT. It printed every reflection verbatim with its prompt and no
 * threshold at all — and this is the path the PUBLIC SHARE PAGE always renders
 * (assembleFallbackOnly). At one respondent that is one person's answers, fully attributable, on
 * a link anyone can forward.
 *
 * ⚠️ KNOWN LIMITATION, deliberate: `reflections` here is the KEYLESS array (item_id + text, no
 * respondent id — resolve.ts:24-28), so this cannot count distinct WRITERS the way theme-gates
 * does. It uses the run's distinct respondent count instead. That is a weaker k, but threading
 * respondent identity into a renderer to strengthen it is exactly what the keyless array exists
 * to prevent. Strictly better than no threshold; not as strong as the theme path's.
 */
function s8Bullets(
  facts: FactsPack,
  methodology: Methodology,
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>,
): string[] {
  if (facts.themes.length > 0) {
    return facts.themes.map((t) => `${t.label}: ${t.gloss} (${t.support_count} people).`);
  }
  if (facts.cover.respondent_count < MIN_SUPPORT) return [methodology.copy.s8_below_threshold];
  // buildOutreachVoices groups per category_id (Map<string, OutreachVoicesGroup[]>) — flatten
  // across the Map's values before producing lines (ruling 10). Verbatims never enter a
  // bullet: only group.entries (respondent free text), never facts.themes[].verbatims.
  const voices = buildOutreachVoices(methodology, [...reflections]);
  const lines = [...voices.values()]
    .flat()
    .flatMap((group) => group.entries.map((entry) => `${group.reflectionPrompt}: ${entry}`));
  // An empty section under a "What Leaders Are Saying" heading reads as a rendering bug. Say why
  // it is empty instead.
  return lines.length > 0 ? lines : [methodology.copy.s8_below_threshold];
}
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/report/anonymity.test.ts tests/report/anonymity-note.test.ts tests/report/fallback-sections.test.ts tests/report/audience.test.ts tests/report/audience-parity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Confirm the share page is actually covered**

```bash
npx vitest run tests/report/assemble-fallback-only.test.ts
```

Add an assertion there if none exists: `assembleFallbackOnly` over a 1-respondent facts pack with reflections must produce an s8 whose bullets contain none of the reflection texts. That is the surface the gap actually lived on.

- [ ] **Step 8: Full gate**

```bash
npm test && npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add methodology/copy.yaml lib/methodology/schema.ts lib/report/fallback-sections.ts tests/report/anonymity.test.ts tests/report/assemble-fallback-only.test.ts
git commit -m "fix(report): apply the k>=3 threshold to s8's fallback verbatim path"
```

---

## Task 11: Verify the s8 theme path end to end

Spec §5, priority 4.1. Priority 4 is **already built** — `lib/ai/themes.ts`, `lib/ai/theme-gates.ts` (`MIN_SUPPORT = 3`), verbatim substring verification, item-id mapping, the `s8Bullets` theme branch, and `revalidatedThemes` read-back all ship today. It is dark only because there is no `OPENAI_API_KEY`. The work is verify-and-tune, not build.

**Files:**
- Test: `tests/report/theme-path.test.ts` (create)
- Modify: only if a real defect is found. Do not refactor working code.

**Interfaces:**
- Consumes: `THEMES_N3_FACTS` (Task 3); `resolveReportSections` (`lib/report/resolve.ts`), which takes an injected `readPersisted` and imports no Supabase client — that injection is what makes this testable without a DB.

- [ ] **Step 1: Write the test**

Create `tests/report/theme-path.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { fallbackSection } from '@/lib/report/fallback-sections';
import { assembleFallbackOnly } from '@/lib/report/compose';
import { MIN_SUPPORT } from '@/lib/ai/theme-gates';
import { THEMES_N3_FACTS, makeFacts } from '../fixtures/facts';

const methodology = loadMethodology();

describe('s8 theme path', () => {
  it('renders one bullet per theme with its label, gloss and support count', () => {
    const bullets = fallbackSection('s8', { facts: THEMES_N3_FACTS, methodology, reflections: [] }).bullets;
    expect(bullets).toHaveLength(THEMES_N3_FACTS.themes.length);
    for (const theme of THEMES_N3_FACTS.themes) {
      const line = bullets.find((b) => b.includes(theme.label));
      expect(line, theme.label).toBeDefined();
      expect(line!).toContain(theme.gloss);
      expect(line!).toContain(String(theme.support_count));
    }
  });

  it('never emits a verbatim quote into a bullet, even when the theme carries one', () => {
    const withVerbatims = makeFacts({
      themes: [{
        label: 'Nobody owns follow-up',
        gloss: 'Follow-up is described as everyone’s job.',
        support_count: 4,
        item_ids: ['S2'],
        verbatims: ['I assumed the other campus was calling them.'],
      }],
    });
    const bullets = fallbackSection('s8', { facts: withVerbatims, methodology, reflections: [] }).bullets;
    expect(bullets.join(' ')).not.toContain('I assumed the other campus');
  });

  it('every theme reaching a renderer clears MIN_SUPPORT', () => {
    for (const theme of THEMES_N3_FACTS.themes) {
      expect(theme.support_count).toBeGreaterThanOrEqual(MIN_SUPPORT);
    }
  });

  it('takes the theme branch over the reflection branch when both are available', () => {
    const reflections = [{ item_id: 'G1', reflection: 'A raw reflection nobody clustered.' }];
    const bullets = fallbackSection('s8', { facts: THEMES_N3_FACTS, methodology, reflections }).bullets;
    expect(bullets.join(' ')).not.toContain('A raw reflection nobody clustered');
  });

  it('reaches the public share page too', () => {
    const s8 = assembleFallbackOnly({ facts: THEMES_N3_FACTS, methodology, reflections: [] })
      .find((s) => s.id === 's8')!;
    expect(s8.fallback.bullets.join(' ')).toContain(THEMES_N3_FACTS.themes[0]!.label);
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/report/theme-path.test.ts
```

Expected: PASS on the first run — this path is already built. **If a test fails, that is a real defect** in shipping code. Fix the defect (minimally), do not weaken the test.

- [ ] **Step 3: Verify `revalidatedThemes` read-back has coverage**

```bash
grep -rn "revalidatedThemes\|isThemeClusterFact" tests/
```

If `tests/report/resolve.test.ts` does not already cover a fresh-hash row whose `facts.themes` revalidates, add a case there: `resolveReportSections` with a fake `readPersisted` returning `{ matched: { inputs_hash: <live>, facts: { themes: THEMES_N3_FACTS.themes } }, anyExists: true }` must produce an s8 carrying the theme labels. If coverage exists, say so and move on.

- [ ] **Step 4: Full gate**

```bash
npm test && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add tests/report/theme-path.test.ts tests/report/resolve.test.ts
git commit -m "test(report): pin the s8 theme path end to end against an n>=3 fixture"
```

---

## Task 12: Final verification and PR

**Files:** none modified — verification only, plus the PR body.

- [ ] **Step 1: Full gate, from clean**

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

Expected: all four green. **Do not run `npm run test:db`** — that is a standing guardrail, and this plan adds no migration for it to test.

- [ ] **Step 2: Confirm nothing forbidden was staged or changed**

```bash
git status --short && echo "---" && git diff origin/master --stat -- methodology/
```

Expected: the three known untracked entries (`.claude/`, the two `docs/superpowers/plans/*.md` files) still show as `??` and appear in **no** commit. Under `methodology/`, only `copy.yaml`, `rules.yaml`, and possibly `report.yaml` (length ceiling only) appear.

- [ ] **Step 3: Prove no version was bumped — the §2 hazard check**

```bash
git diff origin/master -- methodology/ | grep -E "^[+-]version:"
```

Expected: **no output**. Any hit is a hard stop — revert it and escalate to Natalie before going further. A `report.yaml:version` bump would stale every persisted report at once and, with `rpc_save_report.sql:45`'s unfixed `on conflict do nothing`, pin every church to 100% fallback permanently.

- [ ] **Step 4: Confirm no dependency drifted**

```bash
git diff origin/master --stat -- package.json package-lock.json && node -p "require('./package.json').dependencies.zod"
```

Expected: no diff, and `zod` still `3.25.76`.

- [ ] **Step 5: Confirm no migration was added**

```bash
git diff origin/master --name-only | grep -E "supabase/|\.sql$" || echo "no migration — correct"
```

Expected: `no migration — correct`.

- [ ] **Step 6: Ask Natalie before pushing**

Do **not** push. Report the full gate output and ask for explicit approval to push the branch and open the PR.

- [ ] **Step 7: Push and open the PR (only after approval)**

```bash
git push -u origin feat/report-quality-charts
```

Then open the PR with this body:

```markdown
## What

Quality pass + data visualisation on the final report, per
`docs/superpowers/specs/2026-08-13-final-report-quality-pass-design.md`.

- **Score-aware `readingBand`** — an `ok`-state area below the new `thresholds.strong` (70) now
  reads *watch*, not *holding*. Governance at 53/100 stops being told "This is strong."
  ⚠️ This changes the wording on **every existing report**, including the cover-table Band column.
- **Composer-vs-fallback is now observable** — a warn-once line when `OPENAI_API_KEY` is absent,
  and an `ai N/13 · fallback: …` summary on every generation.
- **Charts on both surfaces** from one shared geometry seam (`lib/report/charts.ts`): a tier gauge
  and eight area bars on s3, bottom-indicator bars on s7. Bar fills key to the corrected band.
- **s6 grows from three beats to six** — pivot, not-statement and trajectory now have real data
  sources (`copy.beats.*` plus the categories ranking, per-area bottom-item themes, and
  `profile.growth_trajectory`). Deterministic *and* AI path, both renderers, plus the gate.
- **s8's fallback verbatim path now enforces k≥3**, matching the theme path.
  ⚠️ Below 3 respondents, the **public share page** stops showing verbatim reflections and shows a
  neutral line instead.
- **Six `FactsPack` fixtures** as the validation substrate — the only real dataset is degenerate
  (1 respondent, no broken stage, no themes) and cannot exercise any of this.

## Constraints honoured

No methodology version bump. **No `report.yaml:version` bump** (it is an `inputsHash` component;
bumping it would stale every persisted report and, with `rpc_save_report.sql:45`'s unfixed
`on conflict do nothing`, pin every church to 100% fallback permanently). No migration. No new
dependencies; `zod` stays pinned `3.25.76`. PDF charts use `@react-pdf/renderer` 4.5.1 SVG
primitives only. `SYSTEM_PROMPT` untouched.

## ⚠️ Unverified: the two-surface prose smoke has never been run

The diagnosis page and the PDF agree **today only because both render 100% fallback** —
`.env.local` has no `OPENAI_API_KEY`, so all seven AI sections and `clusterThemes` return null.
The two-surface prose smoke has therefore never proved anything, and it becomes load-bearing the
moment the key is set.

Every **parity** claim in this PR rests on the shared-geometry seam, which *is* unit-tested
(`tests/report/chart-parity.test.ts` asserts both renderers consume the same model object and
neither recomputes geometry). The **prose** parity between the two surfaces remains unverified and
is owner-driven — procedure in the s60 handoff §3: compare `s2, s4, s5, s6, s7, s9, s12` on the
diagnosis page against the PDF for the same run. Two of its three failure modes are silent.

## Known limitation

s8's fallback k-guard counts the run's **distinct respondents**, not distinct reflection
**writers**. The array reaching that renderer is deliberately keyless (no respondent id), so a
writer-based count is not available there without threading identity into a renderer — the exact
thing the keyless array exists to prevent. Strictly better than the previous no-threshold state;
weaker than the theme path's own k.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
|---|---|
| §0 findings (fallback-only sample, degenerate dataset) | Global Constraints + Task 3 |
| §1 shared-geometry seam, `inputsHash` untouched | Tasks 4, 5, 6 (+ Task 12 Step 3) |
| §2 no `report.yaml:version` bump | Global Constraints; enforced Task 8 Step 7, Task 12 Step 3 |
| §3 s3 dashboard: bars, gauge, XPG read, stays non-AI | Tasks 4, 5, 6, 7 |
| §4 three missing s6 beats, deterministic + AI + gate | Tasks 8, 9 |
| §5 priority 3 (s7 chart, logic unchanged) | Tasks 4, 5, 6 — `s7Bullets` is untouched |
| §5 priority 4.1 (verify theme path) | Task 11 |
| §5 priority 4.2 (close anonymity gap) | Task 10 |
| §6 six fixtures | Task 3 |
| §7.1 score-aware `readingBand` | Task 1 |
| §7.2 composer-vs-fallback observability | Task 2 |
| §8 scope boundaries | Global Constraints; verified Task 12 |
| §9 flag the never-run smoke in the PR body | Task 12 Step 7 |

**Sequencing check.** §7 (Tasks 1–2) and §6 (Task 3) land before §1 charts (Tasks 4–6) and §4 beats (Tasks 8–9), as required — Task 4's bar fills consume Task 1's corrected bands, and Task 4's tests consume Task 3's fixtures.

**Two deviations from the spec's letter, both recorded at their task:**
1. `AssembledSection.charts: ChartModel[]`, not `chart: ChartModel | null` — s3 needs two charts, which §3 itself requires. Same seam, same attach point.
2. New keyed copy lives in named top-level `copy` keys (`beats`, `xpg_read`, `s8_below_threshold`) rather than under `copy.inserts` / `copy.blocks`, because those two are `z.record(z.string().min(1))` and cannot hold a band-keyed or theme-keyed object. This is a `schema.ts` change, not a `report.yaml` change, so it does not trip the §2 hazard and needs no escalation.

**Type consistency.** `readingBand`'s third parameter is `Methodology['rules']['thresholds']` in Task 1 and at all four later call sites (`view.ts` `buildAreas`, `fallback-sections.ts` `bandRead`, `charts.ts` `areaBarsModel`, `fallback-sections.ts` `pivotBeat`). `BandKey` in `charts.ts` mirrors `ReadingBand` in `view.ts` — deliberately re-declared rather than imported, so the chart palette does not force `charts.ts` to export a view type; the Task 4 test asserts they agree on every fixture. `ChartModel` is the same discriminated union in `charts.ts`, `compose.ts`, `pdf/charts.tsx` and the web `charts.tsx`. `S6Schema`'s six field names (`affirm, pivot, evidence, not_statement, reframe, trajectory`) match both renderers in Task 9 and the deterministic beat order in Task 8.
