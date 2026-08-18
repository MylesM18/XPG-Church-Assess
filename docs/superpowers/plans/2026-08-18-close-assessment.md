# Close / Reopen Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assessment completion an explicit, reversible admin action (Close / Reopen) and stop `save_diagnosis` from writing run status, so members invited after a diagnosis is generated can still answer.

**Architecture:** One migration adds `closed_at`/`closed_by` to `assessment_runs`, two new SECURITY DEFINER RPCs (`close_run`, `reopen_run`) gated by `require_church_admin` and resolving the run through `current_run()`, re-creates `save_diagnosis` without its status gate/flip, and re-creates `get_run_responses`/`get_completed_run_responses` on `current_run()` (status-agnostic). The app gains a `lib/data/runs.ts` seam, two server actions, a `window.confirm`-based client control on the dashboard, a "still open" note on the diagnosis page, and closed-date copy on the answer page. `submit_self_response` is untouched — its existing `complete` gate is what makes Close mean read-only.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres, plpgsql SECURITY DEFINER RPCs, RLS), pgTAP (owner-run), vitest (`environment: 'node'`, `react-dom/server` for component renders), TypeScript.

**Plan of record:** `docs/superpowers/specs/2026-08-18-close-assessment-design.md` (spec) amending `docs/adr/0001-review-only-completion-defer-multi-run.md`. Where this plan and the spec disagree, the differences are listed under "Spec conflicts resolved against source" below — **escalate, do not silently pick one** if you find another.

## Global Constraints

- ⛔ **No new dependencies.** Confirm text is `window.confirm(...)` — the app has no dialog primitive.
- ⛔ The agent **never** runs `npm run test:db`, `supabase db push`, or `supabase db reset`. pgTAP files are AUTHORED here and RUN only by the owner. The agent's runnable gates are vitest (`npm test` / `npx vitest run <file>`), `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint .`).
- ⛔ Never push to `master`, never force-push, never merge. Branch is `feat/close-assessment` (already checked out).
- Stage with **explicit git paths only** — never `git add .` / `git add -A`. Never stage `.claude/` or these pre-existing untracked files: `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`, `docs/superpowers/plans/2026-08-01-assessment-deadlines.md`, `docs/superpowers/specs/2026-08-15-web-report-visual-design-WIP.md`.
- Prefix `GIT_LITERAL_PATHSPECS=1` on every `git add` whose path contains `[churchId]` / `[categoryId]`.
- The repo's PostToolUse formatter rewrites an unassigned `let x` to `const` — write a `let` and its reassignment in the SAME edit (never a bare `let x: T` in one edit and `x = …` in a later one).
- RPC names / args exact: `close_run(p_church_id uuid)`, `reopen_run(p_church_id uuid)`; TS calls `rpc('close_run', { p_church_id })` / `rpc('reopen_run', { p_church_id })`.
- Untouched: `RunStatus` (`'in_progress' | 'complete'`), `canAcceptAnswers`, `submit_self_response`, sharing RPCs, `/r/[shareToken]`, `assessment-cta.ts`, `done/page.tsx`, `completion_reminder_recipients`, deadline RPCs, RLS, the `status` CHECK constraint.
- Keep the names `get_run_responses` and `get_completed_run_responses` (they become equivalent; unification is out of scope — ADR 0003 records it).
- Copy strings are the spec's, verbatim (see `lib/runs/close-reopen.ts` in Task 5 — every page/component reads them from there).
- `npm test` does **not** typecheck. Run `npm run typecheck` at the boundary of Task 4 (the `Run` shape gains fields) and again in Task 11.
- `tests/a11y/live-regions-applied.test.ts` scans every `.tsx` under `app/` and `components/`: any status/error text must go through `<LiveStatus …/>` (always mounted, never behind `&&`/`?`), and no JSX element may be guarded by an identifier ending in `err|error|message|status|notice|warning|fail|failed|problem|alert|toast|banner` immediately followed by `&&`/`?` + `<Tag`. Variable names in this plan were chosen to satisfy that (`isClosed`, `openNote`, `runIsOpen`) — keep them.
- `tests/dashboard/view-diagnosis-new-tab.test.ts` anchors on the FIRST occurrence of `` `/app/${churchId}/diagnosis` `` in `app/app/[churchId]/page.tsx` — do not add that string to `page.tsx` before the "View diagnosis" `<Link>`.
- `tests/report/web-page-wiring.test.ts` pins in `diagnosis/page.tsx`: `<ReportToolbar` < `{stale &&` < `<ReportCover` < `<ReportSections`, exactly one `<ReportToolbar`, exactly one `Download PDF`, and nothing but closing tags after `<ReportSections`. The open-run note goes BETWEEN `</ReportToolbar>` and `{stale && (`.

## Verified facts (plan time, 2026-08-18, source is authoritative)

1. **`current_run` signature** — `supabase/migrations/20260730000100_fn_current_run_dedup_resolution.sql:31-42`: `create or replace function public.current_run(p_church_id uuid) returns setof public.assessment_runs language sql stable set search_path = public` — `select * from public.assessment_runs where church_id = p_church_id order by created_at asc limit 1`. **`20260807000500` does NOT call it** — `get_completed_run_responses` (`:28-32`) resolves inline `where church_id = p_church_id and status = 'complete' order by created_at asc limit 1`; likewise `20260807000400_rpc_get_run_responses_reflection.sql:28-32` with `status = 'in_progress'`. Both files use `drop function if exists` + `create function` because their return type changed then.
2. **`auth.users` FKs** — yes: `20260715000100_schema.sql` lines 18, 26, 28, 53, 69, 92, 100, 115, 116 (`created_by`, `user_id`, `granted_by`, `respondent_user_id`, `accepted_by`… all `uuid references auth.users`, nullable audit columns like `granted_by`/`accepted_by` carry no `on delete` clause). **Decision: `closed_by uuid null references auth.users`** (WITH the FK, matching `granted_by`/`accepted_by`).
3. **Identical return types ⇒ plain `create or replace` works** — yes. `save_diagnosis(uuid, text, text, jsonb) returns void` (`20260730000100:103-108`) is re-created `returns void` with the same 4 params. `get_run_responses(uuid)` / `get_completed_run_responses(uuid)` both `returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)` (`20260807000400:11`, `20260807000500:11`) and are re-created with that exact line. No `drop function` needed.
4. **"Finished" per member from the dashboard matrix** — `app/app/[churchId]/page.tsx:164-177` builds `memberMatrix: MemberMatrixRow[]` (`{ member: MatrixMember; cells: { category_id, status: 'not_started'|'partial'|'covered' }[] }`, `lib/coverage/member-matrix.ts`) via `churchMembers<MatrixMember>` + `rpc('get_member_category_coverage')` + `buildMemberMatrix(…, { isExempt, effectiveCategories })`. `classify()` (`lib/coverage/coverage.ts:22-26`) marks a cell `'covered'` iff answered === total; `assessmentCta` (`lib/coverage/assessment-cta.ts:25-27`) calls a member `'complete'` iff `coveredCount === categories.length`. So **finished ⇔ every cell in the member's row is `'covered'`**; M = `memberMatrix.length` (the roster). Task 5 makes this `finishedMemberCount(matrix)`.
5. **Confirm pattern** — `grep -rn "confirm(" app lib components` and `grep -rln 'role="dialog"|<dialog|AlertDialog|Dialog' app components lib` both return **nothing**. No dialog primitive exists, no new deps allowed ⇒ a small `'use client'` component calling `window.confirm(<spec text>)` in the button's `onClick`, then `startTransition` → server action, error via the always-mounted `<LiveStatus>` — the exact shape of `app/app/[churchId]/generate-button.tsx`.
6. **`submit_self_response` complete gate is reached via `current_run()`** — yes: `20260807000200_rpc_submit_self_response_reflection.sql:58-63` `select id, status into v_run_id, v_status from public.current_run(p_church_id); … elsif v_status <> 'in_progress' then raise exception 'run is complete; answers are read-only'`. Since `close_run` sets `status='complete'` on that same row, Close = read-only with **no change** to `submit_self_response`.

Other load-bearing facts:
- `require_church_admin(p_run_id uuid) returns uuid` (`20260718000300_rpc_report_share_manage.sql:9-38`) takes a **RUN id**, has NO execute grant (`revoke all … from public, anon, authenticated`), raises `'not authenticated'` / `'must be an admin of this church'` with `errcode = 'insufficient_privilege'` (42501). House call pattern is `save_report` (`20260814000100:48-57`): resolve `v_run_id` via `current_run`, raise `'no run for this church'` if null, then `perform public.require_church_admin(v_run_id)`.
- Dashboard run select today: `.select('id, methodology_version')` (`page.tsx:87-93`) — no `status`, no `closed_at`. Diagnosis page selects `'id, status, methodology_version, completed_at'` (`diagnosis/page.tsx:81`) but never reads `status`; it has NO roster/matrix data — Task 8 fetches roster + `get_member_category_coverage` there (only when the run is open) and reuses `buildMemberMatrix`.
- `generateDiagnosis` (`actions.ts:32`) returns `Promise<{ ok: boolean; error?: string }>`, calls the seam then `revalidatePath` ×2 then `redirect`; access actions use `requireChurchAdmin(churchId)` → `{ supabase, error }` from `lib/auth/require-church-admin.ts` (`'You must be signed in.'` / `'You must be an admin of this church.'`).
- Answer page read-only copy: `app/app/[churchId]/answer/[categoryId]/page.tsx:99-101` `This assessment is complete, so your answers are read-only.` inside `<p className="font-body text-sm text-ink-soft">`; `writable = canAcceptAnswers(run)` (`:67`), `run = await currentRun(supabase, churchId)` (`:34`). `tests/assessment/answer-readonly-when-complete.test.ts` requires the (comment-stripped) page to still match `/read-only/i` — the fallback literal stays in the page.
- `lib/runs/current-run.ts` selects `'id, status, methodology_version'` (`:40`); `tests/runs/current-run.test.ts:75` pins that select list exactly.
- pgTAP prefixes `23_` and `24_` are TAKEN (`23_assessment_deadlines_test.sql`, `24_outreach_reflection_test.sql`); next free are `26_`, `27_`.
- pgTAP identity pattern: fixed-uuid `insert into auth.users`, `set local role authenticated; set local request.jwt.claims to '{"sub":"…","email":"…","role":"authenticated"}';`, `reset role;` for superuser seeding, `create_church_with_admin('<name>', '#hex', '0.1.0')`, `throws_ok(sql, '42501', 'msg', 'desc')` / `throws_ok(sql, 'msg', 'desc')` / `throws_ok(sql, '42501')`, `lives_ok(sql, 'desc')`.
- Test conventions: server pages are covered by **source-reading** tripwires (`fs.readFileSync` + comment strip + string/regex asserts — jsdom/testing-library are unavailable by standing decision); components by `renderToStaticMarkup(createElement(...))` in `.ts` files (vitest include is `tests/**/*.test.ts`); server actions by `vi.hoisted` + `vi.mock('@/lib/supabase/server' | 'next/cache' | …)` then importing the action (`tests/report/generate-report-behavior.test.ts`); data modules by a `fakeClient` recording `rpc(name, args)` (`tests/data/members.test.ts`); migrations by SQL source-reads (`tests/coverage/current-run-dedup.test.ts`).

## Spec conflicts resolved against source (report these; do not re-litigate silently)

1. **§3.2 `perform public.require_church_admin(p_church_id)`** — the helper takes a **run id**. Plan: resolve the run via `current_run(p_church_id)` first, then `perform public.require_church_admin(v_run.id)` (the `save_report` pattern).
2. **§8 new files `23_close_run_test.sql` / `24_reopen_run_test.sql`** — those prefixes exist. Plan uses `26_close_run_test.sql` / `27_reopen_run_test.sql`.
3. **§8 "`22_` … existing complete-run seeds kept"** — `22_` seeds its COMPLETE run *after* the church's `in_progress` seed run; with `current_run()` (earliest by `created_at`) the RPC would return the in_progress run. Plan back-dates that complete run's `created_at` by one day (seed kept, now the current run) and adds the "returns rows when in_progress" assertion.
4. **§8 omits `24_outreach_reflection_test.sql`** — its bullet (7)/(8) puts the reflection row and the share on a later COMPLETE run; status-agnostic `get_completed_run_responses` would no longer see it. Plan removes that second run and points both subselects at the church's current run (`order by created_at asc limit 1`). `plan(19)` unchanged.
5. **§3.4 "everything else identical"** — removing the gate leaves `v_status` unused; plan also drops the `v_status` declaration and selects only `id`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20260818000100_close_reopen_run.sql` | Create | Columns + `close_run` + `reopen_run` + re-created `save_diagnosis`, `get_run_responses`, `get_completed_run_responses`. |
| `supabase/tests/12_save_diagnosis_test.sql` | Modify | `save_diagnosis` no longer writes status; second save on a manually-completed run succeeds. `plan(8)`. |
| `supabase/tests/11_get_run_responses_test.sql` | Modify | "returns rows when run is complete". `plan(8)` unchanged. |
| `supabase/tests/22_get_completed_and_shared_run_responses_test.sql` | Modify | back-dated complete run + "returns rows when run is in_progress". `plan(11)`. |
| `supabase/tests/24_outreach_reflection_test.sql` | Modify | reflection row + share on the current run. `plan(19)` unchanged. |
| `supabase/tests/26_close_run_test.sql`, `supabase/tests/27_reopen_run_test.sql` | Create | close/reopen behaviour, gates, submit refused/accepted, coverage unaffected. |
| `tests/runs/close-reopen-migration.test.ts` | Create | vitest source-read tripwire over the migration. |
| `lib/data/runs.ts`, `tests/data/runs.test.ts` | Create | `closeRun` / `reopenRun` seam. |
| `lib/runs/current-run.ts`, `tests/runs/current-run.test.ts` | Modify | `Run` gains `closed_at`, `closed_by`. |
| `lib/runs/close-reopen.ts`, `tests/runs/close-reopen.test.ts` | Create | Spec copy strings, date label, error mapping, `RunActionResult` type. |
| `lib/coverage/finished-members.ts`, `tests/coverage/finished-members.test.ts` | Create | `finishedMemberCount(matrix)` → `{ finished, total }`. |
| `app/app/[churchId]/run-actions.ts`, `tests/runs/run-actions.test.ts` | Create | `closeAssessment` / `reopenAssessment` server actions. |
| `app/app/[churchId]/close-reopen-controls.tsx`, `tests/dashboard/close-reopen-controls.test.ts` | Create | Client control (confirm → action → LiveStatus). |
| `app/app/[churchId]/page.tsx`, `tests/dashboard/close-reopen-wiring.test.ts`, `tests/a11y/live-regions-applied.test.ts` | Modify / Create / Modify | Dashboard selects `status, closed_at`, renders the control; census entry. |
| `app/app/[churchId]/diagnosis/page.tsx`, `tests/report/diagnosis-open-note.test.ts` | Modify / Create | "still open — N of M" note. |
| `app/app/[churchId]/answer/[categoryId]/page.tsx`, `tests/assessment/answer-closed-copy.test.ts` | Modify / Create | Closed-on-date read-only copy with fallback. |
| `docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md`, `docs/adr/0001-review-only-completion-defer-multi-run.md`, `CONTEXT.md` | Create / Modify / Modify | ADR 0003, amendment line, glossary entries. |

---

### Task 1: pgTAP — author the database tests first (owner runs them)

**Files:**
- Modify: `supabase/tests/12_save_diagnosis_test.sql` (whole file replaced below)
- Modify: `supabase/tests/11_get_run_responses_test.sql:54-56, 70-78`
- Modify: `supabase/tests/22_get_completed_and_shared_run_responses_test.sql:8, 19-21, 55-57, 113`
- Modify: `supabase/tests/24_outreach_reflection_test.sql:162-171, 191-197`
- Create: `supabase/tests/26_close_run_test.sql`
- Create: `supabase/tests/27_reopen_run_test.sql`

**Interfaces:**
- Consumes: nothing yet — these are the failing tests for Task 2's migration.
- Produces: the pgTAP contract for `close_run(uuid)`, `reopen_run(uuid)`, the status-free `save_diagnosis`, and the status-agnostic read RPCs. Task 2's SQL must satisfy every assertion below.

- [ ] **Step 1: Replace `supabase/tests/12_save_diagnosis_test.sql` with this exact content**

```sql
begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','saveadmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','saveviewer@test.com','x',now(),now()),
 ('d3333333-3333-3333-3333-333333333333','authenticated','authenticated','savestranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Save Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Save Test Church'),
        'd2222222-2222-2222-2222-222222222222', 'viewer',
        'd1111111-1111-1111-1111-111111111111');

-- admin saves a diagnosis
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Save Test Church'),
  'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;

select is((select count(*)::int from diagnoses d
           join assessment_runs r on r.id = d.run_id
           where r.church_id = (select id from churches where name = 'Save Test Church')), 1,
          'admin save inserts exactly one diagnoses row');
-- ADR 0003: save_diagnosis no longer writes run status. Closing is a separate admin action
-- (close_run, 20260818000100); Generate leaves the run exactly as it found it.
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')), 'in_progress',
          'save_diagnosis leaves the run in_progress (status is close_run''s job — ADR 0003)');
select ok((select completed_at is null from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')),
          'save_diagnosis leaves completed_at null');

-- idempotency: save again with the SAME hash → still one row
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Save Test Church'),
  'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;
select is((select count(*)::int from diagnoses d
           join assessment_runs r on r.id = d.run_id
           where r.church_id = (select id from churches where name = 'Save Test Church')), 1,
          'a second identical save is idempotent — no duplicate row');

-- a viewer cannot save
set local role authenticated;
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"saveviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-xyz', '0.1.0', '{}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a viewer cannot save a diagnosis');

-- a non-member cannot save
set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333","email":"savestranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-xyz', '0.1.0', '{}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a non-member cannot save a diagnosis');

-- ADR 0003: a manually-completed (closed) run STILL accepts save_diagnosis — Generate and
-- Regenerate work after Close — and the save does not touch the status.
reset role;
update assessment_runs set status = 'complete', completed_at = now()
where church_id = (select id from churches where name = 'Save Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-def', '0.1.0', '{"overall_score":60}'::jsonb)$$,
  'admin save on a closed (complete) run succeeds — Generate works after Close');
reset role;
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')), 'complete',
          'save_diagnosis does not touch the status of a closed run');

select * from finish();
rollback;
```

- [ ] **Step 2: Edit `supabase/tests/11_get_run_responses_test.sql`**

Replace lines 54-56 (the description only changes):

```sql
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'only the church''s CURRENT run''s rows are returned (a later run is excluded)');
```

Replace lines 70-78 (`-- no in_progress run → zero rows` … the `is(...)` block) with:

```sql
-- ADR 0003: the run is resolved through current_run() (status-agnostic). Completing the church's
-- run must NOT hide its rows — Generate / Regenerate work after Close.
reset role;
update assessment_runs set status = 'complete', completed_at = now()
where church_id = (select id from churches where name = 'Responses Test Church') and status = 'in_progress';
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'returns rows when the run is complete (status-agnostic — ADR 0003)');
```

`plan(8)` stays (one assertion replaced, none added).

- [ ] **Step 3: Edit `supabase/tests/22_get_completed_and_shared_run_responses_test.sql`**

Line 8: `select plan(10);` → `select plan(11);`

Replace lines 19-21 with:

```sql
-- create_church_with_admin seeds only an in_progress run; add a COMPLETE run for this church.
-- ADR 0003: get_completed_run_responses resolves the run through current_run() — the EARLIEST run
-- by created_at, status-agnostic — so this complete run is back-dated to be the church's current run.
insert into assessment_runs (church_id, methodology_version, status, completed_at, created_at)
values ((select id from churches where name = 'Completed Responses Church'), '0.1.0', 'complete', now(), now() - interval '1 day');
```

Replace lines 55-57 with:

```sql
select is((select count(*)::int from get_completed_run_responses(
            (select id from churches where name = 'Completed Responses Church')) where item_id = 'C1'), 0,
          'the later run''s rows are EXCLUDED (current_run = the earliest run)');
```

Insert BEFORE `select * from finish();` (line 114):

```sql
-- ── ADR 0003: status-agnostic — the same rows come back once the current run is in_progress ──
reset role;
update assessment_runs set status = 'in_progress', completed_at = null
where church_id = (select id from churches where name = 'Completed Responses Church')
  and status = 'complete';
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"ccradmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_completed_run_responses(
            (select id from churches where name = 'Completed Responses Church'))), 3,
          'returns rows when the current run is in_progress (status-agnostic — ADR 0003)');
```

- [ ] **Step 4: Edit `supabase/tests/24_outreach_reflection_test.sql`**

Replace lines 162-171 (from `reset role;` through the `insert into responses … 'wonderful welcome team'\n);`) with:

```sql
reset role;
-- ADR 0003: get_run_responses / get_completed_run_responses both resolve the church's CURRENT run
-- (current_run(), earliest by created_at, status-agnostic), so the reflection row is seeded on that
-- run — no second "complete" run is needed for the read RPCs to see it.
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label, reflection)
values (
  (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') order by created_at asc limit 1),
  (select id from churches where name = 'Outreach Reflection Church'),
  'guest', 'G1', 5, 'member', 'd1111111-1111-1111-1111-111111111111', 'Member',
  'wonderful welcome team'
);
```

Replace line 193 (the `run_id` subselect inside the `report_shares` insert) with:

```sql
  (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') order by created_at asc limit 1),
```

`plan(19)` unchanged. Verify with `grep -n "status = 'complete'" supabase/tests/24_outreach_reflection_test.sql` → no output.

- [ ] **Step 5: Create `supabase/tests/26_close_run_test.sql`**

```sql
-- pgTAP for close_run (20260818000100_close_reopen_run.sql; ADR 0003).
--
-- OWNER-APPLIED: the agent never runs `npm run test:db` / `supabase test db`. Written against the
-- seeding / identity-simulation pattern of 12_save_diagnosis_test.sql and
-- 17_report_share_manage_test.sql, NOT executed by the agent.
begin;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('26262626-2626-2626-2626-262626262626','authenticated','authenticated','closeadmin@test.com','x',now(),now()),
 ('26262626-2626-2626-2626-262626262627','authenticated','authenticated','closeviewer@test.com','x',now(),now()),
 ('26262626-2626-2626-2626-262626262628','authenticated','authenticated','closestranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262626","email":"closeadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Close Run Church', '#262626', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Close Run Church'),
        '26262626-2626-2626-2626-262626262627', 'viewer',
        '26262626-2626-2626-2626-262626262626');

-- ── precondition ────────────────────────────────────────────────────────────
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')), 'in_progress',
          'precondition: create_church_with_admin seeds an in_progress run');

-- ── admin gate (require_church_admin) ───────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262627","email":"closeviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot close the run');

set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262628","email":"closestranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  '42501', 'must be an admin of this church', 'a non-member cannot close the run');

-- anon cannot execute the function at all (revoked); assert SQLSTATE only
reset role;
set local role anon;
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  '42501');

-- ── a member can answer while the run is open (precondition for the refusal below) ──
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262627","email":"closeviewer@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Close Run Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'a member can answer while the run is open');

-- ── admin closes ────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262626","email":"closeadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  'admin closes the run');
reset role;

select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')), 'complete',
          'close sets status = complete');
select ok((select closed_at is not null and completed_at is not null from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')),
          'close stamps closed_at and completed_at');
select is((select closed_by from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')),
          '26262626-2626-2626-2626-262626262626'::uuid,
          'closed_by is the closing admin');

-- ── double close raises ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262626","email":"closeadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  'run is already closed',
  'closing an already-closed run raises');

-- ── Close means read-only: submit_self_response (untouched) refuses ─────────
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262627","email":"closeviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Close Run Church'), 'guest',
      '[{"item_id":"G1","value":9},{"item_id":"G2","value":9},{"item_id":"G3","value":9},
        {"item_id":"G4","value":9},{"item_id":"G5","value":9}]'::jsonb)$$,
  'run is complete; answers are read-only',
  'a member cannot answer once the run is closed');

-- ── coverage RPCs are unaffected by status ──────────────────────────────────
select is((select count(*)::int from get_member_run_coverage(
            (select id from churches where name = 'Close Run Church'))), 5,
          'get_member_run_coverage still returns the member''s 5 answered items after close');

select * from finish();
rollback;
```

- [ ] **Step 6: Create `supabase/tests/27_reopen_run_test.sql`**

```sql
-- pgTAP for reopen_run (20260818000100_close_reopen_run.sql; ADR 0003).
--
-- OWNER-APPLIED: the agent never runs `npm run test:db` / `supabase test db`. Mirrors
-- 26_close_run_test.sql; NOT executed by the agent.
begin;
select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('27272727-2727-2727-2727-272727272727','authenticated','authenticated','reopenadmin@test.com','x',now(),now()),
 ('27272727-2727-2727-2727-272727272728','authenticated','authenticated','reopenviewer@test.com','x',now(),now()),
 ('27272727-2727-2727-2727-272727272729','authenticated','authenticated','reopenstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Reopen Run Church', '#272727', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Reopen Run Church'),
        '27272727-2727-2727-2727-272727272728', 'viewer',
        '27272727-2727-2727-2727-272727272727');

-- ── reopening an OPEN run raises ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  'run is not closed',
  'reopening an open run raises');

-- ── close it first (through close_run, the only production writer) ──────────
select lives_ok(
  $$select close_run((select id from churches where name = 'Reopen Run Church'))$$,
  'admin closes the run');
reset role;
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')), 'complete',
          'precondition: the run is closed');

-- ── admin gate ──────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272728","email":"reopenviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot reopen the run');

set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272729","email":"reopenstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  '42501', 'must be an admin of this church', 'a non-member cannot reopen the run');

reset role;
set local role anon;
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  '42501');

-- ── while closed, the member is refused ─────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272728","email":"reopenviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Reopen Run Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'run is complete; answers are read-only',
  'a member cannot answer while the run is closed');

-- ── admin reopens ───────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  'admin reopens the run');
reset role;

select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')), 'in_progress',
          'reopen sets status = in_progress');
select ok((select closed_at is null and closed_by is null and completed_at is null from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')),
          'reopen clears closed_at, closed_by and completed_at');

-- ── the member can answer again ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272728","email":"reopenviewer@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Reopen Run Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'a member can answer again after reopen');

-- ── coverage RPCs are unaffected by the round trip ──────────────────────────
select is((select count(*)::int from get_member_run_coverage(
            (select id from churches where name = 'Reopen Run Church'))), 5,
          'get_member_run_coverage returns the member''s 5 answered items after reopen');

-- ── old-path run (complete, closed_at null — closed by Generate before ADR 0003) reopens ──
reset role;
update assessment_runs set status = 'complete', completed_at = now(), closed_at = null, closed_by = null
where church_id = (select id from churches where name = 'Reopen Run Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  'an old-path complete run (closed_at null) can be reopened — the Test Church fix');
reset role;
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')), 'in_progress',
          'the old-path run is in_progress after reopen');

select * from finish();
rollback;
```

- [ ] **Step 7: Sanity-check plan counts by hand** — 12_: 8 `is/ok/throws_ok/lives_ok` calls; 11_: 8; 22_: 11; 24_: 19; 26_: 12; 27_: 14. Run: `grep -c "select is(\|select ok(\|select throws_ok(\|select lives_ok(" supabase/tests/26_close_run_test.sql supabase/tests/27_reopen_run_test.sql supabase/tests/12_save_diagnosis_test.sql supabase/tests/22_get_completed_and_shared_run_responses_test.sql` and compare with each file's `plan(N)`. (Owner runs `npm run test:db` after Task 2 — the agent does not.)

- [ ] **Step 8: Commit**

```bash
git add supabase/tests/11_get_run_responses_test.sql supabase/tests/12_save_diagnosis_test.sql supabase/tests/22_get_completed_and_shared_run_responses_test.sql supabase/tests/24_outreach_reflection_test.sql supabase/tests/26_close_run_test.sql supabase/tests/27_reopen_run_test.sql
git commit -m "test(pgtap): close_run / reopen_run contract; save_diagnosis no longer writes status (ADR 0003)"
```

---

### Task 2: Migration `20260818000100_close_reopen_run.sql` + vitest tripwire

**Files:**
- Create: `tests/runs/close-reopen-migration.test.ts`
- Create: `supabase/migrations/20260818000100_close_reopen_run.sql`

**Interfaces:**
- Consumes: `public.current_run(p_church_id uuid) returns setof public.assessment_runs`; `public.require_church_admin(p_run_id uuid) returns uuid` (raises 42501); `auth.uid()`.
- Produces: `public.close_run(p_church_id uuid) returns void`, `public.reopen_run(p_church_id uuid) returns void` (both `grant execute … to authenticated`); columns `assessment_runs.closed_at timestamptz null`, `assessment_runs.closed_by uuid null references auth.users`; `save_diagnosis` no longer raises `run is already complete` nor writes status; `get_run_responses`/`get_completed_run_responses` return the current run's rows regardless of status.

- [ ] **Step 1: Write the failing tripwire `tests/runs/close-reopen-migration.test.ts`**

```ts
// Source-reading tripwire (agent cannot run pgTAP — owner-only). ADR 0003: completion is an
// explicit, reversible admin action (close_run / reopen_run); save_diagnosis no longer writes run
// status; the two report-path read RPCs resolve the run through current_run() (status-agnostic).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260818000100_close_reopen_run.sql'),
  'utf8',
)
// Strip SQL line comments so negative assertions test the CODE, not the header prose.
const CODE = SQL.replace(/--.*$/gm, '')

/** The text of one `create [or replace] function public.<name>(` … up to its terminating `$$;`. */
function fnBody(name: string): string {
  const start = CODE.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`))
  expect(start, `${name} must be defined in the migration`).toBeGreaterThan(-1)
  const end = CODE.indexOf('$$;', start)
  expect(end, `${name} body must terminate with $$;`).toBeGreaterThan(start)
  return CODE.slice(start, end)
}

describe('close / reopen migration — columns', () => {
  it('adds the nullable audit pair to assessment_runs (closed_by FK follows granted_by/accepted_by)', () => {
    expect(CODE).toContain('alter table public.assessment_runs')
    expect(CODE).toContain('add column closed_at timestamptz null')
    expect(CODE).toContain('add column closed_by uuid null references auth.users')
    // No CHECK churn: status stays 'in_progress' | 'complete'.
    expect(CODE).not.toMatch(/check\s*\(\s*status/i)
  })
})

describe('close_run', () => {
  const body = fnBody('close_run')
  it('is a security-definer admin action resolved through current_run', () => {
    expect(body).toContain('security definer set search_path = public')
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('perform public.require_church_admin(v_run.id)')
    expect(body).toContain("'no run for this church'")
  })
  it('refuses a double close and stamps status + audit columns', () => {
    expect(body).toContain("raise exception 'run is already closed'")
    expect(body).toMatch(/set status = 'complete',\s*completed_at = now\(\),\s*closed_at = now\(\),\s*closed_by = auth\.uid\(\)/)
  })
  it('has least-privilege grants', () => {
    expect(SQL).toContain('revoke all on function public.close_run(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.close_run(uuid) to authenticated')
  })
})

describe('reopen_run', () => {
  const body = fnBody('reopen_run')
  it('mirrors close_run', () => {
    expect(body).toContain('security definer set search_path = public')
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('perform public.require_church_admin(v_run.id)')
    expect(body).toContain("raise exception 'run is not closed'")
    expect(body).toMatch(/set status = 'in_progress',\s*completed_at = null,\s*closed_at = null,\s*closed_by = null/)
  })
  it('has least-privilege grants', () => {
    expect(SQL).toContain('revoke all on function public.reopen_run(uuid) from public, anon')
    expect(SQL).toContain('grant execute on function public.reopen_run(uuid) to authenticated')
  })
})

describe('save_diagnosis (re-created)', () => {
  const body = fnBody('save_diagnosis')
  it('keeps the same signature, admin gate, and idempotent insert', () => {
    expect(body).toContain('p_church_id uuid')
    expect(body).toContain('p_response_hash text')
    expect(body).toContain('p_methodology_version text')
    expect(body).toContain('p_payload jsonb')
    expect(body).toContain(') returns void')
    expect(body).toContain("raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege'")
    expect(body).toContain('from public.current_run(p_church_id)')
    expect(body).toContain('on conflict (run_id, response_hash) do nothing')
  })
  it('no longer gates on status nor writes it', () => {
    expect(body).not.toContain('run is already complete')
    expect(body).not.toContain('v_status')
    expect(body).not.toMatch(/set status\s*=/)
    expect(body).not.toContain('completed_at')
  })
  it('keeps the grants', () => {
    expect(SQL).toContain('revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon')
    expect(SQL).toContain('grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated')
  })
})

describe('get_run_responses / get_completed_run_responses (re-created, status-agnostic)', () => {
  const RETURNS =
    'returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)'
  for (const name of ['get_run_responses', 'get_completed_run_responses'] as const) {
    describe(name, () => {
      const body = fnBody(name)
      it('keeps the exact return type (plain create or replace, no drop)', () => {
        expect(body).toContain(RETURNS)
        expect(CODE).not.toContain(`drop function if exists public.${name}`)
      })
      it('resolves the run through current_run() with no inline status filter', () => {
        expect(body).toContain('select id into v_run_id from public.current_run(p_church_id)')
        expect(body).not.toMatch(/status\s*=\s*'in_progress'/)
        expect(body).not.toMatch(/status\s*=\s*'complete'/)
        expect(body).not.toContain('from public.assessment_runs')
      })
      it('keeps the member gate and projection', () => {
        expect(body).toContain("raise exception 'not a member of this church' using errcode = 'insufficient_privilege'")
        expect(body).toContain('select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection')
      })
      it('keeps the grants', () => {
        expect(SQL).toContain(`revoke all on function public.${name}(uuid) from public, anon`)
        expect(SQL).toContain(`grant execute on function public.${name}(uuid) to authenticated`)
      })
    })
  }
})

describe('the seam is used everywhere in this migration', () => {
  it('resolves the run via current_run in all five functions and never inline', () => {
    const calls = CODE.match(/current_run\(p_church_id\)/g) ?? []
    expect(calls.length).toBe(5)
    const inlineLookups = CODE.match(/from public\.assessment_runs\s+where church_id = p_church_id/g) ?? []
    expect(inlineLookups.length).toBe(0)
  })
  it('names ADR 0003 in the header', () => {
    expect(SQL).toContain('docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/runs/close-reopen-migration.test.ts`
Expected: FAIL — `ENOENT … 20260818000100_close_reopen_run.sql`.

- [ ] **Step 3: Create `supabase/migrations/20260818000100_close_reopen_run.sql`**

```sql
-- Close / Reopen assessment (docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md, which
-- amends docs/adr/0001-review-only-completion-defer-multi-run.md; spec
-- docs/superpowers/specs/2026-08-18-close-assessment-design.md).
--
-- Completion becomes an explicit, REVERSIBLE admin action. Until now the only writer of
-- assessment_runs.status = 'complete' was save_diagnosis (20260730000100:138-140), so the moment an
-- admin generated a diagnosis every member who had not finished — including people invited
-- afterwards — landed on read-only pages and submit_self_response refused their writes.
--
-- 1. assessment_runs gains the audit pair closed_at / closed_by. Nullable; no CHECK change — status
--    stays 'in_progress' | 'complete'; completed_at is still stamped on close so existing readers
--    (report cover date, pgTAP seeds) keep working. closed_by follows granted_by / accepted_by:
--    `references auth.users`, no ON DELETE clause.
-- 2. close_run(p_church_id) / reopen_run(p_church_id): SECURITY DEFINER, run resolved through
--    current_run() (never an inline status filter — tests/coverage/current-run-dedup.test.ts), then
--    gated by require_church_admin — which takes the RUN id (20260718000300:9), so resolution comes
--    first, exactly as save_report does (20260814000100:48-57).
-- 3. save_diagnosis re-created byte-identical to 20260730000100:103-145 MINUS the
--    `run is already complete` gate and the status/completed_at flip (and the now-unused v_status).
--    Generate no longer touches run status; it works before and after Close.
-- 4. get_run_responses / get_completed_run_responses re-created with the inline
--    `status = 'in_progress'` / `status = 'complete'` lookups replaced by current_run(). Both are now
--    status-agnostic and equivalent; the names are kept so the four call sites (diagnosis/actions.ts
--    generate + regenerate, diagnosis/page.tsx, pdf/route.ts) do not move — unification is a later
--    slice (ADR 0003). This closes ADR 0001's own "still pending" follow-up for these two.
--
-- Untouched: submit_self_response (still refuses on 'complete' — that is what makes Close mean
-- read-only), completion_reminder_recipients (reminders stop on Close, resume on Reopen — accepted),
-- deadline RPCs, sharing RPCs, save_report, RLS (members already have runs_select, so they can read
-- closed_at without a policy change).
--
-- ⚠️ Owner-gated: apply with `supabase db push` and verify with `npm run test:db` (pgTAP 11_/12_/
-- 22_/24_/26_/27_). The agent cannot run either; the vitest tripwire
-- tests/runs/close-reopen-migration.test.ts only source-reads this file. Every replaced function
-- keeps its return type, so plain `create or replace` applies; if `db push` reports 42P13 on one of
-- them, use `drop function … ; create function …` for that one in this same file.

-- ── 1. audit columns ────────────────────────────────────────────────────────────────────────────
alter table public.assessment_runs
  add column closed_at timestamptz null,
  add column closed_by uuid null references auth.users;

-- ── 2a. close_run ───────────────────────────────────────────────────────────────────────────────
create function public.close_run(p_church_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.assessment_runs;
begin
  select * into v_run from public.current_run(p_church_id);
  if v_run.id is null then
    raise exception 'no run for this church';
  end if;

  -- require_church_admin takes a RUN id, not a church id (20260718000300:9). It also authenticates
  -- (raises 'not authenticated' on a null auth.uid()). It has no execute grant — reachable only
  -- because this function is security definer and runs as the owner.
  perform public.require_church_admin(v_run.id);

  if v_run.status = 'complete' then
    raise exception 'run is already closed';
  end if;

  update public.assessment_runs
  set status = 'complete',
      completed_at = now(),
      closed_at = now(),
      closed_by = auth.uid()
  where id = v_run.id;
end;
$$;

revoke all on function public.close_run(uuid) from public, anon;
grant execute on function public.close_run(uuid) to authenticated;

-- ── 2b. reopen_run ──────────────────────────────────────────────────────────────────────────────
create function public.reopen_run(p_church_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.assessment_runs;
begin
  select * into v_run from public.current_run(p_church_id);
  if v_run.id is null then
    raise exception 'no run for this church';
  end if;

  perform public.require_church_admin(v_run.id);

  if v_run.status <> 'complete' then
    raise exception 'run is not closed';
  end if;

  update public.assessment_runs
  set status = 'in_progress',
      completed_at = null,
      closed_at = null,
      closed_by = null
  where id = v_run.id;
end;
$$;

revoke all on function public.reopen_run(uuid) from public, anon;
grant execute on function public.reopen_run(uuid) to authenticated;

-- ── 3. save_diagnosis: no status gate, no status write ──────────────────────────────────────────
create or replace function public.save_diagnosis(
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

  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    raise exception 'no active run for this church';
  end if;

  insert into public.diagnoses (run_id, response_hash, methodology_version, payload)
  values (v_run_id, p_response_hash, p_methodology_version, p_payload)
  on conflict (run_id, response_hash) do nothing;
end;
$$;

revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated;

-- ── 4a. get_run_responses: current_run(), status-agnostic ───────────────────────────────────────
create or replace function public.get_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)
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

  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_run_responses(uuid) from public, anon;
grant execute on function public.get_run_responses(uuid) to authenticated;

-- ── 4b. get_completed_run_responses: current_run(), status-agnostic ─────────────────────────────
create or replace function public.get_completed_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)
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

  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_completed_run_responses(uuid) from public, anon;
grant execute on function public.get_completed_run_responses(uuid) to authenticated;
```

- [ ] **Step 4: Run the tripwire and the pre-existing migration tests**

Run: `npx vitest run tests/runs/close-reopen-migration.test.ts tests/coverage/current-run-dedup.test.ts tests/deadlines/migration-submit-lock.test.ts tests/report/migration-save-report-upsert.test.ts`
Expected: PASS (all four files).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818000100_close_reopen_run.sql tests/runs/close-reopen-migration.test.ts
git commit -m "feat(db): close_run / reopen_run; save_diagnosis stops writing status; read RPCs on current_run (ADR 0003)"
```

---

### Task 3: `lib/data/runs.ts` seam

**Files:**
- Create: `lib/data/runs.ts`
- Test: `tests/data/runs.test.ts`

**Interfaces:**
- Consumes: `close_run` / `reopen_run` RPCs (Task 2).
- Produces: `closeRun(supabase: SupabaseServerClient, churchId: string): Promise<{ error: string | null }>` and `reopenRun(...)` with the same shape (`SupabaseServerClient = Awaited<ReturnType<typeof createClient>>` from `@/lib/supabase/server`). Task 6 calls both.

- [ ] **Step 1: Write the failing test `tests/data/runs.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { closeRun, reopenRun } from '@/lib/data/runs'

type ClientType = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

function fakeClient(opts: {
  rpcError?: unknown
  rpcCalls?: Array<{ name: string; args: Record<string, unknown> }>
}) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      opts.rpcCalls?.push({ name, args })
      return { data: null, error: opts.rpcError ?? null }
    },
  } as unknown as ClientType
}

describe('closeRun()', () => {
  it('calls close_run with the church id and returns no error on success', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const res = await closeRun(fakeClient({ rpcCalls }), 'c1')
    expect(res).toEqual({ error: null })
    expect(rpcCalls).toEqual([{ name: 'close_run', args: { p_church_id: 'c1' } }])
  })
  it('surfaces the RPC refusal message (e.g. run is already closed)', async () => {
    const res = await closeRun(fakeClient({ rpcError: { message: 'run is already closed' } }), 'c1')
    expect(res).toEqual({ error: 'run is already closed' })
  })
})

describe('reopenRun()', () => {
  it('calls reopen_run with the church id and returns no error on success', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const res = await reopenRun(fakeClient({ rpcCalls }), 'c1')
    expect(res).toEqual({ error: null })
    expect(rpcCalls).toEqual([{ name: 'reopen_run', args: { p_church_id: 'c1' } }])
  })
  it('surfaces the RPC refusal message (e.g. run is not closed)', async () => {
    const res = await reopenRun(fakeClient({ rpcError: { message: 'run is not closed' } }), 'c1')
    expect(res).toEqual({ error: 'run is not closed' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/data/runs.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/data/runs"`.

- [ ] **Step 3: Create `lib/data/runs.ts`**

```ts
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Close the church's current run via the admin-gated `close_run` RPC (ADR 0003). Returns the RPC's
 * refusal message (`run is already closed`, `must be an admin of this church`, …) rather than
 * throwing, so the server action can map it to inline copy. Reads through the anon-key RLS client;
 * the RPC is SECURITY DEFINER and gates on require_church_admin itself.
 */
export async function closeRun(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('close_run', { p_church_id: churchId })
  return { error: error?.message ?? null }
}

/**
 * Reopen the church's current run via `reopen_run` (ADR 0003). Same contract as closeRun; the RPC
 * refuses with `run is not closed` when the run is already open.
 */
export async function reopenRun(
  supabase: SupabaseServerClient,
  churchId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reopen_run', { p_church_id: churchId })
  return { error: error?.message ?? null }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/data/runs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data/runs.ts tests/data/runs.test.ts
git commit -m "feat(data): closeRun / reopenRun seam over close_run / reopen_run"
```

---

### Task 4: `Run` shape gains `closed_at` / `closed_by` (typecheck boundary)

**Files:**
- Modify: `lib/runs/current-run.ts:7-15, 40`
- Modify: `tests/runs/current-run.test.ts:69-77`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface Run { id: string; status: RunStatus; methodology_version: string | null; closed_at: string | null; closed_by: string | null }`; `currentRun()` selects `'id, status, methodology_version, closed_at, closed_by'`. Task 9 reads `run?.closed_at`.

- [ ] **Step 1: Update the failing test — replace the `selects methodology_version alongside id and status` block (`tests/runs/current-run.test.ts:69-77`) and add one passthrough case**

```ts
  // ADR 0003: the answer page reads closed_at for the "closed by your church admin on <date>"
  // copy, and currentRun is the ONE canonical run lookup — extend it rather than add a second query.
  it('selects closed_at and closed_by alongside id, status and methodology_version', async () => {
    // Mutation guard: catches the select column list left at the old shape. A silently missing
    // closed_at column would make run.closed_at read `undefined` for EVERY run — indistinguishable at
    // the answer page from an old-path run, so the closed-date copy would never render.
    const selectCols: string[] = []
    await currentRun(
      fakeClient({ data: { id: 'r1', status: 'in_progress', methodology_version: '0.2.0', closed_at: null, closed_by: null }, error: null }, [], selectCols),
      'c1',
    )
    expect(selectCols).toEqual(['id, status, methodology_version, closed_at, closed_by'])
  })
  it('passes closed_at / closed_by through untouched (null for an open or old-path run)', async () => {
    const closed = await currentRun(
      fakeClient({ data: { id: 'r1', status: 'complete', methodology_version: '0.3.0', closed_at: '2026-08-18T14:03:00.000Z', closed_by: 'u1' }, error: null }),
      'c1',
    )
    expect(closed?.closed_at).toBe('2026-08-18T14:03:00.000Z')
    expect(closed?.closed_by).toBe('u1')
    const open = await currentRun(
      fakeClient({ data: { id: 'r1', status: 'in_progress', methodology_version: '0.3.0', closed_at: null, closed_by: null }, error: null }),
      'c1',
    )
    expect(open?.closed_at).toBeNull()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/runs/current-run.test.ts`
Expected: FAIL on the select-list assertion (`['id, status, methodology_version']` ≠ expected).

- [ ] **Step 3: Edit `lib/runs/current-run.ts`**

Replace the `Run` interface (lines 7-15) with:

```ts
export interface Run {
  id: string
  status: RunStatus
  /** assessment_runs.methodology_version — null for any run created before the column was
   *  stamped. Feeds effectiveMethodologyForRun / isExemptMember at call sites; never defaulted
   *  here (each call site does its own `?? null`, never a non-null fallback — see
   *  lib/methodology/effective.ts's predatesOutreach(null) === true contract). */
  methodology_version: string | null
  /** assessment_runs.closed_at — stamped by close_run, cleared by reopen_run (ADR 0003). Null for an
   *  open run AND for an old-path run completed by Generate before ADR 0003; call sites fall back
   *  to the dateless copy in that case, never invent a date. */
  closed_at: string | null
  /** assessment_runs.closed_by — the closing admin's auth.uid(); same null semantics as closed_at. */
  closed_by: string | null
}
```

Line 40: `.select('id, status, methodology_version')` → `.select('id, status, methodology_version, closed_at, closed_by')`.

Also update the `canAcceptAnswers` doc comment (lines 17-22) — replace `once `save_diagnosis` completes the run (terminal in v1), answers are read-only` with `once an admin closes the run (`close_run` — reversible via `reopen_run`, ADR 0003), answers are read-only`.

- [ ] **Step 4: Run tests + typecheck (boundary)**

Run: `npx vitest run tests/runs/current-run.test.ts && npm run typecheck`
Expected: PASS; `tsc --noEmit` clean. (`Run` is only constructed inside `currentRun` via `data as Run | null`, and no other file builds a `Run` literal — `grep -rn ": Run\b\|as Run\|<Run>" app lib tests` returns only `lib/runs/current-run.ts:46`. If tsc reports a site, add `closed_at: null, closed_by: null` there.)

- [ ] **Step 5: Commit**

```bash
git add lib/runs/current-run.ts tests/runs/current-run.test.ts
git commit -m "feat(runs): Run shape gains closed_at / closed_by (ADR 0003)"
```

---

### Task 5: Pure copy + error mapping (`lib/runs/close-reopen.ts`) and `finishedMemberCount`

**Files:**
- Create: `lib/runs/close-reopen.ts`
- Create: `lib/coverage/finished-members.ts`
- Test: `tests/runs/close-reopen.test.ts`, `tests/coverage/finished-members.test.ts`

**Interfaces:**
- Consumes: `MemberMatrixRow` from `@/lib/coverage/member-matrix`.
- Produces (used by Tasks 6-9):
  - `closeConfirmText(finished: number, total: number): string`
  - `REOPEN_CONFIRM_TEXT: string`
  - `closedDateLabel(closedAt: string): string` → `"August 18, 2026"` (en-US, UTC)
  - `closedLineText(closedAt: string | null): string` → `"Assessment closed on August 18, 2026"` | `"Assessment closed"`
  - `openNoteText(finished: number, total: number): string`
  - `closedReadOnlyCopy(closedAt: string): string`
  - `CLOSE_REOPEN_ERRORS: { alreadyClosed; alreadyOpen; notAllowed; generic }`
  - `mapCloseReopenError(message: string): string`
  - `type RunActionResult = { ok: true } | { ok: false; error: string }`
  - `finishedMemberCount(matrix: MemberMatrixRow[]): { finished: number; total: number }`

- [ ] **Step 1: Write the failing tests**

`tests/runs/close-reopen.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CLOSE_REOPEN_ERRORS,
  REOPEN_CONFIRM_TEXT,
  closeConfirmText,
  closedDateLabel,
  closedLineText,
  closedReadOnlyCopy,
  mapCloseReopenError,
  openNoteText,
} from '@/lib/runs/close-reopen'

const CLOSED_AT = '2026-08-18T14:03:00.000Z'

describe('close / reopen copy (spec §5, verbatim)', () => {
  it('close confirm names N of M and the reopen escape hatch', () => {
    expect(closeConfirmText(3, 8)).toBe(
      '3 of 8 members have finished. After closing, members can review but not change their answers. You can reopen later.',
    )
    // both directions: the numbers are interpolated, not baked in
    expect(closeConfirmText(0, 1)).toContain('0 of 1 members have finished.')
  })
  it('reopen confirm warns about edits and reminder emails', () => {
    expect(REOPEN_CONFIRM_TEXT).toBe(
      'Members will be able to change their answers again and reminder emails may resume.',
    )
  })
  it('formats the closed date en-US / UTC like the report cover', () => {
    expect(closedDateLabel(CLOSED_AT)).toBe('August 18, 2026')
    // UTC, not local: 23:30Z on the 18th must not roll to the 19th on a US machine
    expect(closedDateLabel('2026-08-18T23:30:00.000Z')).toBe('August 18, 2026')
  })
  it('dashboard closed line: dated when closed_at is known, dateless for an old-path run', () => {
    expect(closedLineText(CLOSED_AT)).toBe('Assessment closed on August 18, 2026')
    expect(closedLineText(null)).toBe('Assessment closed')
  })
  it('diagnosis open note names N of M', () => {
    expect(openNoteText(2, 5)).toBe(
      "This assessment is still open — 2 of 5 members have finished. Regenerate after closing to include everyone's answers.",
    )
  })
  it('answer page closed copy names the admin and the date', () => {
    expect(closedReadOnlyCopy(CLOSED_AT)).toBe(
      'This assessment was closed by your church admin on August 18, 2026, so your answers are read-only.',
    )
  })
})

describe('mapCloseReopenError() (spec §7)', () => {
  it('maps the two stale-state refusals to refresh copy', () => {
    expect(mapCloseReopenError('run is already closed')).toBe('Already closed — refresh to see the latest state')
    expect(mapCloseReopenError('run is not closed')).toBe('Already open — refresh to see the latest state')
    expect(CLOSE_REOPEN_ERRORS.alreadyClosed).toBe('Already closed — refresh to see the latest state')
    expect(CLOSE_REOPEN_ERRORS.alreadyOpen).toBe('Already open — refresh to see the latest state')
  })
  it('maps admin-gate refusals to Not allowed', () => {
    expect(mapCloseReopenError('must be an admin of this church')).toBe('Not allowed')
    expect(mapCloseReopenError('not authenticated')).toBe('Not allowed')
    expect(CLOSE_REOPEN_ERRORS.notAllowed).toBe('Not allowed')
  })
  it('maps anything else to the generic message and never echoes the raw error', () => {
    const out = mapCloseReopenError('connection reset by peer')
    expect(out).toBe(CLOSE_REOPEN_ERRORS.generic)
    expect(out).not.toContain('peer')
  })
})
```

`tests/coverage/finished-members.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { finishedMemberCount } from '@/lib/coverage/finished-members'
import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

function row(userId: string, statuses: Array<'not_started' | 'partial' | 'covered'>): MemberMatrixRow {
  return {
    member: { user_id: userId, full_name: null, email: `${userId}@t.com`, assessment_deadline_at: null },
    cells: statuses.map((status, i) => ({ category_id: `cat${i}`, status })),
  }
}

describe('finishedMemberCount()', () => {
  it('counts a member as finished only when EVERY cell is covered', () => {
    const matrix = [
      row('u1', ['covered', 'covered', 'covered']),
      row('u2', ['covered', 'partial', 'covered']),
      row('u3', ['not_started', 'not_started', 'not_started']),
    ]
    expect(finishedMemberCount(matrix)).toEqual({ finished: 1, total: 3 })
  })
  it('moves in both directions when a cell flips', () => {
    const before = [row('u1', ['covered', 'partial'])]
    const after = [row('u1', ['covered', 'covered'])]
    expect(finishedMemberCount(before).finished).toBe(0)
    expect(finishedMemberCount(after).finished).toBe(1)
  })
  it('is 0 of 0 for an empty matrix (viewers never see the control anyway)', () => {
    expect(finishedMemberCount([])).toEqual({ finished: 0, total: 0 })
  })
  it('does not count a member with zero cells as finished (vacuous every())', () => {
    expect(finishedMemberCount([row('u1', [])])).toEqual({ finished: 0, total: 1 })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/runs/close-reopen.test.ts tests/coverage/finished-members.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Create `lib/runs/close-reopen.ts`**

```ts
/**
 * Copy, error mapping, and the action result type for the admin Close / Reopen assessment feature
 * (ADR 0003, spec docs/superpowers/specs/2026-08-18-close-assessment-design.md §5 / §7).
 *
 * Pure — no IO, no React, no 'use client' / 'use server' — so the server actions, the client
 * control, and three server pages all read ONE source. Strings are the spec's, verbatim.
 */

export type RunActionResult = { ok: true } | { ok: false; error: string }

/** Close confirm (dashboard). N/M come from finishedMemberCount(memberMatrix). */
export function closeConfirmText(finished: number, total: number): string {
  return `${finished} of ${total} members have finished. After closing, members can review but not change their answers. You can reopen later.`
}

/** Reopen confirm (dashboard). */
export const REOPEN_CONFIRM_TEXT =
  'Members will be able to change their answers again and reminder emails may resume.'

/** "August 18, 2026" — en-US, UTC: the report cover's own convention (diagnosis/page.tsx dateLabel),
 *  and deterministic under test regardless of the machine's zone. */
export function closedDateLabel(closedAt: string): string {
  return new Date(closedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Dashboard line for a closed run. An old-path run (completed by Generate before ADR 0003) has no
 *  closed_at; the date is omitted rather than invented. */
export function closedLineText(closedAt: string | null): string {
  return closedAt ? `Assessment closed on ${closedDateLabel(closedAt)}` : 'Assessment closed'
}

/** Diagnosis page note while the run is still open (Q4). */
export function openNoteText(finished: number, total: number): string {
  return `This assessment is still open — ${finished} of ${total} members have finished. Regenerate after closing to include everyone's answers.`
}

/** Answer page read-only copy once closed_at is known. The answer page keeps today's sentence
 *  ("This assessment is complete, so your answers are read-only.") inline as the null fallback. */
export function closedReadOnlyCopy(closedAt: string): string {
  return `This assessment was closed by your church admin on ${closedDateLabel(closedAt)}, so your answers are read-only.`
}

export const CLOSE_REOPEN_ERRORS = {
  alreadyClosed: 'Already closed — refresh to see the latest state',
  alreadyOpen: 'Already open — refresh to see the latest state',
  notAllowed: 'Not allowed',
  generic: 'Something went wrong. Please try again.',
} as const

/**
 * Maps a close_run / reopen_run refusal (the RPC's raise message) to inline copy (spec §7). Never
 * echoes the raw database error to the browser.
 */
export function mapCloseReopenError(message: string): string {
  if (message.includes('run is already closed')) return CLOSE_REOPEN_ERRORS.alreadyClosed
  if (message.includes('run is not closed')) return CLOSE_REOPEN_ERRORS.alreadyOpen
  if (message.includes('must be an admin of this church') || message.includes('not authenticated')) {
    return CLOSE_REOPEN_ERRORS.notAllowed
  }
  return CLOSE_REOPEN_ERRORS.generic
}
```

- [ ] **Step 4: Create `lib/coverage/finished-members.ts`**

```ts
import type { MemberMatrixRow } from '@/lib/coverage/member-matrix'

export interface FinishedMemberCount {
  finished: number
  total: number
}

/**
 * "N of M members have finished" for the Close confirm (dashboard) and the still-open note
 * (diagnosis page) — ADR 0003. A member has finished when EVERY cell in their matrix row is
 * 'covered' (classify(): every item answered), which is the same per-member notion assessmentCta
 * maps to 'complete' (coveredCount === categories.length). Computed from the admin matrix the
 * dashboard already builds; pure — no DB. A row with zero cells is not finished (a vacuous
 * every() must not count anyone).
 */
export function finishedMemberCount(matrix: MemberMatrixRow[]): FinishedMemberCount {
  const finished = matrix.filter(
    (row) => row.cells.length > 0 && row.cells.every((cell) => cell.status === 'covered'),
  ).length
  return { finished, total: matrix.length }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/runs/close-reopen.test.ts tests/coverage/finished-members.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/runs/close-reopen.ts lib/coverage/finished-members.ts tests/runs/close-reopen.test.ts tests/coverage/finished-members.test.ts
git commit -m "feat(runs): close/reopen copy + error mapping; finishedMemberCount"
```

---

### Task 6: Server actions `closeAssessment` / `reopenAssessment`

**Files:**
- Create: `app/app/[churchId]/run-actions.ts`
- Test: `tests/runs/run-actions.test.ts`

**Interfaces:**
- Consumes: `requireChurchAdmin(churchId)` → `{ supabase, error }` (`@/lib/auth/require-church-admin`); `closeRun` / `reopenRun` (Task 3); `CLOSE_REOPEN_ERRORS`, `mapCloseReopenError`, `RunActionResult` (Task 5); `revalidatePath` (`next/cache`).
- Produces: `closeAssessment(churchId: string): Promise<RunActionResult>`, `reopenAssessment(churchId: string): Promise<RunActionResult>` — no redirect; revalidates `/app/${churchId}` and `/app/${churchId}/diagnosis` after every RPC call (success OR stale-state refusal, spec §7), never after an app-side auth failure. Task 7's control calls both.

- [ ] **Step 1: Write the failing test `tests/runs/run-actions.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same idiom as tests/report/generate-report-behavior.test.ts: hoist the mocks, replace the modules
// the action imports, THEN import the action (vi.mock is hoisted above imports regardless).
const { mockRequire, mockClose, mockReopen, mockRevalidate } = vi.hoisted(() => ({
  mockRequire: vi.fn(),
  mockClose: vi.fn(),
  mockReopen: vi.fn(),
  mockRevalidate: vi.fn(),
}))
vi.mock('@/lib/auth/require-church-admin', () => ({ requireChurchAdmin: mockRequire }))
vi.mock('@/lib/data/runs', () => ({ closeRun: mockClose, reopenRun: mockReopen }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))

import { closeAssessment, reopenAssessment } from '@/app/app/[churchId]/run-actions'

const CLIENT = { tag: 'rls-client' }
const revalidated = () => mockRevalidate.mock.calls.map((c) => c[0])

beforeEach(() => {
  mockRequire.mockReset()
  mockClose.mockReset()
  mockReopen.mockReset()
  mockRevalidate.mockReset()
  mockRequire.mockResolvedValue({ supabase: CLIENT, error: null })
})

describe('closeAssessment()', () => {
  it('closes through the seam with the RLS client and revalidates dashboard + diagnosis', async () => {
    mockClose.mockResolvedValue({ error: null })
    const res = await closeAssessment('c1')
    expect(res).toEqual({ ok: true })
    expect(mockClose).toHaveBeenCalledWith(CLIENT, 'c1')
    expect(mockReopen).not.toHaveBeenCalled()
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('maps "run is already closed" to the refresh copy AND still revalidates (spec §7)', async () => {
    mockClose.mockResolvedValue({ error: 'run is already closed' })
    const res = await closeAssessment('c1')
    expect(res).toEqual({ ok: false, error: 'Already closed — refresh to see the latest state' })
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('refuses a non-admin before touching the RPC and does NOT revalidate', async () => {
    mockRequire.mockResolvedValue({ supabase: CLIENT, error: 'You must be an admin of this church.' })
    const res = await closeAssessment('c1')
    expect(res).toEqual({ ok: false, error: 'Not allowed' })
    expect(mockClose).not.toHaveBeenCalled()
    expect(revalidated()).toEqual([])
  })
  it('maps the RPC admin refusal to Not allowed', async () => {
    mockClose.mockResolvedValue({ error: 'must be an admin of this church' })
    expect(await closeAssessment('c1')).toEqual({ ok: false, error: 'Not allowed' })
  })
  it('maps an unknown failure to the generic message, never the raw error', async () => {
    mockClose.mockResolvedValue({ error: 'connection reset by peer' })
    const res = await closeAssessment('c1')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('Something went wrong. Please try again.')
      expect(res.error).not.toContain('peer')
    }
  })
})

describe('reopenAssessment()', () => {
  it('reopens through the seam and revalidates dashboard + diagnosis', async () => {
    mockReopen.mockResolvedValue({ error: null })
    const res = await reopenAssessment('c1')
    expect(res).toEqual({ ok: true })
    expect(mockReopen).toHaveBeenCalledWith(CLIENT, 'c1')
    expect(mockClose).not.toHaveBeenCalled()
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('maps "run is not closed" to the refresh copy AND still revalidates', async () => {
    mockReopen.mockResolvedValue({ error: 'run is not closed' })
    const res = await reopenAssessment('c1')
    expect(res).toEqual({ ok: false, error: 'Already open — refresh to see the latest state' })
    expect(revalidated()).toEqual(['/app/c1', '/app/c1/diagnosis'])
  })
  it('refuses a non-admin before touching the RPC', async () => {
    mockRequire.mockResolvedValue({ supabase: CLIENT, error: 'You must be signed in.' })
    expect(await reopenAssessment('c1')).toEqual({ ok: false, error: 'Not allowed' })
    expect(mockReopen).not.toHaveBeenCalled()
    expect(revalidated()).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/runs/run-actions.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/app/[churchId]/run-actions"`.

- [ ] **Step 3: Create `app/app/[churchId]/run-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireChurchAdmin } from '@/lib/auth/require-church-admin'
import { closeRun, reopenRun } from '@/lib/data/runs'
import { CLOSE_REOPEN_ERRORS, mapCloseReopenError, type RunActionResult } from '@/lib/runs/close-reopen'

type RunOp = typeof closeRun

/**
 * Shared body of the two admin run actions (ADR 0003). App-side admin guard first (the same
 * requireChurchAdmin the access + diagnosis actions use), then the single-RPC data op, then
 * revalidate the two surfaces that read run status. Revalidation ALSO runs on a stale-state refusal
 * ("run is already closed" / "run is not closed" — spec §7): that refusal means the page the admin
 * is looking at is out of date, so its next render must be fresh. Never on an auth failure — a
 * non-admin's request must not churn the admin's cache. No redirect: the dashboard re-renders in
 * place and the client control shows the mapped error inline.
 */
async function runAction(churchId: string, op: RunOp): Promise<RunActionResult> {
  const { supabase, error: authErr } = await requireChurchAdmin(churchId)
  if (authErr) return { ok: false, error: CLOSE_REOPEN_ERRORS.notAllowed }

  const { error } = await op(supabase, churchId)
  revalidatePath(`/app/${churchId}`)
  revalidatePath(`/app/${churchId}/diagnosis`)
  if (error) return { ok: false, error: mapCloseReopenError(error) }
  return { ok: true }
}

export async function closeAssessment(churchId: string): Promise<RunActionResult> {
  return runAction(churchId, closeRun)
}

export async function reopenAssessment(churchId: string): Promise<RunActionResult> {
  return runAction(churchId, reopenRun)
}
```

(A `'use server'` file may only EXPORT async functions — `runAction` is a non-exported async helper, and `RunActionResult` is imported as a type from `lib/runs/close-reopen.ts`, so nothing non-async is exported.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/runs/run-actions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/run-actions.ts"
git add tests/runs/run-actions.test.ts
git commit -m "feat(actions): closeAssessment / reopenAssessment server actions (ADR 0003)"
```

---

### Task 7: Dashboard — `CloseReopenControls` client component + wiring

**Files:**
- Create: `app/app/[churchId]/close-reopen-controls.tsx`
- Modify: `app/app/[churchId]/page.tsx:17-25 (imports), 87-93 (run select), 177-183 (after memberMatrix), 279-306 (admin block)`
- Modify: `tests/a11y/live-regions-applied.test.ts:44-53` (add the new consumer to `EXPECTED_CONSUMERS`)
- Test: `tests/dashboard/close-reopen-controls.test.ts`, `tests/dashboard/close-reopen-wiring.test.ts`

**Interfaces:**
- Consumes: `closeAssessment` / `reopenAssessment` (Task 6); `closeConfirmText`, `closedLineText`, `REOPEN_CONFIRM_TEXT`, `RunActionResult` (Task 5); `finishedMemberCount` (Task 5); `RunStatus` (`@/lib/runs/current-run`); `LiveStatus` (`@/components/live-status`).
- Produces: `CloseReopenControls({ churchId, status, closedAt, finished, total })` client component.

- [ ] **Step 1: Write the failing component test `tests/dashboard/close-reopen-controls.test.ts`**

```ts
// `.ts` not `.tsx` (vitest include is tests/**/*.test.ts) — JSX as createElement, as in
// tests/report/web-toolbar.test.ts. react-dom/server renders a 'use client' component with
// useState/useTransition fine (initial state; no interaction). The server-action module is mocked
// so no next/headers import is reached.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/app/[churchId]/run-actions', () => ({
  closeAssessment: vi.fn(),
  reopenAssessment: vi.fn(),
}))

import { CloseReopenControls } from '@/app/app/[churchId]/close-reopen-controls'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'close-reopen-controls.tsx'), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const render = (props: Parameters<typeof CloseReopenControls>[0]) =>
  renderToStaticMarkup(createElement(CloseReopenControls, props))

const OPEN = { churchId: 'c1', status: 'in_progress' as const, closedAt: null, finished: 3, total: 8 }
const CLOSED = { churchId: 'c1', status: 'complete' as const, closedAt: '2026-08-18T14:03:00.000Z', finished: 8, total: 8 }

describe('CloseReopenControls — open run', () => {
  const html = render(OPEN)
  it('renders the Close button and nothing from the closed state', () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Close assessment<\/button>/)
    expect(html).not.toContain('Reopen assessment')
    expect(html).not.toContain('Assessment closed')
  })
  it('always mounts the LiveStatus region (sr-only when empty)', () => {
    expect(html).toMatch(/<p role="alert" class="sr-only"><\/p>/)
  })
})

describe('CloseReopenControls — closed run', () => {
  it('renders the dated closed line in its own <p> plus the Reopen button, and no Close button', () => {
    const html = render(CLOSED)
    // scoped to the carrying element, not "somewhere in the markup"
    expect(html).toMatch(/<p class="font-body text-sm text-ink-soft">Assessment closed on August 18, 2026<\/p>/)
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Reopen assessment<\/button>/)
    expect(html).not.toMatch(/>Close assessment</)
  })
  it('falls back to the dateless line for an old-path run (closed_at null)', () => {
    const html = render({ ...CLOSED, closedAt: null })
    expect(html).toMatch(/<p class="font-body text-sm text-ink-soft">Assessment closed<\/p>/)
    expect(html).not.toContain('Assessment closed on')
    expect(html).toMatch(/>Reopen assessment</)
  })
})

describe('CloseReopenControls — confirm wiring (source-read; window.confirm is not reachable in SSR)', () => {
  it('confirms Close with the N-of-M spec text and Reopen with the reminder text — exactly once each', () => {
    expect(CODE.match(/window\.confirm\(closeConfirmText\(finished, total\)\)/g)?.length).toBe(1)
    expect(CODE.match(/window\.confirm\(REOPEN_CONFIRM_TEXT\)/g)?.length).toBe(1)
    expect(CODE.match(/window\.confirm\(/g)?.length).toBe(2)
  })
  it('routes the confirmed click into the matching server action inside a transition', () => {
    expect(CODE).toContain("import { closeAssessment, reopenAssessment } from './run-actions'")
    expect(CODE).toContain('startTransition(')
    expect(CODE.indexOf('window.confirm(closeConfirmText(finished, total))')).toBeLessThan(CODE.indexOf('run(closeAssessment)'))
    expect(CODE.indexOf('window.confirm(REOPEN_CONFIRM_TEXT)')).toBeLessThan(CODE.indexOf('run(reopenAssessment)'))
  })
  it('surfaces the action error through LiveStatus, imported from the shared primitive', () => {
    expect(CODE).toContain("from '@/components/live-status'")
    expect(CODE).toContain('<LiveStatus message={error} tone="error"')
  })
})
```

- [ ] **Step 2: Write the failing wiring test `tests/dashboard/close-reopen-wiring.test.ts`**

```ts
// Source-reading tripwire (node env, no DOM) — same approach as tests/dashboard/member-matrix.test.ts.
// ADR 0003: the admin dashboard selects run status + closed_at and renders the Close / Reopen control
// next to the Generate / View-diagnosis block, admin-only, fed by finishedMemberCount(memberMatrix).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8'))

describe('dashboard close / reopen wiring', () => {
  it('selects status and closed_at on the run row (it selected neither before)', () => {
    expect(page).toContain(".select('id, methodology_version, status, closed_at')")
    expect(page.match(/\.from\('assessment_runs'\)/g)?.length).toBe(1)
  })
  it('imports the control and the finished counter', () => {
    expect(page).toContain("import { CloseReopenControls } from './close-reopen-controls'")
    expect(page).toContain("import { finishedMemberCount } from '@/lib/coverage/finished-members'")
    expect(page).toContain('const finishedMembers = finishedMemberCount(memberMatrix)')
  })
  it('renders the control admin-only, after the Generate / View-diagnosis block and before Manage access', () => {
    const controlAt = page.indexOf('<CloseReopenControls')
    expect(controlAt).toBeGreaterThan(-1)
    expect(page.indexOf('View diagnosis')).toBeLessThan(controlAt)
    expect(page.indexOf('<GenerateButton churchId={churchId} />')).toBeLessThan(controlAt)
    expect(controlAt).toBeLessThan(page.indexOf('Manage access'))
    // the guard immediately around it is isAdmin && run
    expect(page).toMatch(/\{isAdmin && run && \(\s*<CloseReopenControls/)
    // props: run.status / run.closed_at / N / M
    const block = page.slice(controlAt, page.indexOf('/>', controlAt))
    expect(block).toContain('status={run.status}')
    expect(block).toContain('closedAt={run.closed_at}')
    expect(block).toContain('finished={finishedMembers.finished}')
    expect(block).toContain('total={finishedMembers.total}')
  })
  it('keeps the View-diagnosis link as the FIRST diagnosis href (view-diagnosis-new-tab anchors on it)', () => {
    const first = page.indexOf('`/app/${churchId}/diagnosis`')
    expect(page.slice(first, page.indexOf('</Link>', first))).toContain('View diagnosis')
  })
})
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run tests/dashboard/close-reopen-controls.test.ts tests/dashboard/close-reopen-wiring.test.ts`
Expected: FAIL — unresolved `close-reopen-controls`; wiring assertions fail on the select list.

- [ ] **Step 4: Create `app/app/[churchId]/close-reopen-controls.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { closeAssessment, reopenAssessment } from './run-actions'
import { LiveStatus } from '@/components/live-status'
import { closeConfirmText, closedLineText, REOPEN_CONFIRM_TEXT, type RunActionResult } from '@/lib/runs/close-reopen'
import type { RunStatus } from '@/lib/runs/current-run'

const BUTTON =
  'rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink transition-opacity hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * Admin-only Close / Reopen assessment control (ADR 0003). Confirmation is window.confirm — the app
 * has no dialog primitive and no new deps are allowed; the confirm copy lives in
 * lib/runs/close-reopen.ts so the pages and this component share one source. Same shape as
 * generate-button.tsx: click → transition → server action → inline error through the always-mounted
 * <LiveStatus> (components/live-status.tsx). On success the action revalidates the dashboard, so the
 * page re-renders in the other state; no redirect.
 */
export function CloseReopenControls({
  churchId,
  status,
  closedAt,
  finished,
  total,
}: {
  churchId: string
  status: RunStatus
  closedAt: string | null
  finished: number
  total: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isClosed = status === 'complete'

  function run(action: (id: string) => Promise<RunActionResult>) {
    if (pending) return
    startTransition(async () => {
      setError(null)
      const res = await action(churchId)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      {isClosed ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-body text-sm text-ink-soft">{closedLineText(closedAt)}</p>
          <button
            type="button"
            aria-disabled={pending}
            onClick={() => {
              if (!window.confirm(REOPEN_CONFIRM_TEXT)) return
              run(reopenAssessment)
            }}
            className={BUTTON}
          >
            {pending ? 'Reopening…' : 'Reopen assessment'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-disabled={pending}
          onClick={() => {
            if (!window.confirm(closeConfirmText(finished, total))) return
            run(closeAssessment)
          }}
          className={BUTTON}
        >
          {pending ? 'Closing…' : 'Close assessment'}
        </button>
      )}
      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
    </div>
  )
}
```

- [ ] **Step 5: Wire the dashboard `app/app/[churchId]/page.tsx`**

Imports — after line 20 (`import { GenerateButton } from './generate-button'`) add:

```ts
import { CloseReopenControls } from './close-reopen-controls'
```

and after line 24 (`import { partialNudges } from '@/lib/coverage/partial-nudge'`) add:

```ts
import { finishedMemberCount } from '@/lib/coverage/finished-members'
```

Run select (lines 83-93) — replace the comment's last sentence and the select:

```ts
  // Run fetch, hoisted above the coverage RPC: RLS runs_select lets any church member (admin or
  // viewer) read it, so this is legitimate for both roles. methodology_version feeds the exemption
  // check below; `id` is reused by the admin hasDiagnosis probe further down instead of a second,
  // duplicate select; status + closed_at feed the admin Close / Reopen control (ADR 0003).
  const { data: run } = await supabase
    .from('assessment_runs')
    .select('id, methodology_version, status, closed_at')
    .eq('church_id', churchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
```

After the `memberMatrix` block (after line 177's closing `}`) add:

```ts
  // "N of M members have finished" for the Close confirm (ADR 0003): a member has finished when
  // every cell in their matrix row is 'covered' — the per-member notion assessmentCta maps to
  // 'complete'. Viewers get an empty matrix (0 of 0), but the control never renders for them.
  const finishedMembers = finishedMemberCount(memberMatrix)
```

Admin block — after the existing `{isAdmin && ( hasDiagnosis ? … )}` expression (ends line 305 `)}`) and BEFORE `{role === 'admin' && (` (line 307), insert:

```tsx
        {isAdmin && run && (
          <CloseReopenControls
            churchId={churchId}
            status={run.status}
            closedAt={run.closed_at}
            finished={finishedMembers.finished}
            total={finishedMembers.total}
          />
        )}
```

- [ ] **Step 6: Add the new LiveStatus consumer to the a11y census** — in `tests/a11y/live-regions-applied.test.ts`, inside `EXPECTED_CONSUMERS` (after the `generate-button.tsx` line at :47) add:

```ts
  path.join('app', 'app', '[churchId]', 'close-reopen-controls.tsx'),
```

- [ ] **Step 7: Run the new tests plus every dashboard / a11y tripwire**

Run: `npx vitest run tests/dashboard tests/a11y tests/data/pages-use-seam.test.ts`
Expected: PASS. (In particular `view-diagnosis-new-tab`, `results-admin-only`, `member-matrix`, `live-regions-applied` stay green.)

- [ ] **Step 8: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. (`run.status` / `run.closed_at` come from the untyped supabase client — `any` — so the `RunStatus` / `string | null` props accept them.)

- [ ] **Step 9: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/close-reopen-controls.tsx" "app/app/[churchId]/page.tsx"
git add tests/dashboard/close-reopen-controls.test.ts tests/dashboard/close-reopen-wiring.test.ts tests/a11y/live-regions-applied.test.ts
git commit -m "feat(dashboard): admin Close / Reopen assessment control with N-of-M confirm (ADR 0003)"
```

---

### Task 8: Diagnosis page — "still open — N of M finished" note

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx:1-26 (imports), 110-112 (after `const brand`), 244-247 (JSX after `</ReportToolbar>`)`
- Test: `tests/report/diagnosis-open-note.test.ts`

**Interfaces:**
- Consumes: `openNoteText` (Task 5), `finishedMemberCount` (Task 5), `churchMembers<MatrixMember>` (`@/lib/data/members`), `buildMemberMatrix` + types (`@/lib/coverage/member-matrix`), `isExemptMember` (`@/lib/coverage/exemption`), `effectiveMethodologyForRun` (`@/lib/methodology/effective`), the page's existing `run` (already selects `status`).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test `tests/report/diagnosis-open-note.test.ts`**

```ts
// Source-reading tripwire (node env, no DOM) — the diagnosis page is a server component with a live
// DB dependency; source reading is the repo's standing substitute (see tests/report/web-page-wiring).
// ADR 0003 Q4: an admin may Generate while the run is open; the page must say so, with N of M, above
// the report — and say nothing when the run is closed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'diagnosis', 'page.tsx'), 'utf8'))
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe('diagnosis page: still-open note (ADR 0003)', () => {
  it('reads run.status (selected since :81 but never read before) into runIsOpen', () => {
    expect(page).toContain(".select('id, status, methodology_version, completed_at')")
    expect(page).toContain("const runIsOpen = run!.status === 'in_progress'")
  })
  it('builds N of M from the same roster + matrix seam the dashboard uses, ONLY when open', () => {
    expect(page).toContain("import { churchMembers } from '@/lib/data/members'")
    expect(page).toContain("import { finishedMemberCount } from '@/lib/coverage/finished-members'")
    expect(page).toContain("import { openNoteText } from '@/lib/runs/close-reopen'")
    expect(page).toContain('let openNote: string | null = null')
    const gate = page.indexOf('if (runIsOpen) {')
    expect(gate).toBeGreaterThan(-1)
    const block = page.slice(gate, page.indexOf('openNote = openNoteText(finished, total)') + 1)
    expect(block).toContain('churchMembers<MatrixMember>(supabase, churchId)')
    expect(block).toContain("supabase.rpc('get_member_category_coverage', { p_church_id: churchId })")
    expect(block).toContain('buildMemberMatrix(')
    expect(block).toContain('finishedMemberCount(matrix)')
    // never the raw roster RPC (pages-use-seam)
    expect(page).not.toContain("rpc('get_church_members'")
  })
  it('renders the note in a ReportNotice between the toolbar and the stale notice, and nowhere else', () => {
    const m = page.match(/\{openNote && \(\s*<ReportNotice>\s*<p>\{openNote\}<\/p>\s*<\/ReportNotice>\s*\)\}/)
    expect(m).not.toBeNull()
    const noteAt = page.indexOf('{openNote && (')
    expect(page.indexOf('</ReportToolbar>')).toBeLessThan(noteAt)
    expect(noteAt).toBeLessThan(page.indexOf('{stale &&'))
    expect(count(page, /\{openNote && \(/g)).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/report/diagnosis-open-note.test.ts`
Expected: FAIL on `runIsOpen` / imports.

- [ ] **Step 3: Edit `app/app/[churchId]/diagnosis/page.tsx`**

Imports — after line 4 (`import { loadChurchForMember, loadChurchProfile } from '@/lib/data/churches'`) add:

```ts
import { churchMembers } from '@/lib/data/members'
import { buildMemberMatrix, type MatrixMember, type MemberCategoryCoverageRow } from '@/lib/coverage/member-matrix'
import { isExemptMember } from '@/lib/coverage/exemption'
import { effectiveMethodologyForRun } from '@/lib/methodology/effective'
import { finishedMemberCount } from '@/lib/coverage/finished-members'
import { openNoteText } from '@/lib/runs/close-reopen'
```

After `const brand = resolveBrand(church.name)` (line 111) add:

```ts
  // ADR 0003 (Q4): an OPEN run can be diagnosed. Say so, with N of M finished, so the admin knows the
  // report may not include everyone yet. Same roster + matrix the dashboard builds (admin-gated RPC;
  // this page is admin-only), fetched ONLY while the run is open — a closed run pays nothing.
  const runIsOpen = run!.status === 'in_progress'
  let openNote: string | null = null
  if (runIsOpen) {
    const rosterRows = await churchMembers<MatrixMember>(supabase, churchId)
    const { data: matrixRows } = await supabase.rpc('get_member_category_coverage', { p_church_id: churchId })
    const runVersion = run!.methodology_version ?? null
    const matrix = buildMemberMatrix(
      rosterRows,
      (matrixRows ?? []) as MemberCategoryCoverageRow[],
      methodology.questions.categories,
      {
        isExempt: () => isExemptMember(runVersion),
        effectiveCategories: effectiveMethodologyForRun(methodology, runVersion).questions.categories,
      },
    )
    const { finished, total } = finishedMemberCount(matrix)
    openNote = openNoteText(finished, total)
  }
```

JSX — after `</ReportToolbar>` (line 258) and BEFORE `{stale && (` insert:

```tsx
          {openNote && (
            <ReportNotice>
              <p>{openNote}</p>
            </ReportNotice>
          )}
```

- [ ] **Step 4: Run the new test plus every report-page tripwire**

Run: `npx vitest run tests/report/diagnosis-open-note.test.ts tests/report/web-page-wiring.test.ts tests/report/route-call-ordering.test.ts tests/report/route-rederive.test.ts tests/report/route-methodology-wiring.test.ts tests/report/route-reflections-wiring.test.ts tests/report/route-sections-wiring.test.ts tests/report/inputs-hash-parity.test.ts tests/data/pages-use-seam.test.ts tests/a11y/live-regions-applied.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/diagnosis/page.tsx"
git add tests/report/diagnosis-open-note.test.ts
git commit -m "feat(diagnosis): still-open N-of-M note above the report (ADR 0003 Q4)"
```

---

### Task 9: Answer page — closed-on-date read-only copy

**Files:**
- Modify: `app/app/[churchId]/answer/[categoryId]/page.tsx:5 (import), 61-64 (comment), 99-101 (copy)`
- Test: `tests/assessment/answer-closed-copy.test.ts`

**Interfaces:**
- Consumes: `closedReadOnlyCopy` (Task 5); `run.closed_at` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test `tests/assessment/answer-closed-copy.test.ts`**

```ts
// Source-reading tripwire (node env, no DOM), companion to answer-readonly-when-complete.test.ts.
// ADR 0003 Q3: the read-only review names the close and its date when closed_at is known, and keeps
// today's sentence for an old-path run (complete, closed_at null). Both directions are pinned.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { closedReadOnlyCopy } from '@/lib/runs/close-reopen'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const page = strip(fs.readFileSync(path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'), 'utf8'))

describe('answer page: closed copy vs fallback', () => {
  it('imports the closed copy from the shared source', () => {
    expect(page).toContain("import { closedReadOnlyCopy } from '@/lib/runs/close-reopen'")
  })
  it('renders closedReadOnlyCopy(run.closed_at) when closed_at is set, else today\'s sentence — inside the read-only <p>', () => {
    const m = page.match(
      /<p className="font-body text-sm text-ink-soft">\s*\{run\?\.closed_at\s*\?\s*closedReadOnlyCopy\(run\.closed_at\)\s*:\s*'This assessment is complete, so your answers are read-only\.'\}\s*<\/p>/,
    )
    expect(m).not.toBeNull()
    // exactly one read-only sentence site — the fallback literal must not be duplicated elsewhere
    expect(page.match(/so your answers are read-only\./g)?.length).toBe(1)
  })
  it('the closed copy itself is the spec sentence with the date', () => {
    expect(closedReadOnlyCopy('2026-08-18T14:03:00.000Z')).toBe(
      'This assessment was closed by your church admin on August 18, 2026, so your answers are read-only.',
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/assessment/answer-closed-copy.test.ts`
Expected: FAIL — import missing / regex null.

- [ ] **Step 3: Edit `app/app/[churchId]/answer/[categoryId]/page.tsx`**

After line 5 (`import { currentRun, canAcceptAnswers } from '@/lib/runs/current-run'`) add:

```ts
import { closedReadOnlyCopy } from '@/lib/runs/close-reopen'
```

Replace the comment at lines 61-64 with:

```ts
  // Review-only once an admin has CLOSED the run (close_run, ADR 0003 — reversible via reopen_run;
  // amends ADR 0001's terminal completion). Gate the editable form on the named write policy —
  // rendering SelfForm on a closed run is exactly what produced the "no active run" write throw on
  // the old "Take Again" path.
```

Replace lines 99-101 (the `<p className="font-body text-sm text-ink-soft">` … `</p>` holding the read-only sentence) with:

```tsx
            <p className="font-body text-sm text-ink-soft">
              {run?.closed_at
                ? closedReadOnlyCopy(run.closed_at)
                : 'This assessment is complete, so your answers are read-only.'}
            </p>
```

- [ ] **Step 4: Run the new test plus every answer-page tripwire**

Run: `npx vitest run tests/assessment tests/a11y/live-regions-applied.test.ts`
Expected: PASS (`answer-readonly-when-complete` still matches `/read-only/i`; the ternary guard `run?.closed_at` is not a status-named identifier).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (`run` is `Run | null` from `currentRun`; `closed_at` exists since Task 4).

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/answer/[categoryId]/page.tsx"
git add tests/assessment/answer-closed-copy.test.ts
git commit -m "feat(answer): read-only copy names the close date; falls back for old-path runs (ADR 0003 Q3)"
```

---

### Task 10: Docs — ADR 0003, ADR 0001 amendment line, CONTEXT.md

**Files:**
- Create: `docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md`
- Modify: `docs/adr/0001-review-only-completion-defer-multi-run.md:3-4`
- Modify: `CONTEXT.md:44-59`

**Interfaces:** none (docs).

- [ ] **Step 1: Create `docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md`**

```markdown
# ADR 0003 — Admins close and reopen the assessment; generating a diagnosis no longer completes it

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Natalie (owner), design review (session 11)
- **Amends:** [ADR 0001](0001-review-only-completion-defer-multi-run.md) — completion is no longer
  terminal, and `save_diagnosis` no longer writes it. ADR 0001's review-only member view and its
  single-run model stand.
- **Related:** spec `docs/superpowers/specs/2026-08-18-close-assessment-design.md`; migration
  `20260818000100_close_reopen_run.sql`; `CONTEXT.md` (Close assessment, Reopen assessment,
  Completeness); `docs/XPG-Engineering-Spec.md` §14 (multi-run still out of scope).

## Context

A church has exactly one `assessment_runs` row. Under ADR 0001 the ONLY writer of
`status = 'complete'` was the `save_diagnosis` RPC, which the admin's **Generate diagnosis**
button calls, and completion was terminal. So the moment an admin generated a diagnosis, every
member who had not finished — including people invited *afterwards* — landed on read-only
pages ("This assessment is complete, so your answers are read-only") and `submit_self_response`
refused their writes. Not an RLS problem (`runs_select` covers members); the completion model.

## Decision

1. **Completion is an explicit, reversible admin action.** Two SECURITY DEFINER RPCs,
   `close_run(p_church_id)` and `reopen_run(p_church_id)`, gated by `require_church_admin`,
   resolve the run through `current_run()` and flip `status` (`in_progress ↔ complete`), stamping
   / clearing `completed_at` plus a new audit pair `closed_at` / `closed_by`. The `status` CHECK,
   `RunStatus`, `canAcceptAnswers`, `submit_self_response`, sharing, and
   `completion_reminder_recipients` are unchanged: `complete` still means "no more answers", so
   Close = read-only with no new gate, and reminders stop on Close / resume on Reopen.
2. **Generate no longer touches run status.** `save_diagnosis` loses its `run is already
   complete` gate and its status/`completed_at` flip. Generate and Regenerate work before and
   after Close.
3. **`get_run_responses` and `get_completed_run_responses` are status-agnostic and equivalent** —
   both now resolve through `current_run()`. The names are kept so the four call sites do not
   move; unifying them is a later slice. This closes ADR 0001's own "still pending" follow-up
   for these two (`get_shared_run_responses` remains inline, by share token, and is out of scope).
4. **No coverage gate on Close** (Q2): the confirm shows "N of M members have finished"; Generate
   keeps its own ≥ 1-fully-covered-respondent-per-area gate.
5. **No backfill** (Q5): existing `complete` runs stay closed with `closed_at` null (the member
   copy falls back to the old sentence; the dashboard line omits the date); an admin fixes them by
   clicking Reopen.

## Alternatives considered

- **A — one-way close, no Reopen.** Rejected: contradicts Q1/Q5 (Test Church must be reopened,
  and a mistaken close must be recoverable).
- **C — a new `'closed'` status value.** Rejected: churns the CHECK constraint, `RunStatus`,
  `canAcceptAnswers`, `completion_reminder_recipients`, and every pgTAP seed for no semantic gain,
  since `complete` already means "no more answers".

## Consequences

- **Positive:** invitees can answer until an admin decides otherwise; a diagnosis can be
  generated early and regenerated after closing; the two report-path read RPCs stop hiding a
  policy inside a lookup; the audit pair records who closed and when.
- **Negative / accepted:** an admin can Reopen after a report exists — the report's `stale`
  flag flips on the first changed answer and Regenerate is offered (no new machinery); reminder
  emails may resume on Reopen (the confirm says so).
- **Still out of scope:** multiple runs / historical re-assessment (spec §14), auto-close on
  deadline, changing the Generate coverage gate, unifying the two `get_*_run_responses` RPCs,
  any change to sharing or `/r/[shareToken]`.
```

- [ ] **Step 2: Amend ADR 0001** — in `docs/adr/0001-review-only-completion-defer-multi-run.md`, after the `- **Status:** Accepted` line (line 3) insert:

```markdown
- **Amended by:** ADR 0003 (2026-08-18) — completion is now an explicit, reversible admin action
  (`close_run` / `reopen_run`) and `save_diagnosis` no longer writes run status; see
  [0003-admin-close-reopen-decoupled-from-diagnosis.md](0003-admin-close-reopen-decoupled-from-diagnosis.md).
  The original text below is left as written.
```

Leave every other line of ADR 0001 untouched.

- [ ] **Step 3: Update `CONTEXT.md` (the "Runs, coverage, completion" section, lines 44-59)**

Replace the **Assessment run** entry with:

```markdown
- **Assessment run** — a church's assessment instance. **v1 is single-run**: exactly
  one run is created at church creation (`create_church_with_admin`) and never
  recreated. An admin **closes** it (`close_run`, status `in_progress → complete`) and
  may **reopen** it (`reopen_run`); `save_diagnosis` no longer touches status
  (ADR 0003, amending ADR 0001's terminal completion).
```

After the **canAcceptAnswers** entry add:

```markdown
- **Close assessment** **(new, ADR 0003)** — the explicit admin action that ends answering:
  `close_run(church_id)` sets `status='complete'`, `completed_at`, and the audit pair
  `closed_at` / `closed_by`. Members keep read-only review; `submit_self_response` refuses
  writes; reminder emails stop. Interface: `closeRun` (`lib/data/runs.ts`) /
  `closeAssessment` (server action). No coverage gate — the confirm shows "N of M finished".
- **Reopen assessment** **(new, ADR 0003)** — the inverse: `reopen_run(church_id)` sets
  `status='in_progress'` and clears `completed_at` / `closed_at` / `closed_by`. Members can
  change answers again; a persisted report goes `stale` on the first changed answer;
  reminders may resume. Interface: `reopenRun` / `reopenAssessment`.
```

Replace the **Completeness** entry with:

```markdown
- **Completeness** — the single definition of "answered every item" is
  `classify(answered, total)` in `lib/coverage/coverage.ts` (`'covered'` iff
  `answered === total`). Per member, "finished" = every cell in their matrix row is
  `'covered'` (`buildMemberMatrix`; counted by `finishedMemberCount`, ADR 0003). The
  spec's `isCategoryComplete` / `isRunComplete` names were never implemented — do not
  look for them.
```

Leave **Current run**, **Coverage**, and **Diagnosis gate** as they are.

- [ ] **Step 4: Verify the docs read cleanly**

Run: `grep -n "isRunComplete\|isCategoryComplete" CONTEXT.md docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md`
Expected: only the one CONTEXT.md sentence saying they were never implemented.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md docs/adr/0001-review-only-completion-defer-multi-run.md CONTEXT.md
git commit -m "docs: ADR 0003 close/reopen decoupled from diagnosis; amend ADR 0001; CONTEXT.md entries"
```

---

### Task 11: Final verification + owner checklist

**Files:** none new.

- [ ] **Step 1: Full vitest suite**

Run: `npm test`
Expected: all green (baseline was ~1473+ tests; this plan adds ~50). If `tests/report/generate-report-wiring.test.ts` or `tests/coverage/current-run-dedup.test.ts` fail, STOP and report — the spec (§8) says extend them only if their assertions actually break, and nothing in this plan should touch what they pin.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 3: Confirm the branch contains only intended files**

Run: `git status --short` and `git log --oneline master..HEAD`
Expected: working tree shows ONLY the four pre-existing untracked entries (`.claude/`, the two old plans, the WIP spec) — never staged; ~10 commits on `feat/close-assessment`.

- [ ] **Step 4: Hand off to the owner — nothing below is run by the agent**

Owner-only checklist (paste into the PR description):

1. `supabase db push` — applies `20260818000100_close_reopen_run.sql`. If a `42P13` (return type) conflict is reported for one of the three re-created functions, replace that one `create or replace function` with `drop function if exists public.<name>(<args>); create function …` in the same file and re-push.
2. `npm run test:db` — pgTAP `11_`, `12_`, `22_`, `24_`, `26_`, `27_` (all authored, none executed by the agent). Report any failing description verbatim.
3. Vercel: no new env vars.
4. Post-deploy on Test Church: **Reopen** → the invitee can answer → **Close** (confirm shows N of M) → **Regenerate** → the member's answer page shows *"This assessment was closed by your church admin on <date>, so your answers are read-only."*
5. PR review: read `/pulls/<n>/comments` for Greptile regardless of check-run status.

---

## Self-review (run before finishing)

- **Spec coverage:** §3.1 columns → T2; §3.2 `close_run` → T1/T2; §3.3 `reopen_run` → T1/T2; §3.4 `save_diagnosis` → T1 (12_)/T2; §3.5 read RPCs → T1 (11_/22_/24_)/T2; §3.6 untouched list → Global Constraints; §4 seam → T3; run type → T4; server actions → T6; §5 dashboard → T7; diagnosis note → T8; answer copy → T9; §6 data flow → implied by T2+T6; §7 error handling → T5/T6 (mapping, revalidate on stale refusal, non-admin "Not allowed", old-path fallback in T5/T7/T9, Reopen-restarts-reminders in confirm text); §8 pgTAP → T1, vitest → T2–T9, `tsc` at the boundary → T4; §9 docs → T10; §10 rollout → T11; §11 out of scope → ADR 0003 text.
- **Placeholder scan:** every code step carries the full code; no "TBD"/"similar to Task N".
- **Type consistency:** `RunActionResult` defined in T5, consumed by T6/T7; `closeRun/reopenRun(supabase, churchId) → { error: string | null }` T3 → T6; `finishedMemberCount(matrix) → { finished, total }` T5 → T7/T8; `closedLineText(closedAt: string | null)`, `closeConfirmText(finished, total)`, `REOPEN_CONFIRM_TEXT`, `openNoteText`, `closedReadOnlyCopy(closedAt: string)` T5 → T7/T8/T9; `Run.closed_at: string | null` T4 → T9; `CloseReopenControls` props `{ churchId, status: RunStatus, closedAt, finished, total }` T7 component ↔ T7 page.
