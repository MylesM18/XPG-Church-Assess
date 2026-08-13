# Final report — plan 4 of 5: renderer / web swap

**Date:** 2026-08-12 · **Branch:** `feat/final-report-3-composer`
**Parent spec:** `docs/superpowers/specs/2026-08-10-final-report-redesign-design.md` (plan 4 = line 136)
**Predecessor:** plan 3 (composer) — `docs/superpowers/plans/2026-08-11-final-report-3-composer.md`, COMPLETE

---

## 1. Why this plan exists

Plan 3 built the composer and shipped it with **zero render-time call sites**. `composeReport` is
wired into generation (`app/app/[churchId]/actions.ts:263`) and writes a `reports` row.
`assembleReport` (`lib/report/compose.ts:79`) — the read half — has **no callers at all**. The
13-section executive report exists in the database and renders nowhere.

Plan 4 turns it on for the two web surfaces. It is the swap from the legacy 10-block `ReportView`
to the 13-section `report.yaml` report on:

- the authenticated diagnosis page — `app/app/[churchId]/diagnosis/page.tsx`
- the public share page — `app/r/[shareToken]/page.tsx`

The PDF route (`app/api/report/[runId]/pdf`) is **deliberately untouched** and keeps rendering the
legacy blocks until plan 5 (decision **D-P4-2**).

---

## 2. Scope

### In scope

1. A new shared section-renderer component set, imported by both pages.
2. A new shared inputs-hash module so the diagnosis page can recompute `liveInputsHash` with a
   formula that provably matches generation's.
3. A `reports` read seam on the diagnosis page only.
4. Themes read-back for S8 on the diagnosis page (decision **D-P4-1**).
5. The I9 cache-miss correction in `actions.ts`.
6. Test updates for the source-reading route tests that plan 4 invalidates (§10.3) plus three new
   test groups (§10.1).

### Out of scope

- The PDF route and everything it imports. `lib/report/view.ts`, `app/app/[churchId]/diagnosis/report/shared.tsx`
  and the four block component files (`cover.tsx`, `chain.tsx`, `system.tsx`, `dossier.tsx`) **survive
  untouched** — plan 4 stops importing most of them from the two pages; it deletes nothing.

  ⚠️ **CORRECTION.** This bullet previously read *"they are the PDF route's renderer until plan 5."*
  **That was false, and it was never true at any point in the project's history.** The PDF route
  renders through `lib/report/pdf/render.ts` — `@react-pdf/renderer` plus `lib/report/pdf/document.tsx`
  — which **structurally cannot consume DOM/JSX components**. `bd4dc17`, the commit that created that
  renderer, says so outright: the DOM components in `diagnosis/report/*.tsx` *"can't be reused by a
  non-DOM renderer"*, so the PDF **mirrors** them instead. Of the files named in this bullet the PDF
  route imports **only `lib/report/view.ts`, and only for `resolveScoreability`**. The five `.tsx`
  files survive plan 4 because **plan 4 deletes nothing** — not because anything renders them. A
  teardown session must not treat "the PDF needs it" as a reason to keep them.
- Any new visual language. Structural swap on existing tokens only (**D-P4-3**): `font-display`,
  `font-body`, `text-ink`, `text-ink-soft`, `max-w-2xl`, `gap-8`. No mockup round.
- Any migration. No schema change, no RPC change, no methodology version bump.
- Date formatting. `facts.cover.completed_at` renders as the raw ISO-8601 string through
  `report.yaml`'s S1 template, exactly as generation already stores it. See §9.4 — flagged, deferred.
- New dependencies.

---

## 3. Architecture

Both surfaces converge on one component, from different data paths.

**Diagnosis page (authenticated, admin-only):**

```
loadChurchForMember + loadChurchProfile
  → get_completed_run_responses  → responses[] (keyless reflections[] as today)
  → deriveDiagnosisForRun        → derived
  → reportMethodology = derived.effectiveMethodology     ← LINE STAYS VERBATIM
  → reportInputs(...)            → { inputsHash, baseFacts }        (§4)
  → .from('reports') read        → persisted | null                 (§5)
  → themes revalidate            → facts (baseFacts, or rebuilt with themes)  (§6)
  → assembleReport(...)          → AssembledSection[]
  → <ReportSections>
```

**Share page (public, tokenized):**

```
get_shared_report + get_shared_run_responses → responses[] (NO reflections — four-layer exclusion)
  → deriveDiagnosisForRun        → derived
  → reportMethodology = derived.effectiveMethodology     ← LINE STAYS VERBATIM
  → buildFacts(...)              → facts (NO themes, name-only ChurchFacts, completedAt null)
  → assembleFallbackOnly({ facts, methodology, reflections: [] })
                                 → AssembledSection[], every source 'fallback'   (§7.3)
  → <ReportSections>
```

The share page passes `reflections: []` explicitly — not an omitted optional. `FallbackSectionArgs`
requires the field, so an empty literal is the structural exclusion, visible at the call site.

The share page **never** reads the `reports` table, **never** receives themes, and **never**
receives reflections. Verbatim exclusion on the public surface is **structural** — there is no
conditional to get wrong, because the data never enters the call.

Both `reportMethodology = derived.ok ? derived.effectiveMethodology : methodology` assignments stay
verbatim. Their *consumers* change (see §10.3 — `route-methodology-wiring.test.ts` asserts on the
`resolveReportView` call, not on the assignment, so that test must be re-pointed).

### 3.1 What each page keeps outside `<ReportSections>`

`<ReportSections>` renders the 13 report sections and nothing else. Page chrome stays on the pages:

| element | diagnosis | share |
|---|---|---|
| church-identity block (monogram + name `<p>`) | keep, unchanged | keep, unchanged |
| not-scoreable branch (`StaleMethodologyNotice` / `SharedStaleMethodologyNotice`) | keep, unchanged | keep, unchanged |
| Download-PDF link + `<ShareControl>` | keep — moved from `layer1Actions` to **after** `<ReportSections>` | n/a |
| `<BookingCta>` | not currently rendered here | **keep**, after `<ReportSections>` |
| "Shared read-only view…" footer `<p>` | n/a | keep, unchanged |

`layer1Actions` existed only as a `ReportBody` prop to position the admin controls mid-report.
`ReportBody` is no longer rendered on this page, so the controls move to the end of the page.
`<BookingCta>` is a booking link, not a report section — s11 ("Where XPG can partner") is prose
about partnering, not the CTA — so it stays and `tests/report/booking-cta-shared.test.ts` keeps
passing unchanged.

---

## 4. The inputs-hash recompute — the highest-risk piece

`assembleReport` needs `liveInputsHash`. Today `reportInputsHash` is called from exactly one place
(`actions.ts:218-225`) and needs six inputs, two of which are non-trivial to reproduce:
`reflections` **carrying `respondent_key`**, and `profile` taken from a `buildFacts` call.

**A duplicated formula does not fail loudly. It pins every report to "stale" forever, with no
error, no log, and a page that still renders correctly** — just always from fallback. Dropping the
freshness check is explicitly off the table: it would let a stale AI section outlive a methodology
change, the exact harm CT-2(c) exists to prevent.

### 4.1 New module: `lib/report/inputs-hash.ts`

Two exports. `lib/report/report-hash.ts` (`reportInputsHash`, the pure canonicalizer) is **not
modified** — it keeps its own tests.

```ts
/** The raw run-response row shape both surfaces already have in hand. */
export interface ReflectionSourceRow {
  item_id: string
  respondent_label: string
  respondent_user_id: string | null
  reflection: string | null
}

/** item_id + respondent_key + trimmed text, non-empty only. respondent_key is the STABLE
 *  identity: respondent_user_id ?? respondent_label. Extracted verbatim from actions.ts:204-210. */
export function reflectionRowsFor(
  rows: readonly ReflectionSourceRow[],
): Array<{ item_id: string; respondent_key: string; text: string }>

/** Everything between actions.ts:212 and :231, extracted verbatim: responseHash is NOT
 *  recomputed here (callers pass it), buildFacts produces baseFacts, and baseFacts.profile
 *  feeds reportInputsHash. Returning baseFacts means neither caller rebuilds it. */
export function reportInputs(args: {
  diagnosis: Diagnosis
  methodology: Methodology            // ALWAYS derived.effectiveMethodology
  responses: Response[]
  church: ChurchFacts
  completedAt: string | null
  labelSource: LabelSource
  responseHash: string
  reflections: ReadonlyArray<{ item_id: string; respondent_key: string; text: string }>
}): { inputsHash: string; baseFacts: FactsPack }
```

`reportInputs` owns the assembly of all six hash components — `methodologyVersion` from
`diagnosis.methodology_version`, `reportVersion` from `methodology.report.version`, and
`profile` from its own `buildFacts` call. That is the anti-drift boundary: the only way the two
call sites can disagree is by passing different `responses`, `church`, or `reflections`, all of
which the tests in §10.1 group 2 pin directly.

`actions.ts:212-231` is replaced by one `reflectionRowsFor` call plus one `reportInputs` call. This
is a **pure extraction** — generation's behaviour is bit-identical, which the existing 1168-test
baseline plus the new equality test both hold to.

### 4.2 Anonymity — the sibling array

The diagnosis page's existing `reflections` array is deliberately keyless, and its comment says so:
*"No respondent identifier travels alongside."* Plan 4 must not falsify that comment.

The page builds a **second, local array** via `reflectionRowsFor(rawResponses)`. It carries
`respondent_key`. It is passed to `reportInputs` and to nothing else. It is never passed to
`fallbackSections`, never to `assembleReport`, never to a component, never to a client boundary.
The keyless array is unchanged and remains the only reflections data that reaches a renderer.

**The existing anonymity comment is extended**, in the same block, to state that a sibling keyed
array exists, that it is built by `reflectionRowsFor`, that its sole consumer is the hash, and that
adding it to any render call would leak respondent identity into the report.

### 4.3 The profile-column drift risk (new finding, 2026-08-12)

`reportInputs` hashes `baseFacts.profile`, which is derived from `ChurchFacts`. The two call sites
obtain `ChurchFacts` differently today:

- `actions.ts:50-69` inlines a 13-column `.from('churches').select(...)` and maps it to `ChurchFacts`.
- The diagnosis page calls `loadChurchForMember`, which selects only `id, name, brand_color, attendance_band`.

A `ChurchFacts` built from four columns produces a **different `profile` slice** and therefore a
different hash — permanent staleness, silently.

**Decision:** the diagnosis page additionally calls **`loadChurchProfile`** (`lib/data/churches.ts`),
the existing ADR-0002 seam whose `PROFILE_COLUMNS` list is the same 13 columns `actions.ts` inlines,
and maps its result to `ChurchFacts`. `loadChurchForMember` stays for church chrome + role.

**Decision:** `actions.ts` is **also** switched to `loadChurchProfile`, replacing its inline select.
This is in scope: it is the same "one definition, never two drifting copies" principle §4 exists to
enforce, applied to the second component of the same hash. The mapping from `ChurchProfile` to
`ChurchFacts` lives in one place — a small exported `churchFactsFrom(profile: ChurchProfile | null,
fallbackName: string): ChurchFacts` in `lib/report/inputs-hash.ts` — called by both sites.

---

## 5. The `reports` read seam

Diagnosis page only, after `run` is resolved:

```ts
const { data: persistedRow } = await supabase
  .from('reports')
  .select('inputs_hash, sections, facts')
  .eq('run_id', run.id)
  .order('generated_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

This mirrors the `actions.ts:238-243` idiom and the existing `diagnoses` read on the same page.
RLS on `reports` is admin-only select; the page is already admin-gated (`role === 'admin'`, else
redirect), so no new exposure.

Degradation: any error, zero rows, or a malformed row resolves to `persisted = null`, which
`assembleReport` already treats as "no AI" — every section renders its deterministic fallback. No
throw, no notice, no logging beyond a reason-only `console.warn` if the read errors.

`tests/data/pages-use-seam.test.ts` bans only `.from('church_members')` on member-facing pages
(verified by reading its assertions), so a direct `.from('reports')` here does not violate it.

**Local-environment note:** migrations `20260811000100_reports.sql` and
`20260811000200_rpc_save_report.sql` are committed but **not applied**. Until Natalie applies them,
this read returns an error locally and every section renders fallback. That is designed behaviour,
not a bug — and it means the fallback path is what gets exercised in local smoke testing.

---

## 6. Themes and S8

`facts.themes` is model output that cannot be re-derived from responses, so S8 ("What leaders are
saying") is the one place a renderer reads model output back off the persisted row (**D-P4-1**).

Flow on the diagnosis page:

1. If the read seam returned a row **and** its `inputs_hash` matches `liveInputsHash`, take
   `persistedRow.facts.themes`.
2. **Schema-revalidate first** — the same posture `assembleReport` already applies to `sections`
   (`compose.ts:100-105`). A `reports` row outlives the code that wrote it and `facts` is untyped
   jsonb.
3. On success, rebuild facts: `buildFacts({ …same args…, themes })`.
4. On any failure — no row, stale hash, missing key, revalidation failure — use `baseFacts`
   unchanged. `facts.themes` is then `[]`, and `s8Bullets` (`fallback-sections.ts:106-120`) already
   falls through to the per-area voices list built from the keyless `reflections`. No new code
   path; the fallback already exists and already renders.

The share page passes **no themes and no reflections**, so `facts.themes` is `[]` *and*
`buildOutreachVoices` receives an empty array — S8's bullets are empty on the public surface by
construction.

**Migration comment:** `supabase/migrations/20260811000100_reports.sql:16-18` currently reads *"No
renderer reads it."* That is now false for `facts.themes`. The comment is amended in place to record
the narrowing: *no renderer reads derived **numbers** from `facts`; model output that cannot be
re-derived is read back, schema-revalidated first.* Comment-only edit to an unapplied migration —
no schema change, no new migration file.

---

## 7. The section renderer set

New file: **`app/app/[churchId]/diagnosis/report/sections.tsx`**, imported by both pages.

### 7.1 The uniform renderer

```tsx
function SectionBodyView({ body, bullets }: { body: string; bullets: string[] })
```

Renders the `{ body, bullets }` half of `SectionBody`. Used for all 13 sections on the share page
and for every `source: 'fallback'` section on the diagnosis page.

### 7.2 The seven AI renderers

One per AI section shape (`lib/ai/sections.ts:21-47`). There is no uniform AI shape — the S6Schema
narrowing in plan 3 made AI and fallback agree on beat **vocabulary only, not field-for-field** — so
the mapping is per-section and it is the substance of this plan.

| id | title (report.yaml) | AI shape | rendering |
|---|---|---|---|
| s2 | Executive summary | `summary`, `what_this_is_not`, `context_bullets[]` | two paragraphs, then the bullets |
| s4 | What the assessment revealed | `thesis_word`, `narrative` | thesis word as a lead-in, then the narrative |
| s5 | Organizational strengths | `strengths[]{category_id, heading, body}` | one sub-block per strength |
| s6 | Areas requiring investment | `areas[]{category_id, affirm, evidence, reframe}` | one sub-block per area, three beats in order |
| s7 | Lowest scoring indicators | `narrative`, `pattern_claim \| null` | narrative, then the pattern claim when non-null |
| s9 | Strategic diagnosis | `narrative`, `working_model` | narrative, then the working model |
| s12 | Final executive assessment | `assessment`, `overall_percent`, `tier_name`, `primary_objective` | assessment prose, then the three named facts |

**Each AI renderer takes `ai: unknown` and runs its own `Schema.safeParse` from
`SECTION_REGISTRY`, returning `<SectionBodyView>` with the section's fallback on failure.** This is
deliberate: it is the only path from `AssembledSection['ai']` (typed `unknown | null`) to a typed
value without a cast, it keeps each renderer independently testable, and it makes "never throws" a
structural property rather than a convention. The double validation — once in `assembleReport`,
once here — is free.

### 7.3 The dispatcher

```tsx
export function ReportSections({ sections }: { sections: AssembledSection[] })
```

Iterates `sections` **in array order and never re-sorts**. `assembleReport` already returns them in
`Object.keys(methodology.report.sections)` order, which is `report.yaml` order:
s1 · s2 · s3 · s4 · s5 · s6 · s7 · s8 · s9 · s10 · s11 · s12 · appendix.

For each section: `source === 'ai'` and an AI renderer exists for that id → that renderer;
otherwise `<SectionBodyView>`.

**The heading always comes from `section.fallback.title`**, which `fallbackSection`
(`fallback-sections.ts:319`) copies verbatim from `report.yaml`. AI renderers render body content
only and never emit their own heading. One title source, both branches.

**Heading levels:** the first section (s1) renders `<h1>`; every other section renders `<h2>`. This
is what preserves the single-`<h1>` document outline on both pages once `<CoverCard>` (today's
`<h1>` supplier) stops being rendered there. See §10.3.

The share page needs the same `AssembledSection[]` shape without touching the composer's AI path, so
`lib/report/compose.ts` gains one additive export:

```ts
export function assembleFallbackOnly(args: FallbackSectionArgs): AssembledSection[]
```

— `fallbackSections` mapped over the same `Object.keys(methodology.report.sections)` order, every
entry `{ source: 'fallback', ai: null }`. Additive only; no existing export changes. This keeps
section order owned by one place instead of two.

---

## 8. I9 — the cache-miss correction

`actions.ts:236-244` currently selects `id` and treats any matching row as a hit. A row written when
every AI section failed its gate is all-fallback, and treating it as a hit pins that report to
100% fallback forever.

Change the select to `section_sources` and treat a row whose `section_sources` contains no `'ai'`
value as a **MISS**, so the next generation attempt re-runs the model and the report self-heals.
No new UI, no migration.

---

## 9. Decisions resolved in this spec

### 9.1 `completedAt` for render-time `buildFacts`

`buildFacts` requires a `completedAt`. It feeds `facts.cover.completed_at`, which **is
user-visible**: `report.yaml:20-22` renders S1's body as `"{church_name} — assessed {completed_at},
{respondent_count} respondents."`, and `fallback-sections.ts:308` substitutes the literal
`'not yet completed'` when it is null.

It is **not** in the hash — `reportInputsHash` takes `profile`, never `cover` — so this choice
cannot affect the freshness check.

**Decision — diagnosis page: pass `run.completed_at`.** Add `completed_at` to the existing
`assessment_runs` select (`page.tsx:47-49`, already `id, status, methodology_version`). Rationale:
`new Date().toISOString()` would make the cover line print the page-load moment and change on every
reload, which is wrong for a line labelled "assessed". The run's own completion timestamp is what
that sentence means. This diverges from generation's `new Date().toISOString()` (`actions.ts:221`)
and that divergence is intentional and harmless — generation's value is persisted into
write-only-provenance `facts` and is never rendered by plan 4.

**Decision — share page: pass `null`.** No completion timestamp is reachable there without a
migration: `get_shared_report` returns only `valid, payload, church_name, brand_color`
(`20260718000600`), and `get_shared_run_responses` returns no timestamp column. **Consequence,
stated plainly: S1 on the public share page will read "assessed not yet completed".** The fix is one
added column on `get_shared_run_responses` — a migration, therefore out of plan 4's scope — and is
listed as a plan-5 follow-up. Flagged for Natalie: overrule at spec review if the public copy
matters more than holding the no-migration line.

### 9.2 Where `ChurchFacts` comes from

**Diagnosis page and `actions.ts`:** resolved in §4.3 — `loadChurchProfile` on both, one shared
`churchFactsFrom` mapper.

**Share page:** the anon client cannot read the `churches` profile columns, and `get_shared_report`
returns only `valid, payload, church_name, brand_color`. **Decision: build `ChurchFacts` with
`name: row.church_name` and every other field `null`**, via the same `churchFactsFrom(null,
row.church_name)` call. `facts.profile` is then `{}` — profile fields are *absent, not empty*
(locked decision 6), which the fallback templates already handle. The public report therefore
carries no profile calibration. This is a deliberate consequence of the surface's data access, not
a defect, and it needs no migration because the share page never computes an inputs hash.

### 9.3 `labelSource` on the share page — verify before shipping

`buildFacts` requires a `labelSource`, which the anonymity guard (`lib/report/anonymity.ts`,
`containsRespondentLabel`) uses to scan text for respondent names. On the share page,
`get_shared_run_responses` **redacts `respondent_label` to the empty string** by design.

**An empty string is a substring of every string.** A guard built from redacted labels is therefore
a fail-sentinel in one direction or the other: it either flags every field as containing a label,
or it silently guards nothing. Planning **must read `knownLabels` and `containsRespondentLabel` and
establish which**, then choose the safe construction — most likely `knownLabels` over the
non-empty labels only, or the explicit "unknown" `LabelSource` variant if one exists. Do not
copy the diagnosis page's `knownLabels(responses)` call onto the share page without checking.
This is called out rather than resolved because it turns on source I have not read.

### 9.4 Date formatting

Out of scope. `completed_at` renders as a raw ISO-8601 string on both surfaces, exactly as
`report.yaml`'s template interpolates it today. Formatting it is a copy change, not the structural
swap D-P4-3 authorises. Named here so it is a known, accepted output of plan 4 rather than a
surprise.

---

## 10. Testing

All new tests live in `tests/report/**`, which **is linted**.

### 10.1 New tests — three groups

**Group 1 — dispatcher (`tests/report/sections-dispatch.test.ts`)**
- Each of the seven AI shapes renders through its own renderer, not `SectionBodyView`.
- A `source: 'fallback'` section renders through `SectionBodyView`.
- A `source: 'ai'` section whose `ai` payload fails its schema falls back to `SectionBodyView`
  instead of throwing.
- All 13 sections render, in `report.yaml` order, with titles from `fallback.title`.
- Exactly one `<h1>`.
- Assertions that iterate ids must **collect and compare the whole set**, not assert inside the
  loop — an assertion inside a loop reports only the first failure.

**Group 2 — read seam + hash (`tests/report/inputs-hash-parity.test.ts`)**
- `reportInputs` called with generation's arguments and with the page's arguments, from the same
  fixture, produces the **same** `inputsHash`. This is the test that catches the drift §4 exists to
  prevent.
- `reflectionRowsFor` drops null/whitespace reflections, trims text, and keys on
  `respondent_user_id ?? respondent_label`.
- Stale `inputs_hash` → every section `source: 'fallback'`.
- `persisted = null` (read error / no row) → every section `source: 'fallback'`.
- `facts.themes` revalidation failure → S8 renders the voices list, not a crash.

**Group 3 — route wiring (`tests/report/route-sections-wiring.test.ts`)** — source-reading, in the
established style of the existing route tests.
- The share page does not contain `.from('reports')` and does not build a keyed reflections array.
- The share page passes no `themes` and no `reflections` into its facts/section calls.
- The diagnosis page's keyed sibling array reaches `reportInputs` and nothing else.
- Both `reportMethodology = derived.effectiveMethodology` assignments are still present, and their
  new consumers (`buildFacts`, `fallbackSections`/`assembleFallbackOnly`, `assembleReport`) receive
  `reportMethodology`, never the raw `methodology`.

### 10.2 Non-vacuity

Each group needs a mutation that proves it fails: change one AI renderer's id mapping; change one
component of the hash on one call site only; delete the share page's exclusion. **Verify a fix by
re-running its mutation, not by reading its diff**, and commit before mutating so `git checkout --`
is the safety net.

### 10.3 Existing source-reading tests that plan 4 invalidates

These read the two pages' source and assert on the *legacy* call shape. Verified by reading their
assertions this session:

| test | status | disposition |
|---|---|---|
| `tests/a11y/shared-report-heading.test.ts` | **BREAKS — proven** | Hard-asserts the share page renders `<CoverCard>` and sums its `<h1>`s. Re-point to `sections.tsx`: assert the page renders `<ReportSections` and that page + `sections.tsx` `<h1>`s sum to one. |
| `tests/report/route-call-ordering.test.ts` | **BREAKS — proven** | Requires `resolveReportView(` in all three routes with a lazy thunk. Neither page calls it after plan 4. Narrow the route list to the PDF route and add the plan-4 equivalent ordering guard (read seam resolved before `assembleReport`). |
| `tests/report/route-methodology-wiring.test.ts` | **BREAKS — proven** | Regex `resolveReportView\(\s*derived\s*,\s*(reportMethodology\|methodology)\s*,`. The assignment lines survive but this call does not. Re-point the two page rows at the new consumers; leave the PDF row alone. |
| `tests/report/route-reflections-wiring.test.ts` | **BREAKS — proven** | Locates the `resolveReportView` opts literal via `audience: 'screen'` / `'shared'`. Re-express against the new call sites, preserving the invariant it guards (screen passes reflections, shared never does). |
| `tests/report/route-rederive.test.ts` | **SURVIVES — proven** | Asserts `deriveDiagnosisForRun(`, the response RPC name, and the absence of `payload as Diagnosis`. All three stay true. |
| `tests/data/pages-use-seam.test.ts` | **SURVIVES — proven** | Requires `loadChurchForMember(` and bans `.from('church_members')`. Both hold; `loadChurchProfile` is additive. |
| `tests/report/booking-cta-shared.test.ts` | survives per §3.1 | `<BookingCta>` stays on the share page. Confirm during planning. |
| `tests/outreach/shared-exclusion.test.ts` · `tests/report/audience-parity.test.ts` · `tests/a11y/live-regions-applied.test.ts` · `tests/dashboard/results-admin-only.test.ts` · `tests/report/components.test.ts` · `tests/report/stale-payload.test.ts` · `tests/report/copy-relocation.test.ts` | **unverified** | Each reads one of the two pages or a component plan 4 stops rendering. Read each one's assertions during planning and give it an explicit disposition — do not assume. |

Re-pointing a source-reading test is not the same as weakening it. Each rewrite must keep the
invariant the original guarded and must be proven by re-running the original's mutation against the
new assertion.

---

## 11. Error handling

Layered degradation, no throws, at every step:

| failure | result |
|---|---|
| `reports` read errors / no row | `persisted = null` → all sections fallback |
| `inputs_hash` mismatch | all sections fallback (already in `assembleReport`) |
| malformed `sections` jsonb | that section falls back (already in `assembleReport`) |
| `facts.themes` malformed or absent | no themes → S8 renders the per-area voices list |
| an AI payload fails its schema at render | that section renders `<SectionBodyView>` (§7.2) |
| run not scoreable | existing `StaleMethodologyNotice` / `SharedStaleMethodologyNotice` branches, unchanged |

Logging is reasons-only — never payloads, church data, or respondent data.

---

## 12. Gates and guardrails

- `npx tsc --noEmit` → 0 · `npx vitest run` → baseline **179 files / 1168 tests / 0 failures** ·
  `npx eslint` → 0.
- **eslint is a real gate for plan 4.** `globalIgnores` covers `lib/ai/**`, `lib/engine/**`,
  `lib/methodology/**`, `supabase/**`, `methodology/**`, `docs/**` and their test dirs — but
  `app/**`, `lib/report/**` and `tests/report/**` are linted, and that is where plan 4 lands.
- A green vitest proves nothing about tsc. Run all three.
- No new dependencies. No methodology version bump. zod stays pinned `3.25.76`, imported from
  `zod/v4`.
- The controller commits by explicit path and runs the gates itself; implementers run no git and no
  database command. Bracket paths need `GIT_LITERAL_PATHSPECS=1` and quoting.
- Never merge, push, or force-push without Natalie. Never `npm run test:db`, `supabase db
  push|reset|start`, or `psql`.

---

## 13. Files touched

| file | change |
|---|---|
| `lib/report/inputs-hash.ts` | **new** — `ReflectionSourceRow`, `reflectionRowsFor`, `churchFactsFrom`, `reportInputs` |
| `app/app/[churchId]/diagnosis/report/sections.tsx` | **new** — `SectionBodyView`, 7 AI renderers, `ReportSections` |
| `app/app/[churchId]/diagnosis/page.tsx` | profile read · read seam · hash · themes · `<ReportSections>` · controls relocated |
| `app/r/[shareToken]/page.tsx` | `buildFacts` → `assembleFallbackOnly` → `<ReportSections>` · `<BookingCta>` retained |
| `app/app/[churchId]/actions.ts` | I9 cache-miss select · `reportInputs` extraction · `loadChurchProfile` |
| `lib/report/compose.ts` | additive `assembleFallbackOnly` export |
| `supabase/migrations/20260811000100_reports.sql` | comment-only amendment at lines 16-18 |
| `tests/report/**` (3 new files) · 4 re-pointed source-reading tests | §10 |

Untouched by plan 4 — it deletes nothing: `lib/report/view.ts`,
`app/app/[churchId]/diagnosis/report/{shared,cover,chain,system,dossier}.tsx`,
`lib/report/report-hash.ts`, `lib/report/fallback-sections.ts`, `lib/report/facts.ts`.

⚠️ **CORRECTION.** This line previously read *"Untouched and still live for the PDF route."* It is the
§2 error restated — see the correction there. **"Untouched by plan 4" is not "rendered by the PDF
route."** Of the files listed, the PDF route imports **only `lib/report/view.ts`**, and only for
`resolveScoreability`. The five `.tsx` files are DOM components and **no PDF path has ever rendered
them**; `fallback-sections.ts` is reached from the web renderer (`sections.tsx`), and
`report-hash.ts` only via `lib/report/inputs-hash.ts`.
