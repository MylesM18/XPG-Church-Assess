# Final Report Redesign — Plan 2 of 5: Clustering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cluster short-answer reflections into anonymity-gated themes — a GPT task (`lib/ai/themes.ts`) plus a pure, server-computed gate (`lib/ai/theme-gates.ts`) that never trusts the model — and move the AI/reflections boundary from "reflections never reach `lib/ai/**`" to "reflections reach only the clustering task and its gate".

**Architecture:** Three layers, each independently testable. (1) A deterministic projection: `ReflectionRow[]` (which carries a server-side `respondent_key`) is sorted by `(item_id, text)` and split into a model-facing `{index, item_id, text}[]` plus a server-side `index → respondent_key` map. The key is structurally incapable of reaching the model because the payload is built from the projection, not from the rows. (2) One `responses.parse` call with the same config as `lib/ai/prose.ts` (`max_output_tokens: 6000`), never throwing, with four distinct logged failure paths — three return `null`, and all-themes-gated-out returns `[]`. (3) A pure gate that recomputes every claim the model made — support counts come from the server-side map, verbatims are substring-verified against source text, labels are scanned against **all** run respondents' display labels — and drops failing themes individually. The same label-scan primitive also closes the parked anonymity gap on the facts path.

**Tech Stack:** TypeScript (strict), Zod (`zod/v4`, pinned 3.25.76), `openai` SDK `responses.parse` + `zodTextFormat`, Vitest.

**Base:** `feat/final-report-redesign` @ `93f363d` (plan 1 of 5, shipped as PR #56). Spec: `docs/superpowers/specs/2026-08-10-final-report-redesign-design.md` @ `a608f61`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Verified baseline at `93f363d`:** `npx tsc --noEmit` → exit 0, no output. `npx vitest run` → **167 files / 972 tests passed, 0 failures.** Any brief quoting 968 / 958 / 916 is stale — correct it before dispatching. Each task's test count must move **up** from the previous task's verified number, never down.
- ⚠️ **`eslint.config.mjs:12` globally ignores `lib/ai/**` (and `tests/ai/**`).** Both of this plan's main source files and their tests live under those ignores. **A green lint proves nothing about `lib/ai/themes.ts` or `lib/ai/theme-gates.ts`.** Do not let lint stand in for verification there; `tsc --noEmit` and `vitest` are the only real gates for those files. `lib/report/**` and `tests/report/**` are **not** ignored — normal lint rules apply there.
- **No `console.*` in `lib/report/**`.** That tree currently contains zero `console.` calls and is fully linted. Logging belongs in `lib/ai/**` (lint-ignored) only. Task 3's facts-path guard therefore omits silently and is proven by test, not by a log line.
- **Log prefix is `[report] <task>: <reason>`.** Clustering logs `[report] themes: …`. This matches the spec's mandated shape for plan 3 (spec line 114, `[report] section <id>: <reason>`) and is forward-compatible with it. `lib/ai/prose.ts`'s existing `[m5b]` lines are **out of scope — do not touch them**; the prefix change applies to new code only.
- **Log reasons only, never content.** The clustering payload is raw reflection text. Never log the payload, the parsed output, a theme, a verbatim, a label, or an error object — log `err.message` and fixed reason strings only. This is stricter than `prose.ts`'s rationale (lines 168–172), not looser.
- **Strict structured outputs put every property in `required`**, so absent optionals return **`null`, not `undefined`**. Use `.nullable()` throughout the Zod schema (never `.optional()`), exactly as `ReportBlocksSchema` does.
- **Never trust the model.** Support counts, verbatim provenance, and item-id validity are all recomputed server-side. A model-supplied count is never read.
- ⛔ **No new dependencies.** ⛔ **No version bumps** (`questions.yaml` stays `0.3.0`, `rules.yaml` stays `0.2.0`).
- ⛔ **The implementer never runs git** (`add`/`commit`/`status`/`diff`/`stash`/`checkout`/`log`). The commit step in each task **names the in-scope files** — it is a scope declaration, not a command to run. The controller commits by explicit path.
- ⛔ **The implementer never runs a database command** (`npm run test:db`, `supabase db push`, `supabase db reset`, `psql`). This plan adds no migration.
- **Bracket paths:** any git command naming `app/app/[churchId]/…` needs `GIT_LITERAL_PATHSPECS=1` and quoting. Reading those files via `node:fs` inside a test is unaffected.
- **Commit messages on this branch:** bare conventional-commit subject, **no trailer**.
- **Anonymity vocabulary is two distinct fields — do not conflate them.** `Response.respondent_id` (`lib/engine/types.ts:13`) is *stable identity* — use it for counting distinct respondents. `Response.respondent_label` (`lib/engine/types.ts:12`) is *display only, may collide across people* — use it for the label ban. Counting on labels would undercount two people who share a display name, weakening k≥3.

---

## Decisions resolved during planning

These were open when this plan was written. They are **resolved here** — implementers must not re-open them, and reviewers should read a deviation from them as a defect.

**D1 — Verbatims ship in plan 2, both gate and field.** `ThemeClusterFact` (`lib/report/facts.ts:35-40`) gains a required `verbatims: string[]`. Verification: `grep -rn "ThemeClusterFact" lib tests app` returns **three hits, all in `lib/report/facts.ts`** (`:35` declaration, `:66` and `:90` type references) and **zero test fixtures construct one** — so the required field costs no fixture churn. Gate-without-field would ship provably dead code that plan 3 must revive; gate-plus-field means plan 3's S8 renderer just reads `theme.verbatims`.

**D2 — Log prefix is `[report] themes: …`.** See Global Constraints. Chosen over `[m5b]` because the spec mandates `[report]` for plan 3 and `[m5b]` is a milestone tag with no meaning to a future reader. Clustering is a *task*, not a *section*, so the shape is `[report] themes:` and not `[report] section themes:`.

**D3 — The composer-input half of the rewritten contract is a live assertion, not a deferral.** The naive worry is that `lib/ai/sections.ts` does not exist until plan 3, so any assertion about it is vacuous today. It is not, because the assertion is written as a **per-file allowlist over `lib/ai/**`**: exactly `themes.ts` and `theme-gates.ts` may mention reflections or verbatims; every other file in the tree — every file that exists today, and every file plan 3 adds — may not. That is a live constraint on today's files and a tripwire that fires the moment `sections.ts` lands with a violating reference. No deferral, no vacuous test.

**D4 — The anonymity enforcement point is a shared primitive in `lib/report/anonymity.ts`, consumed at two sites, plus a copy fix.** This closes the parked Important #2 from plan 1's final review. It is **not** re-litigated as a plan-1 branch defect — the Opus reviewer correctly ruled that branch needs no change, because nothing consumed the facts pack yet. Plan 3's composer *will* consume it, so the guard must exist before plan 3, i.e. now.
- The primitive lives in `lib/report/anonymity.ts`, not in `lib/ai/**`. `lib/report/facts.ts` must be able to import it, and `lib/report` importing from `lib/ai` would invert the layering; `lib/ai` importing from `lib/report` is already the established direction. `lib/report` is also linted, which `lib/ai` is not.
- Consumer 1: `lib/ai/theme-gates.ts` — the label ban on every theme label, gloss, and verbatim.
- Consumer 2: `lib/report/facts.ts` — a fail-closed guard on the free-text profile fields. `leadership_history` / `consultant_notes` are copied verbatim into `FactsPack.profile` at `:144-148`; a field containing a run respondent's display label is **omitted from the pack** (the field is dropped, not the report).
- Consumer 3 (prevention, not mechanism): `app/app/[churchId]/settings/settings-form.tsx:49` currently invites admins to describe "who took the assessment (roles)". Silent omission of a field an admin typed is bad UX; the copy fix stops the input from being invited in the first place. Both halves ship, in Task 3.
- `lib/report/pdf/render.ts:28-30` is **left alone**. It throws on the `view` path and that behavior is correct and load-bearing; extending it to report sections is plan 5's job, and it has nothing to guard until plan 3 produces sections.

**D5 — The respondent key enters at the function signature; the model payload is a projection that provably drops it.** `clusterThemes` takes `ReflectionRow[]` where each row carries `respondent_key: string` (opaque to this module — plan 3's caller will pass `respondent_id`). `indexReflections()` sorts the rows and returns two values: a model-facing `IndexedReflection[]` of `{index, item_id, text}` and a server-side `Map<index, respondent_key>`. The OpenAI payload is built from the first value only, so the key cannot reach the model without an edit that changes which value is serialized — and Task 6 pins exactly that. **Plan 2 does not touch `app/app/[churchId]/diagnosis/page.tsx`.** That seam (which strips every respondent identifier today, at `:99-136`) is a *generation-wiring* change, and the spec puts generation wiring in plan 3 (spec line 135). Plan 2 defines the interface plan 3 will fill.

---

## ⚠️ The `ai-exclusion` rewrite is a CONTRACT CHANGE, not a regression

**Read this before reviewing Task 2. A reviewer who has not read it will flag Task 2 as a weakened test.**

`tests/outreach/ai-exclusion.test.ts` today asserts that **no file** under `lib/ai/**` mentions `reflection` or `outreachvoices`. That assertion was correct for every prior plan and is **deliberately invalidated by this one**: `lib/ai/themes.ts` exists precisely to read reflections, and `lib/ai/theme-gates.ts` must hold source reflection text to substring-verify a verbatim against it. Spec line 122 mandates this rewrite by name.

The boundary moves:

| | Old contract | New contract |
|---|---|---|
| Raw reflection text | reaches **no** file in `lib/ai/**` | reaches **exactly** `lib/ai/themes.ts` and `lib/ai/theme-gates.ts` |
| Model payloads | (implied by the above) | only `themes.ts` may place reflection text in a payload; no respondent key or label in any AI input construction |
| Verbatims | (did not exist) | may be referenced **only** by `themes.ts` and `theme-gates.ts` |
| `Response[]` allowlist | pinned | **pinned, unchanged** |
| `generateProse` call site | pinned | **pinned, unchanged** |

**Only one of the file's four describe blocks is invalidated.** The other three are still correct and **deleting them would be a genuine regression**:

1. `'AI prose never reads reflections'` (lines 9–22) — **this is the block the contract change replaces**, and it becomes a per-file allowlist.
2. `'the raw-row to Response[] mapping stays an explicit allowlist that drops reflection'` (lines 47–69) — **survives verbatim.** Reflections still must not ride into the `Diagnosis` that `generateProse` stringifies.
3. `'the generateProse call site passes the clean diagnosis, not an enriched one'` (lines 71–78) — **survives verbatim.**
4. The `stripTs` helper (line 4), the `mapBody` helper + its docblock (lines 35–45), and the long rationale comment at lines 24–32 are load-bearing — **carry them forward unchanged.**

Task 2 is therefore **net-additive with one block rewritten**. The non-vacuity check for that commit must show every deleted line falling inside the old block 1 or being a re-emission — no assertion from blocks 2–4 may disappear.

**`tests/outreach/shared-exclusion.test.ts` is a separate pin on the share path and is NOT rewritten.** P5 keeps the share page theme-free; do not weaken it.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/report/anonymity.ts` *(new)* | Pure label-scan primitive: derive a run's distinct display labels; test a string for any of them. Two consumers, two layers. | T1 |
| `tests/report/anonymity.test.ts` *(new)* | Unit tests for the primitive, including the blank-label trap. | T1 |
| `tests/outreach/ai-exclusion.test.ts` *(rewrite block 1, keep 2–4; then append block 4)* | The contract change: per-file allowlist (T2), then the positive payload pins (T7). | T2, T7 |
| `lib/report/facts.ts` *(modify `:35-40`, `:144-148`)* | `ThemeClusterFact.verbatims`; profile free-text anonymity guard. | T3 |
| `app/app/[churchId]/settings/settings-form.tsx` *(modify `:47-50`)* | Hint copy stops inviting respondent names. | T3 |
| `tests/report/facts.test.ts` *(append)* | Profile-guard accept + redact cases. | T3 |
| `lib/ai/themes.ts` *(new)* | Zod schema, `ReflectionRow`/`IndexedReflection` types, deterministic `indexReflections()` projection (T4); async `clusterThemes()` entry point appended (T6). | T4, T6 |
| `tests/ai/themes-index.test.ts` *(new)* | Ordering, index assignment, and payload-projection tests. | T4 |
| `lib/ai/theme-gates.ts` *(new)* | Pure gate: k≥3 distinct respondents, item-id validity, label ban, verbatim substring/length/n≥8. Individual drops. | T5 |
| `tests/ai/theme-gates.test.ts` *(new)* | Accept + reject fixture per gate. | T5 |
| `tests/ai/themes-generate.test.ts` *(new)* | Mocked OpenAI: happy path plus all four logged failure paths. | T6 |

**Not in this plan, deliberately:** the clustering call site (plan 3 generation wiring), `lib/ai/sections.ts` and its gates (plan 3), the `reports` table and `save_report` (plan 3), the S8 renderer (plan 4), the PDF guard extension (plan 5).

**No fallback module is built here, and that is correct.** Spec line 71 says task failure falls back to the existing per-area voices lists — that fallback already exists as `buildOutreachVoices` in `lib/report/view.ts:224-260`, and *choosing* it is the caller's job. `clusterThemes` signals failure by returning `null`; plan 3's `compose.ts` routes that to the existing lists. Plan 2 must not build a second fallback path. Reviewers: a "missing fallback" finding here is not a defect.

---

### Task 1: The shared anonymity primitive

**Files:**
- Create: `lib/report/anonymity.ts`
- Test: `tests/report/anonymity.test.ts`

**Interfaces:**
- Consumes: `Response` from `lib/engine/types` (fields `respondent_label`, `respondent_id`) — structurally typed, so the parameter takes the minimal shape rather than the whole `Response`.
- Produces:
  - `respondentLabels(responses: ReadonlyArray<{ respondent_label: string }>): string[]` — distinct, non-blank display labels.
  - `containsRespondentLabel(text: string, labels: readonly string[]): boolean` — case-insensitive full-label substring test.
  - Task 3 uses both. Task 5 uses both.

- [ ] **Step 1: Write the failing test**

Create `tests/report/anonymity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { containsRespondentLabel, respondentLabels } from '../../lib/report/anonymity';

describe('respondentLabels', () => {
  it('returns distinct labels', () => {
    const rows = [
      { respondent_label: 'Priscilla Vandermeer' },
      { respondent_label: 'Priscilla Vandermeer' },
      { respondent_label: 'Dana Okafor' },
    ];
    expect(respondentLabels(rows).sort()).toEqual(['Dana Okafor', 'Priscilla Vandermeer']);
  });

  it('drops blank and whitespace-only labels', () => {
    // A blank label is the trap this function exists to defuse: '' is a substring of
    // every string, so letting it through would make containsRespondentLabel return
    // true for all input and silently drop every theme and every profile field.
    const rows = [
      { respondent_label: '' },
      { respondent_label: '   ' },
      { respondent_label: 'Dana Okafor' },
    ];
    expect(respondentLabels(rows)).toEqual(['Dana Okafor']);
  });

  it('returns an empty array for no responses', () => {
    expect(respondentLabels([])).toEqual([]);
  });
});

describe('containsRespondentLabel', () => {
  const labels = ['Priscilla Vandermeer', 'Dana Okafor'];

  it('matches a full label case-insensitively', () => {
    expect(containsRespondentLabel('as PRISCILLA VANDERMEER put it', labels)).toBe(true);
  });

  it('does not match a partial label', () => {
    // Documented scope, identical to lib/ai/prose.ts's check 5: exact full labels only.
    // 'Priscilla', 'Vandermeer' and 'P. Vandermeer' all pass. This is NOT a general PII
    // filter and must not be trusted as one.
    expect(containsRespondentLabel('Priscilla said so', labels)).toBe(false);
    expect(containsRespondentLabel('per Vandermeer', labels)).toBe(false);
  });

  it('returns false when the label list is empty', () => {
    expect(containsRespondentLabel('anything at all', [])).toBe(false);
  });

  it('returns false for an empty text', () => {
    expect(containsRespondentLabel('', labels)).toBe(false);
  });

  it('ignores a blank entry that reached the label list anyway', () => {
    // Defense in depth: respondentLabels already strips these, but this function is
    // exported and a caller may build a list by hand.
    expect(containsRespondentLabel('nothing identifying here', ['', '  '])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/report/anonymity.test.ts`
Expected: FAIL — cannot resolve `../../lib/report/anonymity`.

- [ ] **Step 3: Write the implementation**

Create `lib/report/anonymity.ts`:

```ts
/**
 * Respondent-anonymity primitive, shared by the facts path (lib/report/facts.ts) and the
 * theme gate (lib/ai/theme-gates.ts).
 *
 * Scope, stated once so no caller over-trusts it: this matches EXACT FULL display labels,
 * case-insensitively, as substrings. Given the label 'Priscilla Vandermeer', the strings
 * 'Priscilla', 'Vandermeer' and 'P. Vandermeer' all pass. It is NOT a general PII filter —
 * the same limit lib/ai/prose.ts:117-121 documents for its own check 5. It is a backstop
 * against the specific failure of a person's collected name being reproduced verbatim, not
 * a guarantee of de-identification.
 *
 * It lives in lib/report rather than lib/ai on purpose: lib/report/facts.ts must import it,
 * and lib/report importing from lib/ai would invert the established layering. lib/report is
 * also linted, whereas lib/ai/** is under eslint globalIgnores.
 */

/**
 * Distinct, non-blank display labels across a run's responses.
 *
 * Blank labels are dropped deliberately, and this is the load-bearing line in the file:
 * '' is a substring of every string, so a single blank label reaching
 * containsRespondentLabel would make it return true for all input — every theme dropped,
 * every profile field omitted, with no error anywhere. Fail-closed must not degenerate
 * into fail-everything.
 *
 * Takes the minimal structural shape rather than Response so callers holding a narrower
 * row type (or a test fixture) need no cast.
 */
export function respondentLabels(
  responses: ReadonlyArray<{ respondent_label: string }>,
): string[] {
  const out = new Set<string>();
  for (const r of responses) {
    const label = r.respondent_label?.trim();
    if (label) out.add(label);
  }
  return [...out];
}

/** True iff `text` contains any of `labels` as a case-insensitive substring. */
export function containsRespondentLabel(text: string, labels: readonly string[]): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  for (const label of labels) {
    const needle = label?.trim().toLowerCase();
    if (needle && haystack.includes(needle)) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/report/anonymity.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **980** tests across **168** files (972 + 8 new, 167 + 1 new file).

Run: `npx eslint lib/report/anonymity.ts`
Expected: clean. (`lib/report/**` is **not** under globalIgnores, unlike `lib/ai/**` — this is one of the few files in this plan where lint means something.)

- [ ] **Step 6: Commit**

In-scope files for the controller's commit:

```
lib/report/anonymity.ts
tests/report/anonymity.test.ts
```

Message: `feat(report): add shared respondent-label anonymity primitive`

---

### Task 2: Rewrite the ai-exclusion contract — the allowlist (negative half)

⚠️ **This task MUST run before Task 4 creates `lib/ai/themes.ts`, and the reason is mechanical, not stylistic.** `tests/outreach/ai-exclusion.test.ts:6` calls `readdirSync('lib/ai')` at module scope and `it.each(files)` asserts every file contains no `'reflection'`. The moment `themes.ts` exists, that suite goes red. Creating the file first would mean shipping a task whose full-suite gate cannot be green — so the contract moves first, and the files land into a boundary that already permits them.

**Files:**
- Modify: `tests/outreach/ai-exclusion.test.ts:6-22` (block 1 only)

**Interfaces:**
- Consumes: nothing.
- Produces: the `ALLOWED` allowlist constant that Tasks 4 and 5's files rely on being permitted, and that Task 7 extends with positive pins.

**Read the "⚠️ The `ai-exclusion` rewrite is a CONTRACT CHANGE" section at the top of this plan before starting.** In short: block 1 is deliberately replaced; **blocks 2, 3, the `stripTs` helper, the `mapBody` helper and the long rationale comment at lines 24–32 all survive unchanged.** Deleting any of them is a real regression.

- [ ] **Step 1: Replace block 1**

Replace lines 6–22 of `tests/outreach/ai-exclusion.test.ts` — that is, the `const files = …` statement and the whole `describe('AI prose never reads reflections', …)` block — with:

```ts
/**
 * The clustering task (plan 2) and its gate are the ONLY files under lib/ai/** allowed to
 * touch reflection text or verbatims. Everything else in the tree is still forbidden from
 * both, and that half of the rule is what keeps this test non-vacuous: it constrains every
 * file that exists today, and it fires the moment plan 3's lib/ai/sections.ts lands with a
 * reference to either concept.
 *
 * `verbatim` is guarded alongside `reflection` on purpose. A section composer could pull
 * theme verbatims out of the facts pack without ever writing the word "reflection" — spec
 * line 72 routes verbatims facts -> S8 renderer exclusively, never into a composer input.
 */
const ALLOWED = ['themes.ts', 'theme-gates.ts'];

const files = readdirSync('lib/ai', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

const guarded = files.filter((f) => !ALLOWED.includes(f));

describe('reflections and verbatims reach only the clustering task and its gate', () => {
  it('finds the ai module', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('the allowlist names only the clustering task and its gate', () => {
    // Pinned by value, not by length: widening the boundary must be a deliberate edit to
    // this line, visible in review, rather than a quiet append somewhere else in the file.
    expect(ALLOWED).toEqual(['themes.ts', 'theme-gates.ts']);
  });

  it('there is at least one guarded file left to check', () => {
    // Without this, allowlisting every file would make the scan below vacuously pass.
    expect(guarded.length).toBeGreaterThan(0);
  });

  it.each(guarded)('%s references neither reflection, verbatim nor outreachVoices', (file) => {
    // Lowercased so a PascalCase/camelCase identifier (OutreachVoicesGroup, initialReflections,
    // rawReflection, VerbatimCandidate, ...) cannot dodge a case-sensitive substring check —
    // those are exactly the casings this codebase actually uses for the concepts excluded here.
    const src = stripTs(readFileSync(`lib/ai/${file}`, 'utf8')).toLowerCase();
    expect(src).not.toContain('reflection');
    expect(src).not.toContain('verbatim');
    expect(src).not.toContain('outreachvoices');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes and covers what it should**

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts`
Expected: PASS — **9 tests** (5 in the rewritten block: 3 plain `it`s plus an `it.each` contributing 2, because `lib/ai` holds exactly `fallback.ts` and `prose.ts` today; plus 3 in block 2 and 1 in block 3, unchanged). Previous count was 7 — the old block 1 was 1 plain `it` plus the same 2-row `it.each`.

- [ ] **Step 3: Prove the new scan actually bites**

This is a rewritten security tripwire, so verify it fails when it should rather than trusting that it passes. Temporarily append the single line `// verbatim` to `lib/ai/fallback.ts`, then:

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts`
Expected: **FAIL** on `fallback.ts references neither reflection, verbatim nor outreachVoices`.

⚠️ `stripTs` removes comments, so a `//` comment will NOT trip it — use a real code line instead: append `const verbatim = 1;` to `lib/ai/fallback.ts` and re-run. Expected: **FAIL**. Then **remove the line** and re-run — expected PASS, 9 tests. Report all three runs' real output.

- [ ] **Step 4: Confirm nothing else was touched**

Run: `grep -c "describe(" tests/outreach/ai-exclusion.test.ts`
Expected: `3` — the three describe blocks (rewritten block 1, plus blocks 2 and 3 intact).

Run: `grep -n "mapBody\|generateProse\|stripTs" tests/outreach/ai-exclusion.test.ts`
Expected: the `stripTs` definition, the `mapBody` definition and its three uses, and the `generateProse` pin — all still present.

- [ ] **Step 5: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **982** tests across **168** files (Task 1's 980 + 2 net new in an existing file).

- [ ] **Step 6: Commit**

In-scope files for the controller's commit:

```
tests/outreach/ai-exclusion.test.ts
```

Message: `test(outreach): move the ai-exclusion boundary to a per-file allowlist`

⚠️ **Controller: this commit's non-vacuity check needs judgement, not a rule.** `git diff -U0 -- tests/outreach/ai-exclusion.test.ts | grep '^-'` will show real deleted assertions — that is expected here and only here. Confirm every deleted line falls inside the old `describe('AI prose never reads reflections', …)` block or its `const files` statement. **No line from `mapBody`, from block 2, from block 3, or from the lines 24–32 rationale comment may appear in that output.**

---

### Task 3: Verbatim field on the facts pack, and the anonymity guard on the profile path

**Files:**
- Modify: `lib/report/facts.ts:35-40` (add `verbatims`), `lib/report/facts.ts:144-148` (guard the profile loop)
- Modify: `app/app/[churchId]/settings/settings-form.tsx:47-50` (hint copy)
- Test: `tests/report/facts.test.ts` (append — do **not** rewrite the file)

**Interfaces:**
- Consumes: `respondentLabels`, `containsRespondentLabel` from `lib/report/anonymity` (Task 1).
- Produces: `ThemeClusterFact` with a required `verbatims: string[]`. Task 5's `gateTheme` returns this exact shape.

This task closes the parked Important #2 from plan 1's final review (D4 above). It runs **before** the gate tasks so that `ThemeClusterFact` already carries `verbatims` when Task 5 returns it — no task in this plan ends on a known `tsc` error.

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/facts.test.ts`, reusing the fixtures the file already defines — `makeDiagnosis()` (`:47`), `RESPONSES` (`:95-101`), `CHURCH` (`:75`) — and the same full-object `buildFacts({ diagnosis, methodology, responses, church, completedAt })` call shape the file already uses at `:103` and `:219`. **Add no new top-level helper.**

```ts
describe('buildFacts — profile anonymity guard', () => {
  // RESPONSES labels its respondents 'a' / 'b' / 'c'. A one-character label is a substring of
  // almost any prose, so reusing it here would drop every profile field and the tests would
  // pass for the wrong reason. Re-label with realistic names so these cases exercise the
  // guard rather than the fixture. (The general point — that very short display labels
  // over-match — is documented scope on the primitive, not a bug in it.)
  const NAMES: Record<string, string> = { a: 'Priscilla Vandermeer', b: 'Dana Okafor', c: 'Marcus Reyes' };
  const NAMED: Response[] = RESPONSES.map((r) => ({
    ...r,
    respondent_label: NAMES[r.respondent_label] ?? r.respondent_label,
  }));
  const UNLABELLED: Response[] = RESPONSES.map((r) => ({ ...r, respondent_label: '' }));

  const profileOf = (church: Partial<ChurchFacts>, responses: Response[] = NAMED) =>
    buildFacts({
      diagnosis: makeDiagnosis(),
      methodology,
      responses,
      church: { ...CHURCH, ...church },
      completedAt: null,
    }).profile;

  it('keeps a profile field that names nobody', () => {
    expect(profileOf({ consultant_notes: 'Two campuses merged last year.' }).consultant_notes)
      .toBe('Two campuses merged last year.');
  });

  it('omits a profile field that reproduces a respondent name', () => {
    // The back door the guard closes: churches.consultant_notes is admin free text copied
    // verbatim into FactsPack.profile, and plan 3's composer will put the pack in a model
    // prompt. Drop the field, not the report.
    expect(profileOf({ consultant_notes: 'Priscilla Vandermeer coordinated the responses.' }).consultant_notes)
      .toBeUndefined();
  });

  it('omits only the offending field, not the whole profile', () => {
    const profile = profileOf({
      leadership_history: 'Priscilla Vandermeer became lead pastor in 2019.',
      consultant_notes: 'Budget is flat year over year.',
    });
    expect(profile.leadership_history).toBeUndefined();
    expect(profile.consultant_notes).toBe('Budget is flat year over year.');
  });

  it('matches case-insensitively', () => {
    expect(profileOf({ consultant_notes: 'notes from PRISCILLA VANDERMEER' }).consultant_notes)
      .toBeUndefined();
  });

  it('keeps every field when no respondent has a usable label', () => {
    // The blank-label trap, at the integration level: a run whose labels are all empty must
    // not cause every profile field to vanish.
    expect(
      profileOf({ consultant_notes: 'Two campuses merged last year.' }, UNLABELLED).consultant_notes,
    ).toBe('Two campuses merged last year.');
  });
});
```

⚠️ `Response` is already imported at the top of this file (`:3`); `ChurchFacts` at `:4`. Add no imports unless `tsc` says one is genuinely missing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/report/facts.test.ts`
Expected: FAIL on the omission cases — the unguarded loop copies the field through.

- [ ] **Step 3: Add the `verbatims` field**

In `lib/report/facts.ts`, replace the `ThemeClusterFact` interface (currently lines 35–40):

```ts
/** Shape plan 2's gated clustering output lands in. Empty until plan 3 wires the caller. */
export interface ThemeClusterFact {
  label: string;
  gloss: string;
  /** Distinct supporting respondents, computed server-side. Never the model's own count. */
  support_count: number;
  item_ids: string[];
  /**
   * Substring-verified, label-free quotes, at most 200 chars each. Empty when the P3 writer
   * pool (<8 distinct reflection writers) forbids verbatims, or when no candidate survived
   * the gate. Required rather than optional so a renderer can never mistake "not gated yet"
   * for "gated and empty". These are structured fields on purpose: they flow facts -> the S8
   * renderer, which strips them by audience, and are never embedded in composed prose.
   */
  verbatims: string[];
}
```

- [ ] **Step 4: Guard the profile loop**

In `lib/report/facts.ts`, replace the profile block (currently lines 144–148):

```ts
  // Fail-closed anonymity guard on the free-text profile fields. `leadership_history` and
  // `consultant_notes` are admin-authored prose copied verbatim into the pack, and plan 3's
  // composer puts the pack into a model prompt and onto the rendered report — so a name
  // typed here is a back door around every other anonymity control in the system. Drop the
  // offending FIELD rather than throwing: one over-shared note must not cost the report.
  // Prevention lives alongside this in the settings hint copy (settings-form.tsx).
  const labels = respondentLabels(responses);
  const profile: Record<string, string> = {};
  for (const key of PROFILE_KEYS) {
    const value = church[key];
    if (value === null || value.length === 0) continue;
    if (containsRespondentLabel(value, labels)) continue;
    profile[key] = value;
  }
```

Add to the imports at the top of the file:

```ts
import { containsRespondentLabel, respondentLabels } from './anonymity';
```

⚠️ **No `console.warn` here.** `lib/report/**` is fully linted (unlike `lib/ai/**`) and currently contains zero `console.` calls; adding one risks a lint failure and breaks the tree's convention. The omission is proven by the tests above, and plan 3's compose layer is where report-generation logging belongs.

- [ ] **Step 5: Fix the settings hint copy**

In `app/app/[churchId]/settings/settings-form.tsx`, replace the `TEXTAREA_FIELDS` entries (currently lines 47–50):

```tsx
const TEXTAREA_FIELDS = [
  ['leadership_history', 'Leadership history', 'Tenure changes, transitions, or anything about the leadership story that context helps a reader understand. Please don’t name individuals — the report is anonymous, and anything naming a participant is left out of it.'],
  ['consultant_notes', 'Consultant notes', 'Anything else the report should know — e.g. current initiatives, recent changes, or context the questions don’t capture. Please don’t name individuals — the report is anonymous, and anything naming a participant is left out of it.'],
] as const
```

Two things changed, both deliberate: the phrase *"who took the assessment (roles)"* is gone, because it actively invited the exact content the guard now strips; and each hint states the consequence, so a field silently vanishing from the report is not a mystery. **Keep the typographic apostrophe `’`** — it matches the surrounding copy.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/report/facts.test.ts`
Expected: PASS, including the 5 new cases.

- [ ] **Step 7: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **987** tests across **168** files (Task 2's 982 + 5 new in an existing file).

Run: `npx eslint lib/report/facts.ts "app/app/[churchId]/settings/settings-form.tsx"`
Expected: clean. Both paths **are** linted — unlike `lib/ai/**`, lint is real evidence here.

- [ ] **Step 8: Commit**

In-scope files for the controller's commit (bracket path — needs `GIT_LITERAL_PATHSPECS=1` and quoting):

```
lib/report/facts.ts
app/app/[churchId]/settings/settings-form.tsx
tests/report/facts.test.ts
```

Message: `feat(report): guard profile free text against respondent names and add theme verbatims`

---

### Task 4: Clustering schema, row types, and the deterministic projection

**Files:**
- Create: `lib/ai/themes.ts` (schema + pure helpers only — the OpenAI call is Task 6)
- Test: `tests/ai/themes-index.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (Tasks 5 and 6 both depend on these exact names):
  - `interface ReflectionRow { item_id: string; respondent_key: string; text: string }`
  - `interface IndexedReflection { index: string; item_id: string; text: string }`
  - `interface IndexedReflections { rows: IndexedReflection[]; owners: Map<string, string> }`
  - `indexReflections(rows: readonly ReflectionRow[]): IndexedReflections`
  - `reflectionWriterCount(rows: readonly ReflectionRow[]): number`
  - `ThemesSchema` (Zod), `type ParsedTheme`, `type ParsedThemes`

⚠️ **Do not add an OpenAI import in this task.** Task 6 appends the async entry point to the same file. Keeping the call out of this task is what makes the projection independently testable with no mocking.

- [ ] **Step 1: Write the failing test**

Create `tests/ai/themes-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { indexReflections, reflectionWriterCount, type ReflectionRow } from '../../lib/ai/themes';

const rows: ReflectionRow[] = [
  { item_id: 'b1', respondent_key: 'p2', text: 'zebra' },
  { item_id: 'a1', respondent_key: 'p1', text: 'banana' },
  { item_id: 'a1', respondent_key: 'p3', text: 'apple' },
];

describe('indexReflections', () => {
  it('sorts by item_id then lexicographic text', () => {
    expect(indexReflections(rows).rows.map((r) => [r.item_id, r.text])).toEqual([
      ['a1', 'apple'],
      ['a1', 'banana'],
      ['b1', 'zebra'],
    ]);
  });

  it('assigns r1..rN in sorted order', () => {
    expect(indexReflections(rows).rows.map((r) => r.index)).toEqual(['r1', 'r2', 'r3']);
  });

  it('maps each index back to its respondent key, server-side', () => {
    const { owners } = indexReflections(rows);
    expect(owners.get('r1')).toBe('p3');
    expect(owners.get('r2')).toBe('p1');
    expect(owners.get('r3')).toBe('p2');
  });

  it('projects exactly index/item_id/text — the respondent key cannot ride along', () => {
    // This is the structural proof behind the whole anonymity design: the payload Task 6
    // sends is built from `rows`, and `rows` has no field that could carry identity. An
    // edit that serializes the ReflectionRow[] instead breaks this test.
    for (const r of indexReflections(rows).rows) {
      expect(Object.keys(r).sort()).toEqual(['index', 'item_id', 'text']);
    }
  });

  it('returns empty structures for empty input', () => {
    const { rows: out, owners } = indexReflections([]);
    expect(out).toEqual([]);
    expect(owners.size).toBe(0);
  });

  it('does not mutate the caller array', () => {
    const input = [...rows];
    indexReflections(input);
    expect(input[0]!.text).toBe('zebra');
  });
});

describe('reflectionWriterCount', () => {
  it('counts distinct respondent keys, not rows', () => {
    // P3's pool is distinct reflection-WRITERS. Three rows written by two people is a
    // pool of two, which is why this cannot be rows.length.
    expect(
      reflectionWriterCount([
        { item_id: 'a1', respondent_key: 'p1', text: 'x' },
        { item_id: 'a2', respondent_key: 'p1', text: 'y' },
        { item_id: 'a1', respondent_key: 'p2', text: 'z' },
      ]),
    ).toBe(2);
  });

  it('is 0 for no rows', () => {
    expect(reflectionWriterCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai/themes-index.test.ts`
Expected: FAIL — cannot resolve `../../lib/ai/themes`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/themes.ts`:

```ts
import { z } from 'zod/v4';

/**
 * GPT task: reflection clustering.
 *
 * ⚠️ This file and lib/ai/theme-gates.ts are the ONLY two files under lib/ai/** permitted to
 * touch raw reflection text, and only this one may place it in a model payload. That boundary
 * is pinned by tests/outreach/ai-exclusion.test.ts — read the contract table at the top of
 * docs/superpowers/plans/2026-08-10-final-report-2-clustering.md before widening it.
 *
 * ⚠️ lib/ai/** is under eslint globalIgnores (eslint.config.mjs:12). A green lint says nothing
 * about this file. tsc and vitest are the gates.
 */

/**
 * One reflection as the SERVER holds it. `respondent_key` is opaque to this module — the
 * caller (plan 3's generation wiring) passes Response.respondent_id, the stable identity,
 * NOT respondent_label, which is display-only and may collide across two different people.
 * Counting on labels would undercount a shared display name and weaken the k>=3 gate.
 *
 * `respondent_key` MUST NOT reach the model. It does not, structurally: the payload is built
 * from IndexedReflection[], which has no field that could carry it.
 */
export interface ReflectionRow {
  item_id: string;
  respondent_key: string;
  text: string;
}

/** The model-facing projection. Opaque index, the prompting item, the text. Nothing else. */
export interface IndexedReflection {
  index: string;
  item_id: string;
  text: string;
}

export interface IndexedReflections {
  /** Sent to the model. */
  rows: IndexedReflection[];
  /** Kept server-side: index -> respondent_key. The gate recomputes support counts from this. */
  owners: Map<string, string>;
}

/**
 * Sort by (item_id, lexicographic text), then assign opaque indices r1..rN.
 *
 * The ordering is fixed rather than input-order so the same set of reflections always
 * produces the same payload and the same indices — the report cache key (plan 3's
 * report-hash.ts) depends on that being reproducible.
 *
 * Tie-break idiom matches lib/report/facts.ts:140.
 */
export function indexReflections(rows: readonly ReflectionRow[]): IndexedReflections {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0) ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );

  const out: IndexedReflection[] = [];
  const owners = new Map<string, string>();
  sorted.forEach((row, i) => {
    const index = `r${i + 1}`;
    out.push({ index, item_id: row.item_id, text: row.text });
    owners.set(index, row.respondent_key);
  });
  return { rows: out, owners };
}

/**
 * P3's verbatim pool: distinct reflection-WRITING respondents, which is deliberately stricter
 * than the run's respondent count (lib/report/facts.ts:156). If only two people wrote
 * reflections, a verbatim identifies among two even when thirty answered numerically.
 */
export function reflectionWriterCount(rows: readonly ReflectionRow[]): number {
  return new Set(rows.map((r) => r.respondent_key)).size;
}

/**
 * One clustered theme as the model returns it. Every field here is a CLAIM, not a fact:
 * lib/ai/theme-gates.ts recomputes support from `owners` and verifies verbatims against
 * source text. Nothing on this object is trusted downstream.
 *
 * `verbatim_candidates` is `.nullable()`, never `.optional()`: OpenAI strict structured
 * outputs put every property in `required`, so an absent optional comes back as null.
 * Same discipline as ReportBlocksSchema in lib/ai/prose.ts.
 */
const ThemeSchema = z.object({
  label: z.string(),
  gloss: z.string(),
  support_indices: z.array(z.string()),
  item_ids: z.array(z.string()),
  verbatim_candidates: z.array(z.string()).nullable(),
});

export const ThemesSchema = z.object({
  themes: z.array(ThemeSchema),
  /** The "what they love about this church" theme, rendered last in S8 when present. */
  affection_theme: ThemeSchema.nullable(),
});

export type ParsedTheme = z.infer<typeof ThemeSchema>;
export type ParsedThemes = z.infer<typeof ThemesSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ai/themes-index.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **995** tests across **169** files (Task 3's 987 + 8 new, in 1 new file).

⚠️ Do **not** run eslint on `lib/ai/themes.ts` and report it as evidence — that path is under globalIgnores and will report clean no matter what the file contains.

- [ ] **Step 6: Commit**

In-scope files for the controller's commit:

```
lib/ai/themes.ts
tests/ai/themes-index.test.ts
```

Message: `feat(ai): add clustering schema and deterministic reflection projection`

---

### Task 5: The theme gate

**Files:**
- Create: `lib/ai/theme-gates.ts`
- Test: `tests/ai/theme-gates.test.ts`

**Interfaces:**
- Consumes: `ParsedTheme`, `ParsedThemes` from `lib/ai/themes` (Task 4); `containsRespondentLabel` from `lib/report/anonymity` (Task 1); `ThemeClusterFact` from `lib/report/facts` — **Task 3 already added its required `verbatims: string[]`, so implement against that shape and expect a clean `tsc`.**
- Produces (Task 6 depends on these exact names):
  - `interface GateContext { owners: ReadonlyMap<string, string>; sourceTexts: readonly string[]; labels: readonly string[]; validItemIds: ReadonlySet<string>; writerCount: number }`
  - `methodologyItemIds(methodology: Methodology): Set<string>`
  - `gateTheme(theme: ParsedTheme, ctx: GateContext): ThemeClusterFact | null`
  - `gateThemes(parsed: ParsedThemes, ctx: GateContext): ThemeClusterFact[]`
  - `MIN_SUPPORT`, `MIN_WRITERS_FOR_VERBATIM`, `MAX_VERBATIM_CHARS`

`ThemeClusterFact` already carries `verbatims` at this point — Task 3 added it — so this task's `tsc` boundary is clean. No task in this plan ends on a known type error. If `tsc` reports `Property 'verbatims' is missing in type … but required in type 'ThemeClusterFact'`, Task 3 did not land — stop and report it; **do not "fix" it by dropping `verbatims` from the return.**

- [ ] **Step 1: Write the failing test**

Create `tests/ai/theme-gates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  gateTheme,
  gateThemes,
  methodologyItemIds,
  MAX_VERBATIM_CHARS,
  type GateContext,
} from '../../lib/ai/theme-gates';
import type { ParsedTheme } from '../../lib/ai/themes';

const theme = (over: Partial<ParsedTheme> = {}): ParsedTheme => ({
  label: 'Communication gaps',
  gloss: 'People say decisions are not explained.',
  support_indices: ['r1', 'r2', 'r3'],
  item_ids: ['i1'],
  verbatim_candidates: null,
  ...over,
});

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  owners: new Map([
    ['r1', 'p1'],
    ['r2', 'p2'],
    ['r3', 'p3'],
    ['r4', 'p1'],
  ]),
  sourceTexts: ['we never hear why decisions get made', 'nobody explains the plan'],
  labels: ['Priscilla Vandermeer'],
  validItemIds: new Set(['i1', 'i2']),
  writerCount: 10,
  ...over,
});

describe('gateTheme — support (k>=3, server-computed)', () => {
  it('accepts a theme with 3 distinct supporting respondents', () => {
    const out = gateTheme(theme(), ctx());
    expect(out).not.toBeNull();
    expect(out!.support_count).toBe(3);
  });

  it('drops a theme with only 2 distinct supporters', () => {
    expect(gateTheme(theme({ support_indices: ['r1', 'r2'] }), ctx())).toBeNull();
  });

  it('counts distinct respondents, not indices', () => {
    // r1 and r4 are the same person (p1). Three indices, two people — must drop.
    expect(gateTheme(theme({ support_indices: ['r1', 'r4', 'r2'] }), ctx())).toBeNull();
  });

  it('ignores an index the model invented', () => {
    // 'r99' has no owner, so it contributes nothing. Never trust the model's indices.
    expect(gateTheme(theme({ support_indices: ['r1', 'r2', 'r99'] }), ctx())).toBeNull();
  });
});

describe('gateTheme — item ids', () => {
  it('drops a theme naming an item outside the effective methodology', () => {
    expect(gateTheme(theme({ item_ids: ['i1', 'nope'] }), ctx())).toBeNull();
  });

  it('drops a theme with no item ids at all', () => {
    // Vacuously "all ids valid", but S8 groups themes by the item that prompted them, so an
    // unattributable theme has nowhere to render. Drop rather than ship an orphan.
    expect(gateTheme(theme({ item_ids: [] }), ctx())).toBeNull();
  });
});

describe('gateTheme — respondent-label ban', () => {
  it('drops a theme whose label names a respondent', () => {
    expect(gateTheme(theme({ label: 'Priscilla Vandermeer is frustrated' }), ctx())).toBeNull();
  });

  it('drops a theme whose gloss names a respondent', () => {
    expect(gateTheme(theme({ gloss: 'As Priscilla Vandermeer put it, nobody knows.' }), ctx())).toBeNull();
  });

  it('matches labels of ALL run respondents, not only flagged ones', () => {
    // Wider than lib/ai/prose.ts's check 5, which scopes to disagreement_flags. Deliberate:
    // spec line 71. The list handed in here is every respondent in the run.
    expect(
      gateTheme(theme({ label: 'Dana Okafor speaks up' }), ctx({ labels: ['Dana Okafor'] })),
    ).toBeNull();
  });
});

describe('gateTheme — verbatims', () => {
  const withCandidate = theme({ verbatim_candidates: ['nobody explains the plan'] });

  it('keeps an exact substring of a source reflection at n>=8', () => {
    expect(gateTheme(withCandidate, ctx())!.verbatims).toEqual(['nobody explains the plan']);
  });

  it('emits no verbatims below the n>=8 writer pool but keeps the theme', () => {
    const out = gateTheme(withCandidate, ctx({ writerCount: 7 }));
    expect(out).not.toBeNull();
    expect(out!.verbatims).toEqual([]);
  });

  it('drops a candidate that is not a substring of any source text', () => {
    const out = gateTheme(theme({ verbatim_candidates: ['nobody explains the strategy'] }), ctx());
    expect(out!.verbatims).toEqual([]);
  });

  it('drops a candidate over the length ceiling', () => {
    const long = 'x'.repeat(MAX_VERBATIM_CHARS + 1);
    const out = gateTheme(theme({ verbatim_candidates: [long] }), ctx({ sourceTexts: [long] }));
    expect(out!.verbatims).toEqual([]);
  });

  it('drops a labelled candidate but keeps the theme and its clean candidates', () => {
    const out = gateTheme(
      theme({ verbatim_candidates: ['Priscilla Vandermeer said no', 'nobody explains the plan'] }),
      ctx({ sourceTexts: ['Priscilla Vandermeer said no', 'nobody explains the plan'] }),
    );
    expect(out!.verbatims).toEqual(['nobody explains the plan']);
  });

  it('treats a null candidate list as no verbatims', () => {
    expect(gateTheme(theme(), ctx())!.verbatims).toEqual([]);
  });
});

describe('gateThemes', () => {
  it('drops failing themes individually and keeps the rest', () => {
    const out = gateThemes(
      { themes: [theme(), theme({ label: 'thin', support_indices: ['r1'] })], affection_theme: null },
      ctx(),
    );
    expect(out.map((t) => t.label)).toEqual(['Communication gaps']);
  });

  it('appends a passing affection theme last', () => {
    const out = gateThemes(
      { themes: [theme()], affection_theme: theme({ label: 'They love the people here' }) },
      ctx(),
    );
    expect(out.map((t) => t.label)).toEqual(['Communication gaps', 'They love the people here']);
  });

  it('drops a failing affection theme without touching the others', () => {
    const out = gateThemes(
      { themes: [theme()], affection_theme: theme({ label: 'thin', support_indices: ['r1'] }) },
      ctx(),
    );
    expect(out.map((t) => t.label)).toEqual(['Communication gaps']);
  });

  it('returns an empty array when every theme fails', () => {
    expect(gateThemes({ themes: [theme({ support_indices: [] })], affection_theme: null }, ctx())).toEqual([]);
  });
});

describe('methodologyItemIds', () => {
  it('collects item ids across every category', () => {
    const methodology = {
      questions: {
        categories: [
          { id: 'c1', items: [{ id: 'i1' }, { id: 'i2' }] },
          { id: 'c2', items: [{ id: 'i3' }] },
        ],
      },
    };
    expect([...methodologyItemIds(methodology as never)].sort()).toEqual(['i1', 'i2', 'i3']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai/theme-gates.test.ts`
Expected: FAIL — cannot resolve `../../lib/ai/theme-gates`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/theme-gates.ts`:

```ts
import { containsRespondentLabel } from '../report/anonymity';
import type { Methodology } from '../methodology/schema';
import type { ThemeClusterFact } from '../report/facts';
import type { ParsedTheme, ParsedThemes } from './themes';

/**
 * Theme gates. Pure, no I/O — the model's output is a set of CLAIMS and this file is where
 * each one is either re-derived from server state or thrown away.
 *
 * Modelled on lib/ai/prose.ts's passesFactCheck, with one deliberate widening: prose.ts
 * scopes its anonymity check to disagreement_flags[].respondents[].label and says so at
 * :117-121. This gate matches against ALL run respondents' labels (spec line 71), because
 * a clustered theme is built from free text any respondent wrote, not from the engine's
 * flagged subset. That is intentional, not an inconsistency with prose.ts.
 *
 * ⚠️ This file may hold raw reflection text (sourceTexts) — it is the second of exactly two
 * files under lib/ai/** permitted to. It must never place that text in a model payload;
 * only lib/ai/themes.ts talks to the model.
 *
 * ⚠️ lib/ai/** is under eslint globalIgnores. Lint proves nothing here.
 */

/** Locked decision 5: a theme prints only with >=3 distinct supporting respondents. */
export const MIN_SUPPORT = 3;
/** P3: distinct reflection-WRITING respondents, stricter than the run respondent count. */
export const MIN_WRITERS_FOR_VERBATIM = 8;
export const MAX_VERBATIM_CHARS = 200;

export interface GateContext {
  /** index -> respondent_key, from indexReflections(). The ONLY source of support truth. */
  owners: ReadonlyMap<string, string>;
  /** Raw source reflection texts, for exact substring verification of verbatims. */
  sourceTexts: readonly string[];
  /** Display labels of ALL respondents in the run. */
  labels: readonly string[];
  /** Item ids in the effective methodology. */
  validItemIds: ReadonlySet<string>;
  /** reflectionWriterCount(rows). */
  writerCount: number;
}

export function methodologyItemIds(methodology: Methodology): Set<string> {
  const ids = new Set<string>();
  for (const category of methodology.questions.categories) {
    for (const item of category.items) ids.add(item.id);
  }
  return ids;
}

/**
 * Gate one theme. Returns the fact to ship, or null to drop this theme (and only this one).
 *
 * Whole-theme failures: support, item ids, labels. Candidate-level failures drop the single
 * verbatim and keep the theme — a theme is still worth printing without a quote.
 */
export function gateTheme(theme: ParsedTheme, ctx: GateContext): ThemeClusterFact | null {
  // 1. k>=3 DISTINCT respondents, recomputed from the server-side map. An index the model
  //    invented has no owner and contributes nothing — silently ignored rather than treated
  //    as an error, because one bad index should not cost a theme that is otherwise supported.
  const supporters = new Set<string>();
  for (const index of theme.support_indices) {
    const owner = ctx.owners.get(index);
    if (owner) supporters.add(owner);
  }
  if (supporters.size < MIN_SUPPORT) return null;

  // 2. Item ids must exist in the effective methodology. An empty list is vacuously valid but
  //    unattributable — S8 groups by the prompting item, so an orphan theme has nowhere to go.
  if (theme.item_ids.length === 0) return null;
  for (const id of theme.item_ids) {
    if (!ctx.validItemIds.has(id)) return null;
  }

  // 3. No respondent label in the label or gloss.
  if (containsRespondentLabel(theme.label, ctx.labels)) return null;
  if (containsRespondentLabel(theme.gloss, ctx.labels)) return null;

  // 4. Verbatims. Gated as a group by the P3 writer pool, then individually.
  //    The substring test is CASE-SENSITIVE and exact: a re-cased or re-punctuated quote is
  //    a paraphrase the model authored, not something a person wrote, and the whole point of
  //    a verbatim is that a human said exactly that. Trim the candidate only (models pad
  //    whitespace); the source text stays authoritative.
  const verbatims: string[] = [];
  if (ctx.writerCount >= MIN_WRITERS_FOR_VERBATIM) {
    for (const candidate of theme.verbatim_candidates ?? []) {
      const v = candidate.trim();
      if (!v || v.length > MAX_VERBATIM_CHARS) continue;
      if (!ctx.sourceTexts.some((t) => t.includes(v))) continue;
      if (containsRespondentLabel(v, ctx.labels)) continue;
      verbatims.push(v);
    }
  }

  return {
    label: theme.label,
    gloss: theme.gloss,
    // Server-computed. The model does not report a count and would not be believed if it did.
    support_count: supporters.size,
    item_ids: [...theme.item_ids],
    verbatims,
  };
}

/** Gate every theme; failures drop individually. The affection theme renders last (spec S8). */
export function gateThemes(parsed: ParsedThemes, ctx: GateContext): ThemeClusterFact[] {
  const out: ThemeClusterFact[] = [];
  for (const theme of parsed.themes) {
    const gated = gateTheme(theme, ctx);
    if (gated) out.push(gated);
  }
  if (parsed.affection_theme) {
    const gated = gateTheme(parsed.affection_theme, ctx);
    if (gated) out.push(gated);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ai/theme-gates.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 5: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **1015** tests across **170** files (Task 4's 995 + 20 new, in 1 new file).

⚠️ Do not run eslint on `lib/ai/theme-gates.ts` as evidence — globalIgnores.

- [ ] **Step 6: Commit**

In-scope files for the controller's commit:

```
lib/ai/theme-gates.ts
tests/ai/theme-gates.test.ts
```

Message: `feat(ai): add theme gates for support, item ids, labels and verbatims`

---


### Task 6: `clusterThemes()` — the OpenAI entry point

**Files:**
- Modify: `lib/ai/themes.ts` (**append** — do not rewrite or reorder what Task 4 wrote)
- Test: `tests/ai/themes-generate.test.ts`

**Interfaces:**
- Consumes: `ReflectionRow`, `indexReflections`, `reflectionWriterCount`, `ThemesSchema` from this same file (Task 4); `gateThemes`, `methodologyItemIds` from `lib/ai/theme-gates` (Task 5); `ThemeClusterFact` from `lib/report/facts` (Task 3).
- Produces: `clusterThemes(rows: readonly ReflectionRow[], methodology: Methodology, labels: readonly string[]): Promise<ThemeClusterFact[] | null>` — plan 3's `compose.ts` is the only caller, and plan 2 does not write it.

Three parameters, and no more: `writerCount`, `owners`, `sourceTexts` and `validItemIds` are all derived inside the function, so a caller physically cannot hand in a writer count that disagrees with the rows it passed.

⚠️ **This task APPENDS to `lib/ai/themes.ts`.** Task 4's schema, types and pure helpers stay exactly as they are. Adding the `openai` imports at the bottom of the file rather than the top matches the established idiom in `lib/ai/prose.ts:132-134`.

- [ ] **Step 1: Write the failing test**

Create `tests/ai/themes-generate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMethodology } from '../../lib/methodology/load';
import type { ReflectionRow } from '../../lib/ai/themes';

// vi.hoisted so `mockParse` exists before the hoisted vi.mock factory runs.
// Idiom copied from tests/ai/prose-generate.test.ts:7-17 — do not invent a new one.
const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(() => ({ responses: { parse: mockParse } })),
}));
vi.mock('openai/helpers/zod', () => ({
  zodTextFormat: vi.fn(() => ({ type: 'json_schema' })),
}));

// Imported AFTER the mocks are declared (vitest hoists vi.mock above imports regardless).
import { clusterThemes } from '../../lib/ai/themes';

const m = loadMethodology();
const itemId = m.questions.categories[0]!.items[0]!.id;

// Respondent keys are deliberately loud and unlike anything else in the payload, so the
// "no identity on the wire" assertion below is a real check and not a lucky miss.
const rows: ReflectionRow[] = [
  { item_id: itemId, respondent_key: 'RESPONDENT-ALPHA', text: 'nobody explains the plan' },
  { item_id: itemId, respondent_key: 'RESPONDENT-BRAVO', text: 'we never hear why decisions get made' },
  { item_id: itemId, respondent_key: 'RESPONDENT-CHARLIE', text: 'communication is thin' },
];

// Sorted by (item_id, text) the rows become r1='communication is thin',
// r2='nobody explains the plan', r3='we never hear why...' — three distinct owners.
const theme = () => ({
  label: 'Communication gaps',
  gloss: 'People say decisions are not explained.',
  support_indices: ['r1', 'r2', 'r3'],
  item_ids: [itemId],
  verbatim_candidates: null,
});
const parsed = () => ({ themes: [theme()], affection_theme: null });

describe('clusterThemes', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('returns [] without calling the model when there are no reflections', async () => {
    expect(await clusterThemes([], m, [])).toEqual([]);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('returns gated facts on the happy path', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: parsed() });
    expect(await clusterThemes(rows, m, ['Priscilla Vandermeer'])).toEqual([
      {
        label: 'Communication gaps',
        gloss: 'People say decisions are not explained.',
        support_count: 3,
        item_ids: [itemId],
        verbatims: [],
      },
    ]);

    // Pins the SDK call shape, mirroring tests/ai/prose-generate.test.ts:58-69: model from
    // env-with-default, the 6000 budget this task needs, low reasoning effort, and the exact
    // retry/timeout config. `text.format` asserts against this file's zodTextFormat stub.
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1',
        max_output_tokens: 6000,
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema' } },
      }),
      { timeout: 30000, maxRetries: 0 },
    );
    const callArgs = mockParse.mock.calls[0]![0];
    expect(callArgs).not.toHaveProperty('temperature');
    expect(callArgs).not.toHaveProperty('top_p');
  });

  it('sends the projection and no respondent identity', async () => {
    // The anonymity invariant asserted against the REAL serialized payload, not against the
    // projection helper. An edit that serializes ReflectionRow[] instead fails here, and so
    // does one that helpfully appends the label list to the prompt.
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: parsed() });
    await clusterThemes(rows, m, ['Priscilla Vandermeer']);
    const payload = JSON.stringify(mockParse.mock.calls[0]![0]);
    expect(payload).not.toContain('RESPONDENT-');
    expect(payload).not.toContain('respondent_key');
    expect(payload).not.toContain('Priscilla Vandermeer');
    // ...while the reflection text itself IS sent — otherwise this test would pass vacuously
    // against a function that sends nothing at all.
    expect(payload).toContain('nobody explains the plan');
  });

  it('returns null and logs a reason when the response is incomplete', async () => {
    mockParse.mockResolvedValue({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_parsed: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toBeNull();
      const messages = warn.mock.calls.map((c) => c.join(' '));
      expect(messages.some((msg) => msg.includes('[report] themes:') && msg.includes('max_output_tokens'))).toBe(true);
      // Reasons only, never content — the payload here is raw reflection text.
      for (const msg of messages) expect(msg).not.toContain('nobody explains the plan');
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null when output_parsed is null', async () => {
    mockParse.mockResolvedValue({ status: 'completed', output_parsed: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns [] rather than null when every theme fails the gates', async () => {
    // A fully gated-out run is a determinate verdict, not a failure: a retry would gate the
    // same way, so plan 3 should persist [] and stop. null means "try me again".
    mockParse.mockResolvedValue({
      status: 'completed',
      output_parsed: { themes: [{ ...theme(), support_indices: ['r1'] }], affection_theme: null },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null when responses.parse throws (never throws)', async () => {
    mockParse.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await clusterThemes(rows, m, [])).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai/themes-generate.test.ts`
Expected: FAIL — `clusterThemes` is not exported from `../../lib/ai/themes`.

- [ ] **Step 3: Append the implementation**

Append to the **end** of `lib/ai/themes.ts`:

```ts
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Methodology } from '../methodology/schema';
import type { ThemeClusterFact } from '../report/facts';
import { gateThemes, methodologyItemIds } from './theme-gates';

const SYSTEM_PROMPT =
  'You are given short written reflections from a church health assessment. Each one has an ' +
  'opaque index and the id of the question that prompted it. Group them into the themes that ' +
  'recur across them. For each theme give a short label, a one-sentence gloss, the indices of ' +
  'every reflection supporting it, and the question ids those reflections came from. Use only ' +
  'indices you were given; never invent one. Also return one affection theme — what people say ' +
  'they love about this church — or null if none is present. Anything you put in ' +
  'verbatim_candidates must be copied character for character from a reflection: never ' +
  'paraphrase, re-punctuate, or re-case it. Do not name any individual. Write in this register: ' +
  'plain words, warm but precise. No em-dashes. No churchy clichés. Sentence case. Active voice. ' +
  'Return only the JSON.';

/**
 * Cluster reflections into gated themes. NEVER throws.
 *
 * Return contract, and the difference matters to plan 3's caching:
 *   - `ThemeClusterFact[]` (possibly empty) — a determinate answer. `[]` means the model
 *     answered and nothing survived the gates; retrying produces the same verdict, so the
 *     caller should persist it rather than re-call.
 *   - `null` — the task failed (incomplete, unparseable, or threw). The caller falls back to
 *     the existing per-area voices lists (lib/report/view.ts buildOutreachVoices) and may
 *     retry later. Building a second fallback here is NOT this plan's job.
 *
 * Every failure path logs `[report] themes: <reason>` so "AI is broken" stays distinguishable
 * from "AI is off" (which logs nothing at all). Reasons only — never the payload, the parsed
 * output, a theme, a verbatim or an error object. The payload here is raw reflection text,
 * which makes this stricter than prose.ts's rationale (:167-172), not looser.
 */
export async function clusterThemes(
  rows: readonly ReflectionRow[],
  methodology: Methodology,
  labels: readonly string[],
): Promise<ThemeClusterFact[] | null> {
  // Nothing to cluster is not a failure: no API call, no log, and the caller gets a
  // determinate empty answer it can cache like any other.
  if (rows.length === 0) return [];

  try {
    const { rows: indexed, owners } = indexReflections(rows);
    const client = new OpenAI(); // reads OPENAI_API_KEY from env (server-only)
    const model = process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1';
    const response = await client.responses.parse(
      {
        model,
        // Higher than prose.ts's 4000 because this emits an array of themes over up to ten
        // reflection items rather than one fixed block — and gpt-5.x bills reasoning tokens
        // against this same budget, so exhausting it yields status 'incomplete' (below).
        max_output_tokens: 6000,
        // Clustering short texts, not a reasoning task.
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            // `indexed`, NEVER `rows`. This single line is the whole anonymity design:
            // ReflectionRow carries respondent_key and IndexedReflection cannot, so identity
            // cannot reach the model without an edit right here. tests/outreach/
            // ai-exclusion.test.ts pins it in Task 7. `labels` is a gate input only — it is
            // deliberately never sent, because naming the people to avoid would name them.
            content: 'Reflections to cluster:\n' + JSON.stringify(indexed, null, 2),
          },
        ],
        text: { format: zodTextFormat(ThemesSchema, 'reflection_themes') },
      },
      { timeout: 30000, maxRetries: 0 },
    );

    // gpt-5.x bills reasoning tokens against max_output_tokens, so the budget can be
    // exhausted before any JSON is emitted — status 'incomplete' with output_parsed null.
    // Without its own reason string this lands in the generic branch below and reads as a
    // schema miss. Both values of incomplete_details.reason ('max_output_tokens' |
    // 'content_filter') are fixed enum strings, never report content; the field is nullable.
    if (response.status === 'incomplete') {
      console.warn(
        `[report] themes: response incomplete (${response.incomplete_details?.reason ?? 'reason unreported'}); falling back to the per-area voices lists`,
      );
      return null;
    }

    const parsed = response.output_parsed;
    if (!parsed) {
      console.warn('[report] themes: model returned no parsed output; falling back to the per-area voices lists');
      return null;
    }

    // Everything the model claimed is re-derived here. sourceTexts comes from `rows` (the
    // server's copy), not from anything the model echoed back.
    const gated = gateThemes(parsed, {
      owners,
      sourceTexts: rows.map((r) => r.text),
      labels,
      validItemIds: methodologyItemIds(methodology),
      writerCount: reflectionWriterCount(rows),
    });

    if (gated.length === 0) {
      console.warn('[report] themes: no theme survived the gates');
      return [];
    }
    return gated;
  } catch (err) {
    console.warn('[report] themes: request failed:', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ai/themes-generate.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Confirm Task 4's half of the file is untouched**

Run: `npx vitest run tests/ai/themes-index.test.ts`
Expected: PASS — 8 tests, unchanged. (This task appends; if the projection tests moved, something was rewritten that should not have been.)

- [ ] **Step 6: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **1022** tests across **171** files (Task 5's 1015 + 7 new, in 1 new file).

⚠️ Do **not** run eslint on `lib/ai/themes.ts` or `tests/ai/themes-generate.test.ts` as evidence — both are under globalIgnores and report clean regardless of contents.

- [ ] **Step 7: Commit**

In-scope files for the controller's commit:

```
lib/ai/themes.ts
tests/ai/themes-generate.test.ts
```

Message: `feat(ai): add reflection clustering entry point`

⚠️ **Controller:** this commit appends to a file created in Task 4. Verify with `git diff -U0 -- lib/ai/themes.ts | grep '^-'` that **nothing** was deleted — the projection, the schema and the row types must all survive byte-identical.

---

### Task 7: ai-exclusion positive pins — the other half of the contract

**Files:**
- Modify: `tests/outreach/ai-exclusion.test.ts` (**append a fourth describe block**; blocks 1–3 untouched)

**Interfaces:**
- Consumes: `lib/ai/themes.ts` (Tasks 4 + 6) and `lib/ai/theme-gates.ts` (Task 5) — read as source text from disk, not imported.
- Produces: nothing. This is the closing half of the contract Task 2 opened.

Task 2 proved reflections and verbatims reach **no other** file under `lib/ai/**`. This proves the two allowlisted files use them the way the spec's anonymity model requires (spec lines 104–110). It could not run in Task 2 because the files it reads did not exist yet — that is the only reason it is a separate task.

- [ ] **Step 1: Append the fourth describe block**

Append to the end of `tests/outreach/ai-exclusion.test.ts`:

```ts
/**
 * The positive half of the rewritten contract (plan 2, Task 7). Task 2's allowlist is the
 * negative half: reflections and verbatims reach no file but these two. This block checks how
 * those two files use them — spec lines 104-110, the anonymity model.
 *
 * Source-text assertions rather than behavioural ones on purpose: the behaviour is already
 * covered by tests/ai/themes-generate.test.ts, but a *reviewer* reading a diff needs a
 * tripwire that fires on the shape of the edit, not only on its runtime effect.
 */
describe('the clustering task transmits the projection, not the rows', () => {
  const themesSrc = stripTs(readFileSync('lib/ai/themes.ts', 'utf8'));
  const gatesSrc = stripTs(readFileSync('lib/ai/theme-gates.ts', 'utf8'));

  it('serializes the indexed projection and never the raw rows', () => {
    // ReflectionRow carries respondent_key; IndexedReflection structurally cannot. Swapping
    // which one is serialized is the single edit that would put identity in a model payload.
    expect(themesSrc).toContain('JSON.stringify(indexed');
    expect(themesSrc).not.toContain('JSON.stringify(rows');
  });

  it('names no respondent field anywhere in the model input construction', () => {
    // Scoped to the `input:` array, not the whole file: ReflectionRow's own declaration
    // legitimately names respondent_key, and a file-wide ban would forbid the type itself.
    const start = themesSrc.indexOf('input: [');
    expect(start).toBeGreaterThan(-1);
    const end = themesSrc.indexOf('text: {', start);
    expect(end).toBeGreaterThan(start);
    const inputBlock = themesSrc.slice(start, end);
    expect(inputBlock).not.toContain('respondent_key');
    expect(inputBlock).not.toContain('respondent_label');
    // The label list is a GATE input. Sending it — even as "avoid these names" — would put
    // every respondent's name in the prompt to protect them from being named.
    expect(inputBlock).not.toContain('labels');
  });

  it('keeps the gate off the wire — only themes.ts talks to the model', () => {
    // theme-gates.ts legitimately holds raw reflection text (sourceTexts) to substring-verify
    // verbatims. It must never transmit it: exactly one file in this tree calls the API.
    expect(gatesSrc.toLowerCase()).not.toContain('openai');
    expect(gatesSrc).not.toContain('responses.parse');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts`
Expected: PASS — **12 tests** (Task 2's 9 plus these 3).

- [ ] **Step 3: Prove the payload pin actually bites**

A tripwire that has never been seen to fail is not evidence. In `lib/ai/themes.ts`, temporarily change `JSON.stringify(indexed, null, 2)` to `JSON.stringify(rows, null, 2)`, then:

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts`
Expected: **FAIL** on `serializes the indexed projection and never the raw rows`.

Then **restore the line exactly** and re-run. Expected: PASS, 12 tests. Report both runs' real output, and confirm the restore with `npx vitest run tests/ai/themes-generate.test.ts` (7 passing) — the payload test there fails too if the revert was imperfect.

- [ ] **Step 4: Confirm blocks 1–3 are untouched**

Run: `grep -c "describe(" tests/outreach/ai-exclusion.test.ts`
Expected: `4` — the three pre-existing blocks plus this one.

Run: `grep -n "mapBody\|generateProse\|ALLOWED" tests/outreach/ai-exclusion.test.ts`
Expected: the `ALLOWED` constant and its pin from Task 2, the `mapBody` definition and its three uses, and the `generateProse` pin — all still present.

- [ ] **Step 5: Run the full gates**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: 0 failures; total **1025** tests across **171** files (Task 6's 1022 + 3 net new in an existing file).

- [ ] **Step 6: Commit**

In-scope files for the controller's commit:

```
tests/outreach/ai-exclusion.test.ts
```

Message: `test(outreach): pin the clustering payload projection`

⚠️ **Controller:** unlike Task 2, this commit is purely additive. `git diff -U0 -- tests/outreach/ai-exclusion.test.ts | grep '^-'` must return **nothing**. Any deletion here is a defect.

---

## Out of scope

Named explicitly so a reviewer does not read any of them as an omission.

- **No fallback module, and that is correct.** Spec line 71 says task failure falls back to the existing per-area voices lists. That fallback already exists — `buildOutreachVoices` at `lib/report/view.ts:224-260` — and *choosing* it is the caller's job. `clusterThemes` signals failure by returning `null`; plan 3's `compose.ts` routes that to the existing lists. Building a second fallback path here would create two implementations of one behaviour. **A "missing fallback" finding against this plan is not a defect.**
- **The clustering call site and all generation wiring** — including `app/app/[churchId]/diagnosis/page.tsx`, which strips every respondent identifier today at `:99-136` and would be where `ReflectionRow[]` is assembled. Spec line 135 puts generation wiring in plan 3. Plan 2 defines the interface plan 3 fills; it does not touch that file.
- **`lib/ai/sections.ts`, `lib/ai/section-gates.ts`, `lib/report/compose.ts`, `lib/report/fallback-sections.ts`, `lib/report/report-hash.ts`, `methodology/report.yaml`** — plan 3.
- **The `reports` table, `save_report`, and their pgTAP** — plan 3. **This plan adds no migration.**
- **The S8 renderer and every audience gate over verbatims** — plan 4. Plan 2 produces the structured `verbatims: string[]`; nothing renders it yet, which is why D1 makes the field required rather than optional.
- **Extending the PDF fail-closed guard** (`lib/report/pdf/render.ts:28-30`) — plan 5. It guards the `view` path today, that behaviour is correct and load-bearing, and it has nothing new to guard until plan 3 produces sections. **Do not touch it in this plan.**
- **`lib/ai/prose.ts`'s `[m5b]` log prefix** — the `[report]` prefix (D2) applies to new code only. Rewriting prose.ts's existing lines is churn in a file this plan otherwise does not open.
- **`tests/outreach/shared-exclusion.test.ts`** — a separate pin on the share path (P5 keeps the share page theme-free). Not rewritten, not weakened.
