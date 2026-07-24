# Invite → Viewer whole-assessment redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an invited person an account-based **Viewer** who takes the **whole** 8-area assessment, sees only their **own** progress, and **cannot** see the diagnosis — while removing the old anonymous per-category respondent system entirely.

**Architecture:** Consolidate to the single existing member-invite path (Manage access → `create_member_invitation` → `/accept/<token>` → Viewer membership). Add a per-caller coverage RPC so a Viewer's dashboard dots + a personal "You've completed N of 8" header reflect only their own answers, while admins keep the church-wide aggregate. Restrict results to admins at **both** layers: hide/redirect in the UI, and tighten the `diagnoses_select` RLS policy to admins-only. Then drop the anonymous respondent system (routes, component, server action, 4 RPCs, and the `invitations` table) — preserving `responses` rows and the `responses.invitation_id` column the aggregate coverage RPC still reads.

**Tech Stack:** Next.js 16 App Router (React Server Components), `@supabase/ssr`, PostgreSQL RPCs (`security definer`) + RLS in `supabase/migrations/`, pgTAP in `supabase/tests/`, Vitest source-reading tripwires, Tailwind v4, TypeScript.

## Global Constraints

Every task's requirements implicitly include this section.

- **New migrations use `20260724…` timestamps** (latest applied is `20260723000100`). Forward-only, timestamped; **never mutate applied migration history**.
- **Gates (run after each task):** `npm run typecheck` → 0 errors · `npm run lint` → 0 errors · `npm run test` (= `vitest run`) → keep green (currently 246/246).
- ⛔ **NEVER run `npm run test:db`.** pgTAP tests are **authored here and verified owner-side by Natalie.** Author them to reflect the FINAL post-migration schema; do not execute them.
- **No new dependencies.** Native HTML + Tailwind v4 only.
- **Vitest tripwires are source-reading** (`fs.readFileSync` + comment-strip + `.toContain`, `environment: node`, no DOM). Copy the boilerplate from `tests/dashboard/status-indicator.test.ts`: `REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))`. Keep new tests **exactly 2 directories deep** so `../..` resolves to the repo root.
- **Git hygiene:** `git add`/`git rm` **explicit paths only** — never `-A`, never stage `.claude/`. Paths containing `[churchId]` / `[token]` are glob-magic to git: prefix those commands with `GIT_LITERAL_PATHSPECS=1`. No-bracket paths (`supabase/migrations/…`, `supabase/tests/…`, `tests/dashboard/…`, `tests/a11y/…`, `lib/…`) stage normally.
- **Commit** each task separately with a clean message; end every commit body with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Branch:** `feat/invite-viewer-assessment-redesign` (off `origin/master`). ⛔ **Never merge without Natalie.** Do not push unless asked.
- **Auth-gated verification is owner-side.** The agent must **not** sign in or create accounts. The true end-to-end (accept as Viewer, answer all 8, confirm no results access; admin sees aggregate + diagnosis) is Natalie's.
- **Role model:** `church_members.role in ('admin','viewer')`. There is **no** `is_church_admin` helper — inline `m.role = 'admin'` (the idiom used by `churches_update`, `minv_*`).

## File Structure

**New files**
- `supabase/migrations/20260724000100_rpc_get_member_run_coverage.sql` — per-caller coverage RPC (Task 1).
- `supabase/migrations/20260724000200_diagnoses_select_admin_only.sql` — tighten diagnosis-read RLS to admins (Task 4).
- `supabase/migrations/20260724000300_drop_invitations_system.sql` — destructive teardown of the anonymous respondent system (Task 6).
- `supabase/tests/19_get_member_run_coverage_test.sql` — pgTAP for the new RPC (Task 1).
- `tests/dashboard/viewer-progress.test.ts` — tripwire: role-based coverage RPC + personal header (Task 2).
- `tests/dashboard/results-admin-only.test.ts` — tripwire: viewer redirect + admin-gated dashboard controls (Task 3).

**Modified files**
- `app/app/[churchId]/page.tsx` — role-first coverage choice + personal header (Task 2); admin-gate the diagnosis controls (Task 3); remove CategoryInvite + invitees fetch/notice (Task 5).
- `app/app/[churchId]/diagnosis/page.tsx` — redirect non-admins (Task 3).
- `app/app/[churchId]/actions.ts` — remove `createInvitation`, `InviteResult`, `APP_URL`, `sendInvitationEmail` import (Task 5).
- `tests/a11y/live-regions-applied.test.ts` — drop `category-invite.tsx` from `EXPECTED_CONSUMERS` (Task 5).
- `supabase/tests/04_rls_policies_test.sql`, `05_permission_wall_acceptance_test.sql` — assert viewers are DENIED diagnosis reads (Task 4).
- `supabase/tests/01_schema_test.sql`, `10_get_run_coverage_test.sql`, `11_get_run_responses_test.sql` — rework for the post-drop schema (Task 6).

**Deleted files**
- `app/app/[churchId]/category-invite.tsx`, `app/respond/[token]/page.tsx`, `app/respond/[token]/respond-form.tsx`, `app/api/respond/[token]/route.ts`, `lib/email/send-invitation.ts` (Task 5).
- `tests/access/category-invite.test.ts`, `tests/access/create-invitation-revalidate.test.ts`, `tests/email/send-invitation.test.ts` (Task 5).
- `supabase/tests/06_create_invitation_test.sql`, `07_get_invitation_context_test.sql`, `08_submit_invited_response_test.sql` (Task 6).

**Task order & dependencies:** 1 → 2 → 3 → 4 → 5 → 6. Task 2 consumes Task 1's RPC. Tasks 2, 3, 5 edit `page.tsx` sequentially (each reads the state the previous left). All pgTAP runs against the FULL migration set (`supabase db reset`), so every pgTAP edit must reflect the **final** post-drop schema regardless of task order — Natalie runs `test:db` once at the end.

---

### Task 1: Per-user coverage RPC (`get_member_run_coverage`)

`get_run_coverage` is aggregate-only **and** the diagnosis-generation gate (`actions.ts` `generateDiagnosis:69–76`) — do **not** perturb it. Add a **sibling** RPC scoped to the caller's own `respondent_kind='member'` answers, with the **same return shape** so the pure `coverage()` in `lib/coverage/coverage.ts` (reads only `response_count > 0`) consumes it unchanged.

**Files:**
- Create: `supabase/migrations/20260724000100_rpc_get_member_run_coverage.sql`
- Test: `supabase/tests/19_get_member_run_coverage_test.sql`

**Interfaces:**
- Produces: `public.get_member_run_coverage(p_church_id uuid) returns table(category_id text, item_id text, response_count int, respondent_count int)` — granted to `authenticated`. Same signature shape as `get_run_coverage`; `respondent_count` is always `1` (single caller).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260724000100_rpc_get_member_run_coverage.sql`:

```sql
-- get_member_run_coverage: like get_run_coverage but scoped to the CALLER's own member answers.
-- Powers the Viewer dashboard's personal progress (Decision 3). Same return shape as
-- get_run_coverage → the pure coverage() in lib/coverage/coverage.ts reuses it unchanged.
create function public.get_member_run_coverage(p_church_id uuid)
returns table(category_id text, item_id text, response_count int, respondent_count int)
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
  select r.category_id, r.item_id, count(*)::int as response_count, 1 as respondent_count
  from public.responses r
  where r.run_id = v_run_id
    and r.respondent_kind = 'member'
    and r.respondent_user_id = v_uid
  group by r.category_id, r.item_id;
end;
$$;

revoke all on function public.get_member_run_coverage(uuid) from public, anon;
grant execute on function public.get_member_run_coverage(uuid) to authenticated;
```

- [ ] **Step 2: Write the pgTAP test (author only — DO NOT run test:db)**

Create `supabase/tests/19_get_member_run_coverage_test.sql`. Follows the seeding pattern of `09_submit_self_response_test.sql` (JWT via `set local request.jwt.claims`; `create_church_with_admin` for member A; a superuser-seeded `church_members` row for viewer B; `submit_self_response` writes `respondent_kind='member'` rows keyed by `respondent_user_id`).

```sql
begin;
select plan(4);

-- Two members in ONE church: A (admin via create_church_with_admin) and B (viewer, seeded).
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('c1111111-1111-1111-1111-111111111111','authenticated','authenticated','covadmin@test.com','x',now(),now()),
 ('c2222222-2222-2222-2222-222222222222','authenticated','authenticated','covviewer@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Coverage Test Church', '#cccccc', '0.1.0');

-- seed B as a viewer member (church_members has NO write policy → seed as superuser)
reset role;
insert into public.church_members (church_id, user_id, role)
select id, 'c2222222-2222-2222-2222-222222222222', 'viewer'
from churches where name = 'Coverage Test Church';

-- A answers one category (the 5 'guest' items)
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Coverage Test Church'), 'guest',
  '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
    {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb);

-- A's personal coverage: the 5 guest items appear, each with response_count = 1
select is(
  (select count(*)::int from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where category_id = 'guest'),
  5, 'A sees own 5 guest items in personal coverage');
select is(
  (select response_count from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where item_id = 'G1'),
  1, 'A personal response_count for G1 is 1');

-- B (answered nothing) sees an EMPTY personal coverage — NOT A's answers
set local request.jwt.claims to '{"sub":"c2222222-2222-2222-2222-222222222222","email":"covviewer@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))),
  0, 'B (no answers) sees empty personal coverage, not A''s');

-- Positive control / contrast: the AGGREGATE still shows the guest items to B
select is(
  (select count(*)::int from get_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where category_id = 'guest'),
  5, 'aggregate coverage still shows guest items to any member (contrast with personal)');

select * from finish();
rollback;
```

- [ ] **Step 3: Run the runnable gates**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck 0, lint 0, vitest green (no vitest changes this task; the pgTAP file is not executed here).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260724000100_rpc_get_member_run_coverage.sql supabase/tests/19_get_member_run_coverage_test.sql
git commit -m "feat(db): add get_member_run_coverage RPC for per-viewer progress

Sibling of get_run_coverage scoped to the caller's own member answers.
Same return shape so lib/coverage/coverage.ts consumes it unchanged.
pgTAP 19 authored (owner-verified via test:db).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Dashboard personal progress + role-first coverage

Today `page.tsx` fetches the aggregate `get_run_coverage` **before** role is known (lines 48–52), computing role later (64–71). Reorder so role is computed first, then pick the RPC by role, and give viewers a personal header.

**Files:**
- Modify: `app/app/[churchId]/page.tsx`
- Test: `tests/dashboard/viewer-progress.test.ts`

**Interfaces:**
- Consumes: `get_member_run_coverage` (Task 1) and the existing `get_run_coverage`; both return `CoverageRow[]`.
- Produces: an `isAdmin` boolean computed right after the membership fetch, used by Task 3.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/dashboard/viewer-progress.test.ts`:

```ts
// Source-reading tripwire (node env, no DOM): asserts on app/app/[churchId]/page.tsx text.
// Pins per-viewer progress wiring: the dashboard picks the per-user coverage RPC for viewers
// and the aggregate RPC for admins, and renders the personal "You've completed" header.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = fs.readFileSync(path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'page.tsx'), 'utf8')
// Strip comments so a prose mention can neither satisfy nor break a code assertion.
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('viewer personal progress', () => {
  it('reads the per-user coverage RPC for viewers', () => {
    expect(CODE, 'dashboard must call get_member_run_coverage for viewers').toContain(
      'get_member_run_coverage',
    )
  })
  it('keeps the aggregate coverage RPC for admins', () => {
    expect(CODE, 'dashboard must still call get_run_coverage for admins').toContain(
      "'get_run_coverage'",
    )
  })
  it('renders a personal completion header for viewers', () => {
    expect(CODE, "viewers see a personal \"You've completed N of 8\" header").toContain(
      "You've completed",
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- viewer-progress`
Expected: FAIL — `page.tsx` today contains neither `get_member_run_coverage` nor `You've completed`.

- [ ] **Step 3: Reorder role-first and add role-based coverage + personal header**

In `app/app/[churchId]/page.tsx`, **replace** the current block that runs from the coverage fetch through the header (lines 48–71 in the pristine file — from `const { data: coverageData` down through `const role = membership?.role ?? null`) with the reordered version below. This moves the `user`/`membership`/`role` fetch **above** the coverage fetch, adds `isAdmin`, selects the RPC by role, and personalizes the header for viewers:

```tsx
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  const role = membership?.role ?? null
  const isAdmin = role === 'admin'

  // Admins read the church-wide aggregate (needed to gate diagnosis generation on all-8-covered);
  // viewers read their OWN coverage so status dots + the header reflect only their own answers.
  const { data: coverageData, error: coverageError } = await supabase.rpc(
    isAdmin ? 'get_run_coverage' : 'get_member_run_coverage',
    { p_church_id: churchId },
  )
  if (coverageError) throw coverageError
  const rows = (coverageData ?? []) as CoverageRow[]

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)
  const categories = methodology.questions.categories
  const enablers = methodology.rules.enablers

  const result = coverage(rows, categories)
  const statusById = new Map(result.categories.map((c) => [c.category_id, c.status]))
  const anyStarted = result.categories.some((c) => c.status !== 'not_started')
  const progressState = anyStarted ? 'Assessment in progress' : 'Assessment not started'
  const header = isAdmin
    ? `${progressState} · ${result.coveredCount} of ${categories.length} areas`
    : `${progressState} · You've completed ${result.coveredCount} of ${categories.length} areas`
```

Notes:
- The `list_church_invitees` fetch (currently lines 73–84) still references `role` and remains **below** this block unchanged — Task 5 removes it. Do not touch it here.
- Leave `STATUS_LABEL`, `STATUS_DOT`, the `Answer yourself` link (`target="_blank"` / `rel="noopener noreferrer"`), `<RefreshOnFocus />`, and `STATUS_LABEL[status]` untouched — the `status-indicator` and `self-assessment-wiring` tripwires pin them.

- [ ] **Step 4: Run the test to verify it passes + full gates**

Run: `npm run test -- viewer-progress`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck 0, lint 0, entire vitest suite green (status-indicator + self-assessment-wiring still pass).

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add app/app/[churchId]/page.tsx
git add tests/dashboard/viewer-progress.test.ts
git commit -m "feat(dashboard): per-viewer progress + role-first coverage

Compute role before fetching coverage; admins read get_run_coverage
(aggregate, gates generation), viewers read get_member_run_coverage
(own answers). Viewers get a personal \"You've completed N of 8\" header.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Results = admins only (UI)

Two UI leaks today: the dashboard's **"View diagnosis"** link is not role-gated, and `diagnosis/page.tsx` explicitly allows viewers. Gate the dashboard diagnosis controls behind `isAdmin`, and redirect non-admins off the diagnosis page. (Generation is already admin-only at the DB — `save_diagnosis` migration `20260716001100` checks `role='admin'` — no change there.)

**Files:**
- Modify: `app/app/[churchId]/page.tsx` (uses `isAdmin` from Task 2)
- Modify: `app/app/[churchId]/diagnosis/page.tsx`
- Test: `tests/dashboard/results-admin-only.test.ts`

**Interfaces:**
- Consumes: `isAdmin` (Task 2) in `page.tsx`.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/dashboard/results-admin-only.test.ts`:

```ts
// Source-reading tripwire (node env, no DOM): asserts on the diagnosis page + dashboard text.
// Pins results-are-admins-only at the UI layer: viewers are redirected off the diagnosis page,
// and the dashboard's diagnosis controls are gated behind isAdmin.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const DIAG = strip(read('app', 'app', '[churchId]', 'diagnosis', 'page.tsx'))
const DASH = strip(read('app', 'app', '[churchId]', 'page.tsx'))

describe('results restricted to admins (UI)', () => {
  it('redirects non-admins away from the diagnosis page', () => {
    expect(DIAG, 'diagnosis page must redirect non-admins').toContain('if (!isAdmin)')
    expect(DIAG, 'diagnosis page must call redirect()').toContain('redirect(')
  })
  it('gates the dashboard diagnosis controls behind isAdmin', () => {
    expect(DASH, 'dashboard must reference isAdmin').toContain('isAdmin')
    expect(DASH, 'the diagnosis controls block must be wrapped in {isAdmin && (').toMatch(
      /isAdmin && \(/,
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- results-admin-only`
Expected: FAIL — `diagnosis/page.tsx` has no `if (!isAdmin)` redirect, and the dashboard diagnosis block is not `isAdmin`-gated.

- [ ] **Step 3a: Redirect non-admins off the diagnosis page**

In `app/app/[churchId]/diagnosis/page.tsx`:

Change the import on line 2 from:
```tsx
import { notFound } from 'next/navigation'
```
to:
```tsx
import { notFound, redirect } from 'next/navigation'
```

Then move the membership/`isAdmin` computation **up** so viewers are redirected **before** any diagnosis data is fetched. Immediately after the church fetch guard (`if (!church) notFound()`, currently line 40) insert:

```tsx
  // Results = admins only (Decision 5). A viewer cannot read the diagnoses row (RLS is
  // admin-only) and must not see the report page — send them back to the dashboard.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members').select('role')
    .eq('church_id', churchId).eq('user_id', user?.id ?? '').maybeSingle()
  const isAdmin = membership?.role === 'admin'
  if (!isAdmin) redirect(`/app/${churchId}`)
```

Then **delete** the now-duplicated membership block lower down (the pristine lines 64–72: the `// Mirrors the role check…` comment through `const isAdmin = membership?.role === 'admin'`). The `if (isAdmin)` share-token block (pristine 74–79) stays as-is — `isAdmin` is now defined above it.

Net effect: `user`, `membership`, `isAdmin` are declared once, near the top; viewers never reach the diagnosis fetch.

- [ ] **Step 3b: Admin-gate the dashboard diagnosis controls**

In `app/app/[churchId]/page.tsx`:

First, only compute `hasDiagnosis` for admins (viewers can't read `diagnoses` post-RLS anyway). **Replace** the run + hasDiagnosis block (pristine lines 86–102, `const { data: run }` through the `hasDiagnosis = …` close) with:

```tsx
  let hasDiagnosis = false
  if (isAdmin) {
    const { data: run } = await supabase
      .from('assessment_runs')
      .select('id')
      .eq('church_id', churchId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (run) {
      const { data: diagRows } = await supabase
        .from('diagnoses')
        .select('id')
        .eq('run_id', run.id)
        .limit(1)
      hasDiagnosis = (diagRows?.length ?? 0) > 0
    }
  }
```

Second, wrap the entire diagnosis/generate control in `{isAdmin && ( … )}`. **Replace** the `<section>` that begins at pristine line 169 (`<section className="flex flex-wrap items-start gap-2">`) down through its closing `</section>` (pristine line 204) with the version below. The change is: the diagnosis control (the `hasDiagnosis ? … : … ? <GenerateButton/> : <disabled>` block) is now inside `{isAdmin && ( … )}`; the "Manage access" link keeps its own `role === 'admin'` guard.

```tsx
      <section className="flex flex-wrap items-start gap-2">
        {isAdmin && (
          hasDiagnosis ? (
            <Link
              href={`/app/${churchId}/diagnosis`}
              className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              View diagnosis
            </Link>
          ) : result.coveredCount === categories.length ? (
            <GenerateButton churchId={churchId} />
          ) : (
            <button
              type="button"
              aria-disabled="true"
              className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Generate diagnosis{' '}
              <span className="text-xs">
                (
                {result.coveredCount < categories.length
                  ? `Answer all 8 areas first — ${result.coveredCount} of ${categories.length}`
                  : 'Admins can generate the diagnosis'}
                )
              </span>
            </button>
          )
        )}

        {role === 'admin' && (
          <Link
            href={`/app/${churchId}/access`}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Manage access
          </Link>
        )}
      </section>
```

Note: the inner `result.coveredCount === categories.length && role === 'admin'` collapses to just `result.coveredCount === categories.length` because the whole block is already inside `{isAdmin && (`.

- [ ] **Step 4: Run the test to verify it passes + full gates**

Run: `npm run test -- results-admin-only`
Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck 0, lint 0, full vitest suite green.

- [ ] **Step 5: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add app/app/[churchId]/page.tsx app/app/[churchId]/diagnosis/page.tsx
git add tests/dashboard/results-admin-only.test.ts
git commit -m "feat(results): restrict diagnosis to admins in the UI

Redirect non-admins off /app/<id>/diagnosis; gate the dashboard's
View-diagnosis / Generate controls behind isAdmin and only read the
diagnoses row for admins.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: RLS — tighten `diagnoses_select` to admins (migration + pgTAP)

The current policy (`supabase/migrations/20260715000400_rls_policies.sql:39–42`) allows **any member** to read a diagnosis. Tighten it to admins only by adding `and m.role = 'admin'`. This is the DB half of "results = admins only".

**Files:**
- Create: `supabase/migrations/20260724000200_diagnoses_select_admin_only.sql`
- Modify: `supabase/tests/04_rls_policies_test.sql`
- Modify: `supabase/tests/05_permission_wall_acceptance_test.sql`

**Interfaces:**
- Produces: `diagnoses_select` now requires `m.role = 'admin'`. Viewers reading `diagnoses` get 0 rows.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260724000200_diagnoses_select_admin_only.sql`:

```sql
-- Results = admins only (Decision 5, DB layer). Was: any member could SELECT a diagnosis.
-- Now: only admins of the run's church. Inlines the m.role='admin' idiom used by
-- churches_update / minv_* (there is no is_church_admin helper).
drop policy diagnoses_select on public.diagnoses;
create policy diagnoses_select on public.diagnoses for select to authenticated
  using (exists (select 1 from public.church_members m
                 join public.assessment_runs r on r.church_id = m.church_id
                 where r.id = diagnoses.run_id and m.user_id = auth.uid() and m.role = 'admin'));
```

- [ ] **Step 2: Update `04_rls_policies_test.sql` (author only — DO NOT run test:db)**

Read `supabase/tests/04_rls_policies_test.sql` first to confirm line numbers, then make these four edits (net +2 assertions → `plan(18)`; the admin `count 1` at line 25 is the positive control):

1. **Line 2:** `select plan(16);` → `select plan(18);`

2. **Add a third auth user.** In the `insert into auth.users … values` block (lines 5–7), append a viewer user. Change the block's terminator so the new row is included:
```sql
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','member@test.com','x',now(),now()),
 ('55555555-5555-5555-5555-555555555555','authenticated','authenticated','stranger@test.com','x',now(),now()),
 ('99999999-9999-9999-9999-999999999999','authenticated','authenticated','viewer@test.com','x',now(),now());
```

3. **Seed a viewer membership** as superuser. Immediately after the diagnosis seed (pristine lines 16–18, still under the `reset role;` at line 15) add:
```sql
-- seed a VIEWER member of RLS Test Church (church_members has no write policy → superuser seed)
insert into public.church_members (church_id, user_id, role)
select id, '99999999-9999-9999-9999-999999999999', 'viewer'
from churches where name = 'RLS Test Church';
```

4. **Add the non-vacuous viewer-denied block.** After the non-member assertions (pristine line 48, `… 'non-member selects no membership'`) and before the `-- profiles own-row` block (pristine line 50), add:
```sql
-- VIEWER member: sees own church (positive control) but is DENIED the diagnosis (admin-only)
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","email":"viewer@test.com","role":"authenticated"}';
select is((select count(*)::int from churches where name = 'RLS Test Church'), 1,
          'viewer member: sees own church');
select is((select count(*)::int from diagnoses), 0,
          'viewer member: denied diagnosis read (admin-only)');
```

- [ ] **Step 3: Update `05_permission_wall_acceptance_test.sql` (author only — DO NOT run test:db)**

Read `supabase/tests/05_permission_wall_acceptance_test.sql` first. It already builds a real viewer (`8888…` via `accept_member_invitation`, ~lines 84–86) and seeds a diagnosis (~lines 17–19). Do **all** of 05's edits here — Task 6 does not touch 05. Net plan math: `21 − 2 (removed invitations asserts) + 2 (added diagnoses asserts) = keep plan(21)`.

1. **Remove the invitations seed** — the `insert into invitations …` at ~lines 20–22 (the `invitations` table is dropped in Task 6). **KEEP** the invited-response seed at ~lines 23–25: that insert has no `invitation_id` column, so it survives the drop and keeps the `responses` walls non-vacuous.
2. **Remove the two invitations assertions** — the `AC1 … no invitations` assert (~line 42) and the `AC3 … no invitations` assert (~line 60).
3. **Add a viewer-denied diagnosis assertion.** After the viewer is switched in (~line 89, after `accept_member_invitation` establishes the `8888` viewer), add:
```sql
select is((select count(*)::int from diagnoses), 0, 'AC viewer: cannot read diagnosis');
```
4. **Add an admin-allowed diagnosis assertion.** After the block switches back to the admin JWT (~lines 104–105), add:
```sql
select is((select count(*)::int from diagnoses), 1, 'AC admin: can read diagnosis');
```

Confirm the final `select plan(21);` is unchanged (2 removed, 2 added).

> These viewer-denied assertions fail against the current schema until this migration lands — that is the point (Natalie runs `test:db` to verify red→green). All pgTAP runs against the full migration set, so these edits assume the final post-Task-6 schema (no `invitations` table).

- [ ] **Step 4: Runnable gates**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck 0, lint 0, vitest green (no app/vitest changes this task).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724000200_diagnoses_select_admin_only.sql supabase/tests/04_rls_policies_test.sql supabase/tests/05_permission_wall_acceptance_test.sql
git commit -m "feat(rls): restrict diagnoses_select to admins

Tighten the diagnosis-read policy from any member to admins only.
pgTAP 04/05 updated with non-vacuous viewer-denied assertions (owner
verifies via test:db).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Teardown — UI, server action, routes (delete + edit)

Remove the anonymous per-category respondent surface from the app layer. The paired server action and its tests are deleted together so the vitest suite stays green.

**Files:**
- Delete: `app/app/[churchId]/category-invite.tsx`, `app/respond/[token]/page.tsx`, `app/respond/[token]/respond-form.tsx`, `app/api/respond/[token]/route.ts`, `lib/email/send-invitation.ts`, `tests/access/category-invite.test.ts`, `tests/access/create-invitation-revalidate.test.ts`, `tests/email/send-invitation.test.ts`
- Modify: `app/app/[churchId]/page.tsx`, `app/app/[churchId]/actions.ts`, `tests/a11y/live-regions-applied.test.ts`

- [ ] **Step 1: Delete the files (git rm)**

```bash
GIT_LITERAL_PATHSPECS=1 git rm app/app/[churchId]/category-invite.tsx app/respond/[token]/page.tsx app/respond/[token]/respond-form.tsx app/api/respond/[token]/route.ts
git rm lib/email/send-invitation.ts tests/access/category-invite.test.ts tests/access/create-invitation-revalidate.test.ts tests/email/send-invitation.test.ts
```

Then remove the now-empty route directories if they linger on disk (harmless if already gone):
```bash
rmdir "app/respond/[token]" app/respond "app/api/respond/[token]" app/api/respond 2>/dev/null || true
```

- [ ] **Step 2: Edit `app/app/[churchId]/page.tsx` — remove the invite surface**

1. **Remove the import** (pristine line 8):
```tsx
import { CategoryInvite, type ChurchInvitee } from './category-invite'
```
2. **Remove the `list_church_invitees` fetch + `inviteesUnavailable`** block (pristine lines 73–84 — from `let invitees: ChurchInvitee[] = []` through the closing `}` of the `if (role === 'admin')` invitee fetch). Delete it entirely.
3. **Remove the `inviteesUnavailable` notice** in the JSX (pristine lines 120–124 — the `{inviteesUnavailable && ( … )}` paragraph).
4. **Remove the `CategoryInvite` render** in the card (pristine lines 156–163 — the `{role === 'admin' && (<CategoryInvite … />)}` block). **Keep** the `Answer yourself` link immediately above it for ALL roles (viewers need it).

After this edit, `page.tsx` no longer references `CategoryInvite`, `ChurchInvitee`, `invitees`, `inviteesUnavailable`, or `list_church_invitees`.

- [ ] **Step 3: Edit `app/app/[churchId]/actions.ts` — remove `createInvitation`**

1. **Remove the import** (pristine line 7): `import { sendInvitationEmail } from '@/lib/email/send-invitation'`
2. **Remove the `InviteResult` interface** (pristine lines 15–19).
3. **Remove the `APP_URL` const** (pristine line 21 — used only by `createInvitation`).
4. **Remove the entire `createInvitation` function** (pristine lines 23–58).

**Keep** `generateDiagnosis` and every other import (`redirect` — still used at the `redirect(`/app/${churchId}/diagnosis`)` at the end of `generateDiagnosis`; `revalidatePath`; `loadMethodology`; `createClient`; `coverage`/`CoverageRow`; `diagnose`; `isKnownBand`; `Response`; `responseHash`; `generateProse`).

- [ ] **Step 4: Edit `tests/a11y/live-regions-applied.test.ts` — drop the deleted consumer**

Remove the `category-invite.tsx` entry from `EXPECTED_CONSUMERS` (pristine line 47):
```tsx
  path.join('app', 'app', '[churchId]', 'category-invite.tsx'),
```
This is a **runnable gate**: leaving it fails the "routes every status message through LiveStatus" assertion once the file is deleted (it can no longer be found in the scan). The scan's ≥25-`.tsx` floor is safe — the tree has 41 `.tsx` files; removing 3 leaves 38.

- [ ] **Step 5: Run the full gates**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck 0, lint 0, entire vitest suite green — including `live-regions-applied`, `pending-controls` (both ≥25-file floors still satisfied at 38), `self-assessment-wiring` (the `Answer yourself` link is preserved), and `status-indicator`. If typecheck flags an unused import or symbol in `page.tsx`/`actions.ts`, remove that leftover symbol.

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add app/app/[churchId]/page.tsx app/app/[churchId]/actions.ts
git add tests/a11y/live-regions-applied.test.ts
git commit -m "refactor: remove the anonymous per-category invite surface

Delete CategoryInvite, the /respond route + form + api handler, the
createInvitation action, send-invitation email, and their tests. Drop the
list_church_invitees fetch + inviteesUnavailable notice from the dashboard;
keep 'Answer yourself' for all roles. Drop category-invite from the
live-regions consumer list.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Teardown — DB objects (destructive migration + pgTAP)

Drop the `invitations` table and its 4 RPCs. **Preserve** `responses` rows and the `responses.invitation_id` column — `get_run_coverage` reads it in a `coalesce` (aggregate respondent count), and existing `'invited'` rows keep their data. Then rework the pgTAP that seeded `invitations` so the suite reflects the post-drop schema.

**Files:**
- Create: `supabase/migrations/20260724000300_drop_invitations_system.sql`
- Delete: `supabase/tests/06_create_invitation_test.sql`, `supabase/tests/07_get_invitation_context_test.sql`, `supabase/tests/08_submit_invited_response_test.sql`
- Modify: `supabase/tests/01_schema_test.sql`, `supabase/tests/10_get_run_coverage_test.sql`, `supabase/tests/11_get_run_responses_test.sql`

**Interfaces:**
- Drops: `public.invitations` table; `create_invitation(uuid,text,text,text,text)`, `submit_invited_response(uuid,text,jsonb)`, `get_invitation_context(uuid)`, `list_church_invitees(uuid)`.
- Preserves: `responses.invitation_id` column; the `respondent_kind` CHECK `in ('invited','member')` (unchanged).

- [ ] **Step 1: Confirm the FK constraint name**

Read `supabase/migrations/20260715000100_schema.sql` around the `responses` table (line ~68) to confirm the inline FK is the PG-default name. The column is `invitation_id uuid references public.invitations on delete set null`, so the constraint is `responses_invitation_id_fkey`. If the name differs, use the actual name in the migration below.

- [ ] **Step 2: Write the destructive migration**

Create `supabase/migrations/20260724000300_drop_invitations_system.sql`:

```sql
-- Remove the anonymous per-category respondent system (Decision 4). Keep responses rows AND
-- the responses.invitation_id column: get_run_coverage reads it (coalesce respondent count),
-- and existing 'invited' rows keep their data. respondent_kind CHECK ('invited','member') stays.
alter table public.responses drop constraint if exists responses_invitation_id_fkey;
drop function if exists public.list_church_invitees(uuid);
drop function if exists public.get_invitation_context(uuid);
drop function if exists public.submit_invited_response(uuid, text, jsonb);
drop function if exists public.create_invitation(uuid, text, text, text, text);
drop table if exists public.invitations;  -- FK dropped above; responses.invitation_id column stays
```

- [ ] **Step 3: Delete the three obsolete pgTAP files**

Each tests only a dropped RPC:
```bash
git rm supabase/tests/06_create_invitation_test.sql supabase/tests/07_get_invitation_context_test.sql supabase/tests/08_submit_invited_response_test.sql
```

- [ ] **Step 4: Update `01_schema_test.sql` (author only — DO NOT run test:db)**

Read `supabase/tests/01_schema_test.sql` first (keep `plan(25)` — net unchanged). Make these edits:

1. **Line ~8:** change the `has_table(…'invitations'…)` assertion to assert the table is gone:
```sql
select hasnt_table('public', 'invitations', 'invitations table dropped');
```
2. **Delete** the invitations RLS-enabled assertion (~line 36) — it would error on the missing relation.
3. **Add** a column-preservation assertion (replaces the deleted RLS line to keep `plan(25)`):
```sql
select has_column('public', 'responses', 'invitation_id', 'responses.invitation_id preserved after invitations drop');
```

Note: the `respondent_kind='invited'` response insert (~lines 26–30, no `invitation_id`) stays valid — the CHECK is kept and the column is nullable. Leave it.

- [ ] **Step 5: Rework `10_get_run_coverage_test.sql` (author only — DO NOT run test:db)**

Read `supabase/tests/10_get_run_coverage_test.sql`. It seeds an `invitations` row plus an `invitation_id`-bearing response (~lines 14, 16, 22, 26) to exercise `get_run_coverage`'s `coalesce(respondent_user_id, invitation_id)` respondent-count path. After the drop, seeding `invitations` fails. **Convert those seeds to `member` rows** so the `coalesce` still counts them via `respondent_user_id`:

- Remove the `insert into invitations …` seed entirely.
- For each response that carried an `invitation_id`, seed it instead as `respondent_kind = 'member'` with a distinct `respondent_user_id` (a seeded `auth.users` uuid), and **no** `invitation_id`. Two distinct member users reproduce the "2 respondents" count the test asserts.

Follow the member-row shape from `09_submit_self_response_test.sql` (`respondent_kind='member'`, `respondent_user_id=<uuid>`). Keep the plan count if the number of assertions is unchanged; adjust only the seeds. Preserve the existing assertion values (the respondent-count expectations must still hold with member rows standing in for invited rows).

- [ ] **Step 6: Rework `11_get_run_responses_test.sql` (author only — DO NOT run test:db)**

Read `supabase/tests/11_get_run_responses_test.sql`. Same fix: it seeds `invitations` + invited responses (~lines 13–14, 20, 25, 47, 52, 57). Convert every invited-response seed to a `member`-row seed (`respondent_kind='member'`, `respondent_user_id=<seeded uuid>`, no `invitation_id`), and remove the `insert into invitations …` seeds. `get_run_responses` returns `category_id/item_id/value/respondent_label` and is kind-agnostic, so member rows satisfy the same assertions. Keep the plan count if the assertion count is unchanged.

- [ ] **Step 7: Runnable gates**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck 0, lint 0, vitest green (no app/vitest changes this task; pgTAP is not executed here).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260724000300_drop_invitations_system.sql supabase/tests/01_schema_test.sql supabase/tests/10_get_run_coverage_test.sql supabase/tests/11_get_run_responses_test.sql
git commit -m "feat(db): drop the invitations system

Drop the invitations table + create_invitation / submit_invited_response /
get_invitation_context / list_church_invitees, and the responses FK. Keep
responses rows and responses.invitation_id (get_run_coverage reads it).
Delete pgTAP 06/07/08; rework 01/10/11 for the post-drop schema (owner
verifies via test:db).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Owner-side verification (after all tasks — NOT the agent)

Natalie runs, on the full branch:
1. `npm run test:db` — the pgTAP suite against the full migration set (`supabase db reset`), confirming: new RPC coverage (19), viewer-denied diagnosis reads red→green (04/05), post-drop schema (01/10/11), and that 06/07/08 are gone.
2. Live end-to-end: invite a Viewer via Manage access → accept → answer all 8 areas → confirm the personal "You've completed N of 8" header + own dots, **no** View-diagnosis control, and `/app/<id>/diagnosis` redirects to the dashboard. As admin: confirm the aggregate header + dots and that the diagnosis generates and reads.

## Self-Review (completed against the spec)

- **Decision 1 (account-based Viewer invite):** no new invite path added; teardown (Tasks 5–6) removes the anonymous one, leaving Manage access as the sole path. ✓
- **Decision 2 (reuse the 8 "Answer yourself" cards):** the link is explicitly preserved for all roles in Task 5. ✓
- **Decision 3 (viewer sees own progress; admin sees aggregate):** Task 1 RPC + Task 2 role-based selection + personal header. ✓
- **Decision 4 (remove anonymous respondent system):** Tasks 5 (app) + 6 (DB). ✓
- **Decision 5 (results admins-only, UI + RLS):** Task 3 (UI redirect + gated controls) + Task 4 (RLS). ✓
- **Coverage-column preservation & `'invited'` CHECK kept:** Task 6 migration + `01` schema-test assertion. ✓
- **No `test:db` run by the agent; pgTAP authored for the final schema:** stated in Global Constraints and every pgTAP step. ✓
- **Type consistency:** `isAdmin` is introduced in Task 2 and consumed in Task 3 (`page.tsx`); `get_member_run_coverage` signature matches `get_run_coverage`'s return shape so `coverage()` consumes both. ✓
