# Final Report Redesign — Design

**Date:** 2026-08-10 · **Branch:** `feat/final-report-redesign` (off `master` @ `8198411`, post-OpenAI-migration)
**Design input:** `~/Desktop/XPG Final Report — Deconstruction & Rebuild Blueprint.md` (PCC report deconstruction). Status: DRAFT — awaiting Natalie's review.

## Goal

Replace the 10-block diagnosis page with a consultant-grade 12-section executive report (the PCC formula), composed per-section by GPT from a deterministic facts pack, with short-answer reflections clustered into themes that feed the report. Web-first + PDF from one composed report. The ToC engine remains the diagnosis brain; GPT never decides a finding.

## Locked decisions (from brainstorming, 2026-08-10 — do not reopen)

1. **Auto-publish, self-serve.** Archetype engine + extended fact-check gates are the only reviewer. No draft/review workflow.
2. **Replace + absorb.** The executive report becomes THE diagnosis surface. The current 10 blocks become per-section deterministic fallbacks; dossier gold (blind spots, dispersion, benchmarks, dependency reads, voices) is absorbed into report sections.
3. **All three archetypes ship v1** on one shared 12-section skeleton: **Capacity** (no constraint, no gates), **Constraint** (broken stage; carries "do not work on"), **Foundation** (no broken stage, enabler(s) gated). The engine picks — never GPT.
4. **Web-first + PDF export** from one composed report; extend `lib/report/pdf`, keep the fail-closed anonymity guard (`lib/report/pdf/render.ts:28`).
5. **Reflections anonymity: k=3 + gated verbatims.** A theme prints only with ≥3 distinct supporting respondents. Anonymous substring-verified verbatims only when the respondent pool ≥8; below that, paraphrase-only.
6. **Church-profile intake = optional owner settings form** (incl. consultant-notes). Report calibrates with whatever exists; omits gracefully when empty.

## Proposed decisions (new in this spec — Natalie can veto at review)

| # | Proposal | Rationale |
|---|---|---|
| P1 | **Tier table** on `Diagnosis.capacity` (already the 8-area mean — fractional, so bands are half-open on lower bounds): ≥85 **Healthy & Ready** · ≥70 **Healthy but Stretched** · ≥55 **Strained** · <55 **At Risk** (e.g. 84.6 → Stretched). Tier is a dashboard/register label only; it never selects the archetype. | Averages = dashboard layer; ToC engine stays the diagnosis brain. "At Risk" is honest without shaming. |
| P2 | **Item `theme` tags** in `questions.yaml`: required field `theme: systems \| culture \| theology \| relational` on all 50 items. **No methodology version bump** — tags are annotation (no scoring/`since` semantics), so `response_hash` and run staleness are untouched. Report-level staleness is covered instead by folding the canonical item→theme map into the report `inputsHash` (see `report-hash.ts`): a re-tag regenerates reports without staling runs. | Makes the "none of these are theological" pattern read computable. A bump would falsely stale every existing run. |
| P3 | **Verbatim pool n = distinct reflection-*writing* respondents ≥8** (stricter than "run respondents ≥8"). | If only 2 people wrote reflections, a verbatim identifies among 2 even if 30 answered numerically. |
| P4 | **Roadmap (S10) + Partner (S11) are fully deterministic in v1** — action-library text verbatim, selection keyed by archetype/primary/gated enablers/bottom items. GPT rewording of bullets is a later enhancement. | Every bullet must trace to a diagnosed weakness; deterministic selection makes that a property, not a hope. |
| P5 | **Share page (`/r/[token]`) renders the deterministic skeleton only** — no AI sections, no themes, no verbatims (parity with today's no-AI-prose-no-reflections share behavior). | Avoids building a second sanitization surface in v1. |
| P6 | **Cover shows respondent count only** (no roles line à la PCC "Lead Pastors, Staff, Elders") — ministry roles are not collected; `church_members.role` is a permission, not a title. | Honest v1 scope; `consultant_notes` can carry it manually. |
| P7 | Tier thresholds live in `rules.yaml` (`tiers:` block); section/archetype templates + action library live in a new **`methodology/report.yaml`** with its own `version` that feeds the report cache key. | Keeps rules = semantics, report.yaml = presentation, copy.yaml untouched for fallback compatibility. |

## Approaches considered

- **A — One big schema** (extend today's single `responses.parse` call to all 12 sections). Rejected: gpt-5.1 bills reasoning against `max_output_tokens` (the `status:'incomplete'` trap), a 12-section strict schema routinely blows the budget; gating is all-or-nothing so one bad number degrades the entire report to fallback.
- **B — Deterministic spine + per-section composition** ✅ **CHOSEN.** Compute everything decidable first (tier, archetype, facts pack, clustered themes), then ~7 small parallel GPT calls, each with its own Zod schema, section-scoped gate, and deterministic fallback. Failure isolates per section; small schemas are reliable; latency ≈ one call (parallel). Cost ≈ 8 calls/report, generated once per church and cached — negligible.
- **C — Fully deterministic + reword-only polish** (today's contract generalized). Rejected as the primary mechanism: the micro-template beats (affirm → pivot → evidence → not-statement → reframe → trajectory) need composition from facts, not rewording of fixed sentences; template authoring explodes across archetype × tier × area. Retained where composition adds nothing (dashboard one-liners reuse `copy.yaml` band templates).

## Architecture

### Generation-time flow (extends `generateDiagnosis` in `app/app/[churchId]/actions.ts`)

```
responses (+reflections) ─▶ deriveDiagnosisForRun ─▶ save_diagnosis  (unchanged, commits first)
                                   │
                                   ▼
                       tier + archetype (pure, engine-side)
                                   │
              reflections ─▶ GPT task 1: theme clustering ─▶ gated themes
                                   │
                                   ▶ FACTS PACK (every number originates here)
                                   │
                    7 parallel GPT section calls (Promise.allSettled)
                                   │
                       per-section extended fact-check gates
                                   │
                 save_report RPC → reports table (sections + facts + provenance)
```

Wrapped in try/catch exactly like today's prose block: no AI/DB failure may break the committed diagnosis. Gated by `PROSE_MODE !== 'fallback'`; cache-check on `(run_id, inputs_hash)` before composing.

### Render-time flow (all surfaces)

Re-derive diagnosis from responses per request (CT-2(c) preserved). Build facts pack live. For each section: if a persisted AI section exists **and** its `inputs_hash` matches the live inputs hash, render it; else render the deterministic fallback live. Deterministic sections are always computed live (like `fallbackProse` today). S8 is the one hybrid: its *layout* is deterministic but its *data* (clustered themes) is persisted AI output, so it hash-matches like an AI section and falls back to the per-area voices lists when stale or absent. Surfaces: diagnosis page (screen), PDF route (pdf), share page (shared → deterministic only, P5).

### New/changed modules

| Module | Role |
|---|---|
| `lib/report/tier.ts` | `tierFor(capacity): {id, name}` from `rules.yaml tiers`; `archetypeFor(d): 'capacity'\|'constraint'\|'foundation'` — pure: constraint if `primary_constraint` non-null; foundation if null + `gating_conditions.length > 0`; else capacity. |
| `lib/report/facts.ts` | Builds the **facts pack**: cover (church, completed_at, distinct respondent count), categories sorted desc, overall+tier, archetype, bottom-6 item means (value×10, tie-break by item id) with statement text + theme tags, computed pattern-read counts, gated themes, profile subset (non-null fields only), blind spots, dispersion flags, benchmark percentiles, dependency reads, gating, generosity mode, confidence + caveats. Item means computed here from responses. |
| `lib/ai/themes.ts` | **GPT task: reflection clustering.** Input: `{index, item_id, text}` rows, ordered by (item_id, lexicographic text), opaque indices `r1..rN`; server keeps index→respondent map. Output schema: `themes[]{label, gloss, support_indices, item_ids}`, `affection_theme` nullable, optional `verbatim_candidates[]` per theme. Same call config as `prose.ts` (responses.parse, `zodTextFormat`, `OPENAI_MODEL_PROSE`, effort low, timeout 30s, maxRetries 0), `max_output_tokens` 6000. |
| `lib/ai/theme-gates.ts` | Theme gates: k≥3 distinct respondents per theme (server-computed from indices, never trusted from the model); verbatim must be an exact substring of a source reflection, ≤200 chars, printed only when distinct reflection-writers ≥8 (P3); no respondent label (full-name match against ALL run respondents' labels, not just disagreement flags) in any label/gloss/verbatim; `item_ids` must exist in the effective methodology; failing themes are dropped individually; task failure → fallback = existing per-area voices lists. |
| `lib/ai/sections.ts` | **GPT task: per-section composition** for S2, S4, S5, S6, S7-narrative, S9, S12. Each call: shared style-spine header (style DNA from blueprint §2 + tier name, archetype, thesis word, primary name, overall %) + that section's facts slice + that section's template from `report.yaml` + small per-section Zod schema. Verbatim quotes are NEVER embedded in composed prose — they stay structured fields so renderers gate them by audience. Likewise on the *input* side: section-call facts slices carry theme labels/glosses/support counts only, never verbatim text (verbatims flow facts → S8 renderer exclusively), so the rewritten ai-exclusion contract holds — raw reflection text reaches only `lib/ai/themes.ts`. |
| `lib/ai/section-gates.ts` | Per-section gates (all must pass, else that section falls back): (1) field parity vs schema expectation; (2) numeric containment vs that section's facts slice (scoped, like today's per-field check); (3) required/banned mentions — S2 must contain the tier name; Constraint S2/S4 must contain the primary category display name; banned phrases are a curated per-archetype list in `report.yaml` (`banned_phrases`) capturing the other archetypes' thesis *framings* (e.g. Capacity's "healthy and ready to grow" framing banned in a Constraint report) — single generic words and stage names are never banned (shared vocabulary; would false-positive); capacity-consolation phrasing banned when tier < 70 (P1 register calibration); (4) anonymity — no respondent label anywhere; (5) S7 pattern-claim consistency — "none are theological/cultural" style claims permitted only when the computed bottom-6 theme counts make them true; (6) length ceilings per section. Every failure logs `[report] section <id>: <reason>` — the broken ≠ off invariant carries over verbatim (log reasons only, never content). |
| `lib/report/fallback-sections.ts` | Deterministic per-section fallbacks composed from the facts pack + `report.yaml` templates + absorbed `copy.yaml` blocks. Mapping of the old 10 blocks: verdict→S2/S4 · evidence→S4/S7 · cost + do_not_work_on→S9/S10 (Constraint) · next_step→S11 · gating→S6/S9 (Foundation) · dispersion→S6 area beat · blind_spot→S6 "watch for" beats · benchmark_note + dependency_note→appendix. Dossier-layer computations (insideIt, agreement, position, dependsOn, watchFor from `view.ts`) feed S5/S6 evidence beats. |
| `lib/report/compose.ts` | Orchestrates: facts → clustering → parallel sections → gates → assembled `ExecutiveReport {sections, sources}`; also the render-time assembler (persisted-or-fallback per section). |
| `lib/report/report-hash.ts` | `inputsHash = sha256(methodology_version \| response_hash \| canonical item→theme tag map \| canonical reflections (item_id, respondent key, text) \| canonical profile fields \| report.yaml version)`. Reflections, profile, and theme tags are deliberately IN this hash (all three are excluded from `response_hash`), so any of them changing regenerates the report without staling the run (P2). |

### The 12-section skeleton (+ appendix)

| # | Section | Composer | Key gate notes |
|---|---|---|---|
| S1 | Cover | deterministic | count only (P6) |
| S2 | Executive Summary | **GPT** | tier name required; "what this is NOT" beat; profile context bullets omitted gracefully when empty |
| S3 | Health Dashboard | deterministic | 8 areas sorted desc, overall %, tier name, one-line reads from `copy.yaml` band templates, benchmark percentile column |
| S4 | What the Assessment Revealed | **GPT** | one-word thesis = archetype's (Capacity / the primary stage's name / Foundation) |
| S5 | Organizational Strengths (top 3) | **GPT** | one call, array schema; "XPG Assessment:" stamp per area |
| S6 | Areas Requiring Investment (rest) | **GPT** | micro-template beats per area (affirm → pivot → evidence → not-statement → reframe → trajectory); absorbs per-area blind spot + dispersion; `max_output_tokens` 8000 for this call |
| S7 | Lowest Scoring Indicators | table deterministic + **GPT** narrative | pattern-claim gate (5) |
| S8 | What Leaders Are Saying | deterministic layout over clustered themes | k=3/n≥8 gates; affection theme last if present; verbatims structured + audience-gated |
| S9 | Strategic Diagnosis (lifecycle) | **GPT** | archetype template; dependency reads as the working-model chain |
| S10 | 30/60/90 Roadmap | deterministic (P4) | action library keyed to diagnosis; Constraint variant carries "do not work on" |
| S11 | Where XPG Can Partner | deterministic (P4) | months mirror S10 phases 1:1; `offers.yaml` hook preserved |
| S12 | Final Executive Assessment | **GPT** | three bolded facts: overall %, tier/stage, primary objective |
| A | Methodology & Caveats appendix | deterministic | absorbs current appendix: benchmark provenance, dependency note, confidence band, small-n caveats |

## Data model & schema changes

- **`churches`** — already the profile table (8 nullable columns + unused admin `churches_update` RLS policy). New migration adds 4 nullable columns: `campuses_band text`, `facility_status text` (owned/rented/portable/mixed), `leadership_history text`, `consultant_notes text`. `create_church_with_admin` signature is **untouched** — new fields are post-creation settings only (avoids the 12-arg drop/recreate).
- **`reports`** (new table, copy the `diagnoses` pattern): `id uuid pk`, `run_id fk`, **`church_id fk` denormalized** (lesson from the diagnoses cross-church cache-collision bug), `inputs_hash text`, `methodology_version`, `archetype` check in ('capacity','constraint','foundation'), `tier`, `facts jsonb`, `sections jsonb`, `section_sources jsonb` (per-section 'ai'|'fallback'), `generated_at`, `unique(run_id, inputs_hash)`. RLS: admin-only select (inline idiom, no helper); writes via `save_report` security-definer RPC gated by `require_church_admin`; no base-table insert grant. Return-shape discipline: `drop function if exists` + recreate, re-grant.
- **`methodology/questions.yaml`** — `theme` on all 50 items (P2, no version bump). `ItemSchema` in `lib/methodology/schema.ts` gains required `theme: z.enum([...])` (Zod silently drops unregistered keys — schema and YAML land in the same commit). Tagging rubric: *systems* = process/structure/tooling/coordination; *culture* = trust/unity/atmosphere; *theology* = doctrine/gospel-clarity; *relational* = personal connection/care. The 10 reflection items are expected to tag mostly systems/relational; full 50-item table is an implementation task with Natalie's spot-check.
- **`methodology/rules.yaml`** — new `tiers:` block (P1). **`methodology/report.yaml`** (new) — section templates per archetype, style-spine constants, action library (actions keyed by category/enabler/generosity with phase align|build|scale), own `version`. Schema additions in `lib/methodology/schema.ts` with named keys (load-time failure on missing bands, matching `copy.yaml` discipline).
- **Settings surface** — new `app/app/[churchId]/settings/page.tsx` (admin-gated, `notFound()` for viewers like `access/`), client form forked from `app/get-started/form.tsx` (useActionState pattern), server action through a `lib/data/churches.ts` update seam (ADR 0002) using the existing `churches_update` RLS policy — no new RPC.

## Anonymity model (complete)

1. Clustering input: opaque indices; no labels travel to the model (labels inside reflection *text* itself are the residual risk — mitigated by output gates + k/n thresholds + admin-only audience).
2. Output gates: no respondent label in any theme label/gloss/verbatim (full label list of run respondents); k≥3 per theme; verbatims only at n≥8 reflection-writers, substring-verified, ≤200 chars.
3. Verbatims are structured fields, never embedded in prose → renderer strips by audience; share audience never receives themes at all (P5).
4. PDF fail-closed guard stays and gains one assertion: sections passed to `renderReportDocument` must carry no respondent labels (same fields as today plus the themes structure).
5. `save_report` persists only gated output; logging stays reasons-only.

## Error handling

- `composeReport` never throws; every AI failure path logs a distinct `[report] section <id>: <reason>` (incomplete / no parse / gate name / request failed) — distinguishable from `PROSE_MODE` off (no log).
- Any section failure → that section's deterministic fallback; report always renders complete.
- Whole compose+save wrapped in try/catch after `save_diagnosis`; stale `inputs_hash` at render → fallback, never a stale AI section.

## Testing

- Unit: tier/archetype selector; facts pack (item means, bottom-6 ties, pattern counts); every section gate (accept + reject fixtures); theme gates (k, n, substring, label ban, bad item_id).
- Golden fixtures per archetype: healthy-church → Capacity (PCC-shaped); broken-conn → Constraint; gates-only → Foundation. Assert archetype-consistency gates (capacity language never survives a broken stage).
- **Rewrite `tests/outreach/ai-exclusion.test.ts` deliberately**: the boundary moves from "reflections never reach `lib/ai/**`" to "reflections reach only `lib/ai/themes.ts`; section-composer inputs are the facts pack only; no respondent label in any AI input construction". This is a contract change, not a regression.
- Extend route-ordering / audience-parity / pdf tripwire tests to the new skeleton. pgTAP for `reports` + `save_report` (owner-run only).

## Out of scope (v1)

Multi-run reports; a regenerate button beyond the existing stale-notice path; themes/verbatims on the share page; respondent-role capture; observed (non-prior) benchmarks; GPT-reworded roadmap bullets; email/notification on publish.

## Implementation decomposition (PROPOSED — Natalie decides)

One spec (this document), **five sequential implementation plans / PRs**:

1. **Foundations** — theme tags + schema, tier/archetype module, facts pack, `churches` profile columns migration, settings form. No AI.
2. **Clustering** — `lib/ai/themes.ts` + gates + ai-exclusion contract rewrite.
3. **Composer** — `report.yaml`, section calls, gates, fallbacks, `reports` table + `save_report`, generation wiring.
4. **Web swap** — 12-section components replace the 10-block page; share page onto the deterministic skeleton.
5. **PDF** — extend `pdf/document.tsx` to the skeleton; guard extension.

Each plan lands independently shippable (1–3 are invisible to users until 4).

## Open questions for review

- P1–P7 above, especially: "At Risk" as the <55 tier name; no version bump for theme tags (P2); the stricter n≥8 pool (P3); deterministic S10/S11 (P4); share-page policy (P5).
- Action-library authoring: implementation drafts, Natalie reviews all copy before merge — acceptable?
- Five plans vs fewer: comfortable with the sequencing above?
