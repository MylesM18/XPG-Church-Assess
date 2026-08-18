# Close / Reopen assessment — decouple run completion from diagnosis generation

**Date:** 2026-08-18 · **Status:** Approved by owner (design review, session 11) · **Amends:** ADR 0001 (via new ADR 0003)

## 1. Problem

A church has exactly one `assessment_runs` row. Today the **only** writer of `status='complete'` is the `save_diagnosis` RPC, which the admin's **Generate diagnosis** button calls. ADR 0001 made that terminal. So the moment an admin generates a diagnosis, every member who has not finished — including people invited *afterwards* — lands on read-only pages ("This assessment is complete, so your answers are read-only") and `submit_self_response` refuses their writes. This is not RLS (`runs_select` covers members); it is the completion model.

Owner decision (2026-08-18): **Option 1** — completion becomes an explicit, reversible admin action ("Close assessment" / "Reopen assessment"), and Generate no longer touches run status.

## 2. Decisions (owner-confirmed, one per question)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Reversible or terminal? | **Reversible** — admin Reopen exists. |
| Q2 | Coverage gate on Close? | **No hard gate.** Confirm dialog shows N of M members finished. Generate keeps its own ≥ 1-fully-covered-respondent-per-area gate. |
| Q3 | Member view after Close? | **Keep today's read-only review**; only the copy changes to name the close and its date. |
| Q4 | Generate while open? | **Yes.** Diagnosis page shows a "still open — N of M finished; regenerate after closing" note. Regenerate stays available after Close. |
| Q5 | Backfill existing `complete` runs? | **None.** They stay closed; Test Church is fixed by clicking Reopen. |
| — | Approach | **B**: `close_run` + `reopen_run` + `closed_at`/`closed_by` audit columns. |
| — | Button placement | Dashboard admin block, next to View diagnosis / Generate. |
| — | Sharing on an open run | Unchanged (already allowed today; shared page never reads status). |

Rejected: **A** (no Reopen — contradicts Q1/Q5); **C** (new `'closed'` status value — churns the CHECK constraint, `RunStatus`, `canAcceptAnswers`, `completion_reminder_recipients`, and every pgTAP seed for no semantic gain, since `complete` already means "no more answers").

## 3. Database — one migration `supabase/migrations/20260818000100_close_reopen_run.sql`

1. `alter table public.assessment_runs add column closed_at timestamptz null, add column closed_by uuid null;` — no CHECK change; `status` remains `'in_progress' | 'complete'`. `completed_at` is kept and still set on close so existing readers/tests keep working; `closed_at`/`closed_by` are the audit pair.
2. **`close_run(p_church_id uuid)`** — `security definer`, `perform public.require_church_admin(p_church_id)` (same helper `create_report_share` uses), run resolved via `current_run(...)` (never an inline status filter — the `tests/coverage/current-run-dedup.test.ts` tripwire pattern), `raise exception 'run is already closed'` if `status='complete'`, else `update … set status='complete', completed_at=now(), closed_at=now(), closed_by=auth.uid()`. `grant execute … to authenticated`.
3. **`reopen_run(p_church_id uuid)`** — mirror: `raise exception 'run is not closed'` if `in_progress`, else `set status='in_progress', completed_at=null, closed_at=null, closed_by=null`. Same grant.
4. **`save_diagnosis`** — `create or replace` (return type unchanged): remove the `run is already complete` gate (`20260730000100:130-131`) and the status/`completed_at` flip (`:138-140`). Everything else identical.
5. **`get_run_responses`** (`20260807000400:30`, inline `status='in_progress'`) and **`get_completed_run_responses`** (`20260807000500:30`, inline `status='complete'`) — `create or replace`, filter replaced by `current_run(...)`, status-agnostic. Both names kept so the four call sites (`diagnosis/actions.ts` generate + regenerate, `diagnosis/page.tsx`, `pdf/route.ts`) do not move; ADR 0003 records that they are now equivalent and may be unified in a later slice. This closes ADR 0001's own "still pending" follow-up.
6. **Untouched:** `submit_self_response` (still refuses on `complete` — that is what makes Close mean read-only), `completion_reminder_recipients` (reminders stop on Close, resume on Reopen — accepted), deadline RPCs, sharing RPCs, `save_report`, RLS. Members already have `runs_select`, so they can read `closed_at` without a policy change.

Signature note: none of the replaced functions changes its return type, so plain `create or replace` should apply. If `supabase db push` reports a conflict, use `drop function … ; create function …` in the same migration (verified at plan time; applied only by the owner).

## 4. App layer

- **Data seam (ADR 0002):** new `lib/data/runs.ts` exporting `closeRun(client, churchId)` and `reopenRun(client, churchId)` — thin `rpc('close_run' | 'reopen_run', { p_church_id })` wrappers returning `{ error }`.
- **Run type:** `lib/runs/current-run.ts` run shape gains `closed_at: string | null` and `closed_by: string | null`. `RunStatus` and `canAcceptAnswers` unchanged.
- **Server actions:** new `app/app/[churchId]/run-actions.ts` with `closeAssessment(churchId)` / `reopenAssessment(churchId)` → data op → `revalidatePath` for the dashboard and diagnosis routes → return `{ ok: true } | { ok: false; error: string }`. No redirect; the page re-renders in place.

## 5. UI

### Dashboard admin block (`app/app/[churchId]/page.tsx`, currently ~:280-305)
- Start selecting `status`, `closed_at` on the run row (today the dashboard selects neither).
- **Run open:** existing Generate / View diagnosis controls **plus** a "Close assessment" button. Click → confirm dialog: *"N of M members have finished. After closing, members can review but not change their answers. You can reopen later."* → Close / Cancel. N/M comes from the member matrix the page already builds for admins ("finished" = the member's coverage state that `assessment-cta.ts` maps to `complete`).
- **Run closed:** one line *"Assessment closed on <date>"* + "Reopen assessment" button, also confirmed: *"Members will be able to change their answers again and reminder emails may resume."* Generate / Regenerate / View diagnosis remain available.
- Viewers/members see none of this (matrix + admin block are already admin-only).

### Diagnosis page (`app/app/[churchId]/diagnosis/page.tsx`)
- It already selects `status` (:81) but never reads it. If `in_progress` → note above the report: *"This assessment is still open — N of M members have finished. Regenerate after closing to include everyone's answers."* No note when closed. Existing `stale` / Regenerate affordance and `needsGeneration` logic unchanged. PDF route needs no UI change.

### Member answer page (`app/app/[churchId]/answer/[categoryId]/page.tsx:59-100`)
- Read-only copy becomes *"This assessment was closed by your church admin on <closed_at date>, so your answers are read-only."*; falls back to today's sentence when `closed_at` is null (runs completed by the old Generate path). CTA (`lib/coverage/assessment-cta.ts`), `done/page.tsx`, `/r/[shareToken]` untouched.

## 6. Data flow after the change

- **Generate:** `get_run_responses` (any status) → `deriveDiagnosisForRun` → `save_diagnosis` (no status write) → prose → `save_report` → redirect. Works before and after Close.
- **Regenerate:** `get_completed_run_responses` (any status) → `save_report`. Works before and after Close.
- **Close / Reopen:** independent single-RPC actions; no interaction with diagnoses/reports beyond the existing `stale` flag flipping when answers change after a Reopen.

## 7. Error handling & edge cases

- **Double-click / two admins:** second `close_run` raises `run is already closed` (Reopen: `run is not closed`); action maps to inline "Already closed — refresh to see the latest state" and revalidates. Single UPDATE ⇒ no partial state.
- **Non-admin / wrong church:** `require_church_admin` raises as it does for `create_report_share`; action shows generic "Not allowed". Buttons never render for non-admins.
- **Close before Generate:** allowed. A closed run with insufficient coverage shows the existing disabled Generate + blocked-area copy.
- **Reopen after a report exists:** diagnosis/report rows stay; `stale` flips on the first changed answer; Regenerate available. No new machinery.
- **Reopen restarts reminder emails** for members still `in_progress` (`completion_reminder_recipients`); confirm dialog says so. Per-member deadline locks unaffected.
- **Old-path runs** (`complete`, `closed_at` null): treated as closed; member copy falls back; Reopen works on them (Test Church fix). No data migration.
- **Sharing:** unchanged.

## 8. Tests

- **pgTAP** (authored by the agent, executed only by the owner via `npm run test:db`):
  - `12_save_diagnosis_test.sql`: :32-37 → assert status stays `in_progress` and `completed_at` is null after `save_diagnosis`; :68-71 → a second `save_diagnosis` on a manually-completed run **succeeds**; adjust `plan()`.
  - `11_*` (get_run_responses): add "returns rows when run is `complete`". `22_*` (get_completed_run_responses): add "returns rows when run is `in_progress`". Existing complete-run seeds kept.
  - New `23_close_run_test.sql`, `24_reopen_run_test.sql`: admin gate; non-admin raises; fields set / cleared; `run is already closed` / `run is not closed`; `submit_self_response` refused after close and accepted after reopen; coverage RPCs unaffected by status.
- **Vitest:** new `tests/data/runs.test.ts` (rpc names + args); `tests/runs/run-actions.test.ts` (error mapping, revalidated paths); render tests for dashboard (Close vs Reopen state), answer page (closed copy vs fallback), diagnosis page (open note present/absent) — assertions scoped to the carrying element and mutated in both directions; a migration tripwire asserting `20260818000100_*.sql` calls `current_run(` and contains no inline `status = 'in_progress'` / `status = 'complete'` filter in the replaced read RPCs. Extend `tests/coverage/current-run-dedup.test.ts` / `tests/report/generate-report-wiring.test.ts` only if their assertions actually break. Run `tsc --noEmit` at the boundary (run type gains fields).

## 9. Docs

- **ADR 0003** `docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md` — Status: Accepted; amends ADR 0001. Records: completion is an explicit, reversible admin action; Generate/`save_diagnosis` no longer writes status; `get_run_responses` / `get_completed_run_responses` are status-agnostic and equivalent (unification deferred); multi-run / historical re-assessment still out of scope (spec §14).
- **ADR 0001** — add an "Amended by ADR 0003 (2026-08-18)" line; leave the original text.
- **CONTEXT.md** (:44-59) — add "Close assessment" and "Reopen assessment" entries; correct the "Completeness" wording that references a non-existent `isRunComplete`.

## 10. Rollout

1. Branch `feat/close-assessment` off `master` `00acb12`. Migration + pgTAP + app changes + tests + docs in one PR.
2. Owner applies the migration (`supabase db push`) and runs `npm run test:db`; agent never runs either.
3. After deploy: owner clicks **Reopen** on Test Church → invitee can answer → **Close** → **Regenerate** → member sees the closed copy.
4. PR review: read `/pulls/<n>/comments` for Greptile regardless of check-run status.

## 11. Out of scope

Multiple runs / re-assessment history; auto-close on deadline; changing the Generate coverage gate; unifying the two `get_*_run_responses` RPCs; any change to sharing or the `/r/[shareToken]` page.
