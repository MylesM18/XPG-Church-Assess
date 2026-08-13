# Final Report — Plan 5 of 5: PDF Surface — Design

**Date:** 2026-08-12 · **Branch:** `feat/final-report-3-composer` (continues off `919d70c`)
**Parent spec:** `docs/superpowers/specs/2026-08-10-final-report-redesign-design.md` — plan 5 is defined
at its line 137: *"**PDF** — extend `pdf/document.tsx` to the skeleton; guard extension."*
**Status:** **APPROVED by Natalie, 2026-08-12.** Cleared to `superpowers:writing-plans`.

## Goal

Move the PDF surface off the dead 10-block `ReportView` model onto the same 13-section
`AssembledSection[]` the diagnosis page already renders, so an exported PDF is the report an admin
just read on screen. Then remove the model it left behind.

Plan 4 swapped the web. The PDF route is the **last production consumer** of `buildReportView` /
`resolveReportView`, which is why the teardown of the old model belongs here and not earlier.

## Locked decisions (this session, 2026-08-12 — do not reopen)

| # | Decision |
|---|---|
| **D-P5-1** | **The PDF gets hash-matched AI sections**, via a shared resolver both the page and the PDF route call. Not deterministic-only, and not duplicated in the route. Realises the parent spec's "one composed report". |
| **D-P5-2** | **The `view.ts` teardown lands inside plan 5, as its last phase.** One PR, no dead code left behind. Phase 4 is cuttable without leaving a broken tree. |
| **D-P5-3** | **`revalidatedThemes` / `isThemeClusterFact` are lifted into the shared resolver and tested.** This is the one deferred ride-along plan 5 absorbs. |
| **D-P5-4** | **Profile-edit ruling = (c) now, (a) in plan 5.** Stale-row notice + reasons-only log immediately, *and* a real regenerate affordance. |
| **D-P5-5** | **The `reports` read becomes hash-addressed** (`.eq('inputs_hash', liveInputsHash)`). Not an optional ride-along: it is the correctness precondition for D-P5-4's regenerate path. See "Why the hash-addressed read is now mandatory" below. |
| **D-P5-6** | **Explicitly deferred, by Natalie's scope call:** occurrence-count hardening of `route-call-ordering.test.ts` / `generate-report-wiring.test.ts`, and `response-hash.ts`'s `localeCompare`. |

## Recon — verified by grep this session, not inferred

1. **`lib/report/pdf/document.tsx` (451 lines) is entirely on the old model.** It imports
   `type { ReportView, SystemView, AreaDossierView } from '../view'`, renders one `<Page>`, and
   hand-duplicates the web styling in a ~50-key `StyleSheet` — `@react-pdf/renderer` cannot render
   DOM components, so it never imported the web components and never will.
2. **The PDF route does not call `assembleReport`.** It calls `resolveReportView`
   (`app/api/report/[runId]/pdf/route.ts:5`). `assembleReport`'s only production call site is
   `app/app/[churchId]/diagnosis/page.tsx:226`.
3. **⚠️ `view.ts` does not die — it splits.** The parent handoff's "view.ts dies only if plan 5 swaps
   the PDF document" is half right. Four exports have live non-PDF consumers and **survive**:

   | Surviving export | Live consumer |
   |---|---|
   | `interp` | `lib/report/facts.ts:4`, `lib/report/fallback-sections.ts:4` |
   | `readingBand` | `lib/report/fallback-sections.ts:4` |
   | `buildOutreachVoices` | `lib/report/fallback-sections.ts:4` |
   | `resolveScoreability` (+ `ScoreabilityResolution`) | `app/app/[churchId]/diagnosis/page.tsx:8` **and** `app/r/[shareToken]/page.tsx:20` (D-P4-6) |

   What dies is `buildReportView`, `resolveReportView`, `ReportView`, `SystemView`,
   `AreaDossierView`, `CoverView`, `ReportViewResolution`, `ReportAudience` — roughly 380 of 525 lines.
4. **`save_report` needs no migration to support regenerate.** `20260811000200_rpc_save_report.sql`
   has **no status filter** (it resolves the run through the status-agnostic `current_run()`), is
   `require_church_admin`-gated, and ends `on conflict (run_id, inputs_hash) do nothing`. A
   regenerate path is therefore pure application code over RPCs that already exist.
5. **The share page is untouched by this plan.** It calls `assembleFallbackOnly`, never
   `assembleReport` (`tests/report/route-sections-wiring.test.ts:17` asserts
   `not.toContain('assembleReport(')`). P5 stands: deterministic-only, no themes, no verbatims.

## Why the hash-addressed read is now mandatory (D-P5-5)

Today's render read is `.order('generated_at', desc).limit(1)`
(`page.tsx:197-203`) while generation writes `.eq('inputs_hash', …)`
(`actions.ts:226-231`). That asymmetry is harmless **only** because generation is one-shot per
church. D-P5-4's regenerate affordance is precisely a fix to one-shot, so the asymmetry becomes a
reachable, silent bug:

> Admin edits the church profile → live hash moves to H2 → row R1 (H1) is stale → notice shown.
> Admin regenerates → row R2 (H2) written. Admin then **reverts** the profile edit → live hash
> returns to H1 → `.limit(1)` still returns R2 → judged stale → AI sections gone forever, *even
> though R1 with hash H1 is sitting in the table.*

A hash-addressed read finds R1 and renders it. The deferred note prescribed shipping these two
together; D-P5-4 is what triggers it.

## Architecture

### The shared resolver seam (Phase 1)

Both surfaces need the identical pipeline: facts → hash → read the row by hash → revalidate themes →
rebuild facts with themes → assemble. Today all of it lives inline in `page.tsx`. Duplicating it in
the PDF route would create a second drifting call site — the exact class that produced the
`labelSource` and `responseHash` findings. So it moves into one module.

**New: `lib/report/resolve.ts`**

```
resolveReportSections({
  diagnosis, methodology, responses, church, completedAt,
  labelSource, responseHash, reflections, hashReflections,
  readPersisted,              // (inputsHash) => Promise<PersistedReport | null>
}) => Promise<{ sections: AssembledSection[]; inputsHash: string; stale: boolean }>
```

- **The DB read is dependency-injected**, not imported. The module stays free of any Supabase
  import, so it is unit-testable with a fake `readPersisted` — and that is what finally gives
  `revalidatedThemes` real coverage (D-P5-3).
- **`revalidatedThemes` and `isThemeClusterFact` move here** verbatim out of `page.tsx:286-316`,
  with their docstrings intact. This is a source move with Lesson-11 blast radius: the covering
  tests must be re-run at the move, not only at the end.
- **`stale`** is `persisted !== null && persisted.inputs_hash !== inputsHash`. It drives D-P5-4's
  notice. The resolver logs it reasons-only: `[report] persisted row stale; rendering fallbacks`.
- **`inputsHash` is returned**, because callers need it for their `readPersisted` closure and the
  regenerate action needs it for `save_report`.

**New: `lib/data/reports.ts`** — one `readPersistedReport(supabase, runId, inputsHash)` helper
holding the hash-addressed query text (ADR 0002 data-access seam, mirroring `lib/data/churches.ts`).
Both callers inject it. The query text lives in one place so it cannot drift between surfaces.

`page.tsx` is rewired to call the seam and loses ~90 lines. The PDF route is untouched in Phase 1 —
Phase 1 must be gate-green on its own.

### The PDF document rewrite (Phase 2)

`ReportDocumentProps` changes from `{ view, churchName, brandColor, monogram, generatedAt }` to
`{ sections, churchName, brandColor, monogram, generatedAt, labels, stale }`.

`document.tsx` becomes a react-pdf mirror of `app/app/[churchId]/diagnosis/report/sections.tsx`:

- 13 sections in **array order, never re-sorted** — `assembleReport` already returns them in
  `Object.keys(methodology.report.sections)` order, which is `report.yaml` order.
- Heading always from `section.fallback.title`. AI renderers emit body content only, never a heading
  — the same one-title-source rule the web renderer follows.
- Seven AI renderers (S2, S4, S5, S6, S7, S9, S12), each `safeParse`-then-fallback, mirroring the
  web's per-section field usage exactly.
- **The `switch` + `never` exhaustiveness arm carries over verbatim.** It is the compile-time
  guarantee that an eighth `AiSectionId` cannot be silently dropped from the PDF — tsc fails the
  build, not a human.
- A uniform `SectionBodyView` equivalent for every `source: 'fallback'` section.
- `stale` renders as a caveat line in the appendix (a PDF has no regenerate button).

**Deleted from `document.tsx`:** `AreaDossierBlock`, `DossierField`, `depRelationshipLine`,
`DEP_READ_ORDER` / `DEP_READ_LABEL` / `DEP_PILL`, `confidenceBand`, and the ~30 `StyleSheet` keys
serving the old blocks (`dossier*`, `dep*`, `stage*`, `cover*`, `verdict`, `voices*`).
**Kept:** `page`, `header`, `monogram`, `headerText`, `churchName`, `headerMeta`, `section`,
`table*`, `appendixRow`, `footer`, `ctaButton`, and `./fonts`.

The PDF route then loses `resolveReportView`, `fallbackProse`, and the `ReportBlocks` thunk, and
gains the seam plus `resolveScoreability` for its 409 arm — the same export the two pages already use.

### Re-homing the fail-closed anonymity guard (Phase 2)

`lib/report/pdf/render.ts:28` currently asserts on `props.view.dispersion?.respondents.length ||
props.view.system?.disagreement?.respondents.length`. Both fields die with `ReportView`, so **the
guard must be re-homed, never dropped.** Parent spec anonymity point 4 states the contract: sections
passed to `renderReportDocument` must carry no respondent labels — same fields as today plus the
themes structure.

New contract, unchanged in spirit:

- The guard walks every section's `fallback.body`, `fallback.bullets`, and the string fields of the
  AI payload, and **throws** if any respondent label appears. Hence `labels` joining the props.
- **It reuses the existing predicate in `lib/report/anonymity.ts` rather than hand-rolling a second
  one.** Implementation must read that module first and use what is there; a second, drift-prone
  copy of label matching is not acceptable. *(The one implementation detail this spec deliberately
  leaves to a grep — the contract is pinned, the call is not.)*
- ⚠️ **`labels` must be the same value the resolver was handed as `labelSource`** — one
  `knownLabels(responses)` call per request, threaded through, never a second call. Two label
  sources that can disagree is the `labelSource` finding class exactly; a guard checking a
  *different* label list than the one the facts pack was built from would fail open. The plan pins
  this by **occurrence count**: `knownLabels(` occurs at most once per surface.
- Fail-closed and loud: it throws, the route's existing catch turns it into a 500, and the log line
  stays reasons-only. A guard that silently passed would be worse than no guard.

### Stale notice + regenerate affordance (Phase 3)

**Notice (c).** When `stale` is true the diagnosis page renders "This report predates your latest
settings change." next to the regenerate control. The resolver has already logged the reason.

**Regenerate (a).** New admin-only server action in `app/app/[churchId]/actions.ts`:

- Reads responses through **`get_completed_run_responses`** — the status-agnostic RPC the PDF route
  already uses, which is what makes regenerate possible on a completed run.
- Rebuilds facts + `inputsHash`, runs `clusterThemes` + `composeReport`, calls `save_report`.
- **Idempotent for free:** `save_report`'s `on conflict (run_id, inputs_hash) do nothing` makes a
  double-click a no-op. No new guard needed.
- Gated by `PROSE_MODE !== 'fallback'`, exactly like generation.
- Wrapped in try/catch; never throws to the user; reasons-only logging. A failed regenerate leaves
  the existing row and the existing notice untouched.
- **No migration.** `save_report` and `require_church_admin` already permit this (recon 4).

UI: the control renders only when `stale` is true and the viewer is admin. Not a general "regenerate"
button — it is the recovery path for exactly the failure D-P5-4 names.

### Teardown (Phase 4 — cuttable)

**`view.ts` split.** Delete `buildReportView`, `resolveReportView`, `ReportView`, `SystemView`,
`AreaDossierView`, `CoverView`, `ReportViewResolution`, `ReportAudience`. Keep `interp`,
`readingBand`, `buildOutreachVoices`, `OutreachVoicesGroup`, `resolveScoreability`,
`ScoreabilityResolution`.

**Delete the five UNSHIPPED components** — zero production call sites, every remaining reference a
comment: `app/app/[churchId]/diagnosis/report/{shared,cover,chain,system,dossier}.tsx`.

**Nine test files hang off the dying half.** Each gets an explicit disposition, because
*deleting a test file is indistinguishable from a passing gate*:

| File | Disposition |
|---|---|
| `copy-relocation.test.ts` | **Re-home.** s41 explicitly cleared this as real coverage *through* `buildReportView`. Re-point its assertions at `fallbackSections` / `buildFacts`. Coverage must not be dropped. |
| `audience.test.ts` | **Re-home the invariant, not the test.** The screen/pdf/shared audience concept dies with `buildReportView`; the real invariant — no respondent label reaches the pdf or shared surface — re-homes onto the new guard + `assembleFallbackOnly`. |
| `pdf-document.test.ts` | **Rewrite** against the new document. |
| `pdf-voices.test.ts` | **Re-home** onto the S8 fallback / themes path. |
| `components.test.ts` | **Trim.** ~16 of its 20 tests cover UNSHIPPED components (its own comment at :188-203 claims AreaTable is live "until Task 8 swaps that page too" — Task 8 is `b3e7455`, already in this branch). Keep only what survives. |
| `audience-parity.test.ts` | **Delete.** It asserts parity between `buildReportView` audiences that no longer exist. |
| `view.test.ts` | **Trim** to the four surviving helpers. |
| `stale-payload.test.ts` | **Re-point** at `resolveScoreability`. Its stale doc comment at :22-24 gets fixed in passing. |
| `assemble-fallback-only.test.ts` | **Trim** the `resolveReportView` import; the `resolveScoreability` half stays. |

**Test-count restatement.** The baseline is **183 files / 1209 tests / 0 failures**. Phase 4 lowers
it. ⚠️ `npx vitest run` exits 0 while collecting fewer files, so the plan must state the **expected**
post-teardown file and test counts and gate on that number — "0 failures" alone would let a silently
uncollected file pass as green.

## Testing

- **`tests/report/resolve.test.ts`** (new) — the seam: `readPersisted` is called with the **live**
  hash (pins D-P5-5); `revalidatedThemes` accept + reject fixtures — no row, stale hash, missing
  key, wrong shape, valid (this is D-P5-3's coverage); stale → fallback + `stale: true`; fresh → AI.
- **`tests/report/pdf-sections.test.ts`** (new) — 13 sections in `report.yaml` order; a malformed AI
  payload renders that section's fallback; the guard **throws** when a label is present and does not
  throw when it is not.
- **`tests/report/regenerate.test.ts`** (new) — wiring: uses `get_completed_run_responses`, calls
  `save_report`, never throws, respects `PROSE_MODE`.
- **⭐ Occurrence-count assertions, not presence checks.** The seam's whole purpose is that exactly
  two call sites exist, so assert the **count**: `resolveReportSections(` occurs exactly twice across
  `page.tsx` + the PDF route, and `buildFacts(` occurs **zero** times in either — a bare `toContain`
  would be satisfied by one site and survive a regression at the other. Three real findings in this
  series came from that class.
- Existing route-wiring and a11y tests stay green throughout; each phase runs all three gates.

## Out of scope

Share page behaviour (P5 stands — `assembleFallbackOnly`, deterministic-only). Any migration. New
dependencies. Methodology version bump. The D-P5-6 deferrals. Date formatting (§9.4). A general
regenerate button beyond the stale-recovery path. Multi-run reports. The remaining M/I items from
earlier plans.

## Gates and constraints

`npx tsc --noEmit` → 0 · `npx vitest run` → 0 failures **at the stated expected count** ·
`npx eslint .` → 0 **problems** (it exits 0 on warnings — judge by problem count). All three, every
phase. `app/**`, `lib/report/**`, `tests/report/**` are linted. Test files must be `.ts` and
JSX-free — use `createElement`; `.tsx` is silently uncollected. Logging stays reasons-only. Bracket
paths (`[runId]`, `[churchId]`, `[shareToken]`) need `GIT_LITERAL_PATHSPECS=1` and quoting.

## Phasing

1. **Shared resolver seam** — `lib/report/resolve.ts` + `lib/data/reports.ts`, hash-addressed read,
   `revalidatedThemes` lifted and tested. `page.tsx` rewired. PDF untouched.
2. **PDF swap** — route onto the seam, `document.tsx` rewritten, anonymity guard re-homed.
3. **Stale notice + regenerate** — no migration.
4. **Teardown** — `view.ts` split, five components deleted, nine test files dispositioned, baseline
   restated. **Cuttable**: phases 1–3 leave a complete, gate-green tree on their own.

## Open items for Natalie

- The ⚠️ unverified claim from plan 4 is **unchanged and still open**: the AI/themes path has never
  executed against a real `reports` row, because migrations `20260811000100` then `20260811000200`
  are committed but **not applied**. Plan 5 does not close it and cannot. Applying both in order,
  running `npm run test:db`, and smoking both surfaces remains yours — and it is now a **precondition
  for meaningfully testing plan 5's regenerate path** against real data.

### Resolved at approval, 2026-08-12

| # | Ruling |
|---|---|
| **D-P5-7** | **Spec approved as written.** Cleared to `superpowers:writing-plans`; no spec changes requested. |
| **D-P5-8** | **Stale-notice + regenerate-control copy: implementation drafts, Natalie reviews before merge** — the action-library arrangement. The plan must surface the exact drafted strings for her glance rather than burying them in a diff. |
| **D-P5-9** | **Phase 4 restates the expected test counts and gates on that exact number.** A decrease is not a regression; a *silently uncollected file* is. Per-file delta table explicitly **not** required. |
