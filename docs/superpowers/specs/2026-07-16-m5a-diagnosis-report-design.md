# M5a — Diagnosis run + report page (design spec)

- **Date:** 2026-07-16
- **Milestone:** M5a (first of four M5 sub-projects; build order M5a → M5d → M5b → M5c)
- **Branch (when build starts):** `feat/m5a-diagnosis-report` off `master`
- **Status:** design approved (brainstorm Q1–Q6 locked); this spec is the writing-plans input.

## 1. Goal

Wire the already-shipped M1 engine into the product: let an **admin** press one button on the church dashboard to run the deterministic diagnosis over the collected responses, persist it, mark the assessment run complete, and land on a mobile-first **report page** at `/app/[churchId]/diagnosis`. The report renders fully today from the deterministic fallback renderer; M5b later swaps AI prose into the *identical* layout without touching this page's structure.

M5a is **~80% wiring, not building.** The pure engine (`diagnose()`), the deterministic prose renderer (`fallbackProse()`), the 6 scenario fixtures, and the content-addressed `diagnoses` cache table all already exist and pass. M5a adds: two SECURITY DEFINER RPCs, a pure response-hash helper, a pure chain-walk view helper, one server action, one report page + its presentational components, and a dashboard-button flip.

### Non-goals (explicitly out of scope for M5a)

- AI prose generation (that is **M5b** — this page reads persisted `prose` if present but M5a always renders `fallback`).
- Member-management / "Manage access" UI (that is **M5d** — its dashboard stub stays disabled).
- Public share links (**M6**).
- Re-opening a completed run, multi-run history, or a "re-generate" button. In v1 there is one run per church; generating completes it and freezes the response set.

## 2. The hard safety rule (non-negotiable)

`diagnose()` must **never** be called unless coverage is complete: every item in **all 8 categories** has ≥1 response, i.e. `coverage(rows, categories).coveredCount === 8`.

Rationale (confirmed in code): `lib/engine/score.ts` returns `0` for an empty category and `lib/engine/normalize.ts` creates a slot for every methodology category. So diagnosing a partial run makes an unanswered category score `0 < break(45)` → BROKEN → a **phantom primary constraint** that misdiagnoses the church. This is the deferred M2→M5 coverage gate.

The gate is enforced in **two** places, both mandatory:
1. **UI:** the dashboard "Generate diagnosis" button is disabled until `coveredCount === 8`.
2. **Server action:** `generateDiagnosis` re-checks `coveredCount === 8` before calling `get_run_responses`/`diagnose()` and returns an error otherwise. The UI gate is a convenience; the server gate is the guarantee.

## 3. Architecture & data flow

```
Dashboard (admin)                    Server action (Node only)                     Postgres (RLS + SECURITY DEFINER)
────────────────                     ─────────────────────────                     ──────────────────────────────────
[Generate diagnosis] ──click──▶ generateDiagnosis(churchId)
  (enabled iff covered===8)            │
                                       ├─ createClient() + getUser()
                                       ├─ loadMethodology()          (node fs, server-only)
                                       ├─ rpc get_run_coverage ─────────────────────▶ aggregate counts (member-gated)
                                       ├─ coverage(...).coveredCount === 8 ? (HARD GATE — else return error)
                                       ├─ select churches.attendance_band ──────────▶ (RLS churches_select)
                                       ├─ rpc get_run_responses ────────────────────▶ RAW response rows for active run
                                       │     (member-gated; result stays server-side, NEVER returned to browser)
                                       ├─ diagnose(responses, methodology, ctx) ── pure, in-memory ▶ Diagnosis
                                       ├─ responseHash(rawRows, methodology_version) ── pure ▶ hash
                                       ├─ rpc save_diagnosis(payload, hash, version) ▶ upsert diagnoses (admin-gated)
                                       │                                              + set run status='complete'
                                       ├─ revalidatePath(/app/[id]) + (/diagnosis)
                                       └─ redirect(/app/[id]/diagnosis)  (outside try/catch — redirect() throws)

Report page  /app/[churchId]/diagnosis  (server component, read-only)
  ├─ select churches (RLS) → notFound if not a member
  ├─ select assessment_runs (RLS runs_select) → the church's run
  ├─ select diagnoses latest-for-run (RLS diagnoses_select) → row | none
  │     └─ none → EMPTY STATE (link back to dashboard)
  ├─ diagnosis = row.payload as Diagnosis
  ├─ blocks = (PROSE_MODE!=='fallback' && row.prose) ? row.prose : fallbackProse(diagnosis, methodology)
  └─ render 10 sections (Treatment-A chain walk in §2)
```

**Confidentiality guarantee:** raw per-respondent response values leave Postgres in exactly one place — the `get_run_responses` RPC — and only into the Node server action, where they are used solely as `diagnose()` input. They are **never** serialized to the browser. What the browser receives is the aggregated `Diagnosis` payload (category scores, the constraint, evidence receipts, dispersion means) read through the members-only `diagnoses_select` policy. This preserves the "members read the diagnosis, not the raw responses" wall.

## 4. New database surface

Two new SECURITY DEFINER RPCs, following the exact style of `get_run_coverage` / `submit_self_response` (auth.uid() null-check → membership/role check → resolve the one `in_progress` run → act; `revoke all … from public, anon; grant execute … to authenticated`). Methodology semantics stay in TS; these RPCs only move rows and JSON. New migrations numbered `20260716001000+`.

### 4.1 `get_run_responses(p_church_id uuid)` — migration `20260716001000_rpc_get_run_responses.sql`

- **Gate:** member-gated (same check as `get_run_coverage`: caller must have a `church_members` row for the church). Consistent with the aggregate coverage RPC; the confidentiality guarantee is enforced by *where it is called* (server-only) + *what is returned to the client* (nothing), not by tightening this to admin.
- **Returns:** `table(category_id text, item_id text, value int, respondent_label text)` — the RAW response rows for the church's single `in_progress` run (`order by created_at asc limit 1`, same run-resolution as every other RPC). Returns zero rows if there is no active run.
- **Shape note:** these four columns map 1:1 onto the engine's `Response` interface (`{category_id, item_id, value, respondent_label}`), so the action passes the rows straight into `diagnose()` with no remapping.

```sql
create function public.get_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members where church_id = p_church_id and user_id = v_uid
  ) then
    raise exception 'not a member of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_run_responses(uuid) from public, anon;
grant execute on function public.get_run_responses(uuid) to authenticated;
```

### 4.2 `save_diagnosis(...)` — migration `20260716001100_rpc_save_diagnosis.sql`

- **Gate:** **admin-gated** (caller must be `church_members … role = 'admin'`). This RPC both writes the diagnosis and completes the run — a privileged mutation — so it matches the admin-only "Generate diagnosis" button (locked Q2). `diagnoses` has NO INSERT RLS policy, so this SECURITY DEFINER RPC is the sole writer (consistent with the no-service-client guardrail).
- **Params:** `p_church_id uuid, p_response_hash text, p_methodology_version text, p_payload jsonb`.
- **Behavior (atomic):**
  1. Resolve the church's `in_progress` run (same resolution as above). If none → raise `no active run for this church`.
  2. **Upsert** into `diagnoses` on the existing `unique (run_id, response_hash)` — `on conflict (run_id, response_hash) do nothing`. The payload is deterministic from `(responses, methodology_version)` and the hash folds in `methodology_version` (§5), so an existing row for the same key is byte-identical; `do nothing` makes the call idempotent (double-click / retry safe).
  3. Set the run `status = 'complete', completed_at = coalesce(completed_at, now())`. Completing an already-complete run is a no-op.
- **Returns:** `void`.

```sql
create function public.save_diagnosis(
  p_church_id uuid,
  p_response_hash text,
  p_methodology_version text,
  p_payload jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members
    where church_id = p_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;
  if v_run_id is null then
    raise exception 'no active run for this church';
  end if;

  insert into public.diagnoses (run_id, response_hash, methodology_version, payload)
  values (v_run_id, p_response_hash, p_methodology_version, p_payload)
  on conflict (run_id, response_hash) do nothing;

  update public.assessment_runs
  set status = 'complete', completed_at = coalesce(completed_at, now())
  where id = v_run_id;
end;
$$;

revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated;
```

> **Note on run completion vs. `get_run_responses`:** `get_run_responses` resolves the `in_progress` run, and `save_diagnosis` then completes it. Within a single `generateDiagnosis` call this is sequential and safe. After completion there is no `in_progress` run, so the report reads the completed run (§6). Because the answer flow requires an `in_progress` run (`submit_self_response` raises otherwise), the response set is frozen once the run completes — no drift between the persisted diagnosis and later answers in v1.

## 5. Pure TS helpers (`lib/report/`)

Both are pure, unit-tested (vitest), and hold no methodology semantics beyond arrangement.

### 5.1 `responseHash(rows, methodologyVersion): string` — `lib/report/response-hash.ts`

Content-addresses the response set so the same answers under the same methodology reuse the cached diagnosis (Q5: recompute-on-demand, cache-by-hash).

- **Input:** the raw rows from `get_run_responses` (`{category_id, item_id, value, respondent_label}[]`) + `methodology_version`.
- **Algorithm:** canonicalize — sort rows by `(category_id, item_id, respondent_label, value)`, serialize to a stable JSON string, prefix `methodologyVersion + '|'`, `sha256` via `node:crypto` (`createHash('sha256').update(...).digest('hex')`). Server-only (Node crypto).
- **Properties (tested):** deterministic; independent of input row order; changes when any value/respondent changes; changes when `methodology_version` changes (a methodology bump busts the cache → a fresh row, old row retained).

### 5.2 `chainWalk(diagnosis, methodology): StageView[]` — `lib/report/chain-walk.ts`

Arranges the 5 chain stages for the Treatment-A visual. Pure; reads only the already-computed `Diagnosis` (does not re-derive the constraint).

- Walks `methodology.rules.chain` = `[guest, conn, disc, vol, gen]` in order.
- `primaryIndex = chain.indexOf(diagnosis.primary_constraint?.category_id)` (or `-1` when `primary_constraint` is null).
- For each stage index `i`, emit `{ category_id, name, score, state, bucket, isDoNotWorkOn }` where:
  - `bucket = 'holding'` when there is no constraint (`primaryIndex === -1`) **or** `i < primaryIndex` (upstream, passing);
  - `bucket = 'constraint'` when `i === primaryIndex`;
  - `bucket = 'downstream'` when `i > primaryIndex`;
  - `isDoNotWorkOn = diagnosis.do_not_work_on.some(x => x.category_id === category_id)` (the broken subset of downstream — drives the "symptom of the constraint" microcopy).
- `name` from the methodology category name; `score`/`state` from the matching `diagnosis.categories` entry.

## 6. Report page & components

### 6.1 `app/app/[churchId]/diagnosis/page.tsx` (server component)

Data fetch (all through RLS SELECT — no new read RPC needed):
1. `createClient()`; `select id,name,brand_color from churches where id = churchId` → `notFound()` if null (RLS returns null for non-members).
2. `select id,status from assessment_runs where church_id = churchId` → the church's run (one in v1).
3. `select payload, prose, prose_source, generated_at from diagnoses where run_id = run.id order by generated_at desc limit 1` → row | none.
   - **none →** render `<EmptyState churchId>` ("This assessment hasn't been diagnosed yet." + link back to `/app/[churchId]`).
4. `diagnosis = row.payload as Diagnosis`; `methodology = loadMethodology()`; `brand = resolveBrand(church.name)`.
5. `const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'`. `blocks = (PROSE_MODE !== 'fallback' && row.prose) ? (row.prose as ReportBlocks) : fallbackProse(diagnosis, methodology)`. **In M5a `prose` is always null → always `fallbackProse`.** The persisted-prose branch is forward-compat for M5b.
6. `stages = chainWalk(diagnosis, methodology)`; render sections.

Mobile-first, `max-w-*` centered column matching the dashboard shell. Uses only existing tokens (§7).

### 6.2 Section structure (10 sections; conditional sections show only when their data exists)

Each conditional section maps directly to an optional `ReportBlocks` field being present — a healthy/no-constraint church gets a short, clean report.

| # | Section | Shows when | Source |
|---|---------|-----------|--------|
| 1 | **Verdict header** | always | `blocks.verdict` (constraint or no-constraint variant), `diagnosis.overall_score`, confidence band from `diagnosis.confidence`; brand monogram + `church.brand_color`, `church.name` |
| 2 | **The chain walk** (signature visual, Treatment A) | always | `chainWalk(...)` |
| 3 | **Evidence receipt** | `blocks.evidence` present | `blocks.evidence` + item rows from the `primary_constraint:{id}` receipt in `diagnosis.evidence_trail` |
| 4 | **Blind spots** | `blocks.blind_spot` present | `blocks.blind_spot` (+ belief/evidence/gap numbers from the matching `diagnosis.blind_spots` entry) |
| 5 | **Cost / do-not-work-on** | `blocks.cost` present | `blocks.cost` + `blocks.do_not_work_on` (when present) |
| 6 | **Enabler gating flags** | `blocks.gating` present | `blocks.gating` — rendered as a muted secondary note (flags never headline) |
| 7 | **Generosity split** | `diagnosis.generosity_mode !== null` | breadth-vs-depth framing keyed off `generosity_mode` |
| 8 | **Disagreement** | `blocks.dispersion` present | `blocks.dispersion` + per-respondent spread (`diagnosis.dispersion_flags[0].respondents` labels+means) |
| 9 | **Recommended next step** (CTA) | always | `diagnosis.offer.call_type` + `diagnosis.offer.hook` (+ `blocks.next_step`) |
| 10 | **Appendix** | always | all 8 `diagnosis.categories` scores 0–100 with a `stage N`/`enabler` tag (via `chain.indexOf`) + `cohort_percentile` when non-null, then `blocks.benchmark_note` (provisional-priors caveat) |

### 6.3 Chain walk — Treatment A ("stacked stage list"), spec

A vertical list of the 5 stages in chain order (guest → conn → disc → vol → gen), each a small tile: **stage name + state label + score (0–100) + a thin horizontal score bar** (bar width = `score`%).

- **`holding`** (upstream of the constraint, passing; and *all* stages when there is no constraint): normal tile, **sage** (`--color-sage #4E6B60`, the existing healthy/enabler token) bar + label ("Holding").
- **`constraint`** (the first broken stage): highlighted tile — **`--berry #8E2B3E` as foreground text + a berry left-border + a berry score bar**, with an inline one-liner **"Your constraint — work here first."** Berry is foreground/accent on the white tile **only — never a berry background fill.**
- **`downstream`** (stages after the constraint): **de-emphasized** (reduced opacity / muted `text-ink-soft`), score bar in a neutral tone; stages that are also `isDoNotWorkOn` carry a small "symptom of the constraint" tag. A single footer under the list reads **"Don't work on the faded stages yet."**

The chain metaphor lives in the section title ("The chain walk") + the top-to-bottom order. No separate callout box — the inline one-liner on the constraint tile is enough (plain Treatment A, not the A+C hybrid).

**No-constraint case:** `primary_constraint` is null → all 5 tiles render `holding` (calm all-sage chain), no berry, no downstream fade, no footer. The verdict header uses `verdict_no_constraint`, and only sections 1, 2, 9, 10 render.

### 6.4 Components — `app/app/[churchId]/diagnosis/report.tsx`

Presentational, pure, typed props (no data fetching). Exports the section components consumed by `page.tsx`: `VerdictHeader`, `ChainWalk` (+ `StageTile`), `EvidenceReceipt`, `BlindSpots`, `CostSection`, `GatingFlags`, `GenerositySplit`, `Disagreement`, `NextStep`, `Appendix`, `EmptyState`. Server components (no client JS needed — the report is read-only). If `report.tsx` grows unwieldy, split per section later; start co-located for reviewability.

## 7. Styling / tokens

Use only existing Tailwind-v4 `@theme` tokens from `app/globals.css`: `paper`, `ink`, `ink-soft`, `line`, `berry` (+ `berry-deep`), `sage`, `sand`; fonts `font-display` (Fraunces), `font-body` (Hanken). No new tokens.

- **`--berry` is foreground/accent only** (constraint text, left-border, score bar) — never a tile or section background. This matches the token's reserved comment ("diagnosis/constraint/active only — never a brand tile").
- Passing/holding = `sage` (the existing healthy token; there is no separate "success green").
- Confidence band is presentation-only (does **not** change any engine number): map the already-computed `diagnosis.confidence` to a label — e.g. `≥0.75 High`, `≥0.5 Moderate`, `<0.5 Low` — and show a muted note like "Based on limited responses — add respondents to sharpen this" when Low. These display thresholds are UI constants, explicitly separate from methodology YAML, and may move freely.

## 8. Dashboard change — `app/app/[churchId]/page.tsx`

Flip the M5 `['View diagnosis','M5']` disabled stub (in `DISABLED_STUBS`, line 23) into a real control. Keep `['Manage access','M5']` disabled (that is M5d).

New reads on the dashboard (all RLS-guarded SELECT):
- current user's role: `getUser()` then `select role from church_members where church_id = churchId and user_id = user.id` (via `members_select` / `is_church_member`).
- the run + whether a diagnosis exists: `select id,status from assessment_runs where church_id = churchId`; `select id from diagnoses where run_id = run.id limit 1` (via `diagnoses_select`).

Control resolution (replacing the single disabled "View diagnosis" stub):
- **diagnosis exists** → enabled **"View diagnosis"** `<Link>` to `/app/[churchId]/diagnosis` (any member).
- **else `coveredCount === 8` and role `admin`** → enabled **"Generate diagnosis"** button (a small client component, §8.1).
- **else `coveredCount === 8` and role `viewer`** → disabled "Generate diagnosis" with reason "Admins can generate the diagnosis."
- **else (`coveredCount < 8`)** → disabled "Generate diagnosis" with reason "Answer all 8 areas first ({coveredCount} of 8)."

### 8.1 `app/app/[churchId]/generate-button.tsx` (client)

Small `'use client'` component: a button that calls the `generateDiagnosis` server action (via `useTransition`), shows a pending state while running, and surfaces the returned `error` string inline (e.g. if the server-side coverage gate rejects). On success the action redirects, so the button has no success branch to render. Mirrors the existing `invite-panel.tsx` client-action pattern.

## 9. Server action — `app/app/[churchId]/actions.ts` (add `generateDiagnosis`)

Co-locate with the existing dashboard `createInvitation` action (`'use server'` module). Signature: `generateDiagnosis(churchId: string): Promise<{ ok: boolean; error?: string }>` (only the error path returns; success redirects).

Flow (redirect is the last statement, **outside** any try/catch — `redirect()` throws `NEXT_REDIRECT` and must not be swallowed, per Next 16 docs):
1. `supabase = await createClient()`; `user = (await supabase.auth.getUser()).data.user`; if `!user` → `return { ok:false, error:'You must be signed in.' }`.
2. `methodology = loadMethodology()`; `categories = methodology.questions.categories`.
3. **Coverage gate:** `rows = await supabase.rpc('get_run_coverage', { p_church_id: churchId })`; if `coverage(rows, categories).coveredCount !== 8` → `return { ok:false, error:'All 8 areas must be answered before generating a diagnosis.' }`.
4. `church = select attendance_band from churches where id = churchId`; `ctx = { attendance_band: church?.attendance_band ?? '' }` (a null band → engine returns null cohort percentiles; acceptable).
5. `raw = await supabase.rpc('get_run_responses', { p_church_id: churchId })` — **server-side only; never returned to the client.**
6. `diagnosis = diagnose(raw as Response[], methodology, ctx)`.
7. `hash = responseHash(raw, diagnosis.methodology_version)`.
8. `await supabase.rpc('save_diagnosis', { p_church_id: churchId, p_response_hash: hash, p_methodology_version: diagnosis.methodology_version, p_payload: diagnosis })`.
9. Each `supabase.rpc` in steps 3/5/8 returns `{ data, error }` (it does not throw); on any non-null `error`, `return { ok:false, error: error.message }` immediately. No `try/catch` is needed for the RPCs.
10. `revalidatePath('/app/'+churchId)`; `revalidatePath('/app/'+churchId+'/diagnosis')`.
11. `redirect('/app/'+churchId+'/diagnosis')` — the last statement, never wrapped in `try/catch` (it throws `NEXT_REDIRECT` by design).

Import the engine `Response` type as `import type { Response } from '@/lib/engine/types'`; within the module this shadows the DOM `Response` global (which the action never uses).

Cache-by-hash (Q5): `save_diagnosis`'s upsert on `(run_id, response_hash)` makes this idempotent — a repeated generate over an unchanged response set writes no duplicate row. Because runs freeze on completion in v1, generation is effectively write-once; the hash mechanism guards double-submit and future milestones that may re-open a run.

## 10. Testing

Baselines that must never drop: **111 pgTAP + 106 vitest** (plus `tsc --noEmit` 0 errors, `eslint .` 0, `next build` ok). New tests are additive.

**pgTAP** (`supabase/tests/`, run via `npm run test:db`):
- `11_get_run_responses_test.sql`: a member gets the run's raw rows; a non-member and `anon` get `insufficient_privilege`; returns zero rows when there is no `in_progress` run; returns only the active run's rows.
- `12_save_diagnosis_test.sql`: an admin upsert inserts a `diagnoses` row **and** flips the run to `complete` + sets `completed_at`; a second identical call is a no-op (idempotent, no duplicate row); a `viewer` and a non-member are rejected; rejects when no active run.

**vitest** (`tests/report/`, run via `npm test`):
- `response-hash.test.ts`: determinism, row-order independence, value-change sensitivity, `methodology_version` sensitivity.
- `chain-walk.test.ts`: bucket assignment for (a) a mid-chain constraint (upstream `holding`, the constraint, downstream `downstream`/`isDoNotWorkOn`), (b) no-constraint (all `holding`), (c) a constraint at stage 1 (no upstream). Reuse the 6 engine fixtures' shapes.

End-to-end (verification phase, not a unit test): with a fully-covered run, the admin generate button → server action → report page renders the fallback report; a viewer sees "View diagnosis" only after generation; a partial run keeps the button disabled with the coverage reason.

## 11. File manifest

**New:**
- `supabase/migrations/20260716001000_rpc_get_run_responses.sql`
- `supabase/migrations/20260716001100_rpc_save_diagnosis.sql`
- `supabase/tests/11_get_run_responses_test.sql`
- `supabase/tests/12_save_diagnosis_test.sql`
- `lib/report/response-hash.ts`
- `lib/report/chain-walk.ts`
- `tests/report/response-hash.test.ts`
- `tests/report/chain-walk.test.ts`
- `app/app/[churchId]/diagnosis/page.tsx`
- `app/app/[churchId]/diagnosis/report.tsx`
- `app/app/[churchId]/generate-button.tsx`

**Changed:**
- `app/app/[churchId]/actions.ts` — add `generateDiagnosis`.
- `app/app/[churchId]/page.tsx` — flip the "View diagnosis" stub into generate/view/disabled-with-reason; fetch role + run + diagnosis-existence.

## 12. Guardrails (carried from the brainstorm; never traded away)

- **Deterministic engine, additive AI:** `diagnose()` is pure; no model decides any number or verdict; the report renders fully with `PROSE_MODE=fallback`. M5b adds AI prose additively into the same layout.
- **Permission wall in Postgres RLS, not UI:** anon-key → RLS only; **no `lib/supabase/service.ts`**; writes go through SECURITY DEFINER RPCs. `invitations`/`responses` keep NO RLS policy (default-deny, RPC-only). Raw responses leave the DB only via the member-gated `get_run_responses`, server-side, never to the browser.
- **Methodology semantics in TS, not SQL;** methodology = versioned YAML under `/methodology`; `methodology_version` stamped on the diagnosis row (and folded into the response hash).
- `--berry #8E2B3E` foreground/accent only, never a tile/background fill.
- Do **not** `npm audit fix --force`. New migrations `20260716001000+`.
- Branch `feat/m5a-diagnosis-report` off `master`. Push to the PRIVATE `github.com/MylesM18/XPG-Church-Assess` (gh user MylesM18) **only on explicit go-ahead.**
