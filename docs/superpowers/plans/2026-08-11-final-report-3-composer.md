# Final Report Redesign — Plan 3 (Composer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the settled execution mode — plans 1 and 2 both used it) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the report composer — `methodology/report.yaml`, the 7 GPT section calls with their gates, the deterministic per-section fallbacks, the `reports` table + `save_report` RPC, the `inputsHash`, and the generation wiring — so a complete 12-section executive report is generated, gated, and persisted for every diagnosis.

**Architecture:** Deterministic spine first (facts pack + clustered themes), then 7 small parallel `responses.parse` calls each with its own Zod schema and section-scoped gates, each failing independently to a deterministic fallback. `compose.ts` holds both halves: the generation orchestrator (called from `generateDiagnosis`) and the render-time persisted-or-fallback assembler (built and unit-tested here, wired to no page until plan 4).

**Tech Stack:** TypeScript, Next.js server actions, Zod 3.25.76 (`zod/v4` import path), `openai` SDK `responses.parse` + `zodTextFormat`, Supabase Postgres (RLS + `security definer` RPCs), Vitest, pgTAP.

**Specs:** `docs/superpowers/specs/2026-08-11-final-report-3-composer-design.md` (addendum, C1–C6) and `docs/superpowers/specs/2026-08-10-final-report-redesign-design.md` (parent, locked 1–6 + P1–P7). Neither is reopened by this plan.

## Global Constraints

- **No new dependencies.** zod stays pinned `3.25.76`; import from `zod/v4`.
- **No methodology version bumps.** `questions.yaml` stays `0.3.0`, `rules.yaml` stays `0.2.0`. `report.yaml` carries its own new `version`.
- **Nothing user-visible ships.** No page consumes the assembler in this plan; plan 4 does the swap. The existing 10-block diagnosis page and its M5b prose block stay live and untouched in behaviour.
- **`lib/ai/**` and `tests/ai/**` are under `eslint.config.mjs:12` globalIgnores.** A green lint proves nothing there. `tsc --noEmit` and vitest are the only real gates. `lib/report/**`, `tests/report/**`, `app/**`, `tests/outreach/**` ARE linted.
- **Logging is reasons-only.** Never log payloads, parsed output, section text, verbatims, church data, or error objects. Every AI failure logs `[report] section <id>: <reason>`; "AI is off" (`PROSE_MODE` unset) logs nothing at all. That distinction is a tested invariant.
- **⛔ Never run `npm run test:db`, `supabase db push`, or `supabase db reset`.** Natalie applies migrations. Write the migration and the pgTAP file; do not execute them.
- **⛔ Never merge, push, or force-push.** Commit locally only.
- **Git hygiene:** explicit paths only, never `git add -A`. Never stage `.claude/`, `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`, or `docs/superpowers/plans/2026-08-01-assessment-deadlines.md` (three long-standing never-staged entries). Bracket paths (`app/app/[churchId]/…`) need `GIT_LITERAL_PATHSPECS=1` and quoting. Commit messages are a **bare conventional-commit subject with NO trailer.**
- **Baseline to preserve:** `tsc --noEmit` exit 0; vitest 1027 tests / 171 files / 0 failures on `master` @ `a8e0086`.
- **`composeReport` never throws.** Every failure path resolves to that section's fallback.

## Two recon corrections to the addendum (apply these, not the addendum's wording)

1. **`ALLOWED` entries are basenames, not `lib/ai/`-prefixed paths.** `tests/outreach/ai-exclusion.test.ts:17` does `readdirSync('lib/ai', {recursive:true})`, whose entries are relative *to `lib/ai`* — the existing values are `['themes.ts', 'theme-gates.ts']`. The new entries are therefore `'sections.ts'` and `'section-gates.ts'`. Addendum §3's phrase "flat relative paths" is correct in intent (a nested `sub/sections.ts` cannot inherit the exemption) but its example strings would never match.
2. **`save_report` must resolve its run WITHOUT a status filter.** `save_diagnosis` (`supabase/migrations/20260716001100_rpc_save_diagnosis.sql`) selects `status = 'in_progress'` and then flips the run to `'complete'`. `save_report` runs *after* it in the same action, so an `in_progress` filter would find no run and raise on every single call. Resolve `order by created_at asc limit 1` with no status predicate — the same shape `actions.ts:69-75` already uses.

## File Structure

| File | Responsibility |
|---|---|
| `lib/report/anonymity.ts` (modify) | Gains `LabelSource` + `knownLabels`. `respondentLabels` survives as the primitive. |
| `lib/report/facts.ts` (modify) | `BuildFactsArgs.labelSource` replaces the internal `respondentLabels(responses)` derivation; guard narrows to the 8 free-text keys; `{kind:'redacted'}` omits those 8 outright. |
| `lib/ai/themes.ts` (modify) | `clusterThemes`' third parameter becomes `LabelSource`; `{kind:'redacted'}` is fail-closed. |
| `lib/methodology/schema.ts` (modify) | `ReportSchema` + `Report` type; `Methodology` gains `report`. |
| `lib/methodology/load.ts` (modify) | Parses `report.yaml`. |
| `methodology/report.yaml` (create) | Copy only: `version`, `style_spine`, 13 named `sections`, `banned_phrases`, `action_library`. |
| `lib/report/report-hash.ts` (create) | `reportInputsHash` per the parent spec's recipe. |
| `lib/report/fallback-sections.ts` (create) | Deterministic per-section fallbacks for all 12 sections + appendix. |
| `lib/report/view.ts` (modify) | Export `buildOutreachVoices` (one keyword) so S8's fallback can reach it. |
| `lib/ai/sections.ts` (create) | The typed section registry (id → Zod schema, facts-slice selector, token budget) and the 7 calls. |
| `lib/ai/section-gates.ts` (create) | The 6 gate families. |
| `lib/report/compose.ts` (create) | Generation orchestrator + render-time assembler. |
| `supabase/migrations/20260811000100_reports.sql` (create) | `reports` table + RLS. |
| `supabase/migrations/20260811000200_rpc_save_report.sql` (create) | `save_report` RPC. |
| `supabase/tests/reports.test.sql` (create) | pgTAP. |
| `app/app/[churchId]/actions.ts` (modify) | Second best-effort block after the existing M5b prose block. |
| `tests/outreach/ai-exclusion.test.ts` (modify) | Contract widened to the two new `lib/ai` files, with replacement positive assertions. |

## Task order and why

Tasks 1–3 are independent foundations. **Task 4 (the `ALLOWED` widening) must land before Task 6**, because `tests/outreach/ai-exclusion.test.ts:17` calls `readdirSync('lib/ai')` at *module scope*: a new `lib/ai/` file that appears before its allowlist entry is scanned as a guarded file. This is the same ordering constraint that forced "Task 2 before Task 4" in plan 2. Task 7 (gates) imports section types from Task 6. Task 8 needs 5, 6 and 7. Task 10 needs everything.

---

### Task 1: `LabelSource` — the label contract and the narrowed guard

Closes both anonymity requirements inherited from plan 2's final review (addendum §1.1, §1.2).

**Files:**
- Modify: `lib/report/anonymity.ts`
- Modify: `lib/report/facts.ts:92-101` (`BuildFactsArgs`), `:103-107` (`PROFILE_KEYS`), `:154-174` (the guard)
- Modify: `lib/ai/themes.ts:139-143` (`clusterThemes` signature), `:198-204` (the `gateThemes` call)
- Test: `tests/report/anonymity.test.ts` (extend), `tests/report/facts.test.ts` (extend + one restoration), `tests/ai/themes-generate.test.ts` (update call sites)

**Interfaces:**
- Consumes: `respondentLabels(rows)`, `containsRespondentLabel(text, labels)` from `lib/report/anonymity.ts`; `ChurchFacts`, `BuildFactsArgs`, `FactsPack` from `lib/report/facts.ts`.
- Produces:
  ```ts
  // lib/report/anonymity.ts
  export type LabelSource = { kind: 'known'; labels: string[] } | { kind: 'redacted' };
  export function knownLabels(rows: ReadonlyArray<{ respondent_label: string }>): LabelSource;
  // lib/report/facts.ts — BuildFactsArgs gains:
  labelSource: LabelSource;   // REQUIRED, not optional
  // lib/ai/themes.ts
  export async function clusterThemes(
    rows: readonly ReflectionRow[],
    methodology: Methodology,
    labelSource: LabelSource,
  ): Promise<ThemeClusterFact[] | null>;
  ```

- [ ] **Step 1: Write the failing tests for `knownLabels`**

Append to `tests/report/anonymity.test.ts`:

```ts
import { knownLabels, type LabelSource } from '@/lib/report/anonymity';

describe('knownLabels', () => {
  it('wraps the derived labels in a known LabelSource', () => {
    const src = knownLabels([{ respondent_label: 'Priscilla Vandermeer' }, { respondent_label: 'Tom Ng' }]);
    expect(src).toEqual({ kind: 'known', labels: ['Priscilla Vandermeer', 'Tom Ng'] });
  });

  it('returns a known source with an empty list rather than a redacted one when every label is blank', () => {
    // The share RPC emits ''::text. knownLabels must NOT silently promote that to 'redacted' —
    // the caller decides which source it is holding; this function only reports what it saw.
    expect(knownLabels([{ respondent_label: '' }, { respondent_label: '' }])).toEqual({
      kind: 'known',
      labels: [],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/anonymity.test.ts`
Expected: FAIL — `knownLabels` is not exported.

- [ ] **Step 3: Implement `LabelSource` + `knownLabels`**

Append to `lib/report/anonymity.ts`:

```ts
/**
 * Where a caller's respondent labels came from, as a value the compiler can check.
 *
 * `{kind:'known'}` — the caller read real labels (get_run_responses). An EMPTY list here is a
 * deliberate statement that this run genuinely has no labels, not an accident.
 * `{kind:'redacted'}` — the caller's rows came from a surface that redacts labels, i.e. the
 * share RPC (supabase/migrations/20260728000400_rpc_get_shared_run_responses.sql:48 emits
 * ''::text). No label list exists, so no label-based guard can be enforced, so consumers must
 * fail closed rather than run a guard that can never fire.
 *
 * This union exists because the old contract — a bare `string[]` — made those two cases
 * indistinguishable: the share path yielded `[]` and every guard downstream became a silent
 * no-op. Removing an arm to reintroduce that is now a compile error.
 */
export type LabelSource = { kind: 'known'; labels: string[] } | { kind: 'redacted' };

/**
 * The constructor callers reach for. respondentLabels() survives as the primitive behind it
 * (and keeps its caller-precondition comment at :26-31), but is no longer the entry point.
 */
export function knownLabels(rows: ReadonlyArray<{ respondent_label: string }>): LabelSource {
  return { kind: 'known', labels: respondentLabels(rows) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/report/anonymity.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the narrowed guard and the redacted omission**

Append to `tests/report/facts.test.ts`. `FREE_TEXT_KEYS` / `CLOSED_VOCAB_KEYS` below are the addendum §1.2 split; the fixture builder is whatever that file already uses to make a `ChurchFacts` — populate all 12 profile columns.

```ts
const FREE_TEXT_KEYS = [
  'denomination', 'adults_band', 'staff_fte_band', 'budget_band',
  'church_age_band', 'campuses_band', 'leadership_history', 'consultant_notes',
] as const;
const CLOSED_VOCAB_KEYS = ['context', 'attendance_band', 'growth_trajectory', 'facility_status'] as const;

describe('LabelSource controls the profile guard', () => {
  it('omits every free-text profile field and keeps the four closed-vocabulary ones when redacted', () => {
    const pack = buildFacts({ ...baseArgs, labelSource: { kind: 'redacted' } });
    for (const k of FREE_TEXT_KEYS) expect(pack.profile[k]).toBeUndefined();
    for (const k of CLOSED_VOCAB_KEYS) expect(pack.profile[k]).toBeDefined();
  });

  it('keeps the closed-vocabulary fields when a respondent label collides with an option value', () => {
    // Today a respondent named 'Li' silently costs growth_trajectory: 'declining'.
    const pack = buildFacts({
      ...baseArgs,
      church: { ...baseArgs.church, growth_trajectory: 'declining', facility_status: 'owned' },
      labelSource: { kind: 'known', labels: ['Li', 'Ow'] },
    });
    expect(pack.profile.growth_trajectory).toBe('declining');
    expect(pack.profile.facility_status).toBe('owned');
  });

  it('still drops a free-text field that contains a respondent label', () => {
    const pack = buildFacts({
      ...baseArgs,
      church: { ...baseArgs.church, consultant_notes: 'Priscilla Vandermeer raised this in April.' },
      labelSource: { kind: 'known', labels: ['Priscilla Vandermeer'] },
    });
    expect(pack.profile.consultant_notes).toBeUndefined();
  });
});
```

Then find the existing test in this file that uses the synthetic `'holding'` value for `growth_trajectory` (introduced only to dodge the over-wide guard) and **restore `'plateaued'`**, the real option value. That restoration is the proof the narrowing landed, not a cosmetic edit — it must be part of this commit.

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/report/facts.test.ts`
Expected: FAIL — `labelSource` is not a known property of `BuildFactsArgs`; the redacted case throws or returns the full profile.

- [ ] **Step 7: Implement the narrowing in `facts.ts`**

Replace the `PROFILE_KEYS` const at `:103-107` with the split, and the guard block at `:154-174` with:

```ts
/**
 * The 8 free-text profile keys. `denomination` and the five *_band text fields are typed by an
 * admin; `leadership_history` and `consultant_notes` are admin-authored prose copied verbatim
 * into the pack, which the composer puts into a model prompt and onto the rendered report — so
 * a name typed here is a back door around every other anonymity control in the system.
 */
const FREE_TEXT_PROFILE_KEYS = [
  'denomination', 'adults_band', 'staff_fte_band', 'budget_band',
  'church_age_band', 'campuses_band', 'leadership_history', 'consultant_notes',
] as const;

/**
 * The 4 closed-vocabulary selects (settings-form.tsx:64, :76, :107, :123). These hold <select>
 * option values, never admin prose, so a respondent label that happens to be a substring of an
 * option value can only ever be a FALSE POSITIVE — a respondent named 'Li' silently cost
 * `growth_trajectory: 'declining'` under the old guard. Unguarded on purpose (addendum §1.2).
 */
const CLOSED_VOCAB_PROFILE_KEYS = ['context', 'attendance_band', 'growth_trajectory', 'facility_status'] as const;
```

and:

```ts
  // Fail-closed anonymity guard, scoped to the free-text keys (addendum §1.2). On a redacted
  // label source there is no label list, so the guard could never fire — the free-text fields
  // are OMITTED outright rather than passed through unguarded. That is the whole point of the
  // union: there is no code path that yields an unguarded pack from redacted rows, and
  // reintroducing one means deleting an arm, which the compiler reports.
  const profile: Record<string, string> = {};
  const putIfSet = (key: keyof ChurchFacts): string | null => {
    const value = church[key];
    return value === null || value.length === 0 ? null : value;
  };
  for (const key of CLOSED_VOCAB_PROFILE_KEYS) {
    const value = putIfSet(key);
    if (value !== null) profile[key] = value;
  }
  if (args.labelSource.kind === 'known') {
    const labels = args.labelSource.labels;
    for (const key of FREE_TEXT_PROFILE_KEYS) {
      const value = putIfSet(key);
      if (value === null) continue;
      if (containsRespondentLabel(value, labels)) continue;
      profile[key] = value;
    }
  }
```

Add `labelSource: LabelSource;` to `BuildFactsArgs` (required, no `?`), import `LabelSource` from `./anonymity`, and delete the now-unused `respondentLabels` import if nothing else in the file uses it.

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/report/facts.test.ts tests/report/anonymity.test.ts`
Expected: PASS.

- [ ] **Step 9: Change `clusterThemes` to take a `LabelSource`**

In `lib/ai/themes.ts`, change the third parameter to `labelSource: LabelSource` (import the type from `../report/anonymity`) and insert the fail-closed branch immediately after the `rows.length === 0` early return:

```ts
  // Fail closed. A redacted source has no label list, so the theme anonymity gate could not
  // fire — and clustering runs over raw reflection text, the highest-risk payload in the
  // system. `[]` rather than `null`: this is a determinate verdict, not a transient failure,
  // so the caller persists it instead of burning its one re-attempt on the same outcome.
  if (labelSource.kind === 'redacted') {
    console.warn('[report] themes: label source redacted; refusing to cluster without an anonymity gate');
    return [];
  }
```

and pass `labels: labelSource.labels` in the `gateThemes` call at `:198-204`.

- [ ] **Step 10: Update the existing `clusterThemes` call sites in tests**

In `tests/ai/themes-generate.test.ts`, replace every third argument: a bare array `[...]` becomes `{ kind: 'known', labels: [...] }`, and `[]` becomes `{ kind: 'known', labels: [] }`. Add one new case:

```ts
it('refuses to cluster and returns a determinate empty result when the label source is redacted', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const result = await clusterThemes(rows, methodology, { kind: 'redacted' });
  expect(result).toEqual([]);           // determinate, not null — no re-attempt
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('[report] themes:'));
  warn.mockRestore();
});
```

- [ ] **Step 11: Prove the tripwires bite, one mutation at a time**

For each mutation below: apply it, run the named test, confirm it FAILS, then restore the file **exactly** (`git checkout -- <path>` after confirming no other edits are pending in it).

1. In `facts.ts`, move `'consultant_notes'` from `FREE_TEXT_PROFILE_KEYS` to `CLOSED_VOCAB_PROFILE_KEYS` → `tests/report/facts.test.ts` "still drops a free-text field" must FAIL.
2. In `facts.ts`, change the redacted branch to run the free-text loop with `labels = []` → the "omits every free-text profile field" test must FAIL.
3. In `themes.ts`, delete the `kind === 'redacted'` branch → the new themes test must FAIL.

- [ ] **Step 12: Run the full gates**

Run: `npx tsc --noEmit` — expect exit 0. (A green vitest proves nothing about `tsc`, and this task makes a shared-schema field required.)
Run: `npx vitest run` — expect 0 failures and a test count ≥ 1027 + the new cases.
Run: `npx eslint lib/report tests/report` — expect 0 problems (`lib/ai`/`tests/ai` are globalIgnored; do not cite lint there).

- [ ] **Step 13: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/report/anonymity.ts lib/report/facts.ts lib/ai/themes.ts tests/report/anonymity.test.ts tests/report/facts.test.ts tests/ai/themes-generate.test.ts
git commit -m "feat: thread an explicit LabelSource through facts and clustering"
```

---

### Task 2: `report.yaml` + its schema and loader

**Files:**
- Create: `methodology/report.yaml`
- Modify: `lib/methodology/schema.ts` (append before the `export type` block; extend `Methodology`)
- Modify: `lib/methodology/load.ts`
- Test: `tests/methodology/report-yaml.test.ts`

**Interfaces:**
- Consumes: `loadMethodology(dir?)`, `Methodology` from `lib/methodology/{load,schema}.ts`.
- Produces:
  ```ts
  export type SectionId = 's1'|'s2'|'s3'|'s4'|'s5'|'s6'|'s7'|'s8'|'s9'|'s10'|'s11'|'s12'|'appendix';
  export type RequiredMention = 'tier_name' | 'primary_name' | 'overall_percent';
  export type ReportSection = { title: string; templates: Record<Archetype,string>; length_ceiling: number; required_mentions: RequiredMention[] };
  export type ActionSet = { align: string; build: string; scale: string };
  export type Report = {
    version: string; style_spine: string;
    sections: Record<SectionId, ReportSection>;
    banned_phrases: Record<Archetype, string[]>;
    action_library: { categories: Record<string, ActionSet>; enablers: Record<string, ActionSet>; generosity: Record<'breadth'|'depth'|'both', ActionSet> };
  };
  // Methodology gains: report: Report;
  ```
  `Archetype` here is the string union `'capacity'|'constraint'|'foundation'`. It is spelled out locally in `schema.ts` rather than imported, because `lib/report/tier.ts` imports *from* `schema.ts` and the reverse edge would be a cycle. **AS SHIPPED:** the planned `ReportArchetypeSchema` enum was never needed and is not in the codebase — `ArchetypeTemplatesSchema` names the three keys directly. See the note at Step 2's code block.

- [ ] **Step 1: Write the failing schema tests**

Create `tests/methodology/report-yaml.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadMethodology } from '@/lib/methodology/load';
import { ReportSchema } from '@/lib/methodology/schema';

const SECTION_IDS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','appendix'] as const;
const ARCHETYPES = ['capacity','constraint','foundation'] as const;

describe('report.yaml', () => {
  const m = loadMethodology();

  it('loads and carries its own version', () => {
    expect(m.report.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('names all thirteen sections', () => {
    expect(Object.keys(m.report.sections).sort()).toEqual([...SECTION_IDS].sort());
  });

  it('gives every section a template for every archetype', () => {
    for (const id of SECTION_IDS) {
      for (const a of ARCHETYPES) {
        expect(m.report.sections[id].templates[a].length, `${id}/${a}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries a banned-phrase list per archetype', () => {
    for (const a of ARCHETYPES) expect(m.report.banned_phrases[a].length).toBeGreaterThan(0);
  });

  // The named-key discipline (copy.yaml's, schema.ts:122-126) as a behaviour, not a shape:
  // a missing section must fail at LOAD, not as an `undefined` interpolated into a report.
  it('fails to load when a section is missing', () => {
    const { sections, ...rest } = ReportSchema.parse(m.report) as never as { sections: Record<string, unknown> };
    const { s6: _dropped, ...withoutS6 } = sections;
    expect(() => ReportSchema.parse({ ...rest, sections: withoutS6 })).toThrow();
  });

  // Stronger than named keys, and self-syncing: the action library must cover every category
  // and enabler the methodology actually defines, so adding an area cannot silently ship a
  // roadmap with a hole in it.
  it('covers every category and enabler in the action library', () => {
    for (const c of m.questions.categories) {
      expect(m.report.action_library.categories[c.id], `category ${c.id}`).toBeDefined();
    }
    for (const e of Object.keys(m.rules.enablers)) {
      expect(m.report.action_library.enablers[e], `enabler ${e}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/methodology/report-yaml.test.ts`
Expected: FAIL — `ReportSchema` is not exported and `m.report` is undefined.

- [ ] **Step 3: Add `ReportSchema` to `lib/methodology/schema.ts`**

Insert immediately before the `export type Signal = ...` block:

**AS SHIPPED:** the `ReportArchetypeSchema` line below was dropped. Nothing ever consumed it —
`ArchetypeTemplatesSchema` names the three archetype keys directly — and it was removed in fix round A
after being proven dead. Do not re-introduce it in plans 4–5.

```ts
// Named keys, not z.record — the same rationale as DossierReadingBandSchema above. The three
// archetypes are a closed set and lib/report/fallback-sections.ts indexes them directly, so a
// z.record would load with any subset and let a missing archetype surface as `undefined`
// interpolated into a rendered sentence, far from the copy file.
const ArchetypeTemplatesSchema = z.object({
  capacity: z.string().min(1),
  constraint: z.string().min(1),
  foundation: z.string().min(1),
});

// A closed enum, so a typo in report.yaml ('tier-name') is a LOAD failure rather than a gate
// that silently never requires anything. lib/ai/section-gates.ts resolves each of these to a
// concrete string from the facts pack.
export const RequiredMentionSchema = z.enum(['tier_name', 'primary_name', 'overall_percent']);

export const ReportSectionSchema = z.object({
  title: z.string().min(1),
  templates: ArchetypeTemplatesSchema,
  length_ceiling: z.number().int().positive(),
  required_mentions: z.array(RequiredMentionSchema),
});

// All thirteen named. fallback-sections.ts iterates the full skeleton, so a missing id is a
// hole in a rendered report; naming them makes it a load-time failure instead.
const ReportSectionsSchema = z.object({
  s1: ReportSectionSchema, s2: ReportSectionSchema, s3: ReportSectionSchema,
  s4: ReportSectionSchema, s5: ReportSectionSchema, s6: ReportSectionSchema,
  s7: ReportSectionSchema, s8: ReportSectionSchema, s9: ReportSectionSchema,
  s10: ReportSectionSchema, s11: ReportSectionSchema, s12: ReportSectionSchema,
  appendix: ReportSectionSchema,
});

const ActionSetSchema = z.object({
  align: z.string().min(1),
  build: z.string().min(1),
  scale: z.string().min(1),
});

// z.record for categories/enablers on purpose: their ids live in questions.yaml and rules.yaml,
// and duplicating them here would be two lists to keep in sync. Completeness is enforced
// instead by tests/methodology/report-yaml.test.ts, which checks coverage against the real
// methodology — stronger than named keys, because it cannot go stale when an area is added.
export const ReportSchema = z.object({
  version: z.string().min(1),
  style_spine: z.string().min(1),
  sections: ReportSectionsSchema,
  banned_phrases: z.object({
    capacity: z.array(z.string().min(1)),
    constraint: z.array(z.string().min(1)),
    foundation: z.array(z.string().min(1)),
  }),
  action_library: z.object({
    categories: z.record(ActionSetSchema),
    enablers: z.record(ActionSetSchema),
    generosity: z.object({
      breadth: ActionSetSchema, depth: ActionSetSchema, both: ActionSetSchema,
    }),
  }),
});
```

Then in the type block add `export type RequiredMention = z.infer<typeof RequiredMentionSchema>;`, `export type ReportSection = z.infer<typeof ReportSectionSchema>;`, `export type ActionSet = z.infer<typeof ActionSetSchema>;`, `export type Report = z.infer<typeof ReportSchema>;`, `export type SectionId = keyof Report['sections'];`, and add `report: Report;` to `interface Methodology`.

- [ ] **Step 4: Wire the loader**

In `lib/methodology/load.ts`, add `ReportSchema` to the import list and `report: parse(ReportSchema, 'report.yaml'),` to the returned object. `effectiveMethodologyForRun` (`lib/methodology/effective.ts:28`) spreads `...methodology`, so the new field carries through with no change there.

- [ ] **Step 5: Write `methodology/report.yaml`**

Full copy file. Templates are the deterministic fallback prose *and* the instruction the composer is handed for that section; `{tokens}` are interpolated by `interp()`'s contract (missing key ⇒ the literal token survives, never a throw).

```yaml
# Presentation layer for the 12-section executive report. Copy ONLY — the section registry
# (Zod schemas, facts-slice selectors, token budgets, which sections are AI) lives in
# lib/ai/sections.ts, because a compiler must check those. Natalie edits this file without a
# code change; a section cannot be declared AI here with no schema there.
#
# This version feeds the report cache key (lib/report/report-hash.ts): bumping it regenerates
# every report without staling any run.
version: "0.1.0"

style_spine: >-
  Write for a lead pastor reading a consultant's report. Plain words, warm but precise. No
  em-dashes. No churchy clichés. Sentence case. Active voice. Name things the way a church
  leader would. Never invent a number, a category, or a finding. If a fact is absent from the
  facts you were given, do not supply it. Return only the JSON.

sections:
  s1:
    title: "Church Health Assessment"
    templates:
      capacity: "{church_name} — assessed {completed_at}, {respondent_count} respondents."
      constraint: "{church_name} — assessed {completed_at}, {respondent_count} respondents."
      foundation: "{church_name} — assessed {completed_at}, {respondent_count} respondents."
    length_ceiling: 200
    required_mentions: []

  s2:
    title: "Executive summary"
    templates:
      capacity: >-
        Overall health sits at {overall_percent} out of 100, which places {church_name} in the
        {tier_name} band. Nothing in the chain is broken. The question in front of you is
        capacity, not repair.
      constraint: >-
        Overall health sits at {overall_percent} out of 100, which places {church_name} in the
        {tier_name} band. One stage is holding the rest back: {primary_name}. Everything
        downstream will read weak until that is addressed.
      foundation: >-
        Overall health sits at {overall_percent} out of 100, which places {church_name} in the
        {tier_name} band. No stage is broken, but the ground underneath is not ready to carry
        what is built on it.
    length_ceiling: 1400
    required_mentions: [tier_name]

  s3:
    title: "Health dashboard"
    templates:
      capacity: "Eight areas, strongest first. Overall {overall_percent} out of 100 — {tier_name}."
      constraint: "Eight areas, strongest first. Overall {overall_percent} out of 100 — {tier_name}."
      foundation: "Eight areas, strongest first. Overall {overall_percent} out of 100 — {tier_name}."
    length_ceiling: 300
    required_mentions: [tier_name, overall_percent]

  s4:
    title: "What the assessment revealed"
    templates:
      capacity: "Capacity. Every stage is working; what you have is a growth question."
      constraint: "{primary_name}. It scored {primary_score} out of 100, below the point where a stage is working."
      foundation: "Foundation. The stages hold, but the enablers underneath them do not yet."
    length_ceiling: 1200
    required_mentions: []

  s5:
    title: "Organizational strengths"
    templates:
      capacity: "Three areas are carrying real weight. Name them before you change anything."
      constraint: "Three areas are carrying real weight. They are what you build the repair on."
      foundation: "Three areas are carrying real weight. They are not the problem."
    length_ceiling: 2200
    required_mentions: []

  s6:
    title: "Areas requiring investment"
    templates:
      capacity: "Each area below is working but has room. Affirm, then pivot to what is missing."
      constraint: "Each area below sits downstream of {primary_name} or alongside it. Read them in that light."
      foundation: "Each area below rests on ground that is not ready. Read them in that light."
    length_ceiling: 6000
    required_mentions: []

  s7:
    title: "Lowest scoring indicators"
    templates:
      capacity: "The six lowest indicators, and what they have in common."
      constraint: "The six lowest indicators, and what they have in common."
      foundation: "The six lowest indicators, and what they have in common."
    length_ceiling: 1200
    required_mentions: []

  s8:
    title: "What leaders are saying"
    templates:
      capacity: "Themes that recurred across the written reflections."
      constraint: "Themes that recurred across the written reflections."
      foundation: "Themes that recurred across the written reflections."
    length_ceiling: 400
    required_mentions: []

  s9:
    title: "Strategic diagnosis"
    templates:
      capacity: >-
        Nothing is capping you. The working model below shows which areas compound into which,
        so growth investment lands where it multiplies.
      constraint: >-
        {primary_name} is the constraint. The working model below shows what it caps, and why
        spending downstream of it raises numbers once and changes nothing.
      foundation: >-
        The enablers below gate the stages above them. Until they hold, work on the stages will
        not stick.
    length_ceiling: 2000
    required_mentions: [primary_name]

  s10:
    title: "30/60/90 roadmap"
    templates:
      capacity: "Ninety days, three phases: align, build, scale."
      constraint: "Ninety days, three phases: align, build, scale. Everything points at {primary_name}."
      foundation: "Ninety days, three phases: align, build, scale. The enablers go first."
    length_ceiling: 2400
    required_mentions: []

  s11:
    title: "Where XPG can partner"
    templates:
      capacity: "Each phase above has a matching engagement."
      constraint: "Each phase above has a matching engagement."
      foundation: "Each phase above has a matching engagement."
    length_ceiling: 1200
    required_mentions: []

  s12:
    title: "Final executive assessment"
    templates:
      capacity: >-
        {church_name} is at {overall_percent} out of 100, in the {tier_name} band, with no broken
        stage. The objective for the next ninety days is capacity, not repair.
      constraint: >-
        {church_name} is at {overall_percent} out of 100, in the {tier_name} band. The objective
        for the next ninety days is {primary_name}.
      foundation: >-
        {church_name} is at {overall_percent} out of 100, in the {tier_name} band. The objective
        for the next ninety days is the ground underneath.
    length_ceiling: 900
    required_mentions: [tier_name, overall_percent]

  appendix:
    title: "Methodology and caveats"
    templates:
      capacity: "How these numbers were produced, and what they do and do not claim."
      constraint: "How these numbers were produced, and what they do and do not claim."
      foundation: "How these numbers were produced, and what they do and do not claim."
    length_ceiling: 1200
    required_mentions: []

# Gate family 3. Each list captures the OTHER archetypes' thesis FRAMINGS — multi-word phrases,
# never single generic words and never stage names, which are shared vocabulary and would
# false-positive on every report. Matched case-insensitively as substrings.
banned_phrases:
  capacity:
    - "your primary constraint"
    - "is the constraint"
    - "capping everything downstream"
    - "before this can hold"
  constraint:
    - "healthy and ready to grow"
    - "nothing in your chain is broken"
    - "this is a capacity conversation"
    - "every stage is strong"
  foundation:
    - "healthy and ready to grow"
    - "your primary constraint"
    - "is the constraint"
    - "this is a capacity conversation"

# S10/S11 are fully deterministic in v1 (P4). Selection is keyed by archetype, primary
# constraint, gated enablers and bottom items; the text is used verbatim.
action_library:
  categories:
    conn:
      align: "Agree on one definition of a first-time guest and count them the same way every week."
      build: "Assign a named owner to first-contact follow-up within 48 hours."
      scale: "Review the follow-up log monthly and staff to the volume you actually see."
    ret:
      align: "Name the point at which someone stops being a guest and starts belonging."
      build: "Build one repeatable path from second visit to a group, and walk ten people down it."
      scale: "Track that path's completion rate and staff the step that leaks most."
    grow:
      align: "Agree what spiritual growth looks like here, in language your people would use."
      build: "Give every group leader one shared next step to point people toward."
      scale: "Measure movement along that step, not attendance at the meeting."
    serv:
      align: "List every volunteer role and who owns it. Delete the ones nobody owns."
      build: "Create one on-ramp conversation for new volunteers and run it monthly."
      scale: "Set a ratio of volunteers to attenders and staff recruitment to hold it."
    lead:
      align: "Name your current leadership pipeline out loud, including the gaps."
      build: "Identify three people to develop this quarter and meet them on a schedule."
      scale: "Hand one real decision to each of them and review how it went."
    gov:
      align: "Write down who decides what. Circulate it to staff and board."
      build: "Set a standing decision rhythm and hold it for a quarter."
      scale: "Review the decision log annually against the written authority map."
    comm:
      align: "Agree the one message every channel is carrying this season."
      build: "Cut your channels to the ones you can maintain weekly."
      scale: "Test whether people can repeat the message back, and adjust."
    sys:
      align: "List the systems you depend on and who administers each."
      build: "Fix the one system whose failure would stop a weekend."
      scale: "Document the two processes that only live in one person's head."
  enablers:
    gov:
      align: "Clarify decision rights before adding any new initiative."
      build: "Put the authority map in front of the board and get it ratified."
      scale: "Audit decisions made outside the map each quarter."
    comm:
      align: "Pick one message and retire the competing ones."
      build: "Build a weekly rhythm you can actually sustain."
      scale: "Measure message recall, not reach."
    sys:
      align: "Name an owner for every system you rely on."
      build: "Close the single point of failure you would feel first."
      scale: "Document and cross-train the two riskiest processes."
  generosity:
    breadth:
      align: "Name giving as discipleship from the platform once this quarter."
      build: "Make first-time giving frictionless and acknowledged within a week."
      scale: "Grow the number of households who give at all, not the size of the top gifts."
    depth:
      align: "Thank your consistent givers personally and specifically."
      build: "Show one clear line from a gift to an outcome, every month."
      scale: "Invite your most committed givers into a next step, not a bigger ask."
    both:
      align: "Say plainly what money does here, and how decisions about it are made."
      build: "Fix the giving experience end to end before you ask for more."
      scale: "Grow participation first, then depth, and report on both."
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/methodology/report-yaml.test.ts`
Expected: PASS, all six cases.

- [ ] **Step 7: Prove the load-time failure bites**

Temporarily rename `sections.s6` to `sections.s6x` in `methodology/report.yaml`. Run `npx vitest run tests/methodology/report-yaml.test.ts` — the suite must fail at `loadMethodology()`, not later. Restore the file exactly.

- [ ] **Step 8: Run the full gates**

Run: `npx tsc --noEmit` (exit 0) — `Methodology` gained a required field, so this is mandatory here.
Run: `npx vitest run` (0 failures).
Run: `npx eslint lib/methodology tests/methodology` (0 problems).

- [ ] **Step 9: Commit**

```bash
git add methodology/report.yaml lib/methodology/schema.ts lib/methodology/load.ts tests/methodology/report-yaml.test.ts
git commit -m "feat: add report.yaml with a named-key schema and loader wiring"
```

---

### Task 3: `report-hash.ts` and the share-path impossibility proof

**Files:**
- Create: `lib/report/report-hash.ts`
- Test: `tests/report/report-hash.test.ts`

**Interfaces:**
- Consumes: `responseHash(rows, methodologyVersion)` from `lib/report/response-hash.ts`; `Methodology` from `lib/methodology/schema.ts`.
- Produces:
  ```ts
  export interface ReportHashArgs {
    methodologyVersion: string;
    responseHash: string;
    methodology: Methodology;                                   // for the canonical item→theme map
    reflections: ReadonlyArray<{ item_id: string; respondent_key: string; text: string }>;
    profile: Record<string, string>;                            // FactsPack['profile']
    reportVersion: string;                                      // methodology.report.version
  }
  export function reportInputsHash(args: ReportHashArgs): string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/report/report-hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { loadMethodology } from '@/lib/methodology/load';
import { responseHash } from '@/lib/report/response-hash';
import { reportInputsHash } from '@/lib/report/report-hash';

const methodology = loadMethodology();
const base = {
  methodologyVersion: '0.3.0',
  responseHash: 'a'.repeat(64),
  methodology,
  reflections: [
    { item_id: 'conn_2', respondent_key: 'u1', text: 'we lose people after week two' },
    { item_id: 'conn_1', respondent_key: 'u2', text: 'greeters are great' },
  ],
  profile: { context: 'suburban', denomination: 'non-denominational' },
  reportVersion: methodology.report.version,
};

describe('reportInputsHash', () => {
  it('is a sha256 hex digest', () => {
    expect(reportInputsHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across reflection input order', () => {
    const reversed = { ...base, reflections: [...base.reflections].reverse() };
    expect(reportInputsHash(reversed)).toBe(reportInputsHash(base));
  });

  it('is stable across profile key insertion order', () => {
    const reordered = { ...base, profile: { denomination: 'non-denominational', context: 'suburban' } };
    expect(reportInputsHash(reordered)).toBe(reportInputsHash(base));
  });

  it.each([
    ['methodologyVersion', { methodologyVersion: '0.2.0' }],
    ['responseHash', { responseHash: 'b'.repeat(64) }],
    ['reportVersion', { reportVersion: '9.9.9' }],
    ['a reflection text', { reflections: [{ item_id: 'conn_2', respondent_key: 'u1', text: 'changed' }, base.reflections[1]!] }],
    ['a reflection respondent', { reflections: [{ ...base.reflections[0]!, respondent_key: 'u9' }, base.reflections[1]!] }],
    ['a profile field', { profile: { context: 'urban', denomination: 'non-denominational' } }],
  ])('changes when %s changes', (_label, patch) => {
    expect(reportInputsHash({ ...base, ...patch })).not.toBe(reportInputsHash(base));
  });

  it('changes when an item theme tag changes', () => {
    const first = methodology.questions.categories[0]!;
    const retagged = {
      ...methodology,
      questions: {
        ...methodology.questions,
        categories: methodology.questions.categories.map((c, i) =>
          i !== 0 ? c : { ...c, items: c.items.map((it, j) => (j !== 0 ? it : { ...it, theme: it.theme === 'systems' ? 'culture' : 'systems' })) },
        ),
      },
    } as typeof methodology;
    expect(first).toBeDefined();
    expect(reportInputsHash({ ...base, methodology: retagged })).not.toBe(reportInputsHash(base));
  });
});

// Addendum §1.3 — asserted as a property so plan 4 inherits a proven fact rather than
// rediscovering a coincidence.
describe('the share path can never hash-match a persisted report', () => {
  const rows = [
    { category_id: 'conn', item_id: 'conn_1', value: 7, respondent_label: 'Priscilla Vandermeer' },
    { category_id: 'conn', item_id: 'conn_2', value: 4, respondent_label: 'Tom Ng' },
  ];
  // get_shared_run_responses emits ''::text as respondent_label for identical answers.
  const shared = rows.map((r) => ({ ...r, respondent_label: '' }));

  it('computes a different response_hash for identical answers', () => {
    expect(responseHash(shared, '0.3.0')).not.toBe(responseHash(rows, '0.3.0'));
  });

  it('therefore computes a different inputs_hash', () => {
    const admin = reportInputsHash({ ...base, responseHash: responseHash(rows, '0.3.0') });
    const share = reportInputsHash({ ...base, responseHash: responseHash(shared, '0.3.0') });
    expect(share).not.toBe(admin);
  });

  it('pins that respondent_label is what makes them differ', () => {
    // If a future edit drops respondent_label from the response-hash serialization, the two
    // hashes above collide and the share path starts matching persisted AI reports — a P5
    // violation. This assertion is the tripwire for that edit.
    const same = rows.map((r) => ({ ...r, respondent_label: 'X' }));
    const alsoSame = rows.map((r) => ({ ...r, respondent_label: 'X' }));
    expect(responseHash(same, '0.3.0')).toBe(responseHash(alsoSame, '0.3.0'));
    expect(createHash('sha256').update('sentinel').digest('hex')).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/report-hash.test.ts`
Expected: FAIL — cannot resolve `@/lib/report/report-hash`.

- [ ] **Step 3: Implement `lib/report/report-hash.ts`**

```ts
import { createHash } from 'node:crypto';
import type { Methodology } from '../methodology/schema';

export interface ReportHashArgs {
  /** The RUN's edition, not the current one — the same value stamped on the diagnosis. */
  methodologyVersion: string;
  /** lib/report/response-hash.ts's digest of this run's answers. */
  responseHash: string;
  /** The EFFECTIVE methodology, for the canonical item→theme map. */
  methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; respondent_key: string; text: string }>;
  /** FactsPack['profile'] — non-null fields only, already guarded. */
  profile: Record<string, string>;
  /** methodology.report.version. */
  reportVersion: string;
}

/**
 * The report cache key (parent spec line 76).
 *
 *   sha256(methodology_version | response_hash | item→theme map | reflections | profile | report.yaml version)
 *
 * Reflections, profile fields and theme tags are deliberately IN this hash and deliberately OUT
 * of response_hash: changing any of them must regenerate the REPORT without staling the RUN
 * (P2). That asymmetry is the whole reason this is a second hash rather than a reuse of the
 * first one.
 *
 * Every component is canonicalized before hashing — sorted, serialized as arrays rather than
 * objects (no key-order ambiguity), with a plain lexicographic compare, never localeCompare,
 * which is locale- and ICU-version-dependent and would make the cache key differ across
 * machines. Server-only (node:crypto).
 *
 * INPUTS ONLY. Clustered themes are model OUTPUT and must never appear here: including them
 * would make the key that decides whether to call the model depend on what the model said.
 */
export function reportInputsHash(args: ReportHashArgs): string {
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

  const themeMap = args.methodology.questions.categories
    .flatMap((c) => c.items.map((i) => [i.id, i.theme] as const))
    .sort((a, b) => cmp(a[0], b[0]));

  const reflections = [...args.reflections]
    .map((r) => [r.item_id, r.respondent_key, r.text] as const)
    .sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]));

  const profile = Object.keys(args.profile)
    .sort(cmp)
    .map((k) => [k, args.profile[k]!] as const);

  const canonical = [
    args.methodologyVersion,
    args.responseHash,
    JSON.stringify(themeMap),
    JSON.stringify(reflections),
    JSON.stringify(profile),
    args.reportVersion,
  ].join('|');

  return createHash('sha256').update(canonical).digest('hex');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/report/report-hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the tripwire bites**

Delete `JSON.stringify(reflections),` from the `canonical` array. Run the suite — "changes when a reflection text changes" must FAIL. Restore exactly. Repeat for `JSON.stringify(themeMap),` against the theme-tag case.

- [ ] **Step 6: Run the full gates**

Run: `npx tsc --noEmit` (exit 0), `npx vitest run` (0 failures), `npx eslint lib/report tests/report` (0 problems).

- [ ] **Step 7: Commit**

```bash
git add lib/report/report-hash.ts tests/report/report-hash.test.ts
git commit -m "feat: add the report inputs hash"
```

---

### Task 4: Widen the ai-exclusion contract (must land before Task 6)

Split from Task 6 deliberately. `tests/outreach/ai-exclusion.test.ts:17` runs `readdirSync('lib/ai')` at **module scope**, so a new `lib/ai/` file that lands before its allowlist entry is scanned as a guarded file. Widening first is safe in both directions: `ALLOWED.includes(f)` on a not-yet-existing file is inert, and the `guarded.length > 0` non-vacuity check still holds (`fallback.ts`, `prose.ts` remain).

**Files:**
- Modify: `tests/outreach/ai-exclusion.test.ts:17` and `:31`

- [ ] **Step 1: Widen `ALLOWED` and its pin**

At `:17`:

```ts
// Basenames, NOT lib/ai-prefixed paths: readdirSync('lib/ai', {recursive:true}) yields entries
// relative to lib/ai. That relativity is the point — a nested `sub/sections.ts` yields
// 'sub/sections.ts' and cannot inherit the exemption from a bare 'sections.ts'.
//
// sections.ts and section-gates.ts join the list per the plan-3 addendum §3. Their inputs are
// the facts pack only, and the facts-slice selectors PICK {label, gloss, support_count,
// item_ids} rather than omitting verbatims — so neither file names the guarded concepts today.
// The exemption therefore removes a guard without either file using it, which is why the
// positive assertions at the foot of this file are its replacement: they pin that the slice is
// built by picking, and that nothing but themes.ts talks to the model.
const ALLOWED = ['themes.ts', 'theme-gates.ts', 'sections.ts', 'section-gates.ts'];
```

At `:31`:

```ts
    expect(ALLOWED).toEqual(['themes.ts', 'theme-gates.ts', 'sections.ts', 'section-gates.ts']);
```

- [ ] **Step 2: Run to verify the suite still passes**

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts`
Expected: PASS — same case count as before.

- [ ] **Step 3: Confirm the non-vacuity check still bites**

Temporarily add `'fallback.ts'`, `'prose.ts'` to `ALLOWED`. The "there is at least one guarded file left to check" case must FAIL. Restore exactly.

- [ ] **Step 4: Run the full gates**

Run: `npx vitest run` (0 failures), `npx eslint tests/outreach` (0 problems).

- [ ] **Step 5: Commit**

```bash
git add tests/outreach/ai-exclusion.test.ts
git commit -m "test: widen the ai-exclusion allowlist to the section composer"
```

---

### Task 5: `fallback-sections.ts` — the deterministic spine

Every section renders without AI. This is what makes each AI failure a local, invisible degradation.

**Files:**
- Create: `lib/report/fallback-sections.ts`
- Modify: `lib/report/view.ts:244` (add `export` to `buildOutreachVoices`)
- Test: `tests/report/fallback-sections.test.ts`

**Interfaces:**
- Consumes: `FactsPack`, `ThemeClusterFact` (`lib/report/facts.ts`); `interp` and `buildOutreachVoices` (`lib/report/view.ts`); `Report`, `SectionId`, `Methodology` (`lib/methodology/schema.ts`); `Archetype`, `Tier` (`lib/report/tier.ts`).
- Produces:
  ```ts
  export interface FallbackSectionArgs {
    facts: FactsPack;
    methodology: Methodology;
    reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
  }
  export type SectionBody = { title: string; body: string; bullets: string[] };
  export function fallbackSection(id: SectionId, args: FallbackSectionArgs): SectionBody;
  export function fallbackSections(args: FallbackSectionArgs): Record<SectionId, SectionBody>;
  ```

**Per-section content — the complete mapping.** Every `body` is `interp(report.sections[id].templates[facts.archetype], TOKENS)`; the table fixes each section's `bullets` source. `TOKENS` is built once per call:

```ts
const TOKENS: Record<string, string> = {
  church_name: facts.cover.church_name,
  completed_at: facts.cover.completed_at ?? 'not yet completed',
  respondent_count: String(facts.cover.respondent_count),
  overall_percent: String(facts.overall.capacity),
  tier_name: facts.overall.tier.name,
  primary_name: facts.primary_constraint?.name ?? 'no single stage',
  primary_score: String(
    facts.categories.find((c) => c.id === facts.primary_constraint?.category_id)?.score ?? 0,
  ),
};
```

| id | `bullets` |
|---|---|
| s1 | `[]` |
| s2 | The profile context bullets: `Object.entries(facts.profile).map(([k, v]) => `${LABELS[k]}: ${v}`)` — empty object ⇒ `[]`, omitted gracefully (locked decision 6). `LABELS` is a local `Record<string,string>` mapping each of the 12 profile keys to its settings-form label. |
| s3 | One line per `facts.categories` entry (already sorted desc): `` `${c.name}: ${c.score} out of 100 — ${bandRead(c)}` ``, where `bandRead` is `interp(methodology.copy.dossier.reading[kind][band], {})` using the same band thresholds `view.ts` already applies. **Check `CategoryFact` for a `kind` field first** (`lib/report/facts.ts:20-33`); if it has none, derive it exactly as `facts.ts:114` does — `new Set(methodology.rules.chain).has(c.id) ? 'stage' : 'enabler'` — rather than adding a field to the pack. |
| s4 | `[]` — the thesis is the body. |
| s5 | `facts.categories.slice(0, 3).map(c => `XPG Assessment: ${c.name} — ${c.score} out of 100.`)` |
| s6 | `facts.categories.slice(3).map(...)` — one bullet per area, composed as the six micro-template beats joined by a space: affirm (`copy.dossier.reading[kind][band]`), pivot, evidence (blind-spot line from `copy.blocks.blind_spot` when `facts.blind_spots` has this category, else the score line), not-statement, reframe (dispersion line from `copy.blocks.dispersion` when `facts.dispersion` has it), trajectory. Absent inputs drop their beat rather than emitting an empty sentence. |
| s7 | `facts.bottom_items.map(b => `${b.text} — ${b.mean} out of 100 (${b.theme}).`)` plus one trailing pattern line built from `facts.pattern_counts`: for each theme with count 0, `` `None of the six lowest indicators are ${theme}.` `` |
| s8 | When `facts.themes.length > 0`: `facts.themes.map(t => `${t.label}: ${t.gloss} (${t.support_count} people).`)`. When empty: the per-area voices lists via `buildOutreachVoices(methodology, reflections)`, flattened as `` `${group.reflectionPrompt}: ${entry}` ``. **Verbatims are never concatenated into a bullet** — they stay structured on the facts pack for the S8 renderer to gate by audience (plan 4). |
| s9 | `facts.dependencies.map(d => d.read_sentence)`, then `facts.gating.map(g => `${g.name}: ${g.note}`)`. |
| s10 | The action library, selected deterministically (P4): for each phase in `['align','build','scale']`, pick the primary constraint's category entry when `archetype === 'constraint'`; each gated enabler's entry when `'foundation'`; the generosity entry for `facts.generosity_mode` when `'capacity'`. Prefix each bullet with `'30 days — '` / `'60 days — '` / `'90 days — '`. When `archetype === 'constraint'`, append one `` `Do not work on yet: ${names}.` `` bullet listing the downstream category names from `facts.dependencies` whose `from` is the primary. |
| s11 | One bullet per S10 phase, mirroring it 1:1: `` `${phase}: ${methodology.offers...}` `` using the existing `offers.yaml` hook for the primary stage (or the generosity offer when there is no primary). |
| s12 | `[` overall, tier, objective `]` — `` `Overall: ${facts.overall.capacity} out of 100.` ``, `` `Band: ${facts.overall.tier.name}.` ``, `` `Objective: ${TOKENS.primary_name}.` `` |
| appendix | `[copy.blocks.benchmark_note, copy.blocks.dependency_note, `Confidence: ${facts.confidence}.`]`, plus `` `Small sample: ${facts.cover.respondent_count} respondents.` `` when the count is below 8. |

- [ ] **Step 1: Export `buildOutreachVoices`**

In `lib/report/view.ts:244`, change `function buildOutreachVoices(` to `export function buildOutreachVoices(`. Nothing else in that file changes. (S8's fallback is the one place outside `view.ts` that needs it; the alternative — routing through `buildReportView` — would force `fallback-sections.ts` to construct a `ReportBlocks` it has no reason to hold.)

- [ ] **Step 2: Write the failing tests**

Create `tests/report/fallback-sections.test.ts`. Build three facts packs from the existing report fixtures — healthy-church (⇒ `capacity`), broken-conn (⇒ `constraint`), gates-only (⇒ `foundation`) — via `buildFacts({..., labelSource: { kind: 'known', labels: [] }})`.

```ts
const IDS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','appendix'] as const;

describe.each([['capacity', capacityFacts], ['constraint', constraintFacts], ['foundation', foundationFacts]] as const)(
  '%s archetype',
  (archetype, facts) => {
    const all = fallbackSections({ facts, methodology, reflections: [] });

    it('produces every section with a non-empty title and body', () => {
      expect(Object.keys(all).sort()).toEqual([...IDS].sort());
      for (const id of IDS) {
        expect(all[id].title.length, id).toBeGreaterThan(0);
        expect(all[id].body.trim().length, id).toBeGreaterThan(0);
      }
    });

    it('leaves no uninterpolated tokens anywhere', () => {
      for (const id of IDS) {
        expect(all[id].body, id).not.toMatch(/\{[a-z_]+\}/);
        for (const b of all[id].bullets) expect(b, id).not.toMatch(/\{[a-z_]+\}/);
      }
    });

    it('uses no other archetype banned phrase', () => {
      // The archetype-consistency property from the parent spec: capacity language must never
      // survive a broken stage. Asserted on the deterministic spine here, and again on AI
      // output by gate family 3 in Task 7.
      const text = IDS.map((id) => `${all[id].body} ${all[id].bullets.join(' ')}`).join(' ').toLowerCase();
      for (const phrase of methodology.report.banned_phrases[archetype]) {
        expect(text, phrase).not.toContain(phrase.toLowerCase());
      }
    });
  },
);

describe('S2 profile bullets', () => {
  it('omits gracefully when the profile is empty', () => {
    const facts = { ...capacityFacts, profile: {} };
    expect(fallbackSection('s2', { facts, methodology, reflections: [] }).bullets).toEqual([]);
  });

  it('lists each populated profile field', () => {
    const facts = { ...capacityFacts, profile: { context: 'suburban' } };
    expect(fallbackSection('s2', { facts, methodology, reflections: [] }).bullets).toHaveLength(1);
  });
});

describe('S8 fallback', () => {
  it('renders clustered themes when present', () => {
    const facts = { ...capacityFacts, themes: [{ label: 'Follow-up', gloss: 'People are lost after week two.', support_count: 4, item_ids: ['conn_2'], verbatims: [] }] };
    const s8 = fallbackSection('s8', { facts, methodology, reflections: [] });
    expect(s8.bullets[0]).toContain('Follow-up');
    expect(s8.bullets[0]).toContain('4');
  });

  it('falls back to the per-area voices lists when there are no themes', () => {
    const s8 = fallbackSection('s8', {
      facts: { ...capacityFacts, themes: [] },
      methodology,
      reflections: [{ item_id: reflectionItemId, reflection: 'greeters are great' }],
    });
    expect(s8.bullets.some((b) => b.includes('greeters are great'))).toBe(true);
  });

  it('never concatenates a verbatim into a bullet', () => {
    // Verbatims are structured fields on the facts pack, gated by audience at render (plan 4).
    const facts = { ...capacityFacts, themes: [{ label: 'Follow-up', gloss: 'g', support_count: 4, item_ids: ['conn_2'], verbatims: ['SENTINEL QUOTE'] }] };
    const s8 = fallbackSection('s8', { facts, methodology, reflections: [] });
    expect(s8.bullets.join(' ')).not.toContain('SENTINEL QUOTE');
  });
});

describe('S10 roadmap', () => {
  it('points every phase at the primary constraint', () => {
    const s10 = fallbackSection('s10', { facts: constraintFacts, methodology, reflections: [] });
    expect(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b))).toHaveLength(3);
  });

  it('carries a do-not-work-on bullet only for the constraint archetype', () => {
    const yes = fallbackSection('s10', { facts: constraintFacts, methodology, reflections: [] });
    const no = fallbackSection('s10', { facts: capacityFacts, methodology, reflections: [] });
    expect(yes.bullets.some((b) => b.startsWith('Do not work on yet:'))).toBe(true);
    expect(no.bullets.some((b) => b.startsWith('Do not work on yet:'))).toBe(false);
  });
});

describe('S11 mirrors S10', () => {
  it('has one bullet per roadmap phase', () => {
    const s10 = fallbackSection('s10', { facts: constraintFacts, methodology, reflections: [] });
    const s11 = fallbackSection('s11', { facts: constraintFacts, methodology, reflections: [] });
    expect(s11.bullets).toHaveLength(s10.bullets.filter((b) => /^(30|60|90) days — /.test(b)).length);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/report/fallback-sections.test.ts`
Expected: FAIL — cannot resolve `@/lib/report/fallback-sections`.

- [ ] **Step 4: Implement `lib/report/fallback-sections.ts`**

Write the module against the mapping table above. Structure:

```ts
import type { FactsPack } from './facts';
import type { Methodology, SectionId } from '../methodology/schema';
import { interp, buildOutreachVoices } from './view';

/**
 * The deterministic spine. Every one of the thirteen sections renders from the facts pack and
 * report.yaml alone — no model, no network, no throw. This is what makes an AI section failure
 * a local, invisible degradation rather than a broken report, and it is the ONLY renderer the
 * share page will ever reach (P5).
 *
 * Absorbs the old 10 blocks per the parent spec line 74:
 *   verdict → S2/S4 · evidence → S4/S7 · cost + do_not_work_on → S9/S10 (Constraint)
 *   next_step → S11 · gating → S6/S9 (Foundation) · dispersion → S6 area beat
 *   blind_spot → S6 "watch for" beat · benchmark_note + dependency_note → appendix
 */
export interface FallbackSectionArgs { /* … as in Interfaces above … */ }
export interface SectionBody { title: string; body: string; bullets: string[] }

export function fallbackSection(id: SectionId, args: FallbackSectionArgs): SectionBody { /* … */ }

export function fallbackSections(args: FallbackSectionArgs): Record<SectionId, SectionBody> {
  const ids = Object.keys(args.methodology.report.sections) as SectionId[];
  return Object.fromEntries(ids.map((id) => [id, fallbackSection(id, args)])) as Record<SectionId, SectionBody>;
}
```

Implement each `case` per the table. Rules that apply throughout: never throw on a missing lookup — a missing category, dependency or offer drops its bullet; use `interp` for every template so a missing token survives as the literal rather than crashing; sort nothing with `localeCompare`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/report/fallback-sections.test.ts`
Expected: PASS.

- [ ] **Step 6: Prove the archetype-consistency tripwire bites**

In `methodology/report.yaml`, temporarily change `sections.s2.templates.constraint` to start with `"Nothing in your chain is broken. "`. Run the suite — the constraint archetype's "uses no other archetype banned phrase" case must FAIL. Restore the file exactly.

- [ ] **Step 7: Run the full gates**

Run: `npx tsc --noEmit` (exit 0), `npx vitest run` (0 failures), `npx eslint lib/report tests/report` (0 problems).

- [ ] **Step 8: Commit**

```bash
git add lib/report/fallback-sections.ts lib/report/view.ts tests/report/fallback-sections.test.ts
git commit -m "feat: add deterministic per-section report fallbacks"
```

---

### Task 6: `lib/ai/sections.ts` — the typed registry and the 7 calls

**Files:**
- Create: `lib/ai/sections.ts`
- Modify: `tests/outreach/ai-exclusion.test.ts` (append the replacement positive assertions)
- Test: `tests/ai/sections.test.ts`

**Interfaces:**
- Consumes: `FactsPack`, `ThemeClusterFact` (`lib/report/facts.ts`); `Methodology`, `SectionId` (`lib/methodology/schema.ts`).
- Produces:
  ```ts
  export type AiSectionId = 's2' | 's4' | 's5' | 's6' | 's7' | 's9' | 's12';
  export const AI_SECTION_IDS: readonly AiSectionId[];
  export interface SectionRegistryEntry {
    schema: z.ZodType;                     // the per-section strict schema
    slice: (facts: FactsPack) => unknown;  // the facts subset this section may see
    maxOutputTokens: number;               // 8000 for s6, 4000 otherwise
  }
  export const SECTION_REGISTRY: Record<AiSectionId, SectionRegistryEntry>;
  // AS SHIPPED: no `sectionSlice` export. It was written, proven to have zero production callers
  // (composeSection calls entry.slice(facts) directly), and deleted in fix round A.
  export async function composeSection(
    id: AiSectionId, facts: FactsPack, methodology: Methodology,
  ): Promise<unknown | null>;   // null on incomplete / no parse / request failure. NEVER throws.
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/ai/sections.test.ts`. Mock the SDK the way `tests/ai/themes-generate.test.ts` already does.

```ts
describe('the section registry', () => {
  it('covers exactly the seven AI sections', () => {
    expect([...AI_SECTION_IDS]).toEqual(['s2','s4','s5','s6','s7','s9','s12']);
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...AI_SECTION_IDS].sort());
  });

  it('gives S6 the larger budget and everything else 4000', () => {
    expect(SECTION_REGISTRY.s6.maxOutputTokens).toBe(8000);
    for (const id of AI_SECTION_IDS) {
      if (id !== 's6') expect(SECTION_REGISTRY[id].maxOutputTokens, id).toBe(4000);
    }
  });
});

// AS SHIPPED — this block was rewritten in fix round A (I5) and again in fix round C (Minor 1).
// Asserting against `sectionSlice` could not observe what actually goes over the wire; the shipped
// tests drive `composeSection` and assert on the real serialized `client.responses.parse` argument.
// The leak assertion is scoped to the WHOLE stringified call, so a leak smuggled into the system
// message is caught too. The non-vacuity assertion is scoped to the USER message and pinned to the
// rendered key: a bare `String(capacity)` against the whole call also matches inside
// `"max_output_tokens":4000`, which made it fail-open for 6 of 7 sections.
describe('facts slices', () => {
  beforeEach(() => { mockParse.mockReset(); });

  it('never sends a verbatim over the wire for any AI section', async () => {
    // Parent spec line 72: verbatims flow facts → the S8 renderer exclusively. S8 is not an AI
    // section at all, so no section's wire payload has any business holding one.
    const facts = { ...capacityFacts, themes: [{ label: 'L', gloss: 'g', support_count: 4, item_ids: ['conn_2'], verbatims: ['SENTINEL QUOTE'] }] };
    for (const id of AI_SECTION_IDS) {
      mockParse.mockReset();
      mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
      await composeSection(id, facts, methodology);
      const call = mockParse.mock.calls[0]![0];
      const payload = JSON.stringify(call);
      expect(payload, id).not.toContain('SENTINEL QUOTE');
      expect(String(call.input[1].content), id).toContain(`"capacity": ${facts.overall.capacity}`);
    }
  });

  it('never sends a profile field over the wire for a section that has no use for it', async () => {
    const facts = { ...capacityFacts, profile: { consultant_notes: 'SENTINEL NOTE' } };
    for (const id of AI_SECTION_IDS) {
      if (id === 's2') continue;   // S2 is the one section that renders profile context
      mockParse.mockReset();
      mockParse.mockResolvedValue({ status: 'completed', output_parsed: {} });
      await composeSection(id, facts, methodology);
      const call = mockParse.mock.calls[0]![0];
      const payload = JSON.stringify(call);
      expect(payload, id).not.toContain('SENTINEL NOTE');
      expect(String(call.input[1].content), id).toContain(`"capacity": ${facts.overall.capacity}`);
    }
  });
});

describe('composeSection', () => {
  it('returns null and logs a reason when the response is incomplete', async () => {
    mockParse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_parsed: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await composeSection('s2', capacityFacts, methodology)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[report] section s2:'));
    warn.mockRestore();
  });

  it('returns null and logs a reason when there is no parsed output', async () => {
    mockParse({ status: 'completed', output_parsed: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await composeSection('s4', capacityFacts, methodology)).toBeNull();
    warn.mockRestore();
  });

  it('returns null rather than throwing when the request fails', async () => {
    mockParseRejects(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(composeSection('s9', capacityFacts, methodology)).resolves.toBeNull();
    warn.mockRestore();
  });

  it('logs no payload, section text or church data on any failure path', async () => {
    mockParseRejects(new Error('secret-church-name leaked in the message'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await composeSection('s2', capacityFacts, methodology);
    // Reason strings only: the SDK's own message is passed through, but nothing from the pack.
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain(capacityFacts.cover.church_name);
    warn.mockRestore();
  });

  it('returns the parsed object on success', async () => {
    mockParse({ status: 'completed', output_parsed: { summary: 's', what_this_is_not: 'n', context_bullets: [] } });
    expect(await composeSection('s2', capacityFacts, methodology)).toEqual({ summary: 's', what_this_is_not: 'n', context_bullets: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ai/sections.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/sections`.

- [ ] **Step 3: Implement `lib/ai/sections.ts`**

Bottom-import idiom (schemas and pure helpers first, then the SDK imports, then the call) — deliberate house style that `prose.ts` and `themes.ts` both use. Do not "fix" it.

```ts
import { z } from 'zod/v4';
import type { FactsPack } from '../report/facts';

/**
 * GPT task: per-section composition (parent spec line 72).
 *
 * ⚠️ lib/ai/** is under eslint globalIgnores (eslint.config.mjs:12). A green lint says nothing
 * about this file. tsc and vitest are the gates.
 *
 * Registry in TS, copy in YAML (addendum C6). Anything a compiler must check — the Zod schemas,
 * the facts-slice selectors, the token budgets, which sections are AI at all — lives here.
 * methodology/report.yaml carries only copy, so Natalie edits templates without a code change
 * and a section cannot be declared AI in one file with no schema in the other.
 *
 * Every schema field is `.nullable()` rather than `.optional()`: OpenAI strict structured
 * outputs put every property in `required`, so an absent optional comes back as null. Same
 * discipline as ReportBlocksSchema in prose.ts and ThemeSchema in themes.ts.
 */

export const S2Schema = z.object({
  summary: z.string(),
  what_this_is_not: z.string(),
  context_bullets: z.array(z.string()),
});
export const S4Schema = z.object({ thesis_word: z.string(), narrative: z.string() });
export const S5Schema = z.object({
  strengths: z.array(z.object({ category_id: z.string(), heading: z.string(), body: z.string() })),
});
export const S6Schema = z.object({
  areas: z.array(z.object({
    category_id: z.string(), affirm: z.string(), pivot: z.string(), evidence: z.string(),
    not_statement: z.string(), reframe: z.string(), trajectory: z.string(),
  })),
});
export const S7Schema = z.object({ narrative: z.string(), pattern_claim: z.string().nullable() });
export const S9Schema = z.object({ narrative: z.string(), working_model: z.string() });
export const S12Schema = z.object({
  assessment: z.string(), overall_percent: z.number(), tier_name: z.string(), primary_objective: z.string(),
});

export type AiSectionId = 's2' | 's4' | 's5' | 's6' | 's7' | 's9' | 's12';
export const AI_SECTION_IDS = ['s2', 's4', 's5', 's6', 's7', 's9', 's12'] as const satisfies readonly AiSectionId[];

/**
 * The shared head of every slice. PICKED field by field, never omitted from the whole pack:
 * an omit-list silently widens the moment a field is added to FactsPack, and one of those
 * fields is the theme structure that carries quotes. Picking cannot leak forward.
 */
function head(facts: FactsPack) {
  return {
    archetype: facts.archetype,
    overall: facts.overall,
    primary_constraint: facts.primary_constraint,
  };
}

/** Themes reduced to what a composer may reason about: no quoted text, ever. */
function themeDigest(facts: FactsPack) {
  return facts.themes.map((t) => ({
    label: t.label, gloss: t.gloss, support_count: t.support_count, item_ids: t.item_ids,
  }));
}

export interface SectionRegistryEntry {
  /** `ZodObject`, not `ZodType`: zodTextFormat needs an object schema, and typing it loosely
   *  here forces an `as never` at the call site that would hide a real mismatch. */
  schema: z.ZodObject<z.ZodRawShape>;
  slice: (facts: FactsPack) => unknown;
  maxOutputTokens: number;
}

export const SECTION_REGISTRY: Record<AiSectionId, SectionRegistryEntry> = {
  s2:  { schema: S2Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), cover: f.cover, profile: f.profile }) },
  s4:  { schema: S4Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), categories: f.categories, gating: f.gating }) },
  s5:  { schema: S5Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), categories: f.categories.slice(0, 3) }) },
  s6:  { schema: S6Schema,  maxOutputTokens: 8000, slice: (f) => ({ ...head(f), categories: f.categories.slice(3), blind_spots: f.blind_spots, dispersion: f.dispersion }) },
  s7:  { schema: S7Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), bottom_items: f.bottom_items, pattern_counts: f.pattern_counts }) },
  s9:  { schema: S9Schema,  maxOutputTokens: 4000, slice: (f) => ({ ...head(f), dependencies: f.dependencies, gating: f.gating, themes: themeDigest(f) }) },
  s12: { schema: S12Schema, maxOutputTokens: 4000, slice: (f) => ({ ...head(f), categories: f.categories }) },
};

// AS SHIPPED: `sectionSlice` is NOT in the codebase. It was written as planned, then proven to have
// zero production callers — `composeSection` calls `entry.slice(facts)` directly when it builds the
// `input[1]` user message — and deleted in fix round A. Do not re-introduce it in plans 4–5.

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Methodology } from '../methodology/schema';

/**
 * One section call. NEVER throws — incomplete, unparseable and request failure all resolve to
 * null, and the caller renders that section's deterministic fallback.
 *
 * Every failure path logs `[report] section <id>: <reason>` so "AI is broken" stays
 * distinguishable from "AI is off", which logs nothing at all. Reasons only: never the payload,
 * the parsed output, section text, or the facts pack — the pack carries church-specific scores
 * and admin prose.
 */
export async function composeSection(
  id: AiSectionId, facts: FactsPack, methodology: Methodology,
): Promise<unknown | null> {
  const entry = SECTION_REGISTRY[id];
  const copy = methodology.report.sections[id];
  try {
    const client = new OpenAI();
    const model = process.env.OPENAI_MODEL_PROSE ?? 'gpt-5.1';
    const response = await client.responses.parse(
      {
        model,
        max_output_tokens: entry.maxOutputTokens,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: `${methodology.report.style_spine}\n\n${copy.templates[facts.archetype]}` },
          { role: 'user', content: `Facts for "${copy.title}" — use no number or name absent from this:\n${JSON.stringify(entry.slice(facts), null, 2)}` },
        ],
        text: { format: zodTextFormat(entry.schema, `report_${id}`) },
      },
      { timeout: 30000, maxRetries: 0 },
    );

    if (response.status === 'incomplete') {
      console.warn(`[report] section ${id}: response incomplete (${response.incomplete_details?.reason ?? 'reason unreported'})`);
      return null;
    }
    const parsed = response.output_parsed;
    if (!parsed) {
      console.warn(`[report] section ${id}: model returned no parsed output`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[report] section ${id}: request failed:`, err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ai/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the replacement positive assertions to the ai-exclusion contract**

Append to `tests/outreach/ai-exclusion.test.ts`. These are what the Task 4 exemption trades for.

```ts
describe('the section composer sees the facts pack and nothing quoted', () => {
  const src = stripTs(readFileSync('lib/ai/sections.ts', 'utf8'));

  it('builds every slice by picking fields, never by omitting them', () => {
    // An omit-list silently widens the moment a field is added to FactsPack — and one of those
    // fields is the theme structure that carries quoted text. Picking cannot leak forward.
    expect(src).not.toMatch(/\.\.\.\s*facts\b/);
    expect(src).not.toMatch(/\.\.\.\s*f\b/);
  });

  it('reduces themes to label, gloss, support count and item ids', () => {
    expect(src).toContain('function themeDigest');
    expect(src).toMatch(/themeDigest[\s\S]{0,400}support_count/);
  });

  it('serializes only a slice into the model payload', () => {
    expect(src).toContain('entry.slice(facts)');
    expect(src).not.toContain('JSON.stringify(facts');
  });
});

describe('the gates never talk to the model', () => {
  it('only sections.ts and themes.ts call the API', () => {
    const gates = stripTs(readFileSync('lib/ai/section-gates.ts', 'utf8')).toLowerCase();
    expect(gates).not.toContain('openai');
    expect(gates).not.toContain('responses.parse');
  });
});
```

The second block reads `lib/ai/section-gates.ts`, which Task 7 creates. **Add that block in Task 7, not here** — `readFileSync` at describe scope on a missing file fails the suite. Add only the first block now.

- [ ] **Step 6: Prove the slice tripwire bites**

Change `s9`'s slice from `themes: themeDigest(f)` to `themes: f.themes`. Run `npx vitest run tests/ai/sections.test.ts` — "never carries a verbatim into any slice" must FAIL. Restore exactly.

- [ ] **Step 7: Run the full gates**

Run: `npx tsc --noEmit` (exit 0), `npx vitest run` (0 failures), `npx eslint tests/outreach` (0 problems; `lib/ai` and `tests/ai` are globalIgnored — do not cite lint there).

- [ ] **Step 8: Commit**

```bash
git add lib/ai/sections.ts tests/ai/sections.test.ts tests/outreach/ai-exclusion.test.ts
git commit -m "feat: add the section composer registry and calls"
```

---

### Task 7: `lib/ai/section-gates.ts` — the 6 gate families

Every gate needs an **accept** and a **reject** fixture. A gate with only a reject test can be satisfied by returning "fail" always; a gate with only an accept test can be satisfied by returning "pass" always.

**Files:**
- Create: `lib/ai/section-gates.ts`
- Modify: `tests/outreach/ai-exclusion.test.ts` (append the "gates never talk to the model" block from Task 6 Step 5)
- Test: `tests/ai/section-gates.test.ts`

**Interfaces:**
- Consumes: `AiSectionId`, `SECTION_REGISTRY` (`lib/ai/sections.ts`); `FactsPack` (`lib/report/facts.ts`); `Methodology`, `RequiredMention` (`lib/methodology/schema.ts`).
- Produces:
  ```ts
  export interface GateContext { facts: FactsPack; methodology: Methodology; labels: readonly string[] }
  /** null = passed. A string = the gate-family name that rejected it, for the log line. */
  export function gateSection(id: AiSectionId, parsed: unknown, ctx: GateContext): string | null;
  ```

- [ ] **Step 1: Write the failing tests — accept and reject per family**

Create `tests/ai/section-gates.test.ts`:

```ts
const ctx = { facts: constraintFacts, methodology, labels: ['Priscilla Vandermeer'] };
const goodS2 = { summary: `Overall health sits at ${constraintFacts.overall.capacity} out of 100, in the ${constraintFacts.overall.tier.name} band. ${constraintFacts.primary_constraint!.name} is holding the rest back.`, what_this_is_not: 'This is not a verdict on anyone.', context_bullets: [] };

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
  it('accepts numbers present in that section\'s own slice', () => {
    expect(gateSection('s2', goodS2, ctx)).toBeNull();
  });
  it('rejects an invented number', () => {
    expect(gateSection('s2', { ...goodS2, summary: goodS2.summary + ' Growth is up 37 percent.' }, ctx)).toBe('numeric containment');
  });
  it('rejects a number that exists in the pack but not in this section\'s slice', () => {
    // Scoped, not global: the whole pack densely covers 0-100, so a global allowed-set would
    // let a downstream category's score be reattached to the primary. Same rationale as
    // prose.ts:70-78.
    const other = constraintFacts.bottom_items[0]!.mean;
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ai/section-gates.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/section-gates`.

- [ ] **Step 3: Implement `lib/ai/section-gates.ts`**

```ts
import type { FactsPack } from '../report/facts';
import type { Methodology } from '../methodology/schema';
import { SECTION_REGISTRY, type AiSectionId } from './sections';

/**
 * The six gate families (parent spec line 73). All must pass, or that section falls back.
 *
 * Pure — no I/O, no SDK, no network. Exactly one file in this tree talks to the model, and it
 * is not this one; tests/outreach/ai-exclusion.test.ts pins that.
 */
export interface GateContext {
  facts: FactsPack;
  methodology: Methodology;
  /** Every run respondent's label. From a LabelSource at the call site — never a bare list. */
  labels: readonly string[];
}

/** Every int/decimal token, normalized by value. Copy of prose.ts:40-43's idiom, not an import:
 *  that module's export surface is the reword pipeline, and coupling the two would join things
 *  that change for different reasons — the same call view.ts:93 makes about `interp`. */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((t) => Number.parseFloat(t.replace(/,/g, '')));
}

/** Every string anywhere in the parsed section, flattened. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) allStrings(x, out);
  return out;
}

const THEME_WORDS: Record<string, string[]> = {
  systems: ['systems', 'systemic'],
  culture: ['culture', 'cultural'],
  theology: ['theology', 'theological'],
  relational: ['relational', 'relationship'],
};

export function gateSection(id: AiSectionId, parsed: unknown, ctx: GateContext): string | null {
  // 1. Field parity — the schema is the expectation. A shape miss and a blank required field
  // are the same failure: the section did not come back whole.
  const check = SECTION_REGISTRY[id].schema.safeParse(parsed);
  if (!check.success) return 'field parity';
  const strings = allStrings(check.data);
  if (strings.some((s) => s.trim().length === 0)) return 'field parity';

  const text = strings.join(' ');
  const lower = text.toLowerCase();

  // 2. Scoped numeric containment — against THIS section's slice, not the whole pack. The pack
  // densely covers 0-100 with every score and percentile, so a global allowed set would let a
  // number migrate from one section's subject to another's. Same rationale as prose.ts:70-78.
  const allowed = new Set(extractNumbers(JSON.stringify(SECTION_REGISTRY[id].slice(ctx.facts))));
  for (const n of extractNumbers(text)) if (!allowed.has(n)) return 'numeric containment';

  // 3. Required and banned mentions.
  const required = ctx.methodology.report.sections[id].required_mentions;
  const resolved: Record<string, string> = {
    tier_name: ctx.facts.overall.tier.name,
    primary_name: ctx.facts.primary_constraint?.name ?? '',
    overall_percent: String(ctx.facts.overall.capacity),
  };
  for (const key of required) {
    const needle = resolved[key];
    // A primary_name requirement is vacuous when there is no primary constraint — skip rather
    // than reject, or every capacity report fails a gate written for constraint reports.
    if (!needle) continue;
    if (!lower.includes(needle.toLowerCase())) return 'required mention';
  }
  if (ctx.facts.archetype === 'constraint' && ctx.facts.primary_constraint && (id === 's2' || id === 's4')) {
    if (!lower.includes(ctx.facts.primary_constraint.name.toLowerCase())) return 'required mention';
  }
  for (const phrase of ctx.methodology.report.banned_phrases[ctx.facts.archetype]) {
    if (lower.includes(phrase.toLowerCase())) return 'banned phrase';
  }
  // P1 register calibration: consolation framing is banned below the 70 tier boundary.
  if (ctx.facts.overall.capacity < 70) {
    for (const phrase of ctx.methodology.report.banned_phrases.capacity) {
      if (lower.includes(phrase.toLowerCase())) return 'banned phrase';
    }
  }

  // 4. Anonymity — no respondent label anywhere in the section. Fail closed: the alternative is
  // a named individual on a rendered report.
  for (const label of ctx.labels) {
    if (label && lower.includes(label.toLowerCase())) return 'anonymity';
  }

  // 5. S7 pattern-claim consistency — a "none of these are X" claim is permitted only when the
  // computed bottom-6 theme counts make it true.
  if (id === 's7') {
    const claim = (check.data as { pattern_claim: string | null }).pattern_claim;
    if (claim) {
      const c = claim.toLowerCase();
      if (c.includes('none')) {
        for (const [theme, words] of Object.entries(THEME_WORDS)) {
          if (!words.some((w) => c.includes(w))) continue;
          if ((ctx.facts.pattern_counts[theme as keyof FactsPack['pattern_counts']] ?? 0) > 0) return 'pattern claim';
        }
      }
    }
  }

  // 6. Length ceiling — total rendered characters for this section.
  if (text.length > ctx.methodology.report.sections[id].length_ceiling) return 'length ceiling';

  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ai/section-gates.test.ts`
Expected: PASS — every accept case and every reject case.

- [ ] **Step 5: Append the "gates never talk to the model" block to the ai-exclusion contract**

Add the second describe block written out in Task 6 Step 5 to `tests/outreach/ai-exclusion.test.ts`. It reads `lib/ai/section-gates.ts`, which now exists.

- [ ] **Step 6: Prove each gate's tripwire bites**

One mutation at a time, restoring exactly after each. Return `null` early from each family in turn — before gate 2, before gate 3's banned loop, before gate 4, before gate 5, before gate 6 — and confirm that family's **reject** case fails while its **accept** case still passes. A gate whose reject case survives the removal of the gate is vacuous.

- [ ] **Step 7: Run the full gates**

Run: `npx tsc --noEmit` (exit 0), `npx vitest run` (0 failures), `npx eslint tests/outreach` (0 problems).

- [ ] **Step 8: Commit**

```bash
git add lib/ai/section-gates.ts tests/ai/section-gates.test.ts tests/outreach/ai-exclusion.test.ts
git commit -m "feat: add per-section fact-check gates"
```

---

### Task 8: `compose.ts` — the orchestrator and the render-time assembler

**Files:**
- Create: `lib/report/compose.ts`
- Test: `tests/report/compose.test.ts`

**Interfaces:**
- Consumes: `composeSection`, `SECTION_REGISTRY`, `AI_SECTION_IDS`, `AiSectionId` (`lib/ai/sections.ts`); `gateSection` (`lib/ai/section-gates.ts`); `fallbackSections`, `SectionBody` (`lib/report/fallback-sections.ts`); `FactsPack` (`lib/report/facts.ts`); `SectionId` (`lib/methodology/schema.ts`). (**AS SHIPPED:** `sectionSlice` was in this list and is not in the codebase — see fix round A.)
- Produces:
  ```ts
  export type SectionSource = 'ai' | 'fallback';
  export interface ComposedReport {
    sections: Partial<Record<AiSectionId, unknown>>;              // AI output only — persisted
    section_sources: Record<SectionId, SectionSource>;            // every section, C3
  }
  export async function composeReport(args: {
    facts: FactsPack; methodology: Methodology; labels: readonly string[];
  }): Promise<ComposedReport>;                                    // NEVER throws

  export interface AssembledSection { id: SectionId; source: SectionSource; ai: unknown | null; fallback: SectionBody }
  export function assembleReport(args: {
    facts: FactsPack; methodology: Methodology;
    reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
    persisted: { inputs_hash: string; sections: unknown } | null;
    liveInputsHash: string;
  }): AssembledSection[];
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/report/compose.test.ts`. Mock `composeSection` per-id via `vi.mock('@/lib/ai/sections', …)`, keeping the real registry.

```ts
describe('composeReport', () => {
  it('marks every section ai when all seven calls pass their gates', async () => {
    mockAllSectionsGood();
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    for (const id of AI_SECTION_IDS) expect(r.section_sources[id], id).toBe('ai');
  });

  it('marks the deterministic sections fallback always', async () => {
    mockAllSectionsGood();
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    for (const id of ['s1','s3','s8','s10','s11','appendix'] as const) {
      expect(r.section_sources[id], id).toBe('fallback');
    }
  });

  it('re-attempts only the failed sections, exactly once', async () => {
    const calls: string[] = [];
    mockSections((id) => { calls.push(id); return id === 's6' && calls.filter(c => c === 's6').length === 1 ? null : good(id); });
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(calls.filter((c) => c === 's6')).toHaveLength(2);   // one re-attempt
    expect(calls.filter((c) => c === 's2')).toHaveLength(1);   // untouched
    expect(r.section_sources.s6).toBe('ai');
  });

  it('re-attempts a gate failure as well as a call failure', async () => {
    // The model is nondeterministic, so a re-roll is a genuine fix, not a hope (C2).
    let n = 0;
    mockSections((id) => (id === 's2' ? (++n === 1 ? gateFailingS2() : good('s2')) : good(id)));
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(n).toBe(2);
    expect(r.section_sources.s2).toBe('ai');
  });

  it('gives up after the single re-attempt and persists a partial report', async () => {
    mockSections((id) => (id === 's6' ? null : good(id)));
    const r = await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(r.section_sources.s6).toBe('fallback');
    expect(r.sections.s6).toBeUndefined();
    expect(r.section_sources.s2).toBe('ai');       // partial persists (C3)
  });

  it('never throws when every call rejects', async () => {
    mockSectionsThrow();
    await expect(composeReport({ facts: constraintFacts, methodology, labels: [] })).resolves.toBeDefined();
  });

  it('logs a distinct reason per failed section and nothing when AI is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSections((id) => (id === 's6' ? null : good(id)));
    await composeReport({ facts: constraintFacts, methodology, labels: [] });
    expect(warn.mock.calls.flat().join(' ')).toContain('[report] section s6:');
    warn.mockRestore();
  });
});

describe('assembleReport', () => {
  const live = 'h'.repeat(64);

  it('renders a persisted section when the hash matches', () => {
    const persisted = { inputs_hash: live, sections: { s2: goodS2 } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out.find((s) => s.id === 's2')!.source).toBe('ai');
  });

  it('falls back when the hash is stale', () => {
    const persisted = { inputs_hash: 'x'.repeat(64), sections: { s2: goodS2 } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out.find((s) => s.id === 's2')!.source).toBe('fallback');
  });

  it('falls back when there is no persisted row at all', () => {
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted: null, liveInputsHash: live });
    for (const s of out) expect(s.source, s.id).toBe('fallback');
  });

  it('falls back rather than crashing on a malformed persisted section', () => {
    // A reports row outlives the code that wrote it and `sections` is untyped jsonb, so each
    // persisted section is re-parsed against its CURRENT schema at render.
    const persisted = { inputs_hash: live, sections: { s2: { summary: 42 } } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out.find((s) => s.id === 's2')!.source).toBe('fallback');
  });

  it('returns a complete report from a partial persisted row', () => {
    const persisted = { inputs_hash: live, sections: { s2: goodS2 } };
    const out = assembleReport({ facts: constraintFacts, methodology, reflections: [], persisted, liveInputsHash: live });
    expect(out).toHaveLength(13);
    for (const s of out) expect(s.fallback.body.trim().length, s.id).toBeGreaterThan(0);
    expect(out.filter((s) => s.source === 'ai')).toHaveLength(1);
  });

  it('never reads the persisted facts blob', () => {
    // C5 + CT-2(c): facts is write-only provenance. Rendering from it would stop every surface
    // re-deriving the diagnosis from responses per request.
    const src = readFileSync('lib/report/compose.ts', 'utf8');
    expect(src).not.toMatch(/persisted\s*\.\s*facts/);
    expect(src).not.toMatch(/\bfacts\b\s*:\s*persisted/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/compose.test.ts`
Expected: FAIL — cannot resolve `@/lib/report/compose`.

- [ ] **Step 3: Implement `lib/report/compose.ts`**

```ts
/**
 * Both halves of the composer. Generation (composeReport) runs once per church behind
 * generateDiagnosis; assembly (assembleReport) runs per request on every render surface.
 *
 * NEITHER THROWS. Generation resolves every failure to that section's fallback; assembly
 * resolves a stale, absent or malformed persisted section the same way. A report always
 * renders complete.
 */

export async function composeReport(args: {
  facts: FactsPack; methodology: Methodology; labels: readonly string[];
}): Promise<ComposedReport> {
  const { facts, methodology, labels } = args;
  const ctx = { facts, methodology, labels };
  const sections: Partial<Record<AiSectionId, unknown>> = {};

  const attempt = async (id: AiSectionId): Promise<boolean> => {
    const parsed = await composeSection(id, facts, methodology);  // never throws → null on failure
    if (parsed === null) return false;
    const reason = gateSection(id, parsed, ctx);
    if (reason !== null) {
      console.warn(`[report] section ${id}: ${reason}`);
      return false;
    }
    sections[id] = parsed;
    return true;
  };

  // Promise.allSettled, not Promise.all: one rejection must not cancel six good sections. The
  // per-section functions already never throw, so this is belt and braces at a boundary where
  // the cost of being wrong is the whole report.
  const first = await Promise.allSettled(AI_SECTION_IDS.map((id) => attempt(id).then((ok) => ({ id, ok }))));
  const failed = first
    .map((r, i) => (r.status === 'fulfilled' && r.value.ok ? null : AI_SECTION_IDS[i]!))
    .filter((id): id is AiSectionId => id !== null);

  // ONE re-attempt of only the failed sections (C2). Gate failures are retried alongside call
  // failures: the model is nondeterministic, so a re-roll is a genuine fix. Worst case 2x calls,
  // typical case 1x. generateDiagnosis is effectively one-shot per church (save_diagnosis
  // completes the run and get_run_responses filters in_progress — actions.ts:135), so this
  // bounded retry is the only defence against a transient blip pinning a section to fallback
  // permanently.
  if (failed.length > 0) await Promise.allSettled(failed.map((id) => attempt(id)));

  const section_sources = Object.fromEntries(
    (Object.keys(methodology.report.sections) as SectionId[]).map((id) => [
      id,
      (AI_SECTION_IDS as readonly string[]).includes(id) && sections[id as AiSectionId] !== undefined
        ? 'ai' : 'fallback',
    ]),
  ) as Record<SectionId, SectionSource>;

  return { sections, section_sources };
}

export function assembleReport(args: {
  facts: FactsPack; methodology: Methodology;
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>;
  persisted: { inputs_hash: string; sections: unknown } | null;
  liveInputsHash: string;
}): AssembledSection[] {
  const fallbacks = fallbackSections({ facts: args.facts, methodology: args.methodology, reflections: args.reflections });
  // A stale or absent hash means fallback, never a stale AI section. Deterministic sections are
  // always computed live, exactly as fallbackProse is today.
  const fresh = args.persisted !== null && args.persisted.inputs_hash === args.liveInputsHash;
  const stored = (fresh && args.persisted && typeof args.persisted.sections === 'object' && args.persisted.sections !== null)
    ? (args.persisted.sections as Record<string, unknown>) : {};

  return (Object.keys(args.methodology.report.sections) as SectionId[]).map((id) => {
    const fallback = fallbacks[id];
    if (!(AI_SECTION_IDS as readonly string[]).includes(id)) return { id, source: 'fallback' as const, ai: null, fallback };
    const raw = stored[id];
    if (raw === undefined) return { id, source: 'fallback' as const, ai: null, fallback };
    // Re-validate. A reports row outlives the code that wrote it and `sections` is untyped
    // jsonb, so a shape mismatch is this section's fallback, never a crash.
    const check = SECTION_REGISTRY[id as AiSectionId].schema.safeParse(raw);
    return check.success
      ? { id, source: 'ai' as const, ai: check.data, fallback }
      : { id, source: 'fallback' as const, ai: null, fallback };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/report/compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the re-attempt bound bites**

Change `if (failed.length > 0) await Promise.allSettled(...)` to a `while (failed.length > 0)` loop. The "re-attempts only the failed sections, exactly once" test must FAIL (or hang — kill it and note that as the failure). Restore exactly. Then delete the re-attempt line entirely and confirm "re-attempts a gate failure as well as a call failure" FAILS. Restore exactly.

- [ ] **Step 6: Run the full gates**

Run: `npx tsc --noEmit` (exit 0), `npx vitest run` (0 failures), `npx eslint lib/report tests/report` (0 problems).

- [ ] **Step 7: Commit**

```bash
git add lib/report/compose.ts tests/report/compose.test.ts
git commit -m "feat: add the report composer and render-time assembler"
```

---

### Task 9: `reports` table, `save_report` RPC, pgTAP

⛔ Do **not** run `npm run test:db`, `supabase db push`, or `supabase db reset` in this task or any other. Natalie applies migrations. Write the files; verify them by reading.

**Files:**
- Create: `supabase/migrations/20260811000100_reports.sql`
- Create: `supabase/migrations/20260811000200_rpc_save_report.sql`
- Create: `supabase/tests/reports.test.sql`

- [ ] **Step 1: Write the table migration**

`supabase/migrations/20260811000100_reports.sql`:

```sql
-- The composed executive report, one row per (run, inputs_hash). Copies the `diagnoses`
-- pattern with one deliberate addition: church_id is DENORMALIZED here. The diagnoses
-- cross-church cache-collision bug came from having to reach church through run_id, and every
-- read of this table is church-scoped.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,
  inputs_hash text not null,
  methodology_version text not null,
  archetype text not null check (archetype in ('capacity','constraint','foundation')),
  tier text not null,
  -- Write-only provenance: the exact facts the gates judged against, so a report that reads
  -- wrong is diagnosable after the fact. No renderer reads it — rendering from it would break
  -- the invariant that every surface re-derives the diagnosis from responses per request.
  facts jsonb not null,
  sections jsonb not null,
  section_sources jsonb not null,
  generated_at timestamptz default now(),
  unique (run_id, inputs_hash)
);

alter table public.reports enable row level security;

-- Admins only, inlining the m.role='admin' idiom used by diagnoses_select / churches_update
-- (there is no is_church_admin helper).
create policy reports_select on public.reports for select to authenticated
  using (exists (select 1 from public.church_members m
                 join public.assessment_runs r on r.church_id = m.church_id
                 where r.id = reports.run_id and m.user_id = auth.uid() and m.role = 'admin'));

-- No insert/update/delete grant and no write policy: save_report is the only way in.
```

- [ ] **Step 2: Write the RPC migration**

`supabase/migrations/20260811000200_rpc_save_report.sql`:

```sql
-- 4 args, mirroring save_diagnosis. archetype, tier, facts, sections and section_sources are
-- read out of p_payload into their own columns, so the columns stay queryable and constrained
-- while the signature never has to change when a section is added.
create function public.save_report(
  p_church_id uuid,
  p_inputs_hash text,
  p_methodology_version text,
  p_payload jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_run_id uuid;
begin
  -- ⚠️ NO STATUS FILTER. save_diagnosis resolves `status = 'in_progress'` and then flips the run
  -- to 'complete'; this function runs AFTER it in the same action, so an in_progress predicate
  -- would find no run and raise on every call. Same shape as the run lookup in
  -- app/app/[churchId]/actions.ts.
  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id
  order by created_at asc
  limit 1;
  if v_run_id is null then
    raise exception 'no run for this church';
  end if;

  -- ⚠️ require_church_admin takes a RUN id, not a church id
  -- (20260718000300_rpc_report_share_manage.sql:9). It also authenticates, so there is no
  -- separate auth.uid() null check here. It has no execute grant — reachable only because this
  -- function is security definer and runs as the owner.
  perform public.require_church_admin(v_run_id);

  insert into public.reports (
    run_id, church_id, inputs_hash, methodology_version,
    archetype, tier, facts, sections, section_sources
  )
  values (
    v_run_id, p_church_id, p_inputs_hash, p_methodology_version,
    p_payload ->> 'archetype',
    p_payload ->> 'tier',
    coalesce(p_payload -> 'facts', '{}'::jsonb),
    coalesce(p_payload -> 'sections', '{}'::jsonb),
    coalesce(p_payload -> 'section_sources', '{}'::jsonb)
  )
  on conflict (run_id, inputs_hash) do nothing;
end;
$$;

revoke all on function public.save_report(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_report(uuid, text, text, jsonb) to authenticated;
```

- [ ] **Step 3: Write the pgTAP file**

`supabase/tests/reports.test.sql`, following whatever `plan()`/`finish()` harness the existing files in that directory use. Cover:

1. `has_table('public','reports')` and `has_column` for all 11 columns.
2. `col_type_is` on `facts`, `sections`, `section_sources` = `jsonb`.
3. The unique constraint on `(run_id, inputs_hash)` exists.
4. Inserting `archetype = 'nope'` raises (check constraint).
5. `row_security_active('public.reports')` is true.
6. Exactly one policy on `reports`, named `reports_select`, `for select`.
7. `has_function('public','save_report', ARRAY['uuid','text','text','jsonb'])` and it is `security definer`.
8. `authenticated` has execute on `save_report`; `anon` and `public` do not.
9. `authenticated` has **no** insert privilege on `public.reports`.
10. A non-admin member calling `save_report` raises `insufficient_privilege`.

- [ ] **Step 4: Verify by reading, not by running**

Re-read all three files. Confirm: the run lookup has no `status` predicate; `require_church_admin` is passed `v_run_id`; the column list in the `insert` matches the `values` list one-for-one; the `revoke`/`grant` argument types match the signature exactly.

- [ ] **Step 5: Run the code gates**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (0 failures) — this task changes no TypeScript, so both must be unchanged from Task 8.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260811000100_reports.sql supabase/migrations/20260811000200_rpc_save_report.sql supabase/tests/reports.test.sql
git commit -m "feat: add the reports table and save_report rpc"
```

---

### Task 10: Wire generation into `generateDiagnosis`

The last task, and the only one that changes a shipped file's runtime behaviour. The existing M5b prose block **stays**: the 10-block diagnosis page is live until plan 4, and removing its input would regress a shipped surface. The two blocks are wrapped separately so neither can break the other or the committed diagnosis.

**Files:**
- Modify: `app/app/[churchId]/actions.ts` (append a block after the M5b block ending at `:170`, before `revalidatePath` at `:172`)
- Test: `tests/report/generate-report-wiring.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/report/generate-report-wiring.test.ts`. Source-structure assertions, matching how `tests/outreach/ai-exclusion.test.ts` and `tests/ai/prose-cache-scope.test.ts` already pin this file — the runtime path needs a live Supabase client, which these tests must not require.

```ts
const src = readFileSync('app/app/[churchId]/actions.ts', 'utf8');

describe('the report generation block', () => {
  it('sits after save_diagnosis', () => {
    expect(src.indexOf('save_diagnosis')).toBeLessThan(src.indexOf('composeReport'));
  });

  it('is gated by PROSE_MODE, the same gate as the prose block', () => {
    expect(src.match(/PROSE_MODE/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('is wrapped in its own try/catch, separate from the prose block', () => {
    // Neither best-effort block may break the other, the committed diagnosis, or the redirect.
    expect(src.match(/catch \(err\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('computes the inputs hash before the cache check', () => {
    expect(src.indexOf('reportInputsHash')).toBeLessThan(src.indexOf("from('reports')"));
  });

  it('builds reflection rows keyed on respondent_id, never respondent_label', () => {
    // respondent_label is display-only and can collide across two people; counting on it would
    // undercount and weaken the k>=3 gate.
    const block = src.slice(src.indexOf('const reflectionRows'), src.indexOf('clusterThemes'));
    expect(block).toContain('respondent_key: r.respondent_user_id ?? r.respondent_label');
    expect(block).not.toMatch(/respondent_key:\s*r\.respondent_label\b/);
  });

  it('passes a knownLabels source, never a bare array', () => {
    expect(src).toMatch(/clusterThemes\([\s\S]{0,120}knownLabels\(/);
    expect(src).toMatch(/labelSource:\s*labelSource/);
  });

  it('persists a null clustering result differently from an empty one', () => {
    // null = the task failed (S8 falls back, no themes persisted); [] = determinate, persist.
    expect(src).toContain('themes === null');
  });

  it('calls save_report with the four-argument signature', () => {
    expect(src).toMatch(/save_report[\s\S]{0,200}p_inputs_hash[\s\S]{0,200}p_methodology_version[\s\S]{0,200}p_payload/);
  });

  it('never widens the raw-row mapping', () => {
    // The reflection rows are built from `raw`, NOT from `responses` — Response[] deliberately
    // drops `.reflection` and tests/outreach/ai-exclusion.test.ts pins that it stays dropped.
    expect(src).toMatch(/\.map\(\(r: RunResponseRow\) => \(\{[\s\S]*?\}\)\)/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/generate-report-wiring.test.ts`
Expected: FAIL — none of these strings are in the file yet.

- [ ] **Step 3: Add the block to `app/app/[churchId]/actions.ts`**

Insert after the M5b block's closing `}` at `:170` and before `revalidatePath` at `:172`. New imports at the top of the file: `buildFacts` and `type ChurchFacts` from `@/lib/report/facts`, `knownLabels` from `@/lib/report/anonymity`, `clusterThemes` from `@/lib/ai/themes`, `reportInputsHash` from `@/lib/report/report-hash`, `composeReport` from `@/lib/report/compose`.

The `churches` select at `:45-49` widens from `'attendance_band'` to the full profile column list (name + the 12 profile columns) so `buildFacts` gets a real `ChurchFacts`. `church?.attendance_band ?? ''` at `:87` keeps working unchanged.

```ts
  // Plan 3: best-effort executive report. A SECOND block, deliberately separate from the M5b
  // prose block above — the 10-block diagnosis page is still live until plan 4, so both run.
  // Same PROSE_MODE gate, so an unset mode makes no API call and logs nothing at all. The
  // diagnosis is already committed, so nothing in here may break it or the redirect.
  if ((process.env.PROSE_MODE ?? 'fallback') !== 'fallback') {
    try {
      // Reflection rows come from `raw`, NOT from `responses`: Response[] deliberately drops
      // `.reflection` and tests/outreach/ai-exclusion.test.ts pins that it stays dropped.
      // respondent_key is the STABLE identity (respondent_user_id ?? respondent_label), never
      // respondent_label alone, which is display-only and can collide across two people —
      // counting on labels would undercount and weaken the k>=3 gate.
      const reflectionRows = (raw ?? [])
        .filter((r: RunResponseRow) => r.reflection != null && r.reflection.trim().length > 0)
        .map((r: RunResponseRow) => ({
          item_id: r.item_id,
          respondent_key: r.respondent_user_id ?? r.respondent_label,
          text: (r.reflection as string).trim(),
        }))

      const labelSource = knownLabels(responses)

      // INPUTS ONLY, and computed BEFORE the cache check: clustered themes are model output, so
      // they must never participate in the key that decides whether to call the model.
      const baseFacts = buildFacts({
        diagnosis,
        methodology: derived.effectiveMethodology,
        responses,
        church: churchFacts,
        completedAt: new Date().toISOString(),
        labelSource,
      })
      const inputsHash = reportInputsHash({
        methodologyVersion: diagnosis.methodology_version,
        responseHash: hash,
        methodology: derived.effectiveMethodology,
        reflections: reflectionRows,
        profile: baseFacts.profile,
        reportVersion: derived.effectiveMethodology.report.version,
      })

      // Cache check scoped to THIS church's run, for the same reason the prose cache above is:
      // an unscoped lookup lets a sibling church's row suppress generation permanently. An
      // unresolvable run degrades to a MISS (generate), never a skip.
      let alreadyReported = false
      if (run) {
        const { data: rows } = await supabase
          .from('reports')
          .select('id')
          .eq('run_id', run.id)
          .eq('inputs_hash', inputsHash)
        alreadyReported = (rows ?? []).length > 0
      }

      if (!alreadyReported) {
        // null = the task failed: S8 falls back to the per-area voices lists and no themes are
        // persisted. [] = determinate, the model answered and nothing survived the gates —
        // persist as-is; retrying would produce the same verdict.
        const themes = await clusterThemes(reflectionRows, derived.effectiveMethodology, labelSource)
        const facts = themes === null
          ? baseFacts
          : buildFacts({
              diagnosis,
              methodology: derived.effectiveMethodology,
              responses,
              church: churchFacts,
              completedAt: baseFacts.cover.completed_at,
              labelSource,
              themes,
            })

        const composed = await composeReport({
          facts,
          methodology: derived.effectiveMethodology,
          labels: labelSource.kind === 'known' ? labelSource.labels : [],
        })

        await supabase.rpc('save_report', {
          p_church_id: churchId,
          p_inputs_hash: inputsHash,
          p_methodology_version: diagnosis.methodology_version,
          p_payload: {
            archetype: facts.archetype,
            tier: facts.overall.tier.id,
            facts,
            sections: composed.sections,
            section_sources: composed.section_sources,
          },
        })
      }
    } catch (err) {
      // Backstop for the Supabase calls around composeReport (cache-check SELECT, save_report
      // RPC) — NOT for composeReport itself, which never throws. Swallow everything so the
      // committed diagnosis and the redirect are never affected. Reason only.
      console.warn('[report] generation failed:', err instanceof Error ? err.message : 'unknown error')
    }
  }
```

Define `churchFacts` next to the widened `churches` select:

```ts
  const churchFacts: ChurchFacts = {
    name: church?.name ?? '',
    denomination: church?.denomination ?? null,
    context: church?.context ?? null,
    attendance_band: church?.attendance_band ?? null,
    adults_band: church?.adults_band ?? null,
    staff_fte_band: church?.staff_fte_band ?? null,
    budget_band: church?.budget_band ?? null,
    church_age_band: church?.church_age_band ?? null,
    growth_trajectory: church?.growth_trajectory ?? null,
    campuses_band: church?.campuses_band ?? null,
    facility_status: church?.facility_status ?? null,
    leadership_history: church?.leadership_history ?? null,
    consultant_notes: church?.consultant_notes ?? null,
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/report/generate-report-wiring.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the existing contracts still hold**

Run: `npx vitest run tests/outreach/ai-exclusion.test.ts tests/ai/prose-cache-scope.test.ts`
Expected: PASS. In particular the `generateProse` call-site pin and the raw-row mapping allowlist must both still match — this task adds a second consumer of `raw` but must not touch the `RunResponseRow → Response[]` map.

- [ ] **Step 6: Prove the wiring tripwires bite**

One mutation at a time, restoring exactly. (a) Change `respondent_key: r.respondent_user_id ?? r.respondent_label` to `respondent_key: r.respondent_label` → the respondent-key test must FAIL. (b) Move the `reportInputsHash` call below the `reports` cache check → the ordering test must FAIL. (c) Replace `knownLabels(responses)` with `{ kind: 'known', labels: [] }` → the knownLabels test must FAIL.

- [ ] **Step 7: Run the full gates**

Run: `npx tsc --noEmit` — exit 0.
Run: `npx vitest run` — 0 failures; test count is 1027 plus every case added across Tasks 1–10.
Run: `npx eslint app lib/report tests/report tests/outreach` — 0 problems.

- [ ] **Step 8: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/actions.ts" tests/report/generate-report-wiring.test.ts
git commit -m "feat: wire executive report generation into generateDiagnosis"
```

---

## Verification before completion

Before claiming plan 3 done, run and paste the actual output of:

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Then confirm each of these by inspection, not assertion:

- [ ] `git log --oneline master..HEAD` shows the documentation commit plus exactly ten task commits, each with a bare conventional-commit subject and no trailer.
- [ ] `git status --porcelain` shows only the three known never-staged entries.
- [ ] `git diff --numstat master..HEAD` — no unexpected file, and no deletions in files a task only appended to.
- [ ] Nothing user-visible changed: the diagnosis page, the share page and the PDF route render exactly as they did on `master`.
- [ ] The migrations are written but **not applied**. Report to Natalie that `20260811000100_reports.sql` and `20260811000200_rpc_save_report.sql` need applying, plus `npm run test:db` for the pgTAP — both owner actions.
- [ ] `PROSE_MODE` unset ⇒ no `[report]` log line at all. That is the "AI is off" ≠ "AI is broken" invariant.

## Spec coverage

| Spec item | Task |
|---|---|
| C1 `LabelSource`, redacted omits | 1 |
| C2 one re-attempt | 8 |
| C3 partial persist + `section_sources` | 8, 9 |
| C4 4-arg `save_report` | 9 |
| C5 `facts` write-only | 9 (column), 8 (the no-read test) |
| C6 registry in TS, copy in YAML | 2, 6 |
| §1.2 narrowed guard, `'plateaued'` restored | 1 |
| §1.3 share path can never hash-match | 3 |
| §1.4 PDF guard unchanged | — (plan 5; no change here, asserted by the untouched `lib/report/pdf/**`) |
| §2 generation flow, `respondent_key`, null vs `[]` | 10 |
| §3 six modules + ai-exclusion contract | 2, 3, 4, 5, 6, 7, 8 |
| §4 data model, `require_church_admin(run_id)`, RLS, pgTAP | 9 |
| §5 error handling, reasons-only logging | 6, 7, 8, 10 |
| §6 testing: gates accept+reject, golden fixtures per archetype, partial row, malformed section, tripwires | 5, 6, 7, 8 |
| Parent P1 tier / P4 deterministic S10-S11 / P7 `report.yaml` | 2, 5 |
| Parent 12-section skeleton | 5 (all 13), 6 (the 7 AI ones) |
