# Final Report — Plan 5 of 5: PDF Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PDF surface off the dead 10-block `ReportView` model onto the same 13-section `AssembledSection[]` the diagnosis page renders, add a stale-report notice and regenerate path, then delete the model left behind.

**Architecture:** A new dependency-injected resolver (`lib/report/resolve.ts`) owns the facts → hash → read → revalidate-themes → assemble pipeline that today lives inline in `page.tsx`. Both the diagnosis page and the PDF route call it — exactly two call sites, asserted by occurrence count. `lib/report/pdf/document.tsx` is rewritten as a react-pdf mirror of the web renderer, and the fail-closed anonymity guard is re-homed off the dying `ReportView` fields onto the assembled sections.

**Tech Stack:** Next.js App Router (Server Components + server actions), TypeScript, Supabase (anon-key RLS client, RPCs), `@react-pdf/renderer`, zod 3.25.76 (imported from `zod/v4`), vitest.

**Source spec:** `docs/superpowers/specs/2026-08-12-final-report-5-pdf-design.md` (APPROVED 2026-08-12). Read it before starting. This plan implements it; where the two disagree, **the spec wins except at the one point recorded under "Spec conflict resolved during planning" below.**

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Gates, run all three at every task boundary:** `npx tsc --noEmit` → **0 errors** · `npx vitest run` → **0 failures at the expected count** · `npx eslint .` → **0 problems**.
- ⚠️ **`npx eslint` exits 0 even when it reports warnings.** Judge by the **problem count** printed in the summary line, never by the exit code.
- ⚠️ **`npx vitest run` can exit 0 while collecting FEWER FILES.** Judge by **test-count delta**. Baseline entering this plan: **183 files / 1209 tests / 0 failures**.
- ⚠️ **A green vitest proves nothing about tsc.** Run both, every task.
- **Test files must be `.ts` and JSX-free.** `vitest.config` is `include: ['tests/**/*.test.ts']` — a `.tsx` test file is **silently uncollected** and reads as a passing gate. Build React elements with `createElement`.
- **Do not modify `vitest.config`.**
- **No new dependencies.** No methodology version bump. zod stays pinned `3.25.76`, imported from `zod/v4`.
- **No migration.** `save_report` (`20260811000200_rpc_save_report.sql`) has no status filter, resolves the run through the status-agnostic `current_run()`, is `require_church_admin`-gated, and ends `on conflict (run_id, inputs_hash) do nothing`.
- **Logging is reasons-only** — never payloads, church data, respondent data, or model output.
- **eslint scope:** `globalIgnores` covers `supabase/**`, `lib/ai/**`, `lib/engine/**`, `lib/methodology/**`, `methodology/**`, `docs/**`, `tests/ai/**`, `tests/engine/**`, `tests/methodology/**`, `tests/smoke.test.ts`. **`app/**`, `lib/report/**`, `lib/data/**`, `tests/report/**` and `tests/outreach/**` ARE linted.**
- **Bracket paths need literal pathspecs.** Any `git add` touching `[churchId]`, `[runId]`, or `[shareToken]` must use `GIT_LITERAL_PATHSPECS=1` and quote the path.
- **Explicit git paths only.** Never `git add -A`. Never stage `.claude/` or the two untracked legacy plan docs in `docs/superpowers/plans/`.
- **Commit messages are a bare conventional-commit subject with NO trailer.**
- ⛔ **Never merge, push, or force-push.** ⛔ Never run `npm run test:db`, `supabase db push|reset|start`, or `psql`.
- 🔑 **Commit before running a verification mutation.** Revert it **by hand with the exact inverse edit** — never `git checkout` / `stash` / `reset` — then re-run the covering test.
- Say **"UNSHIPPED"**, never "inert".
- `@react-pdf/renderer` **cannot render DOM components.** `lib/report/pdf/document.tsx` hand-duplicates the web styling and has never imported a web component. Do not "reuse" `sections.tsx` in the PDF.

---

## Spec conflict resolved during planning — read this before Task 1

The spec pins two clauses that are individually right and **jointly contradictory**:

- **D-P5-5 / Architecture:** the `reports` read becomes hash-addressed — `.eq('inputs_hash', liveInputsHash)`.
- **Architecture, resolver bullet 3:** `stale` is `persisted !== null && persisted.inputs_hash !== inputsHash`.

A hash-addressed query returns either a row **whose `inputs_hash` equals the live hash** or nothing. So `persisted.inputs_hash !== inputsHash` can never be true, `stale` would be permanently `false`, D-P5-4's notice and regenerate control would never render, and **all three gates would stay green** — the "a `.filter`/`.match` collector that can never populate" fail-open class.

**Resolution, preserving both decisions unchanged:** the read seam returns a lookup, not a row.

```ts
{ matched: PersistedReportRow | null; anyExists: boolean }
```

- `matched` is the hash-addressed row → **D-P5-5 intact.** The revert scenario in the spec's "Why the hash-addressed read is now mandatory" works exactly as written: live hash returns to H1, the query finds R1, AI renders.
- `anyExists` is "this run has at least one `reports` row, of any hash".
- **`stale = matched === null && anyExists`** — there is a persisted report, but not for these inputs → **D-P5-4 intact**, and the notice cannot fire for a church that has simply never generated a report.

⚠️ **This is a planning ruling, not a re-opened decision.** D-P5-1 through D-P5-9 all stand. It is on Natalie's glance list.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `lib/data/reports.ts` | The **only** home for the `reports` query text. ADR-0002 data-access seam, mirroring `lib/data/churches.ts`. Exports `readPersistedReport` + its row/lookup types. |
| `lib/report/resolve.ts` | The shared pipeline: facts → hash → injected read → revalidate themes → rebuild facts → assemble. **No Supabase import** — the read is injected, which is what makes it unit-testable and gives `revalidatedThemes` real coverage. Hosts `revalidatedThemes` + `isThemeClusterFact`, moved verbatim from `page.tsx`. |
| `tests/report/resolve.test.ts` | Seam behaviour + the two-call-site occurrence counts. |
| `tests/report/pdf-sections.test.ts` | The rewritten PDF document + the re-homed anonymity guard. |
| `tests/report/regenerate.test.ts` | The regenerate action's wiring. |

**Modified**

| File | Change |
|---|---|
| `app/app/[churchId]/diagnosis/page.tsx` (316) | Loses ~90 lines to the seam. Gains the stale notice + regenerate control. |
| `lib/report/pdf/document.tsx` (451) | Rewritten onto `AssembledSection[]`. |
| `lib/report/pdf/render.ts` (34) | Guard re-homed off `props.view.*` onto sections + `labels`. |
| `app/api/report/[runId]/pdf/route.ts` (168) | Drops `resolveReportView` / `fallbackProse` / the `ReportBlocks` thunk; gains the seam + `resolveScoreability`. |
| `app/app/[churchId]/actions.ts` (282) | Gains the `regenerateReport` server action. |
| `lib/report/view.ts` (525) | **Splits** in Phase 4 — see the warning below. |

> ⚠️ **`view.ts` does NOT die — it SPLITS.** Four exports have live non-PDF consumers and **survive**: `interp` (`facts.ts`, `fallback-sections.ts`), `readingBand` (`fallback-sections.ts`), `buildOutreachVoices` (`fallback-sections.ts`), and `resolveScoreability` + `ScoreabilityResolution` (**both** `diagnosis/page.tsx:8` **and** `r/[shareToken]/page.tsx:20`). **A delete-the-file change breaks `fallback-sections.ts` and both pages.**

**Deleted (Phase 4 only)**

`app/app/[churchId]/diagnosis/report/{shared,cover,chain,system,dossier}.tsx` — five UNSHIPPED components with zero production call sites. ⚠️ `shared.tsx` currently **does** have call sites (`page.tsx:20` imports `EmptyState`, `StaleMethodologyNotice`); Task 9 handles that explicitly.

---

## Phasing

| Phase | Tasks | Leaves a gate-green tree? |
|---|---|---|
| 1 — Shared resolver seam | 1–3 | Yes. PDF untouched. |
| 2 — PDF swap | 4–6 | Yes. |
| 3 — Stale notice + regenerate | 7–8 | Yes. |
| 4 — Teardown (**cuttable**) | 9–10 | Yes. Phases 1–3 stand alone if this is cut. |

---

# Phase 1 — Shared resolver seam

## Task 1: The `reports` data-access seam

**Files:**
- Create: `lib/data/reports.ts`
- Test: `tests/report/resolve.test.ts` (created here, extended in Task 2)

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (type only, exactly as `lib/data/churches.ts:1` does).
- Produces: `readPersistedReport(supabase, runId, inputsHash) => Promise<PersistedReportLookup>`; types `PersistedReportRow`, `PersistedReportLookup`. Tasks 2, 3 and 6 all depend on these exact names.

**Context:** `lib/data/churches.ts` is the pattern to mirror — `type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>`, one exported async function per query, anon-key RLS client, no service role. Read `lib/data/churches.ts:1-30` before writing.

Today's read lives inline at `page.tsx:197-203` and is `.order('generated_at', desc).limit(1)` — **not** hash-addressed. This task replaces the query text, in one place, for both surfaces.

- [ ] **Step 1: Write the failing test**

Create `tests/report/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('lib/data/reports.ts — the hash-addressed reports seam', () => {
  const src = readFileSync('lib/data/reports.ts', 'utf8')

  it('addresses the row by inputs_hash, not by generated_at ordering (D-P5-5)', () => {
    expect(src).toContain(".eq('inputs_hash', inputsHash)")
    // The pre-D-P5-5 read. Its survival anywhere in this module means the seam kept
    // the latest-row semantics that make the spec's revert scenario lose R1 forever.
    expect(src).not.toContain("order('generated_at'")
  })

  it('selects the two jsonb columns the resolver reads back', () => {
    expect(src).toContain('inputs_hash, sections, facts')
  })

  it('holds the reports query text exactly once — one place, so it cannot drift', () => {
    expect(src.match(/from\('reports'\)/g)?.length).toBe(2)
  })
})
```

> ⚠️ The last assertion expects **2**, not 1: the lookup runs a hash-addressed select and, only on a miss, an existence probe. Both touch `reports`. Asserting the **count** rather than presence is deliberate — a bare `toContain` is satisfied by one occurrence and survives a regression at the other site. This class produced three real findings in this series.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/report/resolve.test.ts
```

Expected: FAIL — `ENOENT: no such file or directory, open 'lib/data/reports.ts'`.

- [ ] **Step 3: Write the implementation**

Create `lib/data/reports.ts`:

```ts
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * One persisted `reports` row, narrowed to the columns a renderer reads back.
 * `sections` and `facts` are untyped jsonb: a row outlives the code that wrote it, so both
 * are revalidated downstream (assembleReport re-parses `sections`; revalidatedThemes re-checks
 * `facts.themes`) and neither is ever trusted as-is.
 */
export interface PersistedReportRow {
  inputs_hash: string
  sections: unknown
  facts: unknown
}

/**
 * The result of a hash-addressed lookup.
 *
 * `matched` is the row for THESE inputs, or null. `anyExists` is "this run has some reports
 * row, of any hash" — the two together are what let a caller tell "never generated" apart from
 * "generated under different inputs". A single hash-addressed row cannot express that
 * difference on its own: it is either the right row or absent, so a staleness test written
 * against it alone can never fire.
 */
export interface PersistedReportLookup {
  matched: PersistedReportRow | null
  anyExists: boolean
}

/**
 * Reads the persisted report for `runId` **addressed by `inputsHash`** (D-P5-5).
 *
 * The pre-D-P5-5 read was `.order('generated_at', desc).limit(1)` — the newest row whatever its
 * inputs. That was harmless only while generation was one-shot per church. Plan 5 adds a
 * regenerate path, so the newest row can be for inputs the viewer has since reverted away from,
 * and the older row that DOES match would be invisible forever. Addressing by hash finds it.
 *
 * `(run_id, inputs_hash)` is unique, so `.maybeSingle()` is safe on the matched query.
 *
 * Every failure mode — RLS denial, a query error, no row — resolves to
 * `{ matched: null, anyExists: false }`. That is the same "no AI" input assembleReport already
 * handles, so every section renders its deterministic fallback. Reads through the anon-key RLS
 * client; no service role. `reports` RLS is admin-only select and both callers are admin-gated.
 */
export async function readPersistedReport(
  supabase: SupabaseServerClient,
  runId: string,
  inputsHash: string,
): Promise<PersistedReportLookup> {
  const { data: matched, error } = await supabase
    .from('reports')
    .select('inputs_hash, sections, facts')
    .eq('run_id', runId)
    .eq('inputs_hash', inputsHash)
    .maybeSingle()

  if (error) {
    // Reason only — never the row, the facts, or the sections.
    console.warn('[report] reports read failed; rendering fallback sections')
    return { matched: null, anyExists: false }
  }
  if (matched) return { matched: matched as PersistedReportRow, anyExists: true }

  // Only on a miss: is there a report for this run at ALL? This is what separates "this church
  // has never generated" (no notice) from "generated under different inputs" (stale → notice +
  // regenerate). Selecting a single non-jsonb column keeps it cheap.
  const { data: other } = await supabase
    .from('reports')
    .select('inputs_hash')
    .eq('run_id', runId)
    .limit(1)
    .maybeSingle()

  return { matched: null, anyExists: other !== null && other !== undefined }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/report/resolve.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run all three gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc 0 errors · vitest **184 files / 1212 tests / 0 failures** (baseline 183/1209 + this file's 3) · eslint **0 problems** (read the summary line — the exit code is 0 on warnings too).

- [ ] **Step 6: Commit**

```bash
git add lib/data/reports.ts tests/report/resolve.test.ts
git commit -m "feat(report): add hash-addressed reports data-access seam"
```

---

## Task 2: The shared resolver

**Files:**
- Create: `lib/report/resolve.ts`
- Modify: `tests/report/resolve.test.ts` (extend)
- Source-move from: `app/app/[churchId]/diagnosis/page.tsx:274-316` (`isThemeClusterFact`, `revalidatedThemes`)

**Interfaces:**
- Consumes: `readPersistedReport`'s `PersistedReportLookup` (Task 1); `reportInputs`, `churchFactsFrom` from `@/lib/report/inputs-hash`; `buildFacts`, `ThemeClusterFact` from `@/lib/report/facts`; `assembleReport`, `AssembledSection` from `@/lib/report/compose`.
- Produces: `resolveReportSections(args) => Promise<{ sections: AssembledSection[]; inputsHash: string; stale: boolean }>` and `ResolveReportSectionsArgs`. Tasks 3 and 6 are its only two call sites.

**Context — this is a source MOVE, not a rewrite.** `isThemeClusterFact` and `revalidatedThemes` move out of `page.tsx` **verbatim, docstrings intact**. Their docstrings explain why there is deliberately no `ThemesSchema` import (it validates the model's *raw* output — `{ themes, affection_theme }` with `support_indices`/`verbatim_candidates` — not the post-processed `ThemeClusterFact[]` shape read back off `facts.themes`, which carries `support_count`/`verbatims`; `ThemesSchema.safeParse` would reject every real row, always). **Do not "simplify" that comment away and do not substitute the schema.** A move has Lesson-11 blast radius: re-run the covering tests at the move, not only at the end.

⚠️ **Do not guess the shape of `reportInputs`'s argument.** Derive it. Before writing, run:

```bash
grep -n "export function reportInputs" -A 20 lib/report/inputs-hash.ts
```

The types below use `Parameters<typeof reportInputs>[0]` precisely so no symbol is invented — tsc enforces agreement with the real signature.

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/resolve.test.ts`:

```ts
import { resolveReportSections } from '@/lib/report/resolve'
import { loadMethodology } from '@/lib/methodology/load'
import type { PersistedReportLookup } from '@/lib/data/reports'

describe('resolveReportSections', () => {
  // Minimal real inputs: the resolver is pure apart from the injected read, so a run with no
  // responses still exercises hash → read → revalidate → assemble end to end.
  const methodology = loadMethodology()
  const baseArgs = () => ({
    diagnosis: DIAGNOSIS_FIXTURE,
    methodology,
    responses: [],
    church: { name: 'Test Church' } as never,
    completedAt: '2026-01-01T00:00:00.000Z',
    labelSource: { kind: 'known' as const, labels: [] },
    responseHash: 'rh-1',
    reflections: [],
    hashReflections: [],
  })

  it('calls readPersisted with the LIVE inputs hash (pins D-P5-5)', async () => {
    let seen: string | null = null
    const result = await resolveReportSections({
      ...baseArgs(),
      readPersisted: async (hash) => {
        seen = hash
        return { matched: null, anyExists: false }
      },
    })
    expect(seen).not.toBeNull()
    // The hash handed to the read is the hash the resolver reports back — a read addressed
    // with anything else would silently never match.
    expect(seen).toBe(result.inputsHash)
  })

  it('is not stale when the run has never been generated', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: async (): Promise<PersistedReportLookup> => ({ matched: null, anyExists: false }),
    })
    expect(r.stale).toBe(false)
    expect(r.sections.every((s) => s.source === 'fallback')).toBe(true)
  })

  it('is stale when a report exists but not for these inputs', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: async (): Promise<PersistedReportLookup> => ({ matched: null, anyExists: true }),
    })
    expect(r.stale).toBe(true)
    expect(r.sections.every((s) => s.source === 'fallback')).toBe(true)
  })

  // D-P5-3: revalidatedThemes finally gets real coverage, which is only possible because the
  // read is injected. Each case must land on themes === null, i.e. facts.themes stays [].
  const THEME = {
    label: 'Belonging', gloss: 'people feel known', support_count: 4,
    item_ids: ['q1'], verbatims: ['we know each other'],
  }
  const lookupWith = (facts: unknown, hashMatches = true) =>
    async (hash: string): Promise<PersistedReportLookup> => ({
      matched: { inputs_hash: hashMatches ? hash : 'a-different-hash', sections: {}, facts },
      anyExists: true,
    })

  it.each([
    ['a missing themes key', { archetype: 'x' }],
    ['themes of the wrong shape', { themes: [{ label: 'Belonging' }] }],
    ['themes that are not an array', { themes: 'Belonging' }],
    ['a null facts blob', null],
  ])('drops persisted themes on %s', async (_label, facts) => {
    const r = await resolveReportSections({ ...baseArgs(), readPersisted: lookupWith(facts) })
    expect(r.sections.find((s) => s.id === 's8')?.fallback).toBeDefined()
    expect(r.stale).toBe(false)
  })

  it('accepts themes that revalidate on a fresh row', async () => {
    const r = await resolveReportSections({
      ...baseArgs(),
      readPersisted: lookupWith({ themes: [THEME] }),
    })
    expect(r.stale).toBe(false)
  })
})
```

> ⚠️ `DIAGNOSIS_FIXTURE` is **not** invented here. Reuse the existing one: run `grep -rln "methodology_version" tests/report/*.test.ts | head` and import or copy the diagnosis fixture an existing report test already builds (`tests/report/` has several). If none is reusable, build it from `deriveDiagnosisForRun` on a real fixture run rather than hand-writing a `Diagnosis` literal — a hand-written one drifts from the type.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/report/resolve.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/report/resolve"`.

- [ ] **Step 3: Write the implementation**

Create `lib/report/resolve.ts`:

```ts
import { buildFacts } from '@/lib/report/facts'
import type { ThemeClusterFact } from '@/lib/report/facts'
import { reportInputs } from '@/lib/report/inputs-hash'
import { assembleReport } from '@/lib/report/compose'
import type { AssembledSection } from '@/lib/report/compose'
import type { PersistedReportLookup } from '@/lib/data/reports'

type ReportInputsArgs = Parameters<typeof reportInputs>[0]

/**
 * The one pipeline both report surfaces run: facts → inputs hash → hash-addressed read →
 * revalidate themes → rebuild facts with themes → assemble 13 sections.
 *
 * ⚠️ This module imports NO Supabase client. The read is injected as `readPersisted`, which is
 * what makes the whole pipeline unit-testable against a fake — and that is what finally gives
 * revalidatedThemes real coverage (D-P5-3). Importing a client here to "simplify" the callers
 * would silently un-test it.
 *
 * `reflections` and `hashReflections` are two different arrays from the same raw rows and must
 * not be swapped. `reflections` is KEYLESS (item_id + text) and is the only reflections data
 * that reaches a renderer. `hashReflections` CARRIES respondent identity and its sole consumer
 * is reportInputs — passing it to assembleReport or any component leaks respondent identity.
 */
export type ResolveReportSectionsArgs = Omit<ReportInputsArgs, 'reflections'> & {
  /** The keyless array — item_id + free text, no respondent identifier. Goes to assembleReport. */
  reflections: ReadonlyArray<{ item_id: string; reflection: string | null }>
  /** The keyed array — respondent identity included. Goes to reportInputs and nowhere else. */
  hashReflections: ReportInputsArgs['reflections']
  readPersisted: (inputsHash: string) => Promise<PersistedReportLookup>
}

export interface ResolvedReportSections {
  sections: AssembledSection[]
  inputsHash: string
  /** A report exists for this run, but not for these inputs. Drives the D-P5-4 notice. */
  stale: boolean
}

export async function resolveReportSections(
  args: ResolveReportSectionsArgs,
): Promise<ResolvedReportSections> {
  const { reflections, hashReflections, readPersisted, ...inputs } = args

  const { inputsHash, baseFacts } = reportInputs({ ...inputs, reflections: hashReflections })

  const lookup = await readPersisted(inputsHash)
  const persisted = lookup.matched

  // A row for OTHER inputs exists. Not an error and not a crash — the deterministic sections
  // are still correct, so this renders fallbacks and tells the caller why.
  const stale = persisted === null && lookup.anyExists
  if (stale) console.warn('[report] persisted row stale; rendering fallbacks')

  // D-P4-1: facts.themes is model output that cannot be re-derived from responses, so S8 is the
  // one place a renderer reads model output back off the persisted row. The invariant narrows
  // rather than breaks: no renderer reads derived NUMBERS from `facts`; model output that cannot
  // be re-derived is read back, SCHEMA-REVALIDATED FIRST.
  const themes = revalidatedThemes(persisted, inputsHash)
  const facts = themes === null
    ? baseFacts
    : buildFacts({
        diagnosis: inputs.diagnosis,
        methodology: inputs.methodology,
        responses: inputs.responses,
        church: inputs.church,
        completedAt: inputs.completedAt,
        labelSource: inputs.labelSource,
        themes,
      })

  const sections = assembleReport({
    facts,
    methodology: inputs.methodology,
    reflections, // the KEYLESS array — never hashReflections
    persisted,
    liveInputsHash: inputsHash,
  })

  return { sections, inputsHash, stale }
}

/**
 * Structural validator for ThemeClusterFact[] (lib/report/facts.ts). There is deliberately no
 * schema import here: ThemesSchema (lib/ai/themes.ts) validates the MODEL's RAW output —
 * `{ themes: ThemeSchema[], affection_theme }` where each ThemeSchema carries
 * `support_indices`/`verbatim_candidates` — not the post-processed ThemeClusterFact[] this
 * reads back off `facts.themes` (`support_count`/`verbatims`). The two shapes differ in both
 * wrapper (object vs array) and fields, so `ThemesSchema.safeParse(facts.themes)` would reject
 * every real row, always — a fail-closed bug that disables themes silently and is
 * indistinguishable from "no data yet" (see lib/ai/theme-gates.ts / clusterThemes's return
 * contract for where support_indices becomes support_count and verbatim_candidates becomes
 * verbatims). This checks the same required string/number keys ThemeClusterFact declares.
 */
function isThemeClusterFact(value: unknown): value is ThemeClusterFact {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.label === 'string' &&
    typeof t.gloss === 'string' &&
    typeof t.support_count === 'number' &&
    Array.isArray(t.item_ids) && t.item_ids.every((id) => typeof id === 'string') &&
    Array.isArray(t.verbatims) && t.verbatims.every((v) => typeof v === 'string')
  )
}

/**
 * Returns the persisted themes only when the row is FRESH and its themes revalidate.
 * On any failure — no row, stale hash, missing key, revalidation failure — returns null,
 * and facts.themes stays []. s8Bullets (lib/report/fallback-sections.ts:106-120) already
 * falls through to the per-area voices list built from the keyless reflections, so the
 * fallback needs no new code path.
 */
function revalidatedThemes(
  persisted: { inputs_hash: string; facts: unknown } | null,
  liveInputsHash: string,
): ThemeClusterFact[] | null {
  if (!persisted || persisted.inputs_hash !== liveInputsHash) return null
  const facts = persisted.facts
  if (!facts || typeof facts !== 'object' || !('themes' in facts)) return null
  const themes = (facts as { themes: unknown }).themes
  return Array.isArray(themes) && themes.every(isThemeClusterFact)
    ? (themes as ThemeClusterFact[])
    : null
}
```

> ⚠️ The `inputs_hash !== liveInputsHash` guard inside `revalidatedThemes` is now **redundant** with the hash-addressed read (a matched row always agrees). **Keep it.** It is the fail-closed backstop if a future caller injects a non-hash-addressed `readPersisted`, and the covering test above still exercises it via `lookupWith(facts, false)`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/resolve.test.ts
```

Expected: PASS.

- [ ] **Step 5: Re-run the moved code's covering tests (Lesson-11 blast radius)**

```bash
npx vitest run tests/report/
```

Expected: 0 failures. `revalidatedThemes` moved modules; anything that source-read `page.tsx` for it fails **here**, not at the end of the plan.

- [ ] **Step 6: Run all three gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc 0 · vitest 0 failures, file count still **184** (this task added tests to an existing file, no new file) · eslint 0 problems.

- [ ] **Step 7: Commit**

```bash
git add lib/report/resolve.ts tests/report/resolve.test.ts
git commit -m "feat(report): add shared resolveReportSections seam"
```

---

## Task 3: Rewire the diagnosis page onto the seam

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx` — replace `:169-233`, delete `:274-316`
- Modify: `tests/report/resolve.test.ts` (add the occurrence-count assertions)

**Interfaces:**
- Consumes: `resolveReportSections` (Task 2), `readPersistedReport` (Task 1).
- Produces: `page.tsx` calling the seam exactly once. Task 6 adds the second and final call site.

**Context:** the page currently inlines the whole pipeline at `:169-233` and defines the two theme helpers at `:274-316`. Both go. The page keeps `resolveScoreability`, the not-scoreable message, and all chrome. It **loses ~90 lines**.

⚠️ **`completedAt: run!.completed_at` must not become `new Date()`.** Spec §9.1: this line is labelled "assessed", and a page-load moment would change on every reload. It intentionally diverges from generation's `new Date().toISOString()`; `completedAt` is not in the hash.

⚠️ **`knownLabels(responses)` is called TWICE today** (`:188` and `:222`). After this task it is called **once** and threaded through. Two label sources that can disagree is the `labelSource` finding class exactly.

- [ ] **Step 1: Write the failing occurrence-count tests**

Append to `tests/report/resolve.test.ts`:

```ts
describe('the seam has exactly two call sites', () => {
  const page = readFileSync('app/app/[churchId]/diagnosis/page.tsx', 'utf8')

  it('the diagnosis page calls resolveReportSections once', () => {
    expect(page.match(/resolveReportSections\(/g)?.length).toBe(1)
  })

  it('the diagnosis page no longer calls buildFacts directly', () => {
    // buildFacts moved behind the seam. A surviving call here is a second, drifting pipeline.
    expect(page.match(/buildFacts\(/g)?.length ?? 0).toBe(0)
  })

  it('the diagnosis page calls knownLabels exactly once', () => {
    // Was twice (:188 and :222). One label source per request, threaded through — a guard
    // checking a different label list than the facts pack was built from fails open.
    expect(page.match(/knownLabels\(/g)?.length).toBe(1)
  })

  it('the diagnosis page no longer inlines the reports query', () => {
    expect(page).not.toContain("from('reports')")
  })

  it('revalidatedThemes moved out of the page', () => {
    expect(page).not.toContain('function revalidatedThemes')
    expect(page).not.toContain('function isThemeClusterFact')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/report/resolve.test.ts -t 'exactly two call sites'
```

Expected: FAIL — `knownLabels(` is 2, `buildFacts(` is 1, `from('reports')` present.

- [ ] **Step 3: Rewrite the page's pipeline block**

In `app/app/[churchId]/diagnosis/page.tsx`, replace lines **169–233** (from `let sections: AssembledSection[] = []` through the closing `}` of the `if (resolution.scoreable)` block) with:

```tsx
  // Built only on the scoreable path — `resolution.diagnosis` does not exist otherwise. Stays a
  // `let` (rather than an early return) so the not-scoreable branch below can keep the page's
  // existing single-return, ternary-JSX shape.
  let sections: AssembledSection[] = []
  let stale = false

  if (resolution.scoreable) {
    // Mirrors app/app/[churchId]/actions.ts's `hash = responseHash(responses, diagnosis
    // .methodology_version)` argument-for-argument: same `responses`, and `.methodology_version`
    // read off the diagnosis object itself (never `run.methodology_version` or a methodology
    // edition's own `.questions.version`) — hash parity between generation and render depends on
    // this matching exactly, or a persisted report is judged stale forever and themes never render.
    const hash = responseHash(responses, resolution.diagnosis.methodology_version)

    // ONE label source per request, threaded through. Two knownLabels(responses) calls that can
    // disagree is the labelSource finding class; the PDF guard depends on this being singular.
    const labelSource = knownLabels(responses)

    const resolved = await resolveReportSections({
      diagnosis: resolution.diagnosis,
      methodology: reportMethodology,
      responses,
      church: churchFactsFrom(churchProfile, church.name),
      // Spec §9.1: the run's own completion timestamp, not new Date() — this line is labelled
      // "assessed", and a page-load moment would change on every reload. This intentionally
      // diverges from generation's new Date().toISOString(); completedAt is not in the hash.
      completedAt: run!.completed_at,
      labelSource,
      responseHash: hash,
      reflections, // the KEYLESS array
      hashReflections, // the KEYED array — reportInputs only
      readPersisted: (inputsHash) => readPersistedReport(supabase, run!.id, inputsHash),
    })

    sections = resolved.sections
    stale = resolved.stale
  }
```

Then **delete lines 274–316** (the `isThemeClusterFact` and `revalidatedThemes` definitions, including their docstrings — they now live in `resolve.ts`).

Update the imports at the top:

```tsx
// REMOVE these three — all three moved behind the seam:
//   import { buildFacts } from '@/lib/report/facts'
//   import type { ThemeClusterFact } from '@/lib/report/facts'
//   import { assembleReport } from '@/lib/report/compose'
// ADD:
import { resolveReportSections } from '@/lib/report/resolve'
import { readPersistedReport } from '@/lib/data/reports'
```

Keep `import type { AssembledSection } from '@/lib/report/compose'` (still used by the `let`), keep `knownLabels`, keep `churchFactsFrom`/`reportInputs`→ **`reportInputs` is now unused in the page; remove it from the `inputs-hash` import, keeping `churchFactsFrom` and `reflectionRowsFor`.**

> `stale` is declared here and unused until Task 8. eslint's `no-unused-vars` does **not** flag an assigned `let` that is read nowhere in TSX-compiled output only when it is genuinely unread — if `npx eslint .` reports a problem for it, do **not** silence it with a disable comment: pull Task 8's notice forward into this task instead.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/report/resolve.test.ts
```

Expected: PASS, all groups.

- [ ] **Step 5: Run all three gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc **0** · vitest 0 failures at **184 files** · eslint **0 problems**. tsc is the real gate here — the page dropped three imports and changed a call shape.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/page.tsx' tests/report/resolve.test.ts
git commit -m "refactor(report): rewire diagnosis page onto the shared resolver seam"
```

---

# Phase 2 — PDF swap

**The 13 sections, verified from `methodology/report.yaml`:** `s1` "Church Health Assessment" · `s2` "Executive summary" · `s3` "Health dashboard" · `s4` "What the assessment revealed" · `s5` "Organizational strengths" · `s6` "Areas requiring investment" · `s7` "Lowest scoring indicators" · `s8` "What leaders are saying" · `s9` "Strategic diagnosis" · `s10` "30/60/90 roadmap" · `s11` "Where XPG can partner" · `s12` "Final executive assessment" · **`appendix`** "Methodology and caveats".

The seven AI ids are `s2, s4, s5, s6, s7, s9, s12`; the other six always render `source: 'fallback'`.

> **The old `view.appendix` per-category score/percentile table is dropped, deliberately.** It has no source in `AssembledSection[]`, and the goal of this plan is that "an exported PDF is the report an admin just read on screen." The web page has rendered exactly these 13 sections and nothing else since plan 4. The PDF matching it is the point, not a regression. `s3` "Health dashboard" is where scores live now.

## Task 4: Rewrite the PDF document onto `AssembledSection[]`

**Files:**
- Modify: `lib/report/pdf/document.tsx` (451 lines → roughly 220)
- Create: `tests/report/pdf-sections.test.ts`

**Interfaces:**
- Consumes: `AssembledSection` from `@/lib/report/compose`; `AI_SECTION_IDS`, `S2Schema`, `S4Schema`, `S5Schema`, `S6Schema`, `S7Schema`, `S9Schema`, `S12Schema`, `AiSectionId` from `@/lib/ai/sections`; `SectionBody` from `@/lib/report/fallback-sections`.
- Produces: `ReportDocument` with props `{ sections, churchName, brandColor, monogram, generatedAt, labels, stale }`, and the exported type `ReportDocumentProps`. Tasks 5 and 6 both depend on this exact prop shape.

**Context:** `document.tsx` is a react-pdf **mirror** of `app/app/[churchId]/diagnosis/report/sections.tsx` — read that file first (219 lines). Same structure, different primitives: `<Text>`/`<View>` instead of `<p>`/`<div>`, StyleSheet objects instead of Tailwind classes. `@react-pdf/renderer` cannot render DOM components, so nothing is imported from `sections.tsx`.

**Three rules carried over from the web renderer verbatim:**
1. **Array order, never re-sorted.** `assembleReport` returns them in `Object.keys(methodology.report.sections)` order = `report.yaml` order.
2. **The heading always comes from `section.fallback.title`.** AI renderers emit body content only, never their own heading. One title source for both branches.
3. **The `switch` + `never` exhaustiveness arm carries over.** It is the compile-time guarantee that an eighth `AiSectionId` cannot be silently dropped from the PDF — **tsc fails the build, not a human.**

**Deleted from `document.tsx`:** `AreaDossierBlock`, `DossierField`, `fieldBody`, `UNAVAILABLE`, `depRelationshipLine`, `DEP_READ_ORDER`, `DEP_READ_LABEL`, `DEP_PILL`, `confidenceBand`, the `ReportView`/`SystemView`/`AreaDossierView` and `EdgeRead` imports, and the ~30 StyleSheet keys serving the old blocks (`cover*`, `confidenceRow`, `verdict`, `stage*`, `dep*`, `dossier*`, `field*`, `voices*`, `refs`).

**Kept StyleSheet keys:** `page`, `header`, `monogram`, `headerText`, `churchName`, `headerMeta`, `h2`, `section`, `tableHeaderRow`, `tableRow`, `tableHeaderText`, `tableCellName`, `tableCellSmall`, `appendixRow`, `caveat`, `footer`, `ctaButton`. Kept imports: `./fonts`, `../cta`.

> The spec's "Kept" list omits `h2` and `caveat`; both are **required** by the new renderer (section headings and the stale caveat) and are retained. Three new keys are added: `body`, `bullet`, `aiHeading`. `table*` keys are kept because they are the smallest correct primitive for S12's list — if after implementing you find no surviving consumer for `tableHeaderRow`/`tableRow`/`tableCellName`/`tableCellSmall`/`tableHeaderText`, delete them in this task rather than leaving dead style keys.

- [ ] **Step 1: Write the failing tests**

Create `tests/report/pdf-sections.test.ts` (**`.ts`, JSX-free — a `.tsx` file is silently uncollected**):

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadMethodology } from '@/lib/methodology/load'
import { assembleFallbackOnly } from '@/lib/report/compose'
import type { AssembledSection } from '@/lib/report/compose'
import { renderReportDocument } from '@/lib/report/pdf/render'

const methodology = loadMethodology()

/** Deterministic 13-section input: assembleFallbackOnly returns report.yaml order by construction. */
function fallbackSectionsFixture(): AssembledSection[] {
  return assembleFallbackOnly({ facts: FACTS_FIXTURE, methodology, reflections: [] })
}

const baseProps = () => ({
  sections: fallbackSectionsFixture(),
  churchName: 'Test Church',
  brandColor: '#8E2B3E',
  monogram: 'TC',
  generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  labels: [] as string[],
  stale: false,
})

describe('the PDF document renders the 13 assembled sections', () => {
  const src = readFileSync('lib/report/pdf/document.tsx', 'utf8')

  it('renders every section in report.yaml order and never re-sorts', () => {
    // The renderer maps over the array as given. A .sort( anywhere in this file means the
    // PDF can disagree with the web page about section order.
    expect(src).not.toContain('.sort(')
    expect(src).toContain('sections.map(')
  })

  it('takes the heading from fallback.title only — one title source', () => {
    expect(src.match(/fallback\.title/g)?.length).toBe(1)
  })

  it('keeps the exhaustiveness arm that makes tsc catch an eighth AI section', () => {
    expect(src).toContain('const _exhaustive: never = id')
  })

  it('has a renderer case for each of the seven AI section ids', () => {
    for (const id of ['s2', 's4', 's5', 's6', 's7', 's9', 's12']) {
      expect(src).toContain(`case '${id}':`)
    }
  })

  it('no longer imports the dying ReportView model', () => {
    expect(src).not.toContain('ReportView')
    expect(src).not.toContain('SystemView')
    expect(src).not.toContain('AreaDossierView')
  })

  it('renders to a real PDF buffer', async () => {
    const buffer = await renderReportDocument(baseProps())
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('falls back for a section whose AI payload is malformed', async () => {
    const sections = fallbackSectionsFixture().map((s) =>
      s.id === 's2' ? { ...s, source: 'ai' as const, ai: { nonsense: true } } : s,
    )
    // safeParse rejects → that section renders its own fallback → still a valid PDF, no throw.
    const buffer = await renderReportDocument({ ...baseProps(), sections })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
```

> ⚠️ `FACTS_FIXTURE` is **not** invented. Reuse an existing facts fixture — run `grep -rln "assembleFallbackOnly\|buildFacts(" tests/report/*.test.ts` and take the one the share-page or fallback-section tests already build. Do **not** hand-write a `FactsPack` literal; it drifts from the type.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/report/pdf-sections.test.ts
```

Expected: FAIL — the source assertions fail (`ReportView` still present, no `case 's2':`) and `renderReportDocument` rejects the new props shape.

- [ ] **Step 3: Rewrite `document.tsx`**

Replace the whole file with:

```tsx
import { Document, Page, Text, View, Link, StyleSheet } from '@react-pdf/renderer';
import { AI_SECTION_IDS, S2Schema, S4Schema, S5Schema, S6Schema, S7Schema, S9Schema, S12Schema } from '../../ai/sections';
import type { AiSectionId } from '../../ai/sections';
import type { AssembledSection } from '../compose';
import type { SectionBody } from '../fallback-sections';
import { bookingCta } from '../cta';
import { registerReportFonts, FONT_DISPLAY, FONT_BODY } from './fonts';

registerReportFonts();

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 48, fontFamily: FONT_BODY, fontSize: 10.5, color: INK, lineHeight: 1.5 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 8 },
  monogram: { width: 28, height: 28, borderRadius: 14, color: '#FFFFFF', fontFamily: FONT_DISPLAY, fontSize: 12, textAlign: 'center', paddingTop: 7, marginRight: 8 },
  headerText: { flexDirection: 'column' },
  churchName: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 },
  headerMeta: { fontSize: 9, color: INK_SOFT },
  h1: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 8 },
  h2: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, marginBottom: 6 },
  section: { marginBottom: 18 },
  body: { marginBottom: 6 },
  bullet: { marginBottom: 2, paddingLeft: 10 },
  aiHeading: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 11, marginBottom: 2 },
  block: { marginBottom: 8 },
  caveat: { fontSize: 9, color: INK_SOFT, marginTop: 8 },
  ctaButton: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: INK, color: '#FFFFFF', fontFamily: FONT_DISPLAY, fontSize: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, textDecoration: 'none' },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: INK_SOFT },
});

export interface ReportDocumentProps {
  sections: AssembledSection[];
  churchName: string;
  brandColor: string;
  monogram: string;
  generatedAt: Date;
  /**
   * The respondent labels the facts pack was built from — the SAME value the resolver was handed
   * as `labelSource`, never a second knownLabels() call. The fail-closed guard in ./render.ts
   * checks the sections against exactly this list; a guard checking a different list than the one
   * the report was built from would fail open.
   */
  labels: readonly string[];
  /** A report exists for this run but not for these inputs. Renders as an appendix caveat. */
  stale: boolean;
}

const STALE_CAVEAT =
  'This export was produced from the current assessment data. A previously generated narrative report exists for different settings and is not shown here.';

/**
 * The uniform renderer: the { body, bullets } half of a SectionBody. Used for every
 * source:'fallback' section. The title is rendered by ReportDocument, never here — one title
 * source for both branches, mirroring SectionBodyView in
 * app/app/[churchId]/diagnosis/report/sections.tsx.
 */
function SectionBodyView({ body, bullets }: { body: string; bullets: string[] }) {
  return (
    <>
      <Text style={s.body}>{body}</Text>
      {bullets.map((bullet) => (
        <Text key={bullet} style={s.bullet}>{`•  ${bullet}`}</Text>
      ))}
    </>
  );
}

type AiRendererProps = { ai: unknown; fallback: SectionBody };

/** Every AI renderer's failure path: the section's own deterministic fallback. */
function AiFallback({ fallback }: { fallback: SectionBody }) {
  return <SectionBodyView body={fallback.body} bullets={fallback.bullets} />;
}

function S2View({ ai, fallback }: AiRendererProps) {
  const parsed = S2Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { summary, what_this_is_not, context_bullets } = parsed.data;
  return (
    <>
      <Text style={s.body}>{summary}</Text>
      <Text style={s.body}>{what_this_is_not}</Text>
      {context_bullets.map((bullet) => (
        <Text key={bullet} style={s.bullet}>{`•  ${bullet}`}</Text>
      ))}
    </>
  );
}

function S4View({ ai, fallback }: AiRendererProps) {
  const parsed = S4Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { thesis_word, narrative } = parsed.data;
  return (
    <>
      <Text style={s.aiHeading}>{thesis_word}</Text>
      <Text style={s.body}>{narrative}</Text>
    </>
  );
}

function S5View({ ai, fallback }: AiRendererProps) {
  const parsed = S5Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  return (
    <>
      {parsed.data.strengths.map((strength) => (
        <View key={strength.category_id} style={s.block}>
          <Text style={s.aiHeading}>{strength.heading}</Text>
          <Text style={s.body}>{strength.body}</Text>
        </View>
      ))}
    </>
  );
}

function S6View({ ai, fallback }: AiRendererProps) {
  const parsed = S6Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  return (
    <>
      {parsed.data.areas.map((area) => (
        <View key={area.category_id} style={s.block}>
          <Text style={s.body}>{area.affirm}</Text>
          <Text style={s.body}>{area.evidence}</Text>
          <Text style={s.body}>{area.reframe}</Text>
        </View>
      ))}
    </>
  );
}

function S7View({ ai, fallback }: AiRendererProps) {
  const parsed = S7Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { narrative, pattern_claim } = parsed.data;
  return (
    <>
      <Text style={s.body}>{narrative}</Text>
      {pattern_claim !== null && <Text style={s.body}>{pattern_claim}</Text>}
    </>
  );
}

function S9View({ ai, fallback }: AiRendererProps) {
  const parsed = S9Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { narrative, working_model } = parsed.data;
  return (
    <>
      <Text style={s.body}>{narrative}</Text>
      <Text style={s.body}>{working_model}</Text>
    </>
  );
}

function S12View({ ai, fallback }: AiRendererProps) {
  const parsed = S12Schema.safeParse(ai);
  if (!parsed.success) return <AiFallback fallback={fallback} />;
  const { assessment, overall_percent, tier_name, primary_objective } = parsed.data;
  return (
    <>
      <Text style={s.body}>{assessment}</Text>
      <Text style={s.bullet}>{`•  Overall: ${overall_percent}%`}</Text>
      <Text style={s.bullet}>{`•  Tier: ${tier_name}`}</Text>
      <Text style={s.bullet}>{`•  Primary objective: ${primary_objective}`}</Text>
    </>
  );
}

/**
 * Narrows `section.id: SectionId` (13 possible values) down to `AiSectionId` (the 7 that have a
 * renderer). The co-occurrence of `source === 'ai'` with one of these ids is a compose.ts runtime
 * invariant, not something the type system tracks on its own.
 */
function isAiSectionId(id: AssembledSection['id']): id is AiSectionId {
  return (AI_SECTION_IDS as readonly string[]).includes(id);
}

/**
 * Dispatches a section's body content: its own AI renderer when source is 'ai' and that id is one
 * of the seven AI sections, the shared deterministic view otherwise.
 *
 * The `never` check in the default arm is the compile-time guarantee: add an eighth id to
 * AiSectionId without a case here, and tsc — not a human — fails the build. Keep the switch;
 * a Record/Map lookup is what the web renderer avoided for eslint's react-hooks/static-components.
 */
function SectionContent({ section }: { section: AssembledSection }) {
  if (section.source === 'ai' && isAiSectionId(section.id)) {
    const { id, ai, fallback } = section;
    switch (id) {
      case 's2':
        return <S2View ai={ai} fallback={fallback} />;
      case 's4':
        return <S4View ai={ai} fallback={fallback} />;
      case 's5':
        return <S5View ai={ai} fallback={fallback} />;
      case 's6':
        return <S6View ai={ai} fallback={fallback} />;
      case 's7':
        return <S7View ai={ai} fallback={fallback} />;
      case 's9':
        return <S9View ai={ai} fallback={fallback} />;
      case 's12':
        return <S12View ai={ai} fallback={fallback} />;
      default: {
        const _exhaustive: never = id;
        return _exhaustive;
      }
    }
  }
  return <SectionBodyView body={section.fallback.body} bullets={section.fallback.bullets} />;
}

/**
 * The PDF mirror of app/app/[churchId]/diagnosis/report/sections.tsx. Same 13 sections, same
 * order, same one-title-source rule — different primitives, because @react-pdf/renderer cannot
 * render DOM components and never could.
 *
 * Iterates `sections` in array order and NEVER re-sorts: assembleReport returns them in
 * Object.keys(methodology.report.sections) order, which is report.yaml order.
 */
export function ReportDocument({
  sections, churchName, brandColor, monogram, generatedAt, stale,
}: ReportDocumentProps) {
  const dateLabel = generatedAt.toISOString().slice(0, 10);

  return (
    <Document title={`${churchName} — Church Health Diagnosis`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={[s.monogram, { backgroundColor: brandColor }]}>{monogram}</Text>
          <View style={s.headerText}>
            <Text style={s.churchName}>{churchName}</Text>
            <Text style={s.headerMeta}>Church Health Diagnosis · {dateLabel}</Text>
          </View>
        </View>

        {sections.map((section, index) => (
          <View key={section.id} style={s.section}>
            <Text style={index === 0 ? s.h1 : s.h2}>{section.fallback.title}</Text>
            <SectionContent section={section} />
            {stale && section.id === 'appendix' && <Text style={s.caveat}>{STALE_CAVEAT}</Text>}
          </View>
        ))}

        <View style={s.section}>
          <Text style={s.h2}>{bookingCta.heading}</Text>
          <Text style={s.body}>{bookingCta.body}</Text>
          <Link src={bookingCta.url} style={s.ctaButton}>{bookingCta.buttonLabel}</Link>
        </View>

        <View style={s.footer} fixed>
          <Text>Internal leadership document</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
```

> ⚠️ `labels` is declared in the props but **not destructured** in `ReportDocument` — it is consumed by the guard in `render.ts` (Task 5), which receives the same props object. If eslint flags the unused prop, leave the prop and do not add a disable comment; Task 5 lands one step later and reads it.
>
> ⚠️ `s.appendixRow` and the `table*` keys are **not** used by this renderer. Delete them from the StyleSheet in this task (the version above already omits them) rather than leaving dead keys — the spec's "Kept" list was written before the appendix table was known to be dropped.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/report/pdf-sections.test.ts
```

Expected: the source-text and render tests PASS. The `renderReportDocument` calls still fail on the guard's `props.view` access — that is Task 5. If so, mark those two `it()` blocks `it.skip` **with a `// unskip in Task 5` comment**, and unskip them in Task 5 Step 4.

- [ ] **Step 5: Run all three gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc will still report errors in `render.ts` (it reads `props.view`) and in the PDF route (it passes `view`). **That is expected and is why Tasks 5 and 6 are in the same phase.** Do not commit a red tsc — proceed to Task 5 and commit Tasks 4–6 as one phase if tsc cannot be made green here.

- [ ] **Step 6: Commit (only if tsc is green; otherwise carry to Task 6)**

```bash
git add lib/report/pdf/document.tsx tests/report/pdf-sections.test.ts
git commit -m "feat(report): rewrite PDF document onto assembled sections"
```

---

## Task 5: Re-home the fail-closed anonymity guard

**Files:**
- Modify: `lib/report/pdf/render.ts` (34 lines)
- Modify: `tests/report/pdf-sections.test.ts` (add the guard tests)

**Interfaces:**
- Consumes: `containsRespondentLabel` from `@/lib/report/anonymity`; `ReportDocumentProps` (Task 4).
- Produces: `renderReportDocument(props)` unchanged in name and return type.

**Context:** the guard at `render.ts:28` asserts on `props.view.dispersion?.respondents.length || props.view.system?.disagreement?.respondents.length`. **Both fields die with `ReportView`, so the guard must be re-homed, never dropped.** Parent spec anonymity point 4: sections passed to `renderReportDocument` must carry no respondent labels.

⚠️ **Reuse the existing predicate.** `lib/report/anonymity.ts:47` already exports `containsRespondentLabel(text, labels)` — case-insensitive substring, and it **skips empty needles** (`if (needle && …)`), which is what makes an empty label list a no-op rather than a match-everything. **Do not hand-roll a second matcher.** Read `lib/report/anonymity.ts` before writing.

⚠️ **Check `fallback.body`, `fallback.bullets`, and the string fields of the AI payload — not `fallback.title`.** Titles come from `report.yaml`, never from respondent data, and a label like "Pastor" appearing in a title would throw a 500 on every PDF. That is fail-closed in the wrong direction.

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/pdf-sections.test.ts`:

```ts
describe('the re-homed fail-closed anonymity guard', () => {
  it('throws when a respondent label appears in a fallback body', async () => {
    const sections = fallbackSectionsFixture().map((s, i) =>
      i === 0 ? { ...s, fallback: { ...s.fallback, body: 'Marcus said the welcome is warm.' } } : s,
    )
    await expect(
      renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }),
    ).rejects.toThrow(/respondent/i)
  })

  it('throws when a respondent label appears in a bullet', async () => {
    const sections = fallbackSectionsFixture().map((s, i) =>
      i === 0 ? { ...s, fallback: { ...s.fallback, bullets: ['Marcus mentioned parking'] } } : s,
    )
    await expect(
      renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }),
    ).rejects.toThrow(/respondent/i)
  })

  it('throws when a respondent label appears in an AI payload string', async () => {
    const sections = fallbackSectionsFixture().map((s) =>
      s.id === 's4'
        ? { ...s, source: 'ai' as const, ai: { thesis_word: 'Trust', narrative: 'Marcus put it plainly.' } }
        : s,
    )
    await expect(
      renderReportDocument({ ...baseProps(), sections, labels: ['Marcus'] }),
    ).rejects.toThrow(/respondent/i)
  })

  it('does not throw when no label is present', async () => {
    const buffer = await renderReportDocument({ ...baseProps(), labels: ['Marcus'] })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('does not throw on an empty label list', async () => {
    // containsRespondentLabel skips empty needles, so [] is a no-op, not a match-everything.
    const buffer = await renderReportDocument({ ...baseProps(), labels: [] })
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/report/pdf-sections.test.ts -t 'anonymity guard'
```

Expected: FAIL — the guard still reads `props.view`, which is `undefined` on the new props.

- [ ] **Step 3: Rewrite `render.ts`**

Replace the whole file with:

```ts
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { containsRespondentLabel } from '../anonymity';
import { ReportDocument, type ReportDocumentProps } from './document';

/**
 * Every string reachable inside an untyped AI payload. `ai` is `unknown` — a reports row outlives
 * the code that wrote it — so the guard cannot enumerate fields per section id without going
 * silently blind the moment a schema gains one. Walking the value finds them all.
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

/**
 * Renders the report PDF to a Buffer. The single home for the type cast this requires:
 * renderToBuffer expects a ReactElement<DocumentProps> — i.e. a literal <Document>.
 * ReportDocument is a wrapper component that renders one, so the element shape at runtime is
 * correct but the prop types (ReportDocumentProps vs DocumentProps) don't structurally overlap,
 * and no single `as` bridges them. Both the production route and the test suite call this instead
 * of renderToBuffer directly, so the cast lives in exactly one place.
 */
export function renderReportDocument(props: ReportDocumentProps): Promise<Buffer> {
  // Fail-closed invariant: this function must never print respondent names.
  //
  // Re-homed from the old ReportView model (plan 5 phase 2). The previous version asserted on
  // `view.dispersion.respondents` and `view.system.disagreement.respondents`; both fields died
  // with ReportView. The contract is unchanged in spirit: whatever reaches the PDF renderer
  // carries no respondent label.
  //
  // ⚠️ `props.labels` MUST be the same value the resolver was handed as `labelSource` — one
  // knownLabels(responses) call per request, threaded through. A guard checking a DIFFERENT label
  // list than the one the facts pack was built from is a guard that fails open.
  //
  // Checks fallback body/bullets and every string inside the AI payload. Deliberately NOT
  // fallback.title: titles come from report.yaml, never from respondent data, and a label that
  // happens to be a common word would 500 every export.
  //
  // Reuses containsRespondentLabel (../anonymity) rather than a second matcher — it is
  // case-insensitive and skips empty needles, so an empty label list is a no-op.
  for (const section of props.sections) {
    const texts = [section.fallback.body, ...section.fallback.bullets, ...collectStrings(section.ai)];
    for (const text of texts) {
      if (containsRespondentLabel(text, props.labels)) {
        // Reason only — never the offending text, the section, or the label.
        throw new Error(
          `renderReportDocument: section ${section.id} carries a respondent label; refusing to render`,
        );
      }
    }
  }

  const element = createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
```

> The guard **throws**. The PDF route's existing `catch` turns that into a 500 with a reasons-only log. A guard that silently passed would be worse than no guard.

- [ ] **Step 4: Unskip Task 4's two render tests, then run**

```bash
npx vitest run tests/report/pdf-sections.test.ts
```

Expected: PASS, all blocks, none skipped.

- [ ] **Step 5: Gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc still reports the PDF route passing `view` — Task 6 closes it. `render.ts` and `document.tsx` themselves must be error-free.

- [ ] **Step 6: Commit (if tsc green; else carry to Task 6)**

```bash
git add lib/report/pdf/render.ts tests/report/pdf-sections.test.ts
git commit -m "feat(report): re-home fail-closed anonymity guard onto assembled sections"
```

---

## Task 6: Rewire the PDF route onto the seam

**Files:**
- Modify: `app/api/report/[runId]/pdf/route.ts` (168 lines)
- Modify: `tests/report/resolve.test.ts` (complete the two-call-site count)

**Interfaces:**
- Consumes: `resolveReportSections` (Task 2), `readPersistedReport` (Task 1), `ReportDocumentProps` (Task 4), `resolveScoreability` from `@/lib/report/view`.
- Produces: nothing new. This is the second and final call site of the seam.

**Context:** the route currently calls `resolveReportView` (`:122-130`) with a lazy `fallbackProse` thunk and `{ audience: 'pdf', reflections }`. All of that goes. It gains `resolveScoreability` — the **same export both pages already use** (D-P4-6), so the 409 arm is unchanged in behaviour.

⚠️ The route reads through `get_completed_run_responses`, which returns **real** labels, so `labelSource` here is `knownLabels(responses)` — `{ kind: 'known' }`. The share page's `{ kind: 'redacted' }` (D-P4-4) is a different surface and is **out of scope**.

⚠️ **`knownLabels(responses)` exactly once in this route**, threaded to both the resolver and the document props. That is what makes the guard check the same list the facts pack was built from.

- [ ] **Step 1: Write the failing count tests**

Append to `tests/report/resolve.test.ts`:

```ts
describe('the PDF route is the second and last seam call site', () => {
  const route = readFileSync('app/api/report/[runId]/pdf/route.ts', 'utf8')
  const page = readFileSync('app/app/[churchId]/diagnosis/page.tsx', 'utf8')

  it('the route calls resolveReportSections exactly once', () => {
    expect(route.match(/resolveReportSections\(/g)?.length).toBe(1)
  })

  it('resolveReportSections has exactly two call sites in total', () => {
    const total =
      (route.match(/resolveReportSections\(/g)?.length ?? 0) +
      (page.match(/resolveReportSections\(/g)?.length ?? 0)
    // The seam's whole purpose is that exactly two surfaces share one pipeline. A bare
    // presence check would be satisfied by one site and survive a regression at the other.
    expect(total).toBe(2)
  })

  it('neither caller calls buildFacts directly', () => {
    expect(route.match(/buildFacts\(/g)?.length ?? 0).toBe(0)
    expect(page.match(/buildFacts\(/g)?.length ?? 0).toBe(0)
  })

  it('the route calls knownLabels exactly once', () => {
    expect(route.match(/knownLabels\(/g)?.length).toBe(1)
  })

  it('the route no longer uses the dying view model', () => {
    expect(route).not.toContain('resolveReportView')
    expect(route).not.toContain('fallbackProse')
    expect(route).not.toContain('ReportBlocks')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/report/resolve.test.ts -t 'second and last seam call site'
```

Expected: FAIL — `resolveReportSections(` is 0 in the route, `resolveReportView` still present.

- [ ] **Step 3: Rewire the route**

Change the imports at `route.ts:1-8` to:

```ts
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { resolveScoreability } from '@/lib/report/view'
import { deriveDiagnosisForRun } from '@/lib/report/derive'
import { renderReportDocument } from '@/lib/report/pdf/render'
import { resolveReportSections } from '@/lib/report/resolve'
import { readPersistedReport } from '@/lib/data/reports'
import { readPersistedReport as _unusedGuard } from '@/lib/data/reports' // DELETE THIS LINE — see note
import { knownLabels } from '@/lib/report/anonymity'
import { churchFactsFrom, reflectionRowsFor } from '@/lib/report/inputs-hash'
import { responseHash } from '@/lib/report/response-hash'
import { loadChurchProfile } from '@/lib/data/churches'
import type { ChurchProfile } from '@/lib/data/churches'
import type { Response } from '@/lib/engine/types'
```

> Delete the `_unusedGuard` line — it is here only to make the duplicate-import mistake impossible to miss. `resolveReportView` and `fallbackProse`/`ReportBlocks` imports are **removed**.

Replace lines **119–151** (from the `// \`blocks\` stays a lazy thunk…` comment through the `renderReportDocument({...})` call) with:

```ts
    // D-P4-5: catch to null so this route degrades EXACTLY as generation and the page do. An
    // asymmetric degradation would make the surfaces disagree about `profile` precisely when the
    // database is flaky — permanent silent staleness under the one condition nobody smoke-tests.
    let churchProfile: ChurchProfile | null = null
    try {
      churchProfile = await loadChurchProfile(supabase, run!.church_id)
    } catch {
      churchProfile = null
    }

    // The same export both pages use (D-P4-6). A run that cannot be scored under the current
    // methodology cannot be exported — distinct 409, not the generic 500.
    const resolution = resolveScoreability(derived)
    if (!resolution.scoreable) {
      return new Response(
        'This report cannot be scored under the current methodology and cannot be exported until the assessment is completed.',
        { status: 409 },
      )
    }

    // Mirrors actions.ts and the diagnosis page argument-for-argument: `.methodology_version` off
    // the diagnosis object itself, never run.methodology_version. Hash parity across all three
    // sites depends on this, or the persisted report is judged stale forever.
    const hash = responseHash(responses, resolution.diagnosis.methodology_version)

    // ONE label source per request, threaded to BOTH the resolver and the document props. The
    // fail-closed guard in render.ts checks the sections against exactly this list; a second
    // knownLabels() call that could disagree is the labelSource finding class.
    const labelSource = knownLabels(responses)

    const { data: runRow } = await supabase
      .from('assessment_runs')
      .select('completed_at')
      .eq('id', runId)
      .maybeSingle()

    const { sections, stale } = await resolveReportSections({
      diagnosis: resolution.diagnosis,
      methodology: reportMethodology,
      responses,
      church: churchFactsFrom(churchProfile, church.name),
      completedAt: runRow?.completed_at ?? null,
      labelSource,
      responseHash: hash,
      reflections, // the KEYLESS array
      hashReflections: reflectionRowsFor(rawResponses ?? []), // the KEYED array
      readPersisted: (inputsHash) => readPersistedReport(supabase, runId, inputsHash),
    })

    const brand = resolveBrand(church.name)
    const generatedAt = new Date()

    const buffer = await renderReportDocument({
      sections,
      churchName: church.name,
      brandColor: church.brand_color,
      monogram: brand.monogram,
      generatedAt,
      labels: labelSource.kind === 'known' ? labelSource.labels : [],
      stale,
    })
```

> ⚠️ **`completedAt` must be the run's own `completed_at`, not `new Date()`** — spec §9.1, and it must match what the diagnosis page passes or the two surfaces build different facts packs. The route's existing `assessment_runs` select at `:66-70` does **not** include `completed_at`; the snippet above adds a second small select. **Prefer adding `completed_at` to the existing select at `:68`** and dropping the extra query — do that if it does not disturb the `churches(...)` join shape. Verify with `grep -n "completed_at" app/api/report/\[runId\]/pdf/route.ts` after editing.
>
> ⚠️ `completedAt`'s type must match `reportInputs`'s. The page passes `run!.completed_at` (nullable). If tsc rejects `?? null`, match the page's exact expression rather than casting.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/report/resolve.test.ts tests/report/pdf-sections.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all three gates — this is the phase boundary, tsc must now be 0**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc **0** · vitest **185 files** (184 + `pdf-sections.test.ts`) **/ 0 failures** · eslint **0 problems**.

⚠️ Existing route-wiring tests (`tests/report/route-sections-wiring.test.ts`, `route-call-ordering.test.ts`, `route-methodology-wiring.test.ts`) source-read these files. If any fails, it is telling you the route lost a line it pins — **fix the route, do not weaken the test.** The one exception: a test asserting the route calls `resolveReportView` is asserting the thing this plan deletes; re-point it at `resolveScoreability`.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/api/report/[runId]/pdf/route.ts' lib/report/pdf/document.tsx lib/report/pdf/render.ts tests/report/pdf-sections.test.ts tests/report/resolve.test.ts
git commit -m "feat(report): swap PDF surface onto the shared resolver seam"
```

---

# Phase 3 — Stale notice + regenerate

## ⭐ D-P5-8 — the exact drafted copy, for Natalie's glance before merge

These are the implementation's drafts. **Natalie reviews these strings before merge**; they are surfaced here rather than buried in a diff. Implement them verbatim; if she changes one, change it in the one place it lives.

| Where | String |
|---|---|
| Stale notice (diagnosis page) | **"This report predates your latest settings change."** |
| Regenerate button label | **"Regenerate report"** |
| Regenerate button, pending state | **"Regenerating…"** |
| PDF appendix caveat (Task 4, `STALE_CAVEAT`) | **"This export was produced from the current assessment data. A previously generated narrative report exists for different settings and is not shown here."** |

The notice string is the spec's own wording (Architecture → "Stale notice + regenerate affordance"). The other three are new drafts.

## Task 7: The `regenerateReport` server action

**Files:**
- Modify: `app/app/[churchId]/actions.ts` (append the action)
- Create: `tests/report/regenerate.test.ts`

**Interfaces:**
- Consumes: `get_completed_run_responses` RPC, `save_report` RPC, `clusterThemes`, `composeReport`, `reportInputs`, `buildFacts`, `knownLabels`, `reflectionRowsFor`, `churchFactsFrom`, `loadChurchProfile`, `deriveDiagnosisForRun`, `resolveScoreability`.
- Produces: `export async function regenerateReport(formData: FormData): Promise<void>` — consumed by Task 8's form.

**Context — no migration.** `save_report` has **no status filter** (it resolves the run through the status-agnostic `current_run()`), is `require_church_admin`-gated, and ends `on conflict (run_id, inputs_hash) do nothing`. So regenerate is **pure application code** and **idempotent for free** — a double-click is a no-op, no new guard needed.

**Model the body on `actions.ts:188-270`** (the existing generation block) — same `PROSE_MODE` gate, same `reportInputs` → `clusterThemes` → `buildFacts` → `composeReport` → `save_report` sequence, same reasons-only catch. The two differences: it reads **`get_completed_run_responses`** (status-agnostic — this is what makes it work on a *completed* run, where generation's `get_run_responses` returns nothing), and it has **no cache-check skip** — regenerating is the point.

⚠️ Read `actions.ts:188-270` before writing. Do not re-derive the sequence from memory.

- [ ] **Step 1: Write the failing tests**

Create `tests/report/regenerate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('regenerateReport wiring', () => {
  const src = readFileSync('app/app/[churchId]/actions.ts', 'utf8')

  it('exists as a server action', () => {
    expect(src).toContain('export async function regenerateReport')
  })

  it('reads through the status-agnostic RPC', () => {
    // get_run_responses filters status='in_progress' and returns nothing on a completed run —
    // regenerate would silently write a report built from zero responses.
    expect(src).toContain('get_completed_run_responses')
  })

  it('persists through save_report', () => {
    // Two call sites now: the generation block and regenerate. Assert the COUNT — a presence
    // check is satisfied by the pre-existing generation call and would survive regenerate
    // silently never persisting.
    expect(src.match(/rpc\('save_report'/g)?.length).toBe(2)
  })

  it('is gated by PROSE_MODE, exactly like generation', () => {
    expect(src.match(/PROSE_MODE/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('never lets a failure reach the user', () => {
    // Same backstop shape as generation: the catch logs a reason and returns.
    expect(src).toContain("console.warn('[report] regenerate failed:")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/report/regenerate.test.ts
```

Expected: FAIL — `regenerateReport` not found.

- [ ] **Step 3: Append the action to `actions.ts`**

```ts
/**
 * Rebuilds and re-persists the AI report for a church whose persisted row no longer matches its
 * live inputs (D-P5-4). This is the recovery path for exactly one failure: an admin edited the
 * church profile after generation, the inputs hash moved, and every AI section silently reverted
 * to fallback with no way back. It is NOT a general "regenerate" button.
 *
 * Reads through get_completed_run_responses — the STATUS-AGNOSTIC RPC. Generation's
 * get_run_responses filters status='in_progress' and returns nothing once the run is complete,
 * so using it here would persist a report built from zero responses.
 *
 * No migration: save_report has no status filter, resolves the run via current_run(), is
 * require_church_admin-gated, and ends `on conflict (run_id, inputs_hash) do nothing` — so this
 * is idempotent for free and a double-click is a no-op.
 *
 * Never throws to the user. A failed regenerate leaves the existing row and the existing notice
 * untouched, and logs a reason only — never payloads, church data, or respondent data.
 */
export async function regenerateReport(formData: FormData): Promise<void> {
  const churchId = String(formData.get('churchId') ?? '')
  if (!churchId) return

  if ((process.env.PROSE_MODE ?? 'fallback') === 'fallback') return

  try {
    const supabase = await createClient()
    const methodology = loadMethodology()

    const { data: raw } = await supabase.rpc('get_completed_run_responses', {
      p_church_id: churchId,
    })
    const responses: Response[] = (raw ?? []).map((r: RunResponseRow) => ({
      category_id: r.category_id,
      item_id: r.item_id,
      value: r.value,
      respondent_label: r.respondent_label,
      respondent_id: r.respondent_user_id ?? r.respondent_label,
    }))
    if (responses.length === 0) return

    const { data: run } = await supabase
      .from('assessment_runs')
      .select('id, methodology_version, completed_at')
      .eq('church_id', churchId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!run) return

    // D-P4-5: catch to null so this degrades EXACTLY as generation and both render surfaces do.
    let churchProfile: ChurchProfile | null = null
    try {
      churchProfile = await loadChurchProfile(supabase, churchId)
    } catch {
      churchProfile = null
    }

    const { data: churchRow } = await supabase
      .from('churches')
      .select('name, attendance_band')
      .eq('id', churchId)
      .maybeSingle()
    if (!churchRow) return

    const derived = deriveDiagnosisForRun(
      responses,
      methodology,
      { attendance_band: churchRow.attendance_band ?? '' },
      run.methodology_version ?? null,
    )
    if (!derived.ok) return
    const diagnosis = derived.diagnosis

    const reflectionRows = reflectionRowsFor(raw ?? [])
    const labelSource = knownLabels(responses)
    const churchFacts = churchFactsFrom(churchProfile, churchRow.name)
    const hash = responseHash(responses, diagnosis.methodology_version)

    const { inputsHash, baseFacts } = reportInputs({
      diagnosis,
      methodology: derived.effectiveMethodology,
      responses,
      church: churchFacts,
      completedAt: run.completed_at,
      labelSource,
      responseHash: hash,
      reflections: reflectionRows,
    })

    // No cache check. Regenerating is the point; save_report's on-conflict makes it safe.
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
  } catch (err) {
    // Reason only — never the diagnosis, the facts, the composed sections, or respondent data.
    console.warn('[report] regenerate failed:', err instanceof Error ? err.message : 'unknown error')
    return
  }

  revalidatePath(`/app/${churchId}/diagnosis`)
}
```

> ⚠️ **Verify every symbol before assuming it.** `derived.diagnosis`, `derived.effectiveMethodology`, `baseFacts.cover.completed_at`, `facts.overall.tier.id`, and `RunResponseRow`'s field names are all copied from the existing generation block — re-read `actions.ts:188-270` and match it exactly. If `derived.ok` narrows to a different property name than `.diagnosis`, use the real one.
>
> ⚠️ `revalidatePath` is **outside** the try/catch and after it, so a failed regenerate still refreshes the page (showing the unchanged notice) rather than leaving a stale render.

- [ ] **Step 4: Run the tests** — `npx vitest run tests/report/regenerate.test.ts` → PASS.
- [ ] **Step 5: Gates** — `npx tsc --noEmit && npx vitest run && npx eslint .` → tsc 0 · **186 files** / 0 failures · eslint 0 problems.
- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/actions.ts' tests/report/regenerate.test.ts
git commit -m "feat(report): add admin regenerate action for stale reports"
```

---

## Task 8: Stale notice + regenerate control

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx` (render the notice; `stale` was already computed in Task 3)

**Interfaces:**
- Consumes: `stale` (Task 3), `regenerateReport` (Task 7).
- Produces: no new exports.

**Context:** the control renders **only when `stale` is true and the viewer is admin**. The page is already admin-gated (`:51-52` redirects non-admins), so `stale` alone is the condition. A plain `<form action={…}>` keeps this a Server Component — do **not** add `'use client'` to `page.tsx`.

- [ ] **Step 1: Add the notice + control**

In the scoreable branch of `page.tsx`, immediately **before** `<ReportSections sections={sections} />`:

```tsx
          {stale && (
            <div className="flex flex-col gap-8">
              <p className="font-body text-sm text-ink-soft">
                This report predates your latest settings change.
              </p>
              <form action={regenerateReport}>
                <input type="hidden" name="churchId" value={churchId} />
                <button
                  type="submit"
                  className="py-1.5 font-body text-sm text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Regenerate report
                </button>
              </form>
            </div>
          )}
```

Add to the page's imports:

```tsx
import { regenerateReport } from '../actions'
```

> ⚠️ Verify that relative path. `page.tsx` is `app/app/[churchId]/diagnosis/page.tsx`; `actions.ts` is `app/app/[churchId]/actions.ts` — so `'../actions'`. Confirm with `grep -n "from '../actions'" app/app/\[churchId\]/diagnosis/*.tsx` — if a sibling already imports it, match that specifier exactly.
>
> The **"Regenerating…"** pending label from the D-P5-8 table requires `useFormStatus`, which needs a Client Component. **Do not** convert `page.tsx`. Either extract a tiny client button component, or ship without the pending state and tell Natalie which you chose. Shipping without it is acceptable — the string is drafted so she can decide.

- [ ] **Step 2: Gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc 0 · 186 files / 0 failures · eslint 0 problems. ⚠️ a11y tests count heading tags in source text — this block adds none, but if `tests/a11y/` fails, fix the markup, not the test.

- [ ] **Step 3: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/diagnosis/page.tsx'
git commit -m "feat(report): show stale notice and regenerate control on the diagnosis page"
```

---

# Phase 4 — Teardown (**cuttable**)

> Phases 1–3 leave a complete, gate-green tree. If context or time runs short, **stop here and say so** — do not half-do the teardown.

## Task 9: Split `view.ts`, delete the UNSHIPPED components

**Files:**
- Modify: `lib/report/view.ts` (525 → roughly 145)
- Delete: `app/app/[churchId]/diagnosis/report/{cover,chain,system,dossier}.tsx`
- Modify or delete: `app/app/[churchId]/diagnosis/report/shared.tsx` — **see the warning**

⚠️ **`view.ts` SPLITS, it does not die.**

**Delete:** `buildReportView`, `resolveReportView`, `ReportView`, `SystemView`, `AreaDossierView`, `CoverView`, `ReportViewResolution`, `ReportAudience` (~380 lines).
**Keep:** `interp`, `readingBand`, `buildOutreachVoices`, `OutreachVoicesGroup`, `resolveScoreability`, `ScoreabilityResolution`.

Live consumers of the survivors — **a delete-the-file change breaks all of these**:

| Survivor | Consumer |
|---|---|
| `interp` | `lib/report/facts.ts:4`, `lib/report/fallback-sections.ts:4` |
| `readingBand` | `lib/report/fallback-sections.ts:4` |
| `buildOutreachVoices` | `lib/report/fallback-sections.ts:4` |
| `resolveScoreability` + `ScoreabilityResolution` | `app/app/[churchId]/diagnosis/page.tsx:8`, `app/r/[shareToken]/page.tsx:20` |

⚠️ **`shared.tsx` is NOT UNSHIPPED.** `page.tsx:20` imports `EmptyState` and `StaleMethodologyNotice` from it. The spec's five-file delete list is wrong on this one file. **Verify first:**

```bash
grep -rn "from './report/shared'\|from './shared'\|report/shared" app/ | grep -v node_modules
```

If those two components have live imports, **keep `shared.tsx`** and delete only the components inside it that have none. Delete the other four files outright.

- [ ] **Step 1: Confirm each deletion target has zero production call sites**

```bash
for f in cover chain system dossier shared; do
  echo "--- $f ---"
  grep -rn "report/$f'\|/$f'" app/ lib/ tests/ | grep -v node_modules
done
```

Any hit outside a comment or a test being dispositioned in Task 10 means **do not delete that file** — report it instead.

- [ ] **Step 2: Delete the confirmed-dead files and trim `view.ts`**

```bash
GIT_LITERAL_PATHSPECS=1 git rm 'app/app/[churchId]/diagnosis/report/cover.tsx' 'app/app/[churchId]/diagnosis/report/chain.tsx' 'app/app/[churchId]/diagnosis/report/system.tsx' 'app/app/[churchId]/diagnosis/report/dossier.tsx'
```

Then remove the eight dying exports from `lib/report/view.ts`, plus any imports that only served them.

- [ ] **Step 3: Run tsc FIRST — it is the real gate for a deletion**

```bash
npx tsc --noEmit
```

Expected: 0. Every remaining error names a real surviving consumer you must not have broken. **A vitest run proves nothing here** — deleted modules surface as compile errors, not test failures.

- [ ] **Step 4: Record the pre-trim test count** (needed for Task 10's D-P5-9 gate)

```bash
npx vitest run 2>&1 | tail -5
```

Write the observed **files / tests** numbers into the Task 10 table below before trimming anything.

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/report/view.ts 'app/app/[churchId]/diagnosis/report/'
git commit -m "refactor(report): split view.ts and delete unshipped report components"
```

---

## Task 10: Disposition the nine test files, restate the baseline

**Files:** the nine below, all under `tests/report/`.

⚠️ **Deleting a test file is indistinguishable from a passing gate.** Every one of these gets an explicit disposition, and none is deleted without one.

| File | Disposition |
|---|---|
| `copy-relocation.test.ts` | **Re-home, do not drop.** s41 explicitly cleared this as real coverage *through* `buildReportView`. Re-point its assertions at `fallbackSections` / `buildFacts`. |
| `audience.test.ts` | **Re-home the invariant, not the test.** The screen/pdf/shared audience concept dies with `buildReportView`; the real invariant — no respondent label reaches the pdf or shared surface — re-homes onto the Task 5 guard + `assembleFallbackOnly`. |
| `pdf-document.test.ts` | **Rewrite** against the new document. Much of it is already covered by `pdf-sections.test.ts`; keep only what that file does not assert. |
| `pdf-voices.test.ts` | **Re-home** onto the S8 fallback / themes path. |
| `components.test.ts` | **Trim.** ~16 of its 20 tests cover UNSHIPPED components. Its comment at `:188-203` claims AreaTable is live "until Task 8 swaps that page too" — **Task 8 is `b3e7455`, already in this branch.** Delete that stale comment. Keep only what survives. |
| `audience-parity.test.ts` | **Delete.** It asserts parity between `buildReportView` audiences that no longer exist, via `confidenceBand`, which Task 4 deleted. |
| `view.test.ts` | **Trim** to the four surviving helpers. |
| `stale-payload.test.ts` | **Re-point** at `resolveScoreability`. Fix its stale doc comment at `:22-24` in passing. |
| `assemble-fallback-only.test.ts` | **Trim** the `resolveReportView` import; the `resolveScoreability` half stays. |

- [ ] **Step 1: Work the table top to bottom**, one file per commit-sized chunk. After each, run `npx vitest run tests/report/` and confirm the failure count is 0 and the file count moved by exactly what you intended.

- [ ] **Step 2: Restate the baseline (D-P5-9)**

Fill this in and **gate on the numbers**, not on "0 failures":

| Checkpoint | Files | Tests |
|---|---|---|
| Plan entry (verified at `919d70c`) | 183 | 1209 |
| After Phase 3 (adds `resolve`, `pdf-sections`, `regenerate`) | **186** | *record* |
| After Task 10 (`audience-parity.test.ts` deleted; eight files trimmed) | **185** | *compute: after-Phase-3 count minus the test blocks you removed, summed as you go* |

**The file count is the hard gate: 185.** Anything lower means a file stopped being collected — check for a `.tsx` rename or a syntax error before assuming a deletion explains it.

**A decrease in the test count is NOT a regression** — the teardown removes real tests for real deleted code. **A silently uncollected file IS.** Per D-P5-9 a per-file delta table is explicitly **not** required; the running total you computed while trimming is the expectation to gate on.

- [ ] **Step 3: Final gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint .
```

Expected: tsc **0** · vitest **185 files / \<your computed count\> tests / 0 failures** · eslint **0 problems**.

- [ ] **Step 4: Commit**

```bash
git add tests/report/
git commit -m "test(report): disposition view-model tests and restate the baseline"
```

---

## After the plan

⛔ **Do not merge, push, or force-push.** The branch stays local.

**Owed to Natalie when the work lands:**

1. The **D-P5-8 copy** in the table above, for her glance before merge — including which pending-state option Task 8 shipped.
2. The **planning ruling** at the top of this plan (`stale` could never fire under a purely hash-addressed read; resolved with `{ matched, anyExists }`).
3. The **`shared.tsx` correction** — the spec's five-file delete list names a file with live imports (Task 9).
4. The **dropped `view.appendix` score/percentile table** in the PDF (Phase 2 preamble) — deliberate parity with the web, but it is a visible change to the exported document.
5. ⚠️ **The unverified claim, unchanged and uncloseable by this plan:** the AI/themes path has never executed against a real `reports` row, because migrations `20260811000100` then `20260811000200` are committed but **not applied**. `.from('reports')` always errors, so every section renders fallback — designed degradation, not a bug. **If hash parity is broken the symptom is SILENT:** the row is judged stale forever, themes never render, and all three gates stay green. Applying both migrations **in order**, running `npm run test:db`, and smoking both surfaces is hers — and it is now also the **precondition for testing Phase 3's regenerate path against real data.**
