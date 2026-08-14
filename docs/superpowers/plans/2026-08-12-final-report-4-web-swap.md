# Final Report — Plan 4 of 5: Renderer / Web Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on the 13-section `report.yaml` executive report on the two web surfaces — the authenticated diagnosis page and the public share page — by replacing the legacy 10-block `ReportView` render with `assembleReport`/`assembleFallbackOnly` feeding one new shared `<ReportSections>` component.

**Architecture:** Both surfaces converge on one renderer from different data paths. The diagnosis page recomputes `liveInputsHash` through a **new shared module** (`lib/report/inputs-hash.ts`) whose single definition is also used by generation, reads the persisted `reports` row, revalidates `facts.themes`, and calls `assembleReport`. The share page has no hash, no `reports` read, no themes and no reflections — it calls `assembleFallbackOnly` and every section is deterministic fallback. The PDF route is deliberately untouched and keeps the legacy blocks until plan 5.

**Tech Stack:** Next.js App Router (React Server Components), TypeScript (strict, `npx tsc --noEmit`), Supabase JS server client, zod pinned `3.25.76` imported from `zod/v4`, vitest, eslint (flat config).

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Gates, run after every task:** `npx tsc --noEmit` → 0 · `npx vitest run` → 0 failures · `npx eslint` → 0. A green vitest proves **nothing** about tsc. Run all three, every time.
- **Vitest baseline: 179 files / 1168 tests / 0 failures.** Test counts only ever go up in this plan; a task that ends below its stated expected total has silently deleted coverage.
- **eslint is a real gate for plan 4.** `globalIgnores` covers `supabase/**`, `lib/ai/**`, `lib/engine/**`, `lib/methodology/**`, `methodology/**`, `docs/**`, `tests/ai/**`, `tests/engine/**`, `tests/methodology/**`, `tests/smoke.test.ts`. But `app/**`, `lib/report/**`, `tests/report/**` and `tests/outreach/**` **are linted** — and that is exactly where plan 4 lands. This differs from plan 3.
- **No new dependencies.** No methodology version bump. No migration, no schema change, no RPC change. zod stays pinned `3.25.76`, imported from `zod/v4`.
- **No new visual language (D-P4-3).** Structural swap on existing tokens only: `font-display`, `font-body`, `text-ink`, `text-ink-soft`, `max-w-2xl`, `gap-8`. No mockup round.
- **Logging is reasons-only** — never payloads, church data, or respondent data.
- **Implementers run NO git commands and NO database commands.** The controller commits by explicit path and re-runs the gates itself.
- ⛔ Never merge, push, or force-push without Natalie. ⛔ Never `npm run test:db`, `supabase db push|reset|start`, or `psql`.
- **Explicit git paths only**, never `git add -A`. Never stage `.claude/` or the two old untracked plan docs in `docs/superpowers/plans/`. Bracket paths (`[churchId]`, `[shareToken]`, `[runId]`) need `GIT_LITERAL_PATHSPECS=1` and quoting.
- **Commit messages are a bare conventional-commit subject with NO trailer.**
- **Dispatch sizing is a hard constraint:** one task = one implementer, never batch two tasks into one agent. Review checklists are ≤4 items per reviewer, and batches run **sequentially**.
- Say **"UNSHIPPED"**, never "inert", when describing code with zero production call sites.

---

## Locked inputs — do not re-open

The approved spec `docs/superpowers/specs/2026-08-12-final-report-4-web-swap-design.md` is the contract. Do not re-present it, re-derive its findings, or re-open its decisions. Locked and not to be re-asked: the 6 locked decisions, P1–P7, D1–D5, C1–C6, execution mode, all Task 2–10 rulings, round A's R-A1…R-A9, the round-C go-ahead, the three s27b decisions, **D-P4-1/2/3/4**, the 7 approved design sections, and the entire spec including §9.1 / §4.3 / §9.2 / §9.4.

**§9.1 stands:** the share page passes `completedAt: null`, so S1 publicly reads *"assessed not yet completed"*. The RPC-column fix is a plan-5 follow-up.

### Two known spec errors — neither reopens a decision

1. **§10.3 line 472 is wrong.** `tests/report/booking-cta-shared.test.ts` does **not** survive: it asserts `indexOf('<BookingCta') < indexOf('<Appendix')`, and `<Appendix` leaves the share page in Task 7, so `indexOf` returns `-1` and `202 < -1` is false. The spec checked only the left operand. Task 7 re-points it and **justifies the deliberate ordering inversion**.
2. **D-P4-2's *rationale* is factually wrong.** The PDF route imports **none** of the four block components — `app/api/report/[runId]/pdf` renders through `lib/report/pdf/document.tsx`, a separate `@react-pdf/renderer` implementation that takes only *types* from `view.ts`. After plan 4, `cover.tsx` / `chain.tsx` / `system.tsx` / `dossier.tsx` have **zero production call sites** — they are **UNSHIPPED**, alive only via `tests/report/components.test.ts` and `tests/report/audience-parity.test.ts`. `lib/report/view.ts` **does** survive (`pdf/route.ts:5,122`). **D-P4-2's operative ruling is intact and plan 4's scope is unchanged** — plan 5's deletion scope is simply bigger and cheaper than the spec assumed. Do not repeat the false claim.

### New decisions made by this plan

**D-P4-5 — `loadChurchProfile` error posture.** Spec §4.3 switches both call sites to `loadChurchProfile`, but does not address that it **throws** on an unexpected error (`lib/data/churches.ts:110`, `if (error) throw error`) while the inline select it replaces (`actions.ts:50-54`) **silently degrades** to `church === undefined` → an all-null `ChurchFacts`. `actions.ts:50` sits in the action's main body, **outside both try blocks**, so an unguarded switch converts a transient profile-read failure into an unhandled server-action error where today generation still completes.

**Ruling: wrap the `loadChurchProfile` call in `try { … } catch { profile = null }` at BOTH call sites** and map through `churchFactsFrom(profile, fallbackName)`. Both sites then degrade **identically**, which is what preserves the §4 hash-parity property — an asymmetric degradation would make generation and render disagree about `profile` exactly when the database is flaky, i.e. produce permanent silent staleness under the one condition nobody tests. Note `loadChurchProfile` already returns `null` (not a throw) when RLS hides the church, so the `catch` covers only genuine read failures.

**D-P4-6 — where scoreability comes from once the pages stop calling `resolveReportView`.** The spec says (§10.3) neither page calls `resolveReportView` after plan 4, and (§3.1) that both not-scoreable branches stay unchanged. Those are only jointly satisfiable if something else produces the resolution. `resolveReportView` (`lib/report/view.ts:480-500`) computes its not-scoreable arm from `derived` **alone** — `methodology`, `blocks` and `opts` are used only to build the view on the success arm. Keeping the call purely to read a boolean would build an entire unused `ReportView` on every request on both surfaces and keep `fallbackProse`/`buildReportView`/`toReportBlocks` coupled to both pages.

**Ruling: add one additive export, `resolveScoreability(derived)`, to `lib/report/view.ts`, and make `resolveReportView` delegate to it.** This is a deliberate, additive deviation from spec §13's "untouched" list for `view.ts`. It is the same class of change the spec already authorises for `compose.ts` (`assembleFallbackOnly`), it is the natural home (`ReportViewResolution` is defined there), the delegation is a pure refactor with identical behaviour, and it does not touch the PDF route. Its success arm carries `diagnosis`, which is what lets both pages narrow `derived` at the guard instead of needing a dead second check. **FYI for Natalie — this adds one export to a file the spec listed as untouched; her approval and every other spec decision stand.**

---

## File Structure

| file | responsibility |
|---|---|
| `lib/report/inputs-hash.ts` | **new.** Pure module. `ReflectionSourceRow`, `reflectionRowsFor`, `churchFactsFrom`, `reportInputs`. The single definition of the report inputs hash's assembly — the anti-drift boundary between generation and render. No React, no Supabase, no page coupling. |
| `app/app/[churchId]/diagnosis/report/sections.tsx` | **new.** `SectionBodyView`, the seven AI renderers, the `ReportSections` dispatcher. The only renderer both pages import. Owns the h1/h2 outline rule. |
| `lib/report/view.ts` | **additive.** `resolveScoreability` export; `resolveReportView` delegates to it (D-P4-6). Everything else untouched — the PDF route keeps working. |
| `lib/report/compose.ts` | **additive.** `assembleFallbackOnly` export. Existing exports unchanged. |
| `app/app/[churchId]/actions.ts` | I9 cache-miss select · `reflectionRowsFor` + `reportInputs` extraction · `loadChurchProfile` + `churchFactsFrom` (D-P4-5). |
| `app/r/[shareToken]/page.tsx` | `buildFacts` → `assembleFallbackOnly` → `<ReportSections>`; `<BookingCta>` retained after the report. |
| `app/app/[churchId]/diagnosis/page.tsx` | profile read · `completed_at` in the run select · `reportInputs` · `reports` read seam · themes revalidate · `<ReportSections>` · admin controls relocated after the report. |
| `supabase/migrations/20260811000100_reports.sql` | comment-only amendment at lines 16-18. |
| `tests/report/inputs-hash-parity.test.ts` · `tests/report/sections-dispatch.test.ts` · `tests/report/route-sections-wiring.test.ts` | **new** (spec §10.1 groups 1–3). |
| 6 re-pointed tests | `tests/report/route-call-ordering.test.ts` · `tests/report/route-methodology-wiring.test.ts` · `tests/report/route-reflections-wiring.test.ts` · `tests/a11y/shared-report-heading.test.ts` · `tests/report/booking-cta-shared.test.ts` · `tests/outreach/shared-exclusion.test.ts` |

**Untouched, still live for the PDF route:** `lib/report/pdf/**`, `lib/report/report-hash.ts`, `lib/report/fallback-sections.ts`, `lib/report/facts.ts`, `lib/report/anonymity.ts`. **UNSHIPPED after this plan** (zero production call sites, deleted in plan 5, not here): `app/app/[churchId]/diagnosis/report/{shared,cover,chain,system,dossier}.tsx`.

---

## Task ordering — a hard constraint the spec does not state

Under SDD **every task must end with all three gates green.** The six test re-points therefore **cannot be a trailing task**: each must land in the **same commit** as the page change that breaks it. All six break the instant its page changes.

- **Task 7 (share page)** breaks all six at once. It re-points the share-page half of each.
- **Task 8 (diagnosis page)** breaks the diagnosis half of the three route tests. It re-points those.

Three of the shared test files are therefore edited **twice**, once per page. That is deliberate and honest, not churn: `route-call-ordering` and `route-methodology-wiring` loop over a `ROUTES` array that shrinks 3 → 2 → 1, and `route-reflections-wiring` already has one `it()` per route so each is rewritten in its own task.

**Task order is fixed: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.** Tasks 5 and 6 must precede 7 because `sections.tsx` must exist before `shared-report-heading` counts its `<h1>`.

---

## Task 1: The shared inputs-hash module

**Files:**
- Create: `lib/report/inputs-hash.ts`
- Create: `tests/report/inputs-hash-parity.test.ts`

**Interfaces:**
- Consumes: `buildFacts` / `FactsPack` / `ChurchFacts` (`lib/report/facts.ts`), `reportInputsHash` (`lib/report/report-hash.ts`), `ChurchProfile` (`lib/data/churches.ts`), `LabelSource` (`lib/report/anonymity.ts:71`).
- Produces, for Tasks 2, 7 and 8:
  - `interface ReflectionSourceRow { item_id: string; respondent_label: string; respondent_user_id: string | null; reflection: string | null }`
  - `reflectionRowsFor(rows: readonly ReflectionSourceRow[]): Array<{ item_id: string; respondent_key: string; text: string }>`
  - `churchFactsFrom(profile: ChurchProfile | null, fallbackName: string): ChurchFacts`
  - `reportInputs(args: { diagnosis; methodology; responses; church; completedAt; labelSource; responseHash; reflections }): { inputsHash: string; baseFacts: FactsPack }`

**Background the implementer needs:** `reportInputsHash` (`lib/report/report-hash.ts`) is a pure canonicaliser taking `{ methodologyVersion, responseHash, methodology, reflections, profile, reportVersion }`. It is **not modified** by this plan and keeps its own tests. Today it is called from exactly one place, `app/app/[churchId]/actions.ts:224-231`. Plan 4 adds a second caller — the diagnosis page — and a duplicated formula there would not fail loudly: it would pin every report to "stale" forever, with no error, no log, and a page that still renders correctly, just always from fallback. This module exists so there is one definition rather than two drifting copies.

`ChurchFacts` (`lib/report/facts.ts:53-67`) is structurally `Omit<ChurchProfile, 'id'>` — `name` plus the same 12 nullable columns as `ChurchProfile` (`lib/data/churches.ts:72-87`). That is what makes `churchFactsFrom` a rest-spread rather than a 13-line hand-copy, and it means tsc fails loudly if the two type lists ever drift apart.

- [ ] **Step 1: Read the source of truth before writing anything**

Read these exact ranges. Do not skim — the extraction must be literal.

```
app/app/[churchId]/actions.ts:200-235      # reflectionRows, labelSource, buildFacts, reportInputsHash
lib/report/report-hash.ts                  # 61 lines, ReportHashArgs
lib/report/facts.ts:53-67                  # ChurchFacts
lib/report/facts.ts:92-102                 # BuildFactsArgs
lib/data/churches.ts:72-112                # ChurchProfile, PROFILE_COLUMNS, loadChurchProfile
lib/report/anonymity.ts:60-79              # LabelSource, knownLabels
```

- [ ] **Step 2: Write the failing test**

Create `tests/report/inputs-hash-parity.test.ts`:

```ts
// The anti-drift boundary. reportInputs is called from two places — generation
// (app/app/[churchId]/actions.ts) and render (app/app/[churchId]/diagnosis/page.tsx).
// A duplicated hash formula does not fail loudly: it pins every report to "stale"
// forever, with no error and no log, and the page still renders — just always from
// fallback. This file is what catches that.
import { describe, expect, it } from 'vitest'
import { churchFactsFrom, reflectionRowsFor, reportInputs } from '../../lib/report/inputs-hash'
import type { ReflectionSourceRow } from '../../lib/report/inputs-hash'

describe('reflectionRowsFor', () => {
  const rows: ReflectionSourceRow[] = [
    { item_id: 'i1', respondent_label: 'Ada L', respondent_user_id: 'u1', reflection: '  keep me  ' },
    { item_id: 'i2', respondent_label: 'Ada L', respondent_user_id: 'u1', reflection: null },
    { item_id: 'i3', respondent_label: 'Bo M', respondent_user_id: 'u2', reflection: '   ' },
    { item_id: 'i4', respondent_label: 'Cy N', respondent_user_id: null, reflection: 'no user id' },
  ]

  it('drops null and whitespace-only reflections and trims the rest', () => {
    expect(reflectionRowsFor(rows)).toEqual([
      { item_id: 'i1', respondent_key: 'u1', text: 'keep me' },
      { item_id: 'i4', respondent_key: 'Cy N', text: 'no user id' },
    ])
  })

  it('keys on respondent_user_id ?? respondent_label', () => {
    const keys = reflectionRowsFor(rows).map((r) => r.respondent_key)
    expect(keys).toEqual(['u1', 'Cy N'])
  })

  it('returns an empty array for an empty input', () => {
    expect(reflectionRowsFor([])).toEqual([])
  })
})

describe('churchFactsFrom', () => {
  const profile = {
    id: 'church-1',
    name: 'Grace Chapel',
    denomination: 'Baptist',
    context: 'suburban',
    attendance_band: '200-499',
    adults_band: null,
    staff_fte_band: null,
    budget_band: null,
    church_age_band: null,
    growth_trajectory: null,
    campuses_band: null,
    facility_status: null,
    leadership_history: null,
    consultant_notes: null,
  }

  it('drops id and keeps every profile column', () => {
    const facts = churchFactsFrom(profile, '')
    expect(facts).not.toHaveProperty('id')
    expect(facts.name).toBe('Grace Chapel')
    expect(facts.denomination).toBe('Baptist')
    expect(facts.attendance_band).toBe('200-499')
    expect(facts.consultant_notes).toBeNull()
  })

  it('falls back to the supplied name and nulls every column when the profile is null', () => {
    // Generation passes '' (bit-identity with the pre-plan-4 `church?.name ?? ''`);
    // the diagnosis page passes the real church name from loadChurchForMember.
    expect(churchFactsFrom(null, '')).toEqual({
      name: '',
      denomination: null,
      context: null,
      attendance_band: null,
      adults_band: null,
      staff_fte_band: null,
      budget_band: null,
      church_age_band: null,
      growth_trajectory: null,
      campuses_band: null,
      facility_status: null,
      leadership_history: null,
      consultant_notes: null,
    })
    expect(churchFactsFrom(null, 'Grace Chapel').name).toBe('Grace Chapel')
  })

  it('is the same object for the same profile regardless of fallbackName', () => {
    // fallbackName is NOT in the hash (reportInputsHash takes `profile`, never `cover`),
    // so the two call sites may legitimately pass different fallbacks.
    expect(churchFactsFrom(profile, '')).toEqual(churchFactsFrom(profile, 'Other Name'))
  })
})
```

**Do not write the `reportInputs` parity test yet** — it needs a real `Diagnosis`/`Methodology` fixture, and Task 2 is what proves the extraction was literal. It is added in Step 6 below once the module compiles.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/report/inputs-hash-parity.test.ts`
Expected: FAIL — `Failed to resolve import "../../lib/report/inputs-hash"`.

- [ ] **Step 4: Write the module**

Create `lib/report/inputs-hash.ts`:

```ts
import type { ChurchProfile } from '@/lib/data/churches'
import type { LabelSource } from '@/lib/report/anonymity'
import { buildFacts } from '@/lib/report/facts'
import type { ChurchFacts, FactsPack } from '@/lib/report/facts'
import { reportInputsHash } from '@/lib/report/report-hash'

/**
 * The raw run-response row shape both surfaces already have in hand.
 * Structural subset of what get_completed_run_responses returns — the module never
 * touches Supabase itself, so it stays pure and unit-testable.
 */
export interface ReflectionSourceRow {
  item_id: string
  respondent_label: string
  respondent_user_id: string | null
  reflection: string | null
}

/**
 * item_id + respondent_key + trimmed text, non-empty only. `respondent_key` is the STABLE
 * identity: respondent_user_id ?? respondent_label — a renamed respondent must not change
 * the hash, but a different respondent must.
 *
 * ⚠️ ANONYMITY: the array this returns CARRIES RESPONDENT IDENTITY. Its only legitimate
 * consumer is reportInputs (i.e. the hash). It must never be passed to fallbackSections,
 * assembleReport, a component, or any client boundary. See the sibling keyless array on
 * app/app/[churchId]/diagnosis/page.tsx.
 *
 * Extracted verbatim from app/app/[churchId]/actions.ts:204-210.
 */
export function reflectionRowsFor(
  rows: readonly ReflectionSourceRow[],
): Array<{ item_id: string; respondent_key: string; text: string }> {
  const out: Array<{ item_id: string; respondent_key: string; text: string }> = []
  for (const row of rows) {
    const text = (row.reflection ?? '').trim()
    if (text === '') continue
    out.push({
      item_id: row.item_id,
      respondent_key: row.respondent_user_id ?? row.respondent_label,
      text,
    })
  }
  return out
}

/**
 * Every profile column at null. Typed with `satisfies` so tsc — not a human — proves the
 * key list matches ChurchFacts. If lib/report/facts.ts gains or renames a column, this
 * fails to compile instead of silently hashing a short profile.
 */
const NULL_PROFILE_COLUMNS = {
  denomination: null,
  context: null,
  attendance_band: null,
  adults_band: null,
  staff_fte_band: null,
  budget_band: null,
  church_age_band: null,
  growth_trajectory: null,
  campuses_band: null,
  facility_status: null,
  leadership_history: null,
  consultant_notes: null,
} satisfies Omit<ChurchFacts, 'name'>

/**
 * The single ChurchProfile → ChurchFacts mapping, shared by generation and render so the
 * `profile` component of the inputs hash cannot drift between them (spec §4.3).
 *
 * `fallbackName` legitimately differs per call site: generation passes '' (bit-identity
 * with the pre-plan-4 `church?.name ?? ''`), the diagnosis page passes the real church
 * name. `name` is not part of `profile`, so it cannot affect the hash — but it IS
 * facts.cover.church_name, which S1 renders.
 *
 * ChurchFacts is structurally Omit<ChurchProfile, 'id'>, so this is a rest-spread rather
 * than a 13-line hand-copy: tsc fails loudly if the two type lists ever drift.
 */
export function churchFactsFrom(
  profile: ChurchProfile | null,
  fallbackName: string,
): ChurchFacts {
  if (!profile) return { name: fallbackName, ...NULL_PROFILE_COLUMNS }
  const { id: _id, ...facts } = profile
  return { ...facts, name: facts.name ?? fallbackName }
}

/**
 * Owns the assembly of all six inputs-hash components, so the only way the two call sites
 * can disagree is by passing different `responses`, `church` or `reflections` — all of
 * which tests/report/inputs-hash-parity.test.ts pins directly.
 *
 * `responseHash` is NOT recomputed here (callers pass it). `baseFacts` is returned so
 * neither caller rebuilds it. Extracted verbatim from actions.ts:212-231.
 */
export function reportInputs(args: {
  diagnosis: Parameters<typeof buildFacts>[0]['diagnosis']
  methodology: Parameters<typeof buildFacts>[0]['methodology']
  responses: Parameters<typeof buildFacts>[0]['responses']
  church: ChurchFacts
  completedAt: string | null
  labelSource: LabelSource
  responseHash: string
  reflections: ReadonlyArray<{ item_id: string; respondent_key: string; text: string }>
}): { inputsHash: string; baseFacts: FactsPack } {
  const baseFacts = buildFacts({
    diagnosis: args.diagnosis,
    methodology: args.methodology,
    responses: args.responses,
    church: args.church,
    completedAt: args.completedAt,
    labelSource: args.labelSource,
  })

  const inputsHash = reportInputsHash({
    methodologyVersion: args.diagnosis.methodology_version,
    responseHash: args.responseHash,
    methodology: args.methodology,
    reflections: args.reflections,
    profile: baseFacts.profile,
    reportVersion: args.methodology.report.version,
  })

  return { inputsHash, baseFacts }
}
```

**Note on the `Parameters<typeof buildFacts>[0][...]` indexed types:** use them only if `BuildFactsArgs` is not exported from `lib/report/facts.ts`. Check line 92 first — if `BuildFactsArgs` **is** exported, import it and write `diagnosis: BuildFactsArgs['diagnosis']` etc., which is clearer. Either way the types must be *derived from* `buildFacts`, never re-declared, so a `BuildFactsArgs` change breaks this file at compile time.

**Note on `args.diagnosis.methodology_version` and `args.methodology.report.version`:** confirm both against `actions.ts:224-231` before committing. If generation reads either from a different binding, match generation exactly — generation is the definition, this module is the extraction.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/report/inputs-hash-parity.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Add the `reportInputs` determinism test**

Append to `tests/report/inputs-hash-parity.test.ts`. Build the fixture from an existing one — read `tests/report/` for a `Diagnosis`/`Methodology` fixture already in use (the composer tests from plan 3 have one) and import it rather than hand-rolling a new shape.

```ts
describe('reportInputs', () => {
  // The two call sites differ ONLY in fallbackName and completedAt. Neither is in the
  // hash, so the same run must hash identically from generation and from render.
  const shared = {
    diagnosis: FIXTURE_DIAGNOSIS,
    methodology: FIXTURE_METHODOLOGY,
    responses: FIXTURE_RESPONSES,
    labelSource: { kind: 'known', labels: ['Ada L'] } as const,
    responseHash: 'response-hash-abc',
    reflections: [{ item_id: 'i1', respondent_key: 'u1', text: 'keep me' }],
  }

  it('produces the same inputsHash from generation-shaped and page-shaped arguments', () => {
    const generation = reportInputs({
      ...shared,
      church: churchFactsFrom(FIXTURE_PROFILE, ''),
      completedAt: new Date('2026-01-02T03:04:05.000Z').toISOString(),
    })
    const page = reportInputs({
      ...shared,
      church: churchFactsFrom(FIXTURE_PROFILE, 'Grace Chapel'),
      completedAt: null,
    })
    expect(page.inputsHash).toBe(generation.inputsHash)
  })

  it('changes the hash when a hashed component changes', () => {
    // Non-vacuity: proves the assertion above is not passing because the hash ignores
    // everything. A different profile MUST produce a different hash.
    const base = reportInputs({ ...shared, church: churchFactsFrom(FIXTURE_PROFILE, ''), completedAt: null })
    const other = reportInputs({
      ...shared,
      church: churchFactsFrom({ ...FIXTURE_PROFILE, denomination: 'Methodist' }, ''),
      completedAt: null,
    })
    expect(other.inputsHash).not.toBe(base.inputsHash)
  })

  it('returns baseFacts so neither caller rebuilds it', () => {
    const { baseFacts } = reportInputs({
      ...shared,
      church: churchFactsFrom(FIXTURE_PROFILE, 'Grace Chapel'),
      completedAt: null,
    })
    expect(baseFacts.cover.church_name).toBe('Grace Chapel')
    expect(baseFacts.profile).toBeDefined()
  })
})
```

- [ ] **Step 7: Run all three gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **179 files / 1177 tests / 0 failures** · eslint 0.
(9 new tests in one new file — file count goes 179 → 180 if vitest counts the new file; report the real numbers, do not assume.)

- [ ] **Step 8: Commit** *(controller only)*

```bash
git add lib/report/inputs-hash.ts tests/report/inputs-hash-parity.test.ts
git commit -m "feat(report): add shared inputs-hash module for generation and render"
```

---

## Task 2: Extract generation onto the shared module

**Files:**
- Modify: `app/app/[churchId]/actions.ts:50-70` (inline church select → `loadChurchProfile` + `churchFactsFrom`), `:204-231` (→ `reflectionRowsFor` + `reportInputs`)

**Interfaces:**
- Consumes: `reflectionRowsFor`, `churchFactsFrom`, `reportInputs` (Task 1); `loadChurchProfile` (`lib/data/churches.ts:101`).
- Produces: nothing new. This is a **pure extraction — generation's behaviour must be bit-identical.**

**Why this task exists:** the parity test in Task 1 only proves the *module* is self-consistent. It proves nothing about whether generation actually uses it. Until generation is switched over, there are still two formulas.

- [ ] **Step 1: Read the current code**

Read `app/app/[churchId]/actions.ts:40-75` and `:195-290` in full. Note the structure: `:50` sits in the action's main body, **outside both try blocks** — that is what D-P4-5 is about.

- [ ] **Step 2: Replace the inline church select (D-P4-5)**

Replace `actions.ts:50-70` (the 13-column inline `.from('churches').select(...)` and its `churchFacts` map) with:

```ts
// D-P4-5: loadChurchProfile throws on an unexpected read error, where the inline select
// this replaces silently degraded to an all-null ChurchFacts. This line sits outside both
// try blocks, so an unguarded switch would turn a transient profile read failure into an
// unhandled server-action error. Catching to null keeps generation's old behaviour AND
// keeps it identical to the diagnosis page's, which is what preserves hash parity when
// the database is flaky — the one condition nobody smoke-tests.
let churchProfile: ChurchProfile | null = null
try {
  churchProfile = await loadChurchProfile(supabase, churchId)
} catch {
  churchProfile = null
}
const churchFacts = churchFactsFrom(churchProfile, '')
```

Add the imports:

```ts
import { loadChurchProfile } from '@/lib/data/churches'
import type { ChurchProfile } from '@/lib/data/churches'
import { churchFactsFrom, reflectionRowsFor, reportInputs } from '@/lib/report/inputs-hash'
```

⚠️ The `''` fallback is load-bearing: `actions.ts` previously produced `name: church?.name ?? ''`. Preserving it is what makes this extraction bit-identical. Do **not** substitute a real church name here.

⚠️ Confirm the existing binding name used downstream (`churchFacts` vs another). Keep whatever name the file already uses so the diff stays minimal.

- [ ] **Step 3: Replace the reflection-rows and hash block**

Replace `actions.ts:204-231` with:

```ts
const reflectionRows = reflectionRowsFor(responses)
const labelSource = knownLabels(responses)
const { inputsHash, baseFacts } = reportInputs({
  diagnosis,
  methodology: reportMethodology,
  responses,
  church: churchFacts,
  completedAt: new Date().toISOString(),
  labelSource,
  responseHash: hash,
  reflections: reflectionRows,
})
```

⚠️ Match the existing binding names exactly — downstream code at `:236-288` reads `baseFacts.cover.completed_at` (`:251-261`) and the hash variable. Read those lines and keep the names they already use. If the file currently names the hash `inputsHash`, keep it; if it names it something else, rename the destructure with `const { inputsHash: <existingName>, baseFacts } = ...`.

⚠️ `methodology:` must receive **`reportMethodology`**, never the raw `methodology`. Confirm which binding `actions.ts:216-223` passes today and preserve it exactly.

- [ ] **Step 4: Prove the extraction is literal**

Run the full suite. The 1168-test baseline **is** the proof: generation's hash feeds `save_report`, and the composer tests from plan 3 exercise it.

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **0 failures, same total as end of Task 1** · eslint 0.

- [ ] **Step 5: Non-vacuity check** *(controller only)*

```bash
git diff -U0 -- app/app/[churchId]/actions.ts | grep '^-'
```
Confirm every deleted line is either the inline select, the `churchFacts` map, or the `reflectionRows`/`buildFacts`/`reportInputsHash` block being extracted. **A deleted line outside those ranges is a defect, not a cleanup.**

- [ ] **Step 6: Commit** *(controller only)*

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/actions.ts"
git commit -m "refactor(report): extract generation onto the shared inputs-hash module"
```

---

## Task 3: I9 — the cache-miss correction

**Files:**
- Modify: `app/app/[churchId]/actions.ts:236-244`

**Interfaces:** Consumes nothing new. Produces nothing new.

**Why:** the cache check currently selects `id` and treats any matching row as a hit. A row written when every AI section failed its gate is 100% fallback, and treating it as a hit pins that report to fallback **forever** with no regenerate path. Treating a row whose `section_sources` contains no `'ai'` as a MISS lets the next generation attempt re-run the model, and the report self-heals.

- [ ] **Step 1: Read `actions.ts:232-250` and the `section_sources` column**

Read the cache-check block and `supabase/migrations/20260811000100_reports.sql` to confirm `section_sources`' stored shape (it is written by `composeReport`; check what `save_report` persists — an object keyed by section id, or an array).

- [ ] **Step 2: Write the failing test**

Append to `tests/report/inputs-hash-parity.test.ts`? **No** — this is generation-cache behaviour, not hashing. Add it to the plan-3 composer test file that already covers `section_sources`. Find it with:

```bash
grep -rln "section_sources" tests/
```

Add a test asserting the miss predicate directly. Extract the predicate as a named exported helper so it is unit-testable rather than buried in the action:

```ts
// in lib/report/compose.ts, alongside the other composer exports
/**
 * I9: a persisted report whose every section fell back is not a usable cache hit —
 * treating it as one pins that report to 100% fallback forever, with no regenerate
 * path. Re-running generation lets it self-heal.
 */
export function isUsableCachedReport(sectionSources: unknown): boolean {
  if (Array.isArray(sectionSources)) return sectionSources.includes('ai')
  if (sectionSources && typeof sectionSources === 'object') {
    return Object.values(sectionSources).includes('ai')
  }
  return false
}
```

```ts
describe('isUsableCachedReport (I9)', () => {
  it('is a hit when at least one section came from the model', () => {
    expect(isUsableCachedReport({ s2: 'ai', s4: 'fallback' })).toBe(true)
    expect(isUsableCachedReport(['fallback', 'ai'])).toBe(true)
  })

  it('is a MISS when every section fell back', () => {
    expect(isUsableCachedReport({ s2: 'fallback', s4: 'fallback' })).toBe(false)
    expect(isUsableCachedReport(['fallback', 'fallback'])).toBe(false)
  })

  it('is a MISS for a malformed or absent value', () => {
    expect(isUsableCachedReport(null)).toBe(false)
    expect(isUsableCachedReport(undefined)).toBe(false)
    expect(isUsableCachedReport('ai')).toBe(false)
  })
})
```

⚠️ Write the object/array arms to match what `save_report` actually persists — but keep **both** arms plus the malformed arm regardless. `section_sources` is untyped jsonb read back from a row that outlives the code that wrote it.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run <that test file>`
Expected: FAIL — `isUsableCachedReport is not a function`.

- [ ] **Step 4: Implement**

Add `isUsableCachedReport` to `lib/report/compose.ts`, then change `actions.ts:236-244`:

```ts
const { data: cached } = await supabase
  .from('reports')
  .select('section_sources')
  .eq('run_id', run.id)
  .eq('inputs_hash', inputsHash)
  .maybeSingle()

if (cached && isUsableCachedReport(cached.section_sources)) {
  // existing cache-hit path, unchanged
}
```

⚠️ Preserve the existing filters and the existing hit-path body verbatim — only the `select` column and the hit predicate change. Read `:236-244` and keep every `.eq(...)` it already has.

- [ ] **Step 5: Run gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **+3 tests, 0 failures** · eslint 0.

- [ ] **Step 6: Commit** *(controller only)*

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/actions.ts" lib/report/compose.ts <test file>
git commit -m "fix(report): treat an all-fallback cached report as a cache miss"
```

---

## Task 4: The two additive library exports

**Files:**
- Modify: `lib/report/compose.ts` (add `assembleFallbackOnly`)
- Modify: `lib/report/view.ts` (add `resolveScoreability`; `resolveReportView` delegates — D-P4-6)
- Create: `tests/report/assemble-fallback-only.test.ts`

**Interfaces:**
- Produces, for Tasks 7 and 8:
  - `assembleFallbackOnly(args: FallbackSectionArgs): AssembledSection[]`
  - `resolveScoreability(derived: DeriveResult): ScoreabilityResolution`
  - `type ScoreabilityResolution = Extract<ReportViewResolution, { scoreable: false }> | { scoreable: true; diagnosis: Diagnosis }`

- [ ] **Step 1: Write the failing tests**

Create `tests/report/assemble-fallback-only.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assembleFallbackOnly } from '../../lib/report/compose'
import { resolveReportView, resolveScoreability } from '../../lib/report/view'

describe('assembleFallbackOnly', () => {
  it('returns every report.yaml section, in report.yaml order, all source fallback', () => {
    const sections = assembleFallbackOnly({
      facts: FIXTURE_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections: [],
    })
    expect(sections.map((s) => s.id)).toEqual(Object.keys(FIXTURE_METHODOLOGY.report.sections))
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure.
    expect(new Set(sections.map((s) => s.source))).toEqual(new Set(['fallback']))
    expect(sections.every((s) => s.ai === null)).toBe(true)
  })

  it('gives every section a title and a body from report.yaml', () => {
    const sections = assembleFallbackOnly({
      facts: FIXTURE_FACTS,
      methodology: FIXTURE_METHODOLOGY,
      reflections: [],
    })
    const untitled = sections.filter((s) => !s.fallback.title)
    expect(untitled.map((s) => s.id)).toEqual([])
  })
})

describe('resolveScoreability (D-P4-6)', () => {
  // The anti-drift boundary for the not-scoreable branch: the pages stop calling
  // resolveReportView after plan 4, so this helper is what produces the resolution they
  // render the stale-methodology notice from. It must agree with resolveReportView
  // exactly, or the two surfaces' notices silently diverge from the PDF route's.
  it('agrees with resolveReportView on every not-scoreable arm', () => {
    for (const derived of NOT_SCOREABLE_FIXTURES) {
      const viaView = resolveReportView(derived, FIXTURE_METHODOLOGY, () => FIXTURE_BLOCKS, {
        audience: 'screen',
      })
      const direct = resolveScoreability(derived)
      expect({ id: derived.reason, r: direct }).toEqual({ id: derived.reason, r: viaView })
    }
  })

  it('carries the diagnosis on the scoreable arm so callers can narrow', () => {
    const resolution = resolveScoreability(SCOREABLE_FIXTURE)
    expect(resolution.scoreable).toBe(true)
    if (resolution.scoreable) expect(resolution.diagnosis).toBe(SCOREABLE_FIXTURE.diagnosis)
  })

  it('never invokes the blocks thunk — no view is built', () => {
    let calls = 0
    resolveReportView(SCOREABLE_FIXTURE, FIXTURE_METHODOLOGY, () => { calls++; return FIXTURE_BLOCKS }, { audience: 'screen' })
    const before = calls
    resolveScoreability(SCOREABLE_FIXTURE)
    expect(calls).toBe(before)
  })
})
```

⚠️ Build `NOT_SCOREABLE_FIXTURES` to cover **every** `derived.reason` value, including `'incomplete_areas'` (the one arm that populates `blockedAreas`). Read `lib/report/derive.ts`'s `DeriveResult` for the full reason list, and reuse the fixtures `tests/report/stale-payload.test.ts` already builds rather than hand-rolling new ones.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/assemble-fallback-only.test.ts`
Expected: FAIL — `assembleFallbackOnly is not a function` / `resolveScoreability is not a function`.

- [ ] **Step 3: Add `assembleFallbackOnly` to `lib/report/compose.ts`**

```ts
/**
 * The share page needs the same AssembledSection[] shape as assembleReport without
 * touching the composer's AI path — no persisted row, no hash, no model output. Mapping
 * over the same Object.keys(methodology.report.sections) order keeps section order owned
 * by one place instead of two.
 */
export function assembleFallbackOnly(args: FallbackSectionArgs): AssembledSection[] {
  const fallbacks = fallbackSections(args)
  return Object.keys(args.methodology.report.sections).map((id) => ({
    id: id as SectionId,
    source: 'fallback' as const,
    ai: null,
    fallback: fallbacks[id as SectionId],
  }))
}
```

⚠️ Match `assembleReport`'s own iteration and lookup idiom (`lib/report/compose.ts:79-107`) exactly — if it indexes `fallbacks` differently, or `fallbackSections` returns an array rather than a record, mirror that. **Read `:79-107` and `fallback-sections.ts:325-328` before writing this.** The `as SectionId` casts are acceptable only if `assembleReport` already uses the same idiom; if it avoids them, avoid them here too.

- [ ] **Step 4: Add `resolveScoreability` to `lib/report/view.ts` and delegate**

Insert immediately above `resolveReportView` (`lib/report/view.ts:480`):

```ts
/**
 * The scoreability gate, without building a view (D-P4-6).
 *
 * resolveReportView's not-scoreable arm depends on `derived` alone — methodology, blocks
 * and opts are used only to build the view on the success arm. After plan 4 the two web
 * pages need the gate but not the legacy view, and calling resolveReportView purely to
 * read a boolean would build an entire unused ReportView on every request.
 *
 * The success arm carries `diagnosis` so callers narrow at the guard rather than needing
 * a second, dead `if (!derived.ok)` check.
 */
export type ScoreabilityResolution =
  | Extract<ReportViewResolution, { scoreable: false }>
  | { scoreable: true; diagnosis: Diagnosis }

export function resolveScoreability(derived: DeriveResult): ScoreabilityResolution {
  if (!derived.ok) {
    return {
      scoreable: false,
      reason: derived.reason,
      blockedAreas: derived.reason === 'incomplete_areas' ? derived.blockedAreas : [],
    };
  }
  return { scoreable: true, diagnosis: derived.diagnosis };
}
```

Then rewrite `resolveReportView`'s body to delegate — behaviour identical, zero duplication:

```ts
export function resolveReportView(
  derived: DeriveResult,
  methodology: Methodology,
  blocks: (d: Diagnosis) => ReportBlocks,
  opts: {
    audience: ReportAudience;
    reflections?: Array<{ item_id: string; reflection: string | null }>;
  },
): ReportViewResolution {
  const resolution = resolveScoreability(derived);
  if (!resolution.scoreable) return resolution;
  return {
    scoreable: true,
    view: buildReportView(resolution.diagnosis, blocks(resolution.diagnosis), methodology, opts),
  };
}
```

⚠️ `view.ts` uses semicolons — match the file's existing style, not this plan's.
⚠️ The lazy-thunk contract is **unchanged**: `blocks` is still only invoked on the scoreable arm, after the gate. `tests/report/route-call-ordering.test.ts` and `tests/report/stale-payload.test.ts` both prove this and must stay green.

- [ ] **Step 5: Run gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **0 failures** (existing `stale-payload` / `route-call-ordering` / `audience-parity` tests are the proof the delegation is behaviour-preserving) · eslint 0.

- [ ] **Step 6: Verification mutation** *(controller only, AFTER committing)*

Commit first, then prove the new tests are not vacuous:

```bash
# mutation: make resolveScoreability disagree with resolveReportView
# edit view.ts → change `blockedAreas: ... : []` to `blockedAreas: []` in resolveScoreability ONLY
npx vitest run tests/report/assemble-fallback-only.test.ts   # expect FAIL on the incomplete_areas arm
git checkout -- lib/report/view.ts
npx vitest run tests/report/assemble-fallback-only.test.ts   # expect PASS
```

⚠️ **Verify a fix by re-running its mutation, not by reading its diff.** If the mutation does not turn the test red, `NOT_SCOREABLE_FIXTURES` is missing the `'incomplete_areas'` arm — fix the fixture, not the assertion.

- [ ] **Step 7: Commit** *(controller only)*

```bash
git add lib/report/compose.ts lib/report/view.ts tests/report/assemble-fallback-only.test.ts
git commit -m "feat(report): add assembleFallbackOnly and resolveScoreability exports"
```

---

## Task 5: The section renderer — uniform view and dispatcher

**Files:**
- Create: `app/app/[churchId]/diagnosis/report/sections.tsx`
- Create: `tests/report/sections-dispatch.test.ts`

**Interfaces:**
- Consumes: `AssembledSection` (`lib/report/compose.ts:72-77`), `SectionBody` (`lib/report/fallback-sections.ts:23-27`).
- Produces, for Tasks 6, 7 and 8:
  - `SectionBodyView({ body, bullets }: { body: string; bullets: string[] })`
  - `ReportSections({ sections }: { sections: AssembledSection[] })`

**Landmines — all three are real and have bitten this branch before:**

1. **Exactly one literal `<h1` in this file.** `tests/a11y/shared-report-heading.test.ts` counts `<h1` occurrences in the *source text*. A dynamic tag (`const H = i === 0 ? 'h1' : 'h2'; <H>`) produces **zero** literal `<h1` and fails the count. Write two literal branches.
2. **No `role="status"`, `role="alert"` or `aria-live` anywhere in this file behind a `&&` or `?`.** `tests/a11y/live-regions-applied.test.ts:144-145` is a tripwire for conditionally-mounted live regions. This file needs none — do not add any.
3. **This file is linted.** `app/**` is not in `globalIgnores`.

- [ ] **Step 1: Read the existing test harness and the types**

```
tests/report/components.test.ts        # use ITS rendering harness verbatim
lib/report/compose.ts:72-107           # AssembledSection, assembleReport's ordering
lib/report/fallback-sections.ts:23-27  # SectionBody
lib/report/fallback-sections.ts:302-328 # fallbackSection — title comes from report.yaml
```

If `components.test.ts` renders with `renderToStaticMarkup` from `react-dom/server`, use exactly that. If it uses a different harness, use that instead — do not introduce a new one, and **do not add a dependency**.

- [ ] **Step 2: Write the failing test**

Create `tests/report/sections-dispatch.test.ts`:

```ts
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportSections, SectionBodyView } from '../../app/app/[churchId]/diagnosis/report/sections'
import type { AssembledSection } from '../../lib/report/compose'

const fallbackSection = (id: string, title: string): AssembledSection => ({
  id: id as AssembledSection['id'],
  source: 'fallback',
  ai: null,
  fallback: { title, body: `body of ${id}`, bullets: [`bullet a ${id}`, `bullet b ${id}`] },
})

describe('SectionBodyView', () => {
  it('renders the body and every bullet', () => {
    const html = renderToStaticMarkup(
      <SectionBodyView body="the body" bullets={['one', 'two']} />,
    )
    expect(html).toContain('the body')
    expect(html).toContain('one')
    expect(html).toContain('two')
  })

  it('renders no list at all when there are no bullets', () => {
    const html = renderToStaticMarkup(<SectionBodyView body="the body" bullets={[]} />)
    expect(html).toContain('the body')
    expect(html).not.toContain('<ul')
  })
})

describe('ReportSections', () => {
  const sections = [
    fallbackSection('s1', 'Overview'),
    fallbackSection('s2', 'Executive summary'),
    fallbackSection('s3', 'How to read this'),
  ]

  it('renders every section, in array order, and never re-sorts', () => {
    const html = renderToStaticMarkup(<ReportSections sections={sections} />)
    const order = ['Overview', 'Executive summary', 'How to read this'].map((t) => html.indexOf(t))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure.
    const missing = sections.filter((s) => !html.includes(s.fallback.title))
    expect(missing.map((s) => s.id)).toEqual([])
  })

  it('takes every heading from fallback.title', () => {
    const html = renderToStaticMarkup(<ReportSections sections={sections} />)
    expect(html).toContain('>Overview<')
    expect(html).toContain('>Executive summary<')
  })

  it('renders exactly one <h1>, on the first section only', () => {
    const html = renderToStaticMarkup(<ReportSections sections={sections} />)
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBe(2)
  })

  it('renders a fallback section through SectionBodyView', () => {
    const html = renderToStaticMarkup(<ReportSections sections={[fallbackSection('s1', 'Overview')]} />)
    expect(html).toContain('body of s1')
    expect(html).toContain('bullet a s1')
  })

  it('renders an empty section list without throwing', () => {
    expect(renderToStaticMarkup(<ReportSections sections={[]} />)).toBe('')
  })
})
```

⚠️ The test file contains JSX — name it `.tsx` if the repo's vitest config requires it. Check what `tests/report/components.test.ts` is named and follow suit; adjust the import path in later tasks to match.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/report/sections-dispatch.test*`
Expected: FAIL — cannot resolve `sections`.

- [ ] **Step 4: Write the component**

Create `app/app/[churchId]/diagnosis/report/sections.tsx`:

```tsx
import type { AssembledSection } from '@/lib/report/compose'
import type { SectionBody } from '@/lib/report/fallback-sections'

/**
 * The uniform renderer: the { body, bullets } half of a SectionBody. Used for all 13
 * sections on the public share page, and for every source:'fallback' section on the
 * diagnosis page. The title is rendered by ReportSections, never here — one title
 * source for both branches.
 */
export function SectionBodyView({ body, bullets }: { body: string; bullets: string[] }) {
  return (
    <>
      <p className="font-body text-ink-soft">{body}</p>
      {bullets.length > 0 && (
        <ul className="font-body text-ink-soft">
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Renders the 13 report sections and nothing else. Page chrome — the church-identity
 * block, the not-scoreable notice, the admin controls, the booking CTA, the shared-view
 * footer — stays on the pages.
 *
 * Iterates `sections` in array order and NEVER re-sorts: assembleReport and
 * assembleFallbackOnly both return them in Object.keys(methodology.report.sections)
 * order, which is report.yaml order.
 *
 * The heading always comes from section.fallback.title, which fallbackSection copies
 * verbatim from report.yaml. AI renderers emit body content only and never their own
 * heading.
 *
 * ⚠️ The first section renders <h1> and the rest render <h2>, written as two literal
 * branches. tests/a11y/shared-report-heading.test.ts counts `<h1` in this file's SOURCE
 * TEXT — a dynamic tag would produce zero literal matches and read as "no h1 anywhere"
 * on a public page whose document outline depends on it.
 */
export function ReportSections({ sections }: { sections: AssembledSection[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <section key={section.id} className="flex flex-col gap-8 max-w-2xl">
          {index === 0 ? (
            <h1 className="font-display text-ink">{section.fallback.title}</h1>
          ) : (
            <h2 className="font-display text-ink">{section.fallback.title}</h2>
          )}
          <SectionBodyView body={section.fallback.body} bullets={section.fallback.bullets} />
        </section>
      ))}
    </>
  )
}
```

**The AI dispatch is deliberately absent here** — Task 6 adds it. This task ships the uniform path, which is the whole of the share page's needs and the fallback half of the diagnosis page's.

⚠️ Use the repo's existing import alias. If `@/` is not configured, use the relative path the sibling files in `app/app/[churchId]/diagnosis/report/` already use — read `shared.tsx`'s imports.

⚠️ `SectionBody` must be exported from `lib/report/fallback-sections.ts`. `AssembledSection` already references it, so it is. Confirm rather than assume.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/report/sections-dispatch.test*`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **+7 tests, 0 failures** · eslint 0.

- [ ] **Step 7: Commit** *(controller only)*

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/report/sections.tsx" tests/report/sections-dispatch.test*
git commit -m "feat(report): add the shared report section renderer and dispatcher"
```

---

## Task 6: The seven AI renderers

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report/sections.tsx`
- Modify: `tests/report/sections-dispatch.test.ts`

**Interfaces:**
- Consumes: `SECTION_REGISTRY`, `AiSectionId` (`lib/ai/sections.ts:59-98`); `SectionBodyView` (Task 5).
- Produces: no new export. `ReportSections` gains AI dispatch.

**Why per-section renderers:** there is no uniform AI shape. Plan 3's S6 narrowing made AI and fallback agree on beat *vocabulary only, not field-for-field*. Each renderer takes `ai: unknown` and runs its own `SECTION_REGISTRY[id].schema.safeParse`, returning `<SectionBodyView>` with the section's fallback on failure. That is the only path from `AssembledSection['ai']` (typed `unknown | null`) to a typed value without a cast, it keeps each renderer independently testable, and it makes "never throws" a structural property rather than a convention. The double validation — once in `assembleReport`, once here — is free.

⚠️ `lib/ai/**` is lint-exempt; `app/**` is **not**. These renderers live in `app/**`.

- [ ] **Step 1: Read the exact AI shapes**

Read `lib/ai/sections.ts:21-98`. The seven shapes, verbatim:

| id | title (report.yaml) | AI shape | rendering |
|---|---|---|---|
| s2 | Executive summary | `summary`, `what_this_is_not`, `context_bullets[]` | two paragraphs, then the bullets |
| s4 | What the assessment revealed | `thesis_word`, `narrative` | thesis word as a lead-in, then the narrative |
| s5 | Organizational strengths | `strengths[]{category_id, heading, body}` | one sub-block per strength |
| s6 | Areas requiring investment | `areas[]{category_id, affirm, evidence, reframe}` | one sub-block per area, three beats in order |
| s7 | Lowest scoring indicators | `narrative`, `pattern_claim \| null` | narrative, then the pattern claim when non-null |
| s9 | Strategic diagnosis | `narrative`, `working_model` | narrative, then the working model |
| s12 | Final executive assessment | `assessment`, `overall_percent`, `tier_name`, `primary_objective` | assessment prose, then the three named facts |

- [ ] **Step 2: Write the failing tests**

Append to `tests/report/sections-dispatch.test.ts`:

```ts
const aiSection = (id: string, title: string, ai: unknown): AssembledSection => ({
  id: id as AssembledSection['id'],
  source: 'ai',
  ai,
  fallback: { title, body: `FALLBACK BODY ${id}`, bullets: [`FALLBACK BULLET ${id}`] },
})

const VALID_AI: Record<string, unknown> = {
  s2: { summary: 'AI summary text', what_this_is_not: 'AI not-this text', context_bullets: ['ctx one', 'ctx two'] },
  s4: { thesis_word: 'Alignment', narrative: 'AI s4 narrative' },
  s5: { strengths: [{ category_id: 'c1', heading: 'Strength head', body: 'Strength body' }] },
  s6: { areas: [{ category_id: 'c2', affirm: 'affirm text', evidence: 'evidence text', reframe: 'reframe text' }] },
  s7: { narrative: 'AI s7 narrative', pattern_claim: 'the pattern claim' },
  s9: { narrative: 'AI s9 narrative', working_model: 'the working model' },
  s12: { assessment: 'AI s12 assessment', overall_percent: 62, tier_name: 'Developing', primary_objective: 'the objective' },
}

describe('AI renderers', () => {
  it('renders every AI shape through its own renderer, not the fallback', () => {
    // Collect and compare the whole set — an assertion inside a loop reports only the
    // FIRST failure, which would hide six broken renderers behind one.
    const leaked = Object.entries(VALID_AI).filter(([id, ai]) => {
      const html = renderToStaticMarkup(<ReportSections sections={[aiSection(id, `Title ${id}`, ai)]} />)
      return html.includes(`FALLBACK BODY ${id}`)
    })
    expect(leaked.map(([id]) => id)).toEqual([])
  })

  it('renders the distinctive content of each AI shape', () => {
    const expected: Record<string, string[]> = {
      s2: ['AI summary text', 'AI not-this text', 'ctx one', 'ctx two'],
      s4: ['Alignment', 'AI s4 narrative'],
      s5: ['Strength head', 'Strength body'],
      s6: ['affirm text', 'evidence text', 'reframe text'],
      s7: ['AI s7 narrative', 'the pattern claim'],
      s9: ['AI s9 narrative', 'the working model'],
      s12: ['AI s12 assessment', '62', 'Developing', 'the objective'],
    }
    const missing: string[] = []
    for (const [id, needles] of Object.entries(expected)) {
      const html = renderToStaticMarkup(<ReportSections sections={[aiSection(id, `Title ${id}`, VALID_AI[id])]} />)
      for (const needle of needles) if (!html.includes(needle)) missing.push(`${id}:${needle}`)
    }
    expect(missing).toEqual([])
  })

  it('renders the three s6 beats in order: affirm, evidence, reframe', () => {
    const html = renderToStaticMarkup(<ReportSections sections={[aiSection('s6', 'Areas', VALID_AI.s6)]} />)
    const positions = ['affirm text', 'evidence text', 'reframe text'].map((t) => html.indexOf(t))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('omits the s7 pattern claim when it is null', () => {
    const html = renderToStaticMarkup(
      <ReportSections sections={[aiSection('s7', 'Lowest', { narrative: 'only narrative', pattern_claim: null })]} />,
    )
    expect(html).toContain('only narrative')
    expect(html).not.toContain('FALLBACK BODY s7')
  })

  it('falls back to SectionBodyView when an AI payload fails its schema, and never throws', () => {
    const broken = Object.keys(VALID_AI).filter((id) => {
      const html = renderToStaticMarkup(<ReportSections sections={[aiSection(id, `Title ${id}`, { nonsense: true })]} />)
      return !html.includes(`FALLBACK BODY ${id}`)
    })
    expect(broken).toEqual([])
  })

  it('falls back when ai is null on a source:ai section', () => {
    const html = renderToStaticMarkup(<ReportSections sections={[aiSection('s2', 'Executive summary', null)]} />)
    expect(html).toContain('FALLBACK BODY s2')
  })

  it('still takes the heading from fallback.title on an AI section', () => {
    const html = renderToStaticMarkup(<ReportSections sections={[aiSection('s2', 'Executive summary', VALID_AI.s2)]} />)
    expect(html).toContain('Executive summary')
  })

  it('uses SectionBodyView for a non-AI section id even when source is ai', () => {
    // s1/s3/s8/s10/s11/appendix have no AI renderer — they must not throw.
    const html = renderToStaticMarkup(<ReportSections sections={[aiSection('s8', 'What leaders are saying', VALID_AI.s2)]} />)
    expect(html).toContain('FALLBACK BODY s8')
  })
})
```

⚠️ The `VALID_AI` fixtures must satisfy the **real** zod schemas. Read `lib/ai/sections.ts:21-47` and adjust field values (min lengths, enums, `overall_percent` bounds) until each `safeParse` succeeds. If a fixture fails its schema, the first test passes vacuously in the wrong direction.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/report/sections-dispatch.test*`
Expected: FAIL — the AI sections render `FALLBACK BODY` because no dispatch exists yet.

- [ ] **Step 4: Implement the seven renderers and the dispatch**

Add to `app/app/[churchId]/diagnosis/report/sections.tsx`:

```tsx
import { SECTION_REGISTRY } from '@/lib/ai/sections'
import type { AiSectionId } from '@/lib/ai/sections'

type AiRendererProps = { ai: unknown; fallback: SectionBody }

/** Every AI renderer's failure path: the section's own deterministic fallback. */
function AiFallback({ fallback }: { fallback: SectionBody }) {
  return <SectionBodyView body={fallback.body} bullets={fallback.bullets} />
}

function S2View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s2.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { summary, what_this_is_not, context_bullets } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{summary}</p>
      <p className="font-body text-ink-soft">{what_this_is_not}</p>
      {context_bullets.length > 0 && (
        <ul className="font-body text-ink-soft">
          {context_bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function S4View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s4.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { thesis_word, narrative } = parsed.data
  return (
    <>
      <p className="font-display text-ink">{thesis_word}</p>
      <p className="font-body text-ink-soft">{narrative}</p>
    </>
  )
}

function S5View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s5.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.strengths.map((strength) => (
        <div key={strength.category_id}>
          <p className="font-display text-ink">{strength.heading}</p>
          <p className="font-body text-ink-soft">{strength.body}</p>
        </div>
      ))}
    </div>
  )
}

function S6View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s6.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  return (
    <div className="flex flex-col gap-8">
      {parsed.data.areas.map((area) => (
        <div key={area.category_id}>
          <p className="font-body text-ink-soft">{area.affirm}</p>
          <p className="font-body text-ink-soft">{area.evidence}</p>
          <p className="font-body text-ink-soft">{area.reframe}</p>
        </div>
      ))}
    </div>
  )
}

function S7View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s7.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { narrative, pattern_claim } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{narrative}</p>
      {pattern_claim !== null && <p className="font-body text-ink-soft">{pattern_claim}</p>}
    </>
  )
}

function S9View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s9.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { narrative, working_model } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{narrative}</p>
      <p className="font-body text-ink-soft">{working_model}</p>
    </>
  )
}

function S12View({ ai, fallback }: AiRendererProps) {
  const parsed = SECTION_REGISTRY.s12.schema.safeParse(ai)
  if (!parsed.success) return <AiFallback fallback={fallback} />
  const { assessment, overall_percent, tier_name, primary_objective } = parsed.data
  return (
    <>
      <p className="font-body text-ink-soft">{assessment}</p>
      <ul className="font-body text-ink-soft">
        <li>{`Overall: ${overall_percent}%`}</li>
        <li>{`Tier: ${tier_name}`}</li>
        <li>{`Primary objective: ${primary_objective}`}</li>
      </ul>
    </>
  )
}

/**
 * Typed as a full Record<AiSectionId, ...> so tsc — not a human — proves every AI section
 * in lib/ai/sections.ts has a renderer here. Adding an eighth AI section there without a
 * renderer here becomes a compile error rather than a section that silently renders its
 * fallback in production.
 */
const AI_RENDERERS: Record<AiSectionId, (props: AiRendererProps) => React.ReactElement> = {
  s2: S2View,
  s4: S4View,
  s5: S5View,
  s6: S6View,
  s7: S7View,
  s9: S9View,
  s12: S12View,
}

/** Keyed by plain string so the dispatcher needs no cast on AssembledSection['id']. */
const AI_RENDERER_BY_ID: ReadonlyMap<string, (props: AiRendererProps) => React.ReactElement> =
  new Map(Object.entries(AI_RENDERERS))
```

Then change `ReportSections`' body content line to dispatch:

```tsx
{(() => {
  const Renderer = section.source === 'ai' ? AI_RENDERER_BY_ID.get(section.id) : undefined
  return Renderer ? (
    <Renderer ai={section.ai} fallback={section.fallback} />
  ) : (
    <SectionBodyView body={section.fallback.body} bullets={section.fallback.bullets} />
  )
})()}
```

If eslint objects to the IIFE, hoist it into a small `SectionContent({ section }: { section: AssembledSection })` component in the same file and render `<SectionContent section={section} />`. Either is fine; do **not** reach for a cast.

⚠️ Import `React` (or `ReactElement` from `'react'`) however the sibling components in this directory already do — read `cover.tsx`'s imports and match.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/report/sections-dispatch.test*`
Expected: PASS, 15 tests.

- [ ] **Step 6: Run gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **+8 tests, 0 failures** · eslint 0.

- [ ] **Step 7: Verification mutation** *(controller only, AFTER committing)*

```bash
# mutation: mis-map one renderer — point s4 at S9View in AI_RENDERERS
npx vitest run tests/report/sections-dispatch.test*   # expect FAIL on the s4 content assertions
git checkout -- "app/app/[churchId]/diagnosis/report/sections.tsx"
npx vitest run tests/report/sections-dispatch.test*   # expect PASS
```

⚠️ Re-run the mutation to verify the revert. Do not judge it by reading the diff.

- [ ] **Step 8: Commit** *(controller only)*

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/report/sections.tsx" tests/report/sections-dispatch.test*
git commit -m "feat(report): render the seven AI section shapes"
```

---

## Task 7: Swap the public share page — and re-point the six tests it breaks

**Files:**
- Modify: `app/r/[shareToken]/page.tsx`
- Modify: `tests/outreach/shared-exclusion.test.ts`
- Modify: `tests/report/booking-cta-shared.test.ts`
- Modify: `tests/a11y/shared-report-heading.test.ts`
- Modify: `tests/report/route-reflections-wiring.test.ts` (the shared `it()` only)
- Modify: `tests/report/route-methodology-wiring.test.ts` (drop the share row from `ROUTES`, add a share `it()`)
- Modify: `tests/report/route-call-ordering.test.ts` (drop the share row from `ROUTES`, add a share ordering `it()`)

**Interfaces:**
- Consumes: `assembleFallbackOnly`, `resolveScoreability` (Task 4); `ReportSections` (Tasks 5–6); `churchFactsFrom` (Task 1); `buildFacts` (`lib/report/facts.ts`).
- Produces: nothing for later tasks.

**All six tests break the moment this page changes** — that is why they are in this task and not a trailing one. Every task must end with green gates.

**Current page anchors** (`app/r/[shareToken]/page.tsx`, 216 lines): UUID guard `:30` · `SharedRunResponseRow` `:42-50` (**no `reflection` field, deliberately**) · `get_shared_report` `:63` · `if (!row || !row.valid) notFound()` `:75` · `methodology`/`brand` `:77-78` · `get_shared_run_responses` `:83` · `responses` `:85-91` · `derived` `:92-97` · `reportMethodology` `:107` · `resolveReportView` `:113-118` · **not-scoreable early return `:120-145`** · `const view = resolution.view` `:147` · fresh-branch JSX `:149-215` → monogram `:151-162`, CoverCard/VerdictHeader/AreaTable `:167-169`, chain/system `:172-180`, `view.areas.map(AreaDossier)` `:184-186`, `{view.nextStep && <NextStep …>}` `:194-200`, **`<BookingCta />` `:202`**, `<Appendix … />` `:204-209`, footer `<p>` `:211-213`.

- [ ] **Step 1: Read the page and the six tests**

Read `app/r/[shareToken]/page.tsx` in full, plus all six test files listed above.

- [ ] **Step 2: Swap the page**

Replace `:113-118` (`resolveReportView`) with:

```ts
const resolution = resolveScoreability(derived)
```

Keep the not-scoreable early return at `:120-145` **exactly as it is** — its own `<main>`, monogram, `<SharedStaleMethodologyNotice />`, footer `<p>`. ⚠️ The guard must stay spelled **`!resolution.scoreable`**; `tests/a11y/live-regions-applied.test.ts:136-137` matches identifiers ending in `message`, and renaming this guard is how that tripwire gets tripped.

Replace `:147` (`const view = resolution.view`) with the facts and sections build:

```ts
// The public surface carries NO profile columns: the anon client cannot read them and
// get_shared_report returns only valid/payload/church_name/brand_color. facts.profile is
// therefore {} — profile fields are ABSENT, not empty (locked decision 6), which the
// fallback templates already handle. Spec §9.2.
const facts = buildFacts({
  diagnosis: resolution.diagnosis,
  methodology: reportMethodology,
  responses,
  church: churchFactsFrom(null, row.church_name),
  // Spec §9.1: no completion timestamp is reachable here without a migration, so S1 reads
  // "assessed not yet completed" on the public surface. Fixing it is a plan-5 follow-up.
  completedAt: null,
  // D-P4-4: the literal redacted variant, never knownLabels(responses).
  // get_shared_run_responses redacts respondent_label to the empty string, and
  // containsRespondentLabel skips empty needles — so knownLabels() here would build a
  // guard over [] that guards NOTHING. The observable difference today is ZERO
  // (ChurchFacts is name-only, so facts.profile === {} either way). This is fail-closed
  // permanence: the moment plan 5 gives this page a real profile, { kind: 'known',
  // labels: [] } would silently unguard every free-text field.
  labelSource: { kind: 'redacted' },
})

// Structural exclusion, visible at the call site: the public report never receives
// reflections. FallbackSectionArgs REQUIRES the field, so an empty literal is the
// exclusion — there is no conditional to get wrong, because the data never enters.
const sections = assembleFallbackOnly({
  facts,
  methodology: reportMethodology,
  reflections: [],
})
```

Replace the fresh-branch report JSX (`:167-209`) — CoverCard, VerdictHeader, AreaTable, chain, system, the `view.areas.map(AreaDossier)` block, the `{view.nextStep && …}` block and `<Appendix … />` — with:

```tsx
<ReportSections sections={sections} />
<BookingCta />
```

**Keep unchanged:** the monogram/church-identity block `:151-162`, the surrounding `<main>`, and the "Shared read-only view…" footer `<p>` `:211-213`.

Remove the now-unused imports (`resolveReportView`, `CoverCard`, `VerdictHeader`, `AreaTable`, the chain/system/dossier/NextStep/Appendix components, `toReportBlocks`, `fallbackProse`). ⚠️ eslint will fail on unused imports — that is the gate doing its job. Do **not** delete the component files; they are UNSHIPPED after this plan and plan 5 removes them.

- [ ] **Step 3: Re-point `tests/outreach/shared-exclusion.test.ts`**

Two assertions break on the spec-mandated `reflections: []` literal, and one dies with `resolveReportView`. Replace the whole-file substring-absence checks with **occurrence-count equality** — a substring-absence check breaks on a change that is *more* explicit, which is exactly what happened here.

```ts
describe('the shared report surface never carries reflections', () => {
  it('layer 1 — SQL returns no reflection, but does return the run version', () => {
    expect(sharedSql).not.toContain('reflection');
    expect(sharedSql).toContain('methodology_version');
  });

  it('layer 2 — the shared row type has no reflection field', () => {
    // The page's ONLY legitimate mention of `reflection` is the mandated empty literal
    // passed to assembleFallbackOnly — the structural exclusion itself. Remove exactly
    // that, then require the rest of the file to be clean. Counting rather than
    // substring-absence is deliberate: a bare not.toContain('reflection') breaks on the
    // MORE explicit code, which would push the next author toward an implicit omission.
    const EXCLUSION_LITERAL = /reflections:\s*\[\s*\]/g;
    const occurrences = sharedPage.match(EXCLUSION_LITERAL) ?? [];
    expect(
      occurrences.length,
      'the shared page must pass exactly one explicit `reflections: []` literal',
    ).toBe(1);
    expect(sharedPage.replace(EXCLUSION_LITERAL, '')).not.toContain('reflection');
  });

  it('layer 3 — the shared page builds its sections from the fallback-only assembler', () => {
    // Replaces the old `audience: 'shared'` anchor, which died with resolveReportView.
    // assembleFallbackOnly is the new structural guarantee: it has no AI path and no
    // persisted-row parameter at all, so the public surface cannot render model output
    // or read the reports table even by mistake.
    expect(sharedPage).toContain('assembleFallbackOnly(');
    expect(sharedPage).not.toContain('assembleReport(');
    expect(sharedPage).not.toContain(".from('reports')");
  });

  it('the shared page does read the run version for derive', () => {
    expect(sharedPage).toContain('methodology_version');
  });
});
```

- [ ] **Step 4: Re-point `tests/report/booking-cta-shared.test.ts`**

The original asserted `indexOf('<BookingCta') < indexOf('<Appendix')`. **The Appendix is now section 13 *inside* `<ReportSections>`**, so it is no longer a page-level anchor and `indexOf` returns `-1` — `202 < -1` is false. The ordering is therefore **deliberately inverted**: the CTA is page chrome that follows the entire report, where before it sat between two report blocks. The invariant the original guarded — *the booking CTA appears on the public surface, after the report content* — is preserved exactly; only the anchor for "the report content" changed from one block to all thirteen sections.

```ts
describe('shared report booking CTA', () => {
  it('imports the BookingCta component from the report surface', () => {
    expect(page, 'the shared page must import BookingCta').toContain('BookingCta');
  });

  it('renders <BookingCta /> after the report sections', () => {
    // BOTH anchors are guarded. An ordering assertion with one unguarded anchor is
    // fail-open: a missing needle yields indexOf === -1, which quietly satisfies any
    // `greaterThan` comparison against a real index.
    expect(page, 'the CTA must be rendered').toContain('<BookingCta');
    expect(page, 'the shared page must render <ReportSections>').toContain('<ReportSections');
    expect(
      page.indexOf('<BookingCta'),
      'the booking CTA is page chrome and must follow the whole report, not sit inside it',
    ).toBeGreaterThan(page.indexOf('<ReportSections'));
  });
});
```

- [ ] **Step 5: Re-point `tests/a11y/shared-report-heading.test.ts`**

The page's single `<h1>` used to come from `<CoverCard>`. It now comes from the first section rendered by `<ReportSections>`. Same invariant, new supplier — and the same two-file sum, because the `<h1>` still lives in a different file from the page.

```ts
const SHARE_PAGE = path.join(REPO_ROOT, 'app', 'r', '[shareToken]', 'page.tsx')
const SECTIONS = path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'report', 'sections.tsx')

describe('shared report page heading invariant', () => {
  it('renders <ReportSections>, and carries exactly one <h1> once ReportSections is counted', () => {
    const pageSource = stripComments(fs.readFileSync(SHARE_PAGE, 'utf8'))
    const sectionsSource = stripComments(fs.readFileSync(SECTIONS, 'utf8'))

    expect(
      pageSource,
      'app/r/[shareToken]/page.tsx must render <ReportSections> — it supplies this page’s ' +
        'one true <h1> (the first report section’s title). Without it, the sum-based ' +
        'assertion below would pass vacuously off sections.tsx’s own <h1>.',
    ).toMatch(/<ReportSections[\s>]/)

    const pageH1s = h1Count(pageSource)
    const sectionH1s = h1Count(sectionsSource)
    expect(
      pageH1s + sectionH1s,
      `app/r/[shareToken]/page.tsx must carry exactly one <h1> — it is a public, ` +
        `unauthenticated page, so its document outline needs a top-level heading of its ` +
        `own. Found ${pageH1s} <h1> in page.tsx directly and ${sectionH1s} in the ` +
        `ReportSections it renders (expected 0 + 1).`,
    ).toBe(1)
  })
})
```

⚠️ Update the file's header comment too — it currently explains the `<CoverCard>` history. Replace the Task-16 paragraph with the plan-4 one; leave the *why it exists* paragraph intact.

- [ ] **Step 6: Re-point the shared `it()` in `tests/report/route-reflections-wiring.test.ts`**

The `optsTail(source, 'shared')` helper anchors on the `resolveReportView` opts literal, which is gone. Keep the screen and PDF `it()`s untouched — Task 8 handles the screen one.

```ts
  it('shared route (r/[shareToken]/page.tsx) never passes a populated reflections array', () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))

    // The exclusion is now STRUCTURAL, not an omitted optional: FallbackSectionArgs
    // requires `reflections`, so the empty literal is visible at the call site. Assert
    // the literal is there AND that it is the file's only reflections expression — a
    // "helpful" symmetry edit that populated it would otherwise slip past.
    const EXCLUSION_LITERAL = /reflections:\s*\[\s*\]/g
    expect(
      (source.match(EXCLUSION_LITERAL) ?? []).length,
      'the shared surface must pass exactly one explicit `reflections: []`',
    ).toBe(1)
    expect(
      /\breflections\b/.test(source.replace(EXCLUSION_LITERAL, '')),
      'the shared surface must NEVER receive reflections — private free-text is excluded ' +
        'from the public share page at four independent layers, and this call site is one ' +
        'of them.',
    ).toBe(false)
  })
```

- [ ] **Step 7: Re-point the share row in `tests/report/route-methodology-wiring.test.ts`**

Drop the share entry from `ROUTES` (leaving the diagnosis page and the PDF route, both still calling `resolveReportView` at this point) and add a dedicated `it()`:

```ts
  it("app/r/[shareToken]/page.tsx: every methodology argument is reportMethodology", () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))

    // The consumers changed (buildFacts / assembleFallbackOnly replace resolveReportView),
    // but the invariant did not: a legacy run must be RENDERED against the edition it was
    // scored under, never the current one.
    const passed = [...source.matchAll(/methodology:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!)
    expect(
      passed.length,
      'expected at least two methodology: <arg> call sites (buildFacts and assembleFallbackOnly)',
    ).toBeGreaterThanOrEqual(2)
    expect(new Set(passed)).toEqual(new Set(['reportMethodology']))

    // Shorthand `{ methodology }` would pass the RAW methodology while matching no
    // `methodology:` key at all — the fail-open hole the regex above cannot see.
    expect(
      /[{,]\s*methodology\s*[,}]/.test(source),
      'the shared page must never pass the raw `methodology` via object shorthand',
    ).toBe(false)

    expect(
      source,
      'the reportMethodology assignment itself must survive',
    ).toContain('derived.effectiveMethodology')
  })
```

- [ ] **Step 8: Re-point the share row in `tests/report/route-call-ordering.test.ts`**

Drop the share entry from `ROUTES` (leaving the diagnosis page and the PDF route) and add the plan-4 equivalent ordering guard:

```ts
  it('app/r/[shareToken]/page.tsx resolves scoreability before assembling any section (CT-1, plan 4)', () => {
    const source = strip(read('app', 'r', '[shareToken]', 'page.tsx'))

    // Plan 4's shape of the CT-1 invariant. resolveReportView's lazy thunk is gone from
    // this page, but the harm it prevented is not: buildFacts and assembleFallbackOnly
    // both read derived.diagnosis, which does not exist on a not-scoreable run. The gate
    // must come first.
    // BOTH anchors are guarded — an ordering assertion whose needle is missing yields
    // indexOf === -1 and passes vacuously.
    expect(source, 'the shared page must call resolveScoreability(').toContain('resolveScoreability(')
    expect(source, 'the shared page must call assembleFallbackOnly(').toContain('assembleFallbackOnly(')
    expect(source.indexOf('resolveScoreability(')).toBeLessThan(source.indexOf('assembleFallbackOnly('))
    expect(
      source,
      'the shared page must keep the not-scoreable guard spelled `!resolution.scoreable`',
    ).toContain('!resolution.scoreable')
  })
```

⚠️ Also update the file's `ROUTES` doc comment so it no longer claims to cover all three report routes.

- [ ] **Step 9: Run gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **0 failures** · eslint 0. Test count moves by the net of the re-points (the `shared-exclusion` and `route-*` files gain an `it()` each and lose loop iterations) — **report the real numbers**.

- [ ] **Step 10: Verification mutation** *(controller only, AFTER committing)*

```bash
# mutation: delete the share page's exclusion — change `reflections: []` to `reflections: reflectionRowsFor(responses)`
# (it will not typecheck; use `reflections: [{ item_id: 'x', respondent_key: 'y', text: 'z' }]`)
npx vitest run tests/outreach/shared-exclusion.test.ts tests/report/route-reflections-wiring.test.ts
# expect FAIL in BOTH files
GIT_LITERAL_PATHSPECS=1 git checkout -- "app/r/[shareToken]/page.tsx"
npx vitest run tests/outreach/shared-exclusion.test.ts tests/report/route-reflections-wiring.test.ts   # expect PASS
```

- [ ] **Step 11: Commit** *(controller only)*

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/r/[shareToken]/page.tsx" tests/outreach/shared-exclusion.test.ts \
  tests/report/booking-cta-shared.test.ts tests/a11y/shared-report-heading.test.ts \
  tests/report/route-reflections-wiring.test.ts tests/report/route-methodology-wiring.test.ts \
  tests/report/route-call-ordering.test.ts
git commit -m "feat(report): render the 13-section report on the public share page"
```

---

## Task 8: Swap the diagnosis page — and re-point the three tests it breaks

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx`
- Modify: `tests/report/route-call-ordering.test.ts` (`ROUTES` 2 → 1, add a diagnosis `it()`)
- Modify: `tests/report/route-methodology-wiring.test.ts` (`ROUTES` 2 → 1, add a diagnosis `it()`)
- Modify: `tests/report/route-reflections-wiring.test.ts` (the screen `it()`)

**Interfaces:**
- Consumes: `reflectionRowsFor`, `churchFactsFrom`, `reportInputs` (Task 1); `resolveScoreability` (Task 4); `assembleReport` (`lib/report/compose.ts:79`); `ReportSections` (Tasks 5–6); `loadChurchProfile` (`lib/data/churches.ts:101`).
- Produces: nothing for later tasks.

**Current page anchors** (`app/app/[churchId]/diagnosis/page.tsx`, 205 lines): `loadChurchForMember` `:38` · admin guard `if (!isAdmin) redirect(...)` `:43-44` · run select `'id, status, methodology_version'` `:46-52` · `diagnoses` read `:58-68` · `if (!diagRow) return <EmptyState .../>` `:70` · `get_report_share` `:72-77` · `methodology`/`brand` `:79-80` · `get_completed_run_responses` `:88-90` · `responses` map `:91-97` · **keyless `reflections` `:102-105`** · `derived` `:106-111` · `reportMethodology` `:123` · `PROSE_MODE` `:128` · `resolveReportView` `:129-137` · `notScoreableMessage` `:143-153` · JSX `:155-204`, with `layer1Actions` (Download PDF `<a>` + `{isAdmin && <ShareControl>}`) nested at `:183-200`.

🔑 **The keyless array at `:102-105` maps ALL raw rows unfiltered** — `{ item_id, reflection: r.reflection }`, nulls included. That is exactly `assembleReport`'s `reflections` parameter type (`ReadonlyArray<{item_id: string; reflection: string | null}>`), so it passes straight through with no adapter. The keyed sibling built by `reflectionRowsFor` is the one that filters nulls and carries identity.

- [ ] **Step 1: Read the page and `tests/a11y/live-regions-applied.test.ts:120-160`**

Read `app/app/[churchId]/diagnosis/page.tsx` in full. Then read `tests/a11y/live-regions-applied.test.ts:120-160` and note exactly what it requires of the not-scoreable branch — that test **survives** and must stay green.

- [ ] **Step 2: Add the profile read and the run's `completed_at`**

Add `completed_at` to the run select at `:46-52`:

```ts
.select('id, status, methodology_version, completed_at')
```

After `loadChurchForMember` (`:38`), add the profile read (D-P4-5 — the same guarded shape as `actions.ts`):

```ts
// D-P4-5: catch to null so this page degrades EXACTLY as generation does. An asymmetric
// degradation would make the two sides disagree about `profile` precisely when the
// database is flaky — permanent silent staleness under the one condition nobody smoke-tests.
// loadChurchForMember stays for church chrome and the admin role check.
let churchProfile: ChurchProfile | null = null
try {
  churchProfile = await loadChurchProfile(supabase, churchId)
} catch {
  churchProfile = null
}
```

- [ ] **Step 3: Build the keyed sibling array and extend the anonymity comment**

Immediately after the keyless `reflections` array at `:102-105`, add:

```ts
// ⚠️ ANONYMITY — the sibling keyed array. The array above is deliberately keyless: no
// respondent identifier travels alongside it, and it is the only reflections data that
// reaches a renderer. The array below CARRIES respondent identity (respondent_key =
// respondent_user_id ?? respondent_label) because the inputs hash must change when a
// different respondent answers, not merely when the text does. Its sole consumer is
// reportInputs. Passing it to fallbackSections, assembleReport, a component, or any
// client boundary would leak respondent identity into the report.
const hashReflections = reflectionRowsFor(rawResponses)
```

⚠️ `reflectionRowsFor` needs `respondent_label` and `respondent_user_id`, which the keyless array at `:102-105` has already dropped. Feed it the **raw RPC rows** from `get_completed_run_responses` (`:88-90`), before the `:91-97` map. Confirm the raw row binding's name and that it carries both columns; if the `:91-97` map is what names them, build `hashReflections` from the raw data, not from `responses`.

- [ ] **Step 4: Replace `resolveReportView` with the scoreability gate**

Replace `:129-137` with:

```ts
const resolution = resolveScoreability(derived)
```

Keep the not-scoreable branch and `notScoreableMessage` (`:143-153`) working exactly as they do. ⚠️ The guard stays spelled **`!resolution.scoreable`**.

Remove the now-unused `PROSE_MODE` usage only if it becomes genuinely unused — read `:128` and check. If it still feeds the prose path elsewhere on this page, leave it.

- [ ] **Step 5: Add the hash, the read seam, the themes revalidate, and the assembly**

After the guard (where `resolution.diagnosis` is available):

```ts
const { inputsHash, baseFacts } = reportInputs({
  diagnosis: resolution.diagnosis,
  methodology: reportMethodology,
  responses,
  church: churchFactsFrom(churchProfile, church.name),
  // Spec §9.1: the run's own completion timestamp, not new Date() — this line is labelled
  // "assessed", and a page-load moment would change on every reload. This intentionally
  // diverges from generation's new Date().toISOString(); completedAt is not in the hash.
  completedAt: run.completed_at,
  labelSource: knownLabels(responses),
  responseHash,
  reflections: hashReflections,
})

// RLS on `reports` is admin-only select and this page is already admin-gated (:43-44),
// so a direct .from('reports') here adds no exposure. Any error, zero rows, or a
// malformed row resolves to null, which assembleReport already treats as "no AI" —
// every section then renders its deterministic fallback.
const { data: persistedRow, error: persistedError } = await supabase
  .from('reports')
  .select('inputs_hash, sections, facts')
  .eq('run_id', run.id)
  .order('generated_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (persistedError) console.warn('[diagnosis] reports read failed; rendering fallback sections')

const persisted = persistedRow ?? null

// D-P4-1: facts.themes is model output that cannot be re-derived from responses, so S8 is
// the one place a renderer reads model output back off the persisted row. The invariant
// narrows rather than breaks: no renderer reads derived NUMBERS from `facts`; model output
// that cannot be re-derived is read back, SCHEMA-REVALIDATED FIRST — a reports row
// outlives the code that wrote it and `facts` is untyped jsonb.
const themes = revalidatedThemes(persisted, inputsHash)
const facts = themes === null
  ? baseFacts
  : buildFacts({
      diagnosis: resolution.diagnosis,
      methodology: reportMethodology,
      responses,
      church: churchFactsFrom(churchProfile, church.name),
      completedAt: run.completed_at,
      labelSource: knownLabels(responses),
      themes,
    })

const sections = assembleReport({
  facts,
  methodology: reportMethodology,
  reflections,          // the KEYLESS array — never hashReflections
  persisted,
  liveInputsHash: inputsHash,
})
```

Add the themes revalidator as a small local function at the bottom of the file (or in `lib/report/inputs-hash.ts` if it needs its own test — keep it local unless the reviewer asks):

```ts
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
): Themes | null {
  if (!persisted || persisted.inputs_hash !== liveInputsHash) return null
  const facts = persisted.facts
  if (!facts || typeof facts !== 'object' || !('themes' in facts)) return null
  const parsed = ThemesSchema.safeParse((facts as { themes: unknown }).themes)
  return parsed.success ? parsed.data : null
}
```

⚠️ Use the **existing** themes schema — find it with `grep -rn "themes" lib/ai/ lib/report/facts.ts | grep -i schema`. Plan 3's clustering work (`clusterThemes`, `actions.ts:250`) defines the shape; import that schema rather than writing a new one. If no exported schema exists, import the type and validate structurally (array of objects with the same required string keys), and say so in the commit body.

- [ ] **Step 6: Swap the JSX and relocate the admin controls**

Replace the `<ReportBody …>` render with `<ReportSections sections={sections} />`, and move `layer1Actions`' contents (the Download-PDF `<a>` and `{isAdmin && <ShareControl …>}`) from the `ReportBody` prop at `:183-200` to **after** `<ReportSections>`:

```tsx
<ReportSections sections={sections} />
<div className="flex flex-col gap-8">
  {/* Download PDF <a> — copied verbatim from the old layer1Actions */}
  {isAdmin && <ShareControl … />}
</div>
```

`layer1Actions` existed only as a `ReportBody` prop to position the admin controls mid-report; `ReportBody` is no longer rendered here, so the controls move to the end of the page. Keep the church-identity block and the surrounding `<main>` unchanged.

Remove the now-unused imports. ⚠️ Do not delete the component files.

- [ ] **Step 7: Re-point the diagnosis rows in the three route tests**

`tests/report/route-call-ordering.test.ts` — reduce `ROUTES` to the PDF route only, and add:

```ts
  it('app/app/[churchId]/diagnosis/page.tsx resolves scoreability and the read seam before assembling (CT-1, plan 4)', () => {
    const source = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))

    // BOTH anchors guarded on every ordering assertion — a missing needle yields
    // indexOf === -1 and would satisfy `toBeLessThan` vacuously.
    for (const needle of ['resolveScoreability(', ".from('reports')", 'assembleReport(']) {
      expect(source, `the diagnosis page must call ${needle}`).toContain(needle)
    }
    expect(source.indexOf('resolveScoreability(')).toBeLessThan(source.indexOf('assembleReport('))
    expect(source.indexOf(".from('reports')")).toBeLessThan(source.indexOf('assembleReport('))
    expect(
      source,
      'the diagnosis page must keep the not-scoreable guard spelled `!resolution.scoreable`',
    ).toContain('!resolution.scoreable')
  })
```

`tests/report/route-methodology-wiring.test.ts` — reduce `ROUTES` to the PDF route only, and add the diagnosis-page equivalent of the share `it()` from Task 7 (same regex, same shorthand ban, same `derived.effectiveMethodology` survival check), with `toBeGreaterThanOrEqual(2)` covering `reportInputs` and `assembleReport`.

`tests/report/route-reflections-wiring.test.ts` — rewrite the screen `it()`:

```ts
  it('screen route (diagnosis/page.tsx) passes the KEYLESS reflections to assembleReport', () => {
    const source = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))

    expect(source, 'the screen route must call assembleReport(').toContain('assembleReport(')
    expect(
      source,
      'the screen route must pass reflections, or outreach voices silently disappear from ' +
        'the on-screen report while every current test stays green.',
    ).toMatch(/assembleReport\(\{[\s\S]*?\breflections\b[\s\S]*?\}\)/)

    // The keyed sibling carries respondent identity and must reach reportInputs and
    // NOTHING else. Occurrence-count equality, not substring absence: the identifier is
    // legitimately present in the file, so what matters is how many places consume it.
    const uses = [...source.matchAll(/\bhashReflections\b/g)].length
    expect(
      uses,
      'hashReflections must appear exactly twice — its declaration and its single ' +
        'consumer, reportInputs. A third use is a respondent-identity leak into a renderer.',
    ).toBe(2)
  })
```

⚠️ If Step 3 named the keyed array something other than `hashReflections`, use that name here and everywhere else in this plan consistently.

- [ ] **Step 8: Run gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **0 failures** · eslint 0.

⚠️ **Expected local behaviour, not a bug:** migrations `20260811000100_reports.sql` and `20260811000200_rpc_save_report.sql` are committed but **not applied**, so the `reports` read errors locally and every section renders fallback. That is the designed degradation (spec §5) and it means the fallback path is what local smoke testing exercises.

- [ ] **Step 9: Verification mutation** *(controller only, AFTER committing)*

```bash
# mutation: break hash parity on ONE side only — change the page's `church:` argument to
# churchFactsFrom(null, church.name)
npx vitest run tests/report/route-sections-wiring.test.ts tests/report/route-methodology-wiring.test.ts
# a source-reading test cannot see this one — that is expected and is WHY inputs-hash-parity
# tests the module directly. Confirm the mutation instead by asserting the page's church
# argument in the group-3 test added in Task 9, then re-run.
GIT_LITERAL_PATHSPECS=1 git checkout -- "app/app/[churchId]/diagnosis/page.tsx"
```

- [ ] **Step 10: Commit** *(controller only)*

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/page.tsx" \
  tests/report/route-call-ordering.test.ts tests/report/route-methodology-wiring.test.ts \
  tests/report/route-reflections-wiring.test.ts
git commit -m "feat(report): render the 13-section report on the diagnosis page"
```

---

## Task 9: Route-wiring tripwire, migration comment, final gates

**Files:**
- Create: `tests/report/route-sections-wiring.test.ts`
- Modify: `supabase/migrations/20260811000100_reports.sql:16-18`

**Interfaces:** Consumes nothing. Produces nothing.

- [ ] **Step 1: Write the group-3 route-wiring test**

Create `tests/report/route-sections-wiring.test.ts`, in the established source-reading style (`readFileSync` + comment-stripping + assertions on source text):

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const sharePage = strip(read('app', 'r', '[shareToken]', 'page.tsx'))
const diagnosisPage = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))

describe('the public share surface stays structurally excluded from AI, themes and reflections', () => {
  it('never reads the reports table and never assembles the AI path', () => {
    expect(sharePage).not.toContain(".from('reports')")
    expect(sharePage).not.toContain('assembleReport(')
    expect(sharePage).toContain('assembleFallbackOnly(')
  })

  it('never builds a keyed reflections array', () => {
    expect(sharePage).not.toContain('reflectionRowsFor')
    expect(sharePage).not.toContain('respondent_key')
  })

  it('passes no themes into buildFacts', () => {
    expect(sharePage).not.toContain('themes')
  })

  it('passes the explicit redacted label source, never knownLabels (D-P4-4)', () => {
    expect(sharePage).toContain("kind: 'redacted'")
    expect(sharePage).not.toContain('knownLabels(')
  })
})

describe('the diagnosis surface wires the keyed array to the hash and nothing else', () => {
  it('passes churchFactsFrom(churchProfile, …) into reportInputs, not a null profile', () => {
    // Pins the §4.3 drift risk directly: a ChurchFacts built from four columns produces a
    // different profile slice and therefore a permanently stale hash, silently.
    expect(diagnosisPage).toContain('loadChurchProfile(')
    expect(diagnosisPage).toContain('churchFactsFrom(churchProfile')
    expect(diagnosisPage).not.toContain('churchFactsFrom(null')
  })

  it('keeps loadChurchForMember for chrome and the role check', () => {
    expect(diagnosisPage).toContain('loadChurchForMember(')
  })
})

describe('both surfaces render from reportMethodology, never the raw methodology', () => {
  it('keeps both effectiveMethodology assignments', () => {
    const missing = [
      ['share', sharePage],
      ['diagnosis', diagnosisPage],
    ].filter(([, src]) => !(src as string).includes('derived.effectiveMethodology'))
    expect(missing.map(([label]) => label)).toEqual([])
  })
})
```

⚠️ The `expect(sharePage).not.toContain('themes')` assertion is a whole-file substring-absence check — the class of assertion lesson 8 warns about. It is acceptable **only** because the share page has no legitimate reason to mention themes at all. If a comment on that page ever needs the word, switch it to occurrence-count equality rather than deleting it.

- [ ] **Step 2: Run to verify it passes, then mutate to prove it is not vacuous**

```bash
npx vitest run tests/report/route-sections-wiring.test.ts     # expect PASS
# mutation: change the share page's labelSource to knownLabels(responses)
npx vitest run tests/report/route-sections-wiring.test.ts     # expect FAIL on the D-P4-4 test
GIT_LITERAL_PATHSPECS=1 git checkout -- "app/r/[shareToken]/page.tsx"
npx vitest run tests/report/route-sections-wiring.test.ts     # expect PASS
```

- [ ] **Step 3: Amend the migration comment**

`supabase/migrations/20260811000100_reports.sql:16-18` currently reads *"No renderer reads it."* That is now false for `facts.themes`. Amend **in place** — comment-only edit to an unapplied migration, no schema change, no new migration file:

```sql
-- `facts` is write-only provenance, NARROWED (plan 4, D-P4-1): no renderer reads derived
-- NUMBERS from it. Model output that cannot be re-derived from responses — today only
-- `facts.themes`, which feeds S8 — IS read back by the diagnosis page, schema-revalidated
-- first, and only when the row's inputs_hash matches the live one.
```

⚠️ Match the file's existing comment style and keep the surrounding lines intact. `supabase/**` is lint-ignored, so eslint proves nothing here — read the diff.

- [ ] **Step 4: Final gates**

```bash
npx tsc --noEmit && npx vitest run && npx eslint
```
Expected: tsc 0 · vitest **0 failures** · eslint 0.

- [ ] **Step 5: Final non-vacuity sweep** *(controller only)*

```bash
git diff -U0 5941ef4..HEAD -- tests/ | grep '^-' | grep -v '^---'
```
Every deleted test line must be a re-pointed assertion whose invariant is preserved by its replacement, or a loop iteration removed with the `ROUTES` narrowing. **A deleted assertion with no replacement is a defect.** Cross-check against the six dispositions in Tasks 7 and 8.

- [ ] **Step 6: Commit** *(controller only)*

```bash
git add tests/report/route-sections-wiring.test.ts supabase/migrations/20260811000100_reports.sql
git commit -m "test(report): pin the plan-4 route wiring and narrow the facts provenance comment"
```

---

## Post-plan state

**Shipped:** the 13-section `report.yaml` report renders on both web surfaces. `assembleReport` has its first call site. S8 reads clustered themes back on the diagnosis page. A 100%-fallback cached report self-heals.

**UNSHIPPED after this plan** (zero production call sites; deleted in plan 5, not here): `app/app/[churchId]/diagnosis/report/{shared,cover,chain,system,dossier}.tsx`, alive only via `tests/report/components.test.ts` and `tests/report/audience-parity.test.ts`.

**Deliberately deferred, all flagged rather than fixed:**
- Date formatting — `completed_at` renders as a raw ISO-8601 string on both surfaces (spec §9.4).
- The share page's S1 reads *"assessed not yet completed"* (spec §9.1); the fix is one added column on `get_shared_run_responses`, a migration, therefore plan 5.
- `tests/report/stale-payload.test.ts:22-24`'s doc comment goes stale after Task 4 — comment-only, no assertion changes.
- `tests/report/copy-relocation.test.ts` keeps passing while its coverage of the *shipped* surfaces drops to zero. Consider a sentinel-mutation test on `report.yaml` titles / fallback templates in plan 5.
- **Share-page `respondent_count` may under-report.** `facts.ts:198` counts `new Set(responses.map(r => r.respondent_id)).size`, and any share-page submission the RPC never resolved to a member id collapses to the `''` key (`app/r/[shareToken]/page.tsx:90`). This is **pre-existing** — the same keying already feeds today's share render — but plan 4 newly surfaces it in S1's "{respondent_count} respondents". Verify before asserting harm; no fix in plan 4.

---

## Self-review

**Spec coverage.** §2 in-scope items 1–6 → Tasks 5/6, 1/2, 8, 8, 3, 7/8/9. §3 both data paths → Tasks 7 and 8. §3.1 page chrome table → Tasks 7 (share) and 8 (diagnosis, controls relocated). §4.1 module → Task 1. §4.2 sibling array + extended comment → Task 8 Step 3. §4.3 both call sites on `loadChurchProfile` → Tasks 2 and 8, with D-P4-5 resolving the throw the spec did not address. §5 read seam → Task 8 Step 5. §6 themes + migration comment → Task 8 Step 5 and Task 9 Step 3. §7.1/7.2/7.3 → Tasks 5, 6, 4. §8 I9 → Task 3. §9.1/9.2 → Task 7 and Task 8. §9.3 → resolved as D-P4-4, applied in Task 7 Step 2. §10.1 groups 1–3 → Tasks 5/6, 1, 9. §10.2 non-vacuity → mutation steps in Tasks 4, 6, 7, 9. §10.3 all 8 rows → Tasks 7 and 8, with the §10.3:472 error corrected. §11 error handling → Task 8 Step 5 and each AI renderer's `safeParse`. §12 gates → Global Constraints.

**One gap the spec left open, closed here:** where scoreability comes from once the pages stop calling `resolveReportView` → **D-P4-6**.

**Type consistency.** `reflectionRowsFor` / `churchFactsFrom` / `reportInputs` / `assembleFallbackOnly` / `resolveScoreability` / `ScoreabilityResolution` / `SectionBodyView` / `ReportSections` / `isUsableCachedReport` / `revalidatedThemes` are spelled identically at every definition and every use. The keyed array is `hashReflections` in Tasks 3, 7 and 8. `AssembledSection` fields (`id`, `source`, `ai`, `fallback`) match `lib/report/compose.ts:72-77` throughout.

**Placeholder scan.** Every code step carries real code. Four steps deliberately instruct the implementer to *read a specific line range and match what is there* — Task 1 Step 4 (`BuildFactsArgs` export, generation's exact hash-argument bindings), Task 3 Step 1 (`section_sources` stored shape), Task 4 Step 3 (`assembleReport`'s lookup idiom), Task 8 Step 5 (the themes schema). Those are exact anchors against real uncertainty in files this plan does not otherwise reproduce, not "figure it out".
