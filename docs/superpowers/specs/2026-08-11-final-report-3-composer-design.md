# Final Report Redesign — Plan 3 (Composer) Design Addendum

**Date:** 2026-08-11 · **Branch:** `feat/final-report-3-composer` (off `master` @ `a8e0086`)
**Parent spec:** `docs/superpowers/specs/2026-08-10-final-report-redesign-design.md` — this document does
not replace it. It settles what that spec left open for implementation decomposition item 3
("Composer — `report.yaml`, section calls, gates, fallbacks, `reports` table + `save_report`,
generation wiring") and records two anonymity requirements inherited from plan 2's final review.

Plans 1 (Foundations) and 2 (Clustering) are shipped and merged — PR #56, PR #57. Baseline on
`master`: `tsc --noEmit` exit 0, vitest 1027 tests / 171 files / 0 failures.

Nothing in the parent spec's locked decisions 1–6 or proposals P1–P7 is reopened here.

## Decisions settled in this brainstorm

| # | Decision |
|---|---|
| C1 | `buildFacts` takes an explicit `LabelSource` discriminated union. `{kind:'redacted'}` **omits** the guarded profile fields rather than guarding them. |
| C2 | One immediate re-attempt of failed AI sections inside the generation window, then persist. |
| C3 | Partial reports persist, with `section_sources` recording `'ai' \| 'fallback'` per section. |
| C4 | `save_report(p_church_id uuid, p_inputs_hash text, p_methodology_version text, p_payload jsonb)` — 4 args, mirroring `save_diagnosis`. |
| C5 | `facts jsonb` is persisted **write-only**, as generation-time provenance. No renderer reads it. |
| C6 | `report.yaml` carries copy only; the section registry (Zod schemas, facts-slice selectors, token budgets) lives in TypeScript. Plan 3 builds both halves of `compose.ts` but wires only the generation half. |

## 1. Anonymity

### 1.1 The label contract (inherited requirement 1)

`lib/report/facts.ts:167` derives respondent labels internally from `responses`. The share RPC
(`supabase/migrations/20260728000400_rpc_get_shared_run_responses.sql:48`) emits
`''::text as respondent_label`, and `respondentLabels()` drops blanks, so share-path rows yield
`labels = []` and the profile guard becomes a silent no-op on the only surface a public link
reaches. It is inert today only because `buildFacts` has no production caller; plan 3's generation
wiring ends that.

Closed structurally rather than by documentation:

```ts
// lib/report/anonymity.ts
export type LabelSource = { kind: 'known'; labels: string[] } | { kind: 'redacted' };
export function knownLabels(rows: ReadonlyArray<{ respondent_label: string }>): LabelSource;
```

`buildFacts` and `clusterThemes` both take a `LabelSource` — one concept, tested once.
`respondentLabels()` survives as the primitive behind `knownLabels` and keeps its caller-precondition
comment, but ceases to be what callers reach for.

On `{kind:'redacted'}`, `buildFacts` omits every guarded profile field outright. There is then no code
path that yields an unguarded pack from redacted rows: reintroducing the no-op requires deleting a
union arm, which the compiler reports.

### 1.2 Narrowing the guard (inherited requirement 2)

The guard currently covers all 12 `PROFILE_KEYS`. It narrows to the **8 free-text** keys:
`denomination`; the five `BAND_TEXT_FIELDS` (`adults_band`, `staff_fte_band`, `budget_band`,
`church_age_band`, `campuses_band`); and the two textareas `leadership_history`, `consultant_notes`.

The **4 closed-vocabulary selects** become unguarded: `context` (`settings-form.tsx:64`),
`attendance_band` (`:76`), `growth_trajectory` (`:107`), `facility_status` (`:123`). These hold
`<select>` option values, never admin prose, so a label that happens to be a substring of an option
value can only ever be a false positive — today a respondent named 'Li' silently costs
`growth_trajectory: 'declining'`.

`tests/report/facts.test.ts` restores `'plateaued'` in place of the synthetic `'holding'`. That
restoration is the proof the narrowing landed, not a cosmetic edit.

### 1.3 The share path can never hash-match (asserted, not assumed)

`lib/report/response-hash.ts` serializes `respondent_label` into the hash. The share path receives
those labels redacted to `''`, so it computes a **different** `response_hash` for identical answers,
so any `inputs_hash` derived from it can never match a persisted report. Under P5 (share renders the
deterministic skeleton only) that is the correct outcome. Plan 3 asserts it as a property so plan 4
inherits a proven fact rather than rediscovering a coincidence.

### 1.4 PDF guard

The fail-closed guard at `lib/report/pdf/render.ts:28` stays. Its extension to the new sections
structure belongs to plan 5; plan 3 changes nothing there.

## 2. Generation flow

`app/app/[churchId]/actions.ts` gains a **second** best-effort block after the existing M5b prose
block. The prose block stays: the 10-block diagnosis page is still live until plan 4, and removing
its input would regress a shipped surface. The two blocks are wrapped separately so neither can
break the other or the committed diagnosis.

```
save_diagnosis                                  ← unchanged, commits first
  │
  │  gated by PROSE_MODE !== 'fallback' (same gate as the prose block)
  ├─ inputsHash = reportInputsHash(...)          ← INPUTS only; clustered themes are output
  ├─ cache-check `reports` on (run.id, inputsHash) → row present ⇒ skip entirely
  ├─ reflection rows: respondent_key = respondent_user_id ?? respondent_label
  ├─ clusterThemes(rows, effectiveMethodology, knownLabels(responses))
  ├─ buildFacts({ ..., labelSource, themes })
  ├─ 7 parallel section calls (Promise.allSettled) → gates
  │     └─ one re-attempt of ONLY the failed sections → gates
  └─ save_report
```

`inputsHash` is computed before the cache check and covers inputs only, so clustered themes — which
are model output — never participate in the key that decides whether to call the model.

**`respondent_id` → `respondent_key`.** The wiring site maps `Response.respondent_id`
(`respondent_user_id ?? respondent_label`, the stable identity) onto `ReflectionRow.respondent_key`.
Never `respondent_label`, which is display-only and can collide across two people; counting on labels
would undercount and weaken the k≥3 gate.

**`clusterThemes`' two return values get their distinct meanings wired.** Plan 2 returned a union
specifically so plan 3 could tell these apart:

- **`null`** — the task failed. One re-attempt; if it fails again, S8 falls back to
  `buildOutreachVoices`' per-area voices lists and no themes are persisted.
- **`[]`** — determinate: the model answered and nothing survived the gates. Persist as-is, no
  re-attempt; retrying would produce the same verdict.

The two render identically and are treated oppositely by the cache. `clusterThemes` also gives no
signal when its `labels` input is empty, which is why the wiring site passes a `LabelSource` — an
empty list must be a deliberate `{kind:'known', labels: []}`, not an accident.

**Retry policy (C2).** One re-attempt of failed sections only. Gate failures are retried alongside
call failures: the model is nondeterministic, so a re-roll is a genuine fix, not a hope. Worst case
2× calls; typical case 1×. Because `generateDiagnosis` is effectively one-shot per church
(`save_diagnosis` completes the run, and `get_run_responses` filters `in_progress` — documented at
`actions.ts:135`), this bounded retry is the only defence against a transient blip permanently
pinning sections to fallback.

## 3. Modules

| Module | Role |
|---|---|
| `lib/ai/sections.ts` | The 7 AI section calls (S2, S4, S5, S6, S7-narrative, S9, S12) driven by a typed registry: id → Zod schema, facts-slice selector, `max_output_tokens` (8000 for S6, 4000 otherwise). Same call config as `prose.ts`. |
| `lib/ai/section-gates.ts` | The 6 gate families from the parent spec: field parity, scoped numeric containment, required/banned mentions, anonymity, S7 pattern-claim consistency, length ceilings. |
| `lib/report/fallback-sections.ts` | Deterministic per-section fallbacks from the facts pack + `report.yaml`, absorbing the old 10 blocks per the parent spec's mapping. |
| `lib/report/report-hash.ts` | `inputsHash` per the parent spec's recipe. |
| `lib/report/compose.ts` | Generation orchestrator **and** the render-time persisted-or-fallback assembler. |
| `methodology/report.yaml` | `version`, `style_spine`, `sections[id]{title, template per archetype, length_ceiling, required_mentions}`, `banned_phrases` per archetype, `action_library`. Validated by a named-key Zod schema in `lib/methodology/schema.ts`, load-time failure on missing keys, matching `copy.yaml` discipline. |

**Registry in TS, copy in YAML (C6).** Anything a compiler must check — Zod schemas, facts-slice
selectors, token budgets, which sections are AI — stays in `lib/ai/sections.ts`. Natalie edits copy
without a code change; a section cannot be declared AI in one file with no schema in the other.

**Persisted sections are re-validated at render.** A `reports` row outlives the code that wrote it and
`sections` is untyped jsonb, so the assembler parses each persisted section against its current Zod
schema. A shape mismatch is that section's fallback, never a crash. This rule is new here; the parent
spec does not state it.

**ai-exclusion contract.** `tests/outreach/ai-exclusion.test.ts`'s `ALLOWED` list gains
`lib/ai/sections.ts` and `lib/ai/section-gates.ts` as **flat relative paths** — the matcher compares
the relative path, so a nested path cannot inherit the exemption. Section-call inputs are the facts
pack only; verbatim text never enters a section prompt, and raw reflection text still reaches only
`lib/ai/themes.ts`.

`lib/ai/**` and `tests/ai/**` are under `eslint.config.mjs:12` globalIgnores. Lint proves nothing
there; `tsc --noEmit` and vitest are the gates.

## 4. Data model

`reports` per the parent spec, plus C3 and C5: `id uuid pk`, `run_id fk`, `church_id fk`
(denormalized — the diagnoses cross-church cache-collision lesson), `inputs_hash text`,
`methodology_version`, `archetype` check in ('capacity','constraint','foundation'), `tier`,
`facts jsonb`, `sections jsonb`, `section_sources jsonb`, `generated_at`,
`unique(run_id, inputs_hash)`.

`facts` is write-only provenance (C5): it is the exact input the gates judged against, so a report
that reads wrong is diagnosable after the fact. It is also where the gated themes live. A test pins
that no renderer reads it — rendering from it would break CT-2(c), the invariant that every surface
re-derives the diagnosis from responses per request.

`save_report` (C4) is `security definer`, resolves its own run from `p_church_id` the way
`save_diagnosis` does, and reads `archetype`, `tier`, `facts`, `sections`, `section_sources` out of
`p_payload` into their own columns — so the columns stay queryable and constrained while the
signature never has to change when a section is added.

⚠️ `require_church_admin` takes a **run id**, not a church id
(`supabase/migrations/20260718000300_rpc_report_share_manage.sql:9`). `save_report` therefore
resolves the run first, then calls `require_church_admin(v_run_id)`.

RLS: admin-only select via the inline idiom (no helper), no base-table insert grant, writes only
through the RPC. Return-shape discipline: `drop function if exists` + recreate + re-grant.

pgTAP covers table and columns, `unique(run_id, inputs_hash)`, the archetype check constraint, RLS
enabled and the policy shape, the function existing as security-definer with the right grants, and a
non-admin write being denied.

⛔ **Natalie applies migrations.** The agent never runs `npm run test:db`, `supabase db push`, or
`supabase db reset`.

## 5. Error handling

`composeReport` never throws. Every AI failure path logs a distinct `[report] section <id>: <reason>`
(incomplete / no parse / gate name / request failed), keeping "AI is broken" distinguishable from
"AI is off", which logs nothing. Reasons only — never payloads, parsed output, section text,
verbatims, or error objects.

Any section failure ⇒ that section's deterministic fallback; the report always renders complete. A
stale or absent `inputs_hash` at render ⇒ fallback, never a stale AI section. The whole compose+save
block sits after `save_diagnosis` in its own try/catch, so no AI or DB failure can affect the
committed diagnosis or the redirect.

## 6. Testing

From the parent spec (lines ~120–124): every section gate with accept **and** reject fixtures; theme
gates; golden fixtures per archetype (healthy-church → Capacity, broken-conn → Constraint, gates-only
→ Foundation) asserting archetype-consistency — capacity language must never survive a broken stage;
extension of the route-ordering, audience-parity and PDF tripwire tests to the new skeleton; pgTAP
for `reports` + `save_report`.

Added by this addendum:

- `{kind:'redacted'}` drops the 8 free-text profile fields and keeps the 4 closed-vocabulary ones.
- The 4 closed-vocabulary keys survive a colliding respondent label; `facts.test.ts` restores `'plateaued'`.
- `null` and `[]` from `clusterThemes` take different cache paths (re-attempt vs persist).
- A partial report row renders complete, with `section_sources` reporting the mix.
- A malformed persisted section falls back rather than crashing.
- The share path's `inputs_hash` provably cannot match a persisted report (§1.3).
- Each new guard's tripwire proven to bite, one mutation at a time, restoring exactly.

## 7. Scope

**In:** everything above. Plan 3 ships the render-time assembler fully unit-tested against golden
fixtures, but **no page consumes it** — plan 4 does the swap. Nothing user-visible ships.

**Out (v1, per the parent spec):** multi-run reports; a regenerate button beyond the stale-notice
path; themes/verbatims on the share page; respondent-role capture; observed benchmarks; GPT-reworded
roadmap bullets; publish notifications. Also out of plan 3 specifically: the 12-section components
and share-page swap (plan 4), and the PDF skeleton extension and guard extension (plan 5).

No new dependencies. No methodology version bumps — `questions.yaml` stays `0.3.0`, `rules.yaml`
stays `0.2.0`; `report.yaml` carries its own new `version`. zod stays pinned `3.25.76`.
