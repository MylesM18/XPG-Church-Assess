# Cairn M4 — Invite & Respond Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins invite accountless people to answer one assessment category via a tokenized `/respond/[token]` link, let members answer categories themselves (overwrite), and show per-category coverage on the dashboard — all while `invitations`/`responses` stay default-deny behind `SECURITY DEFINER` RPCs.

**Architecture:** Five narrow `SECURITY DEFINER` RPCs are the *only* surface that touches `invitations`/`responses` (no service-role client, no RLS policy on those tables). Authz/state validation lives in SQL; methodology-semantic validation (category exists, item ∈ category, all-5-present, value range) lives in a pure TS layer that loads the YAML. Coverage is a pure, unit-tested classifier fed by an aggregate-only RPC. Email is a decoupled persist-then-send Resend adapter that soft-fails to a copyable link.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions + one route handler), `@supabase/ssr` anon client → Postgres RLS/RPC, Postgres 17 + pgTAP, vitest, `resend`, Tailwind v4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-16-m4-invite-respond-design.md` (approved 2026-07-16).

## Global Constraints

Copied verbatim from spec §14 + environment. Every task implicitly includes these.

- **anon-key → RLS only. NO service-role client.** `lib/supabase/service.ts` must not be created. Every touch of `invitations`/`responses` is via a `SECURITY DEFINER` RPC.
- `invitations` and `responses` keep **no RLS policy** (default-deny preserved). No table-level `SELECT`/`INSERT` grant to `anon`/`authenticated` on them.
- **Preserve the baseline:** the 4 shipped migrations (`20260715000100…000400`) and 6 shipped pgTAP files stay **byte-unchanged** except `04_rls_policies_test.sql`, which only **gains** assertions (M2 I2). New work extends the 72-assertion baseline; it never lowers it.
- **methodology-as-versioned-YAML:** methodology semantics are validated only in the TS layer that loads `methodology/*.yaml` — never duplicated into SQL. SQL leans on the DB `CHECK (value between 1 and 10)` and the §5.1 uniqueness index.
- `--berry #8E2B3E` is never a tile color. Deterministic engine / additive AI. Do **not** `npm audit fix --force`. Do **not** touch M3 code except the deliberate M4 additions named here.
- **Gates that must stay green after every task:** `npm run typecheck` (tsc 0), `npm run lint` (eslint 0), `npm test` (vitest all pass), `npm run test:db` (`supabase db reset && supabase test db` all pass), `npm run build` (`next build` ok — the middleware-deprecation warning is expected/allowed).
- Env: Node v24.1.0, Supabase CLI 2.104.0 (ignore the v2.109.x nag), Docker running for `test:db`. Repo `/Users/newmac/Desktop/XPG-Church-Assess`.
- **pgTAP discipline (memory-flagged bug class):** every new/edited test file must (a) set `plan(N)` to the exact number of assertions run, and (b) use the **4-arg** `throws_ok(sql, sqlstate, errmsg, description)` form — the 3-arg form binds the 3rd arg as *description*, not *errmsg*, and silently passes. Re-count `plan(N)` by hand after writing each file.

## Execution setup (before Task 1)

Implementation should happen on a dedicated branch. At execution start (subagent-driven-development), create it:

```bash
cd /Users/newmac/Desktop/XPG-Church-Assess
git checkout -b feat/m4-invite-respond
```

All task commits land on `feat/m4-invite-respond`. The whole-branch opus review and `finishing-a-development-branch` happen against `origin/master`. Push only on the user's explicit go-ahead, as **MylesM18**.

## File Map

**New migrations (additive; slot after `…000400`):**
- `supabase/migrations/20260716000100_m2_hardening_is_church_member.sql` — narrow `is_church_member` EXECUTE (M2 I1).
- `supabase/migrations/20260716000200_base_table_grants.sql` — explicit base-table GRANTs (deferred #4).
- `supabase/migrations/20260716000300_responses_member_unique.sql` — partial unique index (Decision 3).
- `supabase/migrations/20260716000400_rpc_create_invitation.sql` — RPC 1.
- `supabase/migrations/20260716000500_rpc_get_invitation_context.sql` — RPC 2.
- `supabase/migrations/20260716000600_rpc_submit_invited_response.sql` — RPC 3.
- `supabase/migrations/20260716000700_rpc_submit_self_response.sql` — RPC 4.
- `supabase/migrations/20260716000800_rpc_get_run_coverage.sql` — RPC 5.

**New pgTAP tests:**
- `supabase/tests/06_create_invitation_test.sql`, `07_get_invitation_context_test.sql`, `08_submit_invited_response_test.sql`, `09_submit_self_response_test.sql`, `10_get_run_coverage_test.sql`.
- `supabase/tests/04_rls_policies_test.sql` — **edited** (M2 I2 assertions appended only).

**New TS (pure, unit-tested):**
- `lib/coverage/coverage.ts` + `tests/coverage/coverage.test.ts` — pure `coverage()` classifier.
- `lib/answers/validate.ts` + `tests/answers/validate.test.ts` — pure YAML-semantic validator.
- `lib/email/send-invitation.ts` + `tests/email/send-invitation.test.ts` — Resend adapter (soft-fail).

**New UI / server routes:**
- `app/app/[churchId]/actions.ts` — `createInvitation` server action.
- `app/app/[churchId]/invite-panel.tsx` — client invite form (link + notice).
- `components/answer-form.tsx` — shared 5-item answer form (respondent + member).
- `app/respond/[token]/page.tsx` — public RSC respondent page.
- `app/respond/[token]/respond-form.tsx` — client wrapper posting to the route handler.
- `app/api/respond/[token]/route.ts` — public POST route handler.
- `app/app/[churchId]/answer/[categoryId]/page.tsx` — member "Answer yourself" page.
- `app/app/[churchId]/answer/[categoryId]/actions.ts` — `submitSelfResponse` server action.

**Modified:**
- `app/app/[churchId]/page.tsx` — coverage wiring + enable two stubs.
- `next.config.ts` — `outputFileTracingIncludes` for `methodology/`.
- `package.json` / `package-lock.json` — add `resend`.

**Interface contracts shared across tasks (defined once, referenced everywhere):**
- `p_answers` jsonb shape (both submit RPCs): a JSON array of exactly 5 objects `{ "item_id": text, "value": int 1..10 }`.
- `get_run_coverage` returns rows `(category_id text, item_id text, response_count int, respondent_count int)` — one row per *answered* item; items with 0 responses are absent.
- `coverage(rows, categories)` where `rows: CoverageRow[]`, `categories: Category[]` (from `lib/methodology/schema`), returns `{ categories: CategoryCoverage[]; coveredCount: number }`.
- `validateCategoryAnswers(categoryId, answers, categories)` returns `{ ok: true; answers: AnswerInput[] } | { ok: false; error: string }`.

---

### Task 1: M2 baseline hardening (I1 migration + I2 negative RLS tests)

Tighten the M2 baseline before building on it: narrow `is_church_member` EXECUTE (I1), and prove `churches_update` / `profiles_update_own` deny cross-tenant writes (I2).

**Files:**
- Create: `supabase/migrations/20260716000100_m2_hardening_is_church_member.sql`
- Modify: `supabase/tests/04_rls_policies_test.sql` (append I2 block; bump `plan`)

**Interfaces:**
- Consumes: shipped schema + `is_church_member(uuid)` + RLS policies (`churches_update`, `profiles_update_own`).
- Produces: no new callable surface; a tighter baseline all later tasks build on.

- [ ] **Step 1: Write the failing test — append the I2 block to `04_rls_policies_test.sql`**

Change the header count from `select plan(12);` to `select plan(16);`. Then, immediately **before** the final `select * from finish();` line, insert this block:

```sql
-- ── M2 I2: cross-tenant writes are denied by RLS (churches_update, profiles_update_own) ──
-- Seed a SECOND church (church B) owned by the stranger, with a known id, as superuser.
reset role;
insert into churches (id, name, brand_color, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RLS Test Church B', '#555555',
        '55555555-5555-5555-5555-555555555555');
insert into church_members (church_id, user_id, role, granted_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '55555555-5555-5555-5555-555555555555', 'admin',
        '55555555-5555-5555-5555-555555555555');

-- member (admin of church A only) attempts to UPDATE church B → USING clause filters it, 0 rows, no error
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select lives_ok(
  $$update churches set name = 'hijacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'cross-tenant church UPDATE runs but matches 0 rows under churches_update');

-- member attempts to UPDATE the stranger's profile row → profiles_update_own filters it
select lives_ok(
  $$update profiles set full_name = 'hijacked' where id = '55555555-5555-5555-5555-555555555555'$$,
  'cross-tenant profile UPDATE runs but matches 0 rows under profiles_update_own');

-- inspect as superuser: neither row was actually changed
reset role;
select is((select name from churches where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
          'RLS Test Church B', 'church B name unchanged — cross-tenant church update denied');
select is((select full_name from profiles where id = '55555555-5555-5555-5555-555555555555'),
          null, 'stranger profile unchanged — cross-tenant profile update denied');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL — the `04_` file now plans 16 assertions but the `is_church_member` migration (Step 3) does not exist yet is *not* what fails here; this step fails only if the appended SQL has an error or the plan miscount trips. If the I2 assertions already pass (they should — the policies already deny cross-tenant writes), that is expected: I2 is a *characterization* test proving existing behavior. Confirm the run reaches `04_` and reports `16..16` planned. (If you want a strict red first, temporarily set `plan(17)` to see the count mismatch, then restore to `16`.)

- [ ] **Step 3: Write the I1 migration**

Create `supabase/migrations/20260716000100_m2_hardening_is_church_member.sql`:

```sql
-- M2 I1 hardening (deferred from M2): narrow EXECUTE on is_church_member.
-- The shipped 20260715000400_rls_policies.sql created it with default (public) EXECUTE.
-- Only authenticated users ever need it (via members_select); revoke the rest.
revoke all on function public.is_church_member(uuid) from public, anon;
grant execute on function public.is_church_member(uuid) to authenticated;
```

- [ ] **Step 4: Run the full DB suite to verify green**

Run: `npm run test:db`
Expected: PASS — clean reset applies all 5 migrations; `04_` reports `ok 1..16`; every prior file still green. Baseline assertion count is now 72 + 4 = 76.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000100_m2_hardening_is_church_member.sql supabase/tests/04_rls_policies_test.sql
git commit -m "feat(m4): M2 hardening — narrow is_church_member EXECUTE + I2 cross-tenant RLS tests"
```

---

### Task 2: Base-table GRANTs + partial unique index

Two additive DDL migrations: explicit privileges so cloud matches local (§5.2), and the partial unique index that makes "Answer yourself" an overwrite (§5.1).

**Files:**
- Create: `supabase/migrations/20260716000200_base_table_grants.sql`
- Create: `supabase/migrations/20260716000300_responses_member_unique.sql`

**Interfaces:**
- Consumes: shipped schema tables.
- Produces: `responses_member_unique` partial index (Task 6's UPSERT infers on it); explicit SELECT grants for the dashboard's direct reads.

- [ ] **Step 1: Write the GRANTs migration**

Create `supabase/migrations/20260716000200_base_table_grants.sql`:

```sql
-- Explicit base-table privileges (deferred M2 #4). Makes cloud behave identically to
-- local regardless of Supabase's auto-expose toggle. RLS is still the real wall — these
-- grants only say "this role may attempt a SELECT, subject to policy".
--
-- Tables the dashboard reads DIRECTLY under RLS:
grant select on public.churches        to authenticated;
grant select on public.church_members  to authenticated;
grant select on public.assessment_runs to authenticated;
grant select on public.diagnoses       to authenticated;

-- invitations and responses get NO table-level grant to anon/authenticated on purpose:
-- they stay reachable only through SECURITY DEFINER RPCs (default-deny preserved).
```

- [ ] **Step 2: Write the partial unique index migration**

Create `supabase/migrations/20260716000300_responses_member_unique.sql`:

```sql
-- "Answer yourself" overwrite (Decision 3): one self-answer per member/item/run.
-- Partial — scoped to member rows so invited/accountless rows (many per item) are untouched.
create unique index responses_member_unique
  on public.responses (run_id, item_id, respondent_user_id)
  where respondent_kind = 'member' and respondent_user_id is not null;
```

- [ ] **Step 3: Run the DB suite to verify migrations apply cleanly**

Run: `npm run test:db`
Expected: PASS — all 76 assertions still green; the two new migrations apply without error.

- [ ] **Step 4: Verify the grants + index actually exist (direct psql check)**

Run:
```bash
supabase db reset >/dev/null 2>&1 && \
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -tAc \
"select has_table_privilege('authenticated','public.churches','SELECT'),
        has_table_privilege('authenticated','public.responses','SELECT'),
        exists(select 1 from pg_indexes where indexname='responses_member_unique');"
```
Expected: `t|f|t` — authenticated may SELECT `churches`, may **not** SELECT `responses`, and the index exists.

> If `supabase status -o env` differs in this CLI version, use the local DB URL printed by `supabase status` (default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000200_base_table_grants.sql supabase/migrations/20260716000300_responses_member_unique.sql
git commit -m "feat(m4): explicit base-table SELECT grants + responses partial unique index"
```

---

### Task 3: RPC `create_invitation` (+ pgTAP 06)

Admin-gated `SECURITY DEFINER` insert of a pending invitation into the church's active run. The returned id **is** the token.

**Files:**
- Create: `supabase/migrations/20260716000400_rpc_create_invitation.sql`
- Test: `supabase/tests/06_create_invitation_test.sql`

**Interfaces:**
- Consumes: `church_members` (admin gate), `assessment_runs` (active run), `invitations`.
- Produces: `create_invitation(p_church_id uuid, p_category_id text, p_invited_name text, p_invited_contact text, p_channel text) → uuid` (EXECUTE: `authenticated`). Token = returned uuid. Used by Task 10's server action and Task 4/5 test seeding.

- [ ] **Step 1: Write the failing test — `supabase/tests/06_create_invitation_test.sql`**

```sql
begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('66666666-6666-6666-6666-666666666666','authenticated','authenticated','admin6@test.com','x',now(),now()),
 ('77777777-7777-7777-7777-777777777777','authenticated','authenticated','stranger6@test.com','x',now(),now());

-- admin creates a church (seeds admin membership + in_progress run)
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","email":"admin6@test.com","role":"authenticated"}';
select create_church_with_admin('Invite Test Church', '#666666', '0.1.0');

-- admin can create an invitation for a category
select lives_ok(
  $$select create_invitation(
      (select id from churches where name = 'Invite Test Church'),
      'guest', 'Pastor Pat', 'pat@example.com', 'email')$$,
  'admin creates an invitation for the guest category');

reset role;
select is((select count(*)::int from invitations where category_id = 'guest' and status = 'pending'), 1,
          'one pending invitation row created');
select is((select run_id from invitations where category_id = 'guest')
          = (select id from assessment_runs where status = 'in_progress'), true,
          'invitation attached to the church active run');
select is((select created_by from invitations where category_id = 'guest'),
          '66666666-6666-6666-6666-666666666666'::uuid, 'created_by = auth.uid()');

-- a non-admin (stranger) cannot create an invitation for that church
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","email":"stranger6@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_invitation(
      (select id from churches where name = 'Invite Test Church'),
      'guest', 'X', 'x@example.com', 'email')$$,
  '42501',
  'not an admin of this church',
  'non-admin cannot create an invitation');

-- unauthenticated caller rejected
set local request.jwt.claims to '{"role":"authenticated"}';
select throws_ok(
  $$select create_invitation(
      (select id from churches where name = 'Invite Test Church'),
      'guest', 'X', 'x@example.com', 'email')$$,
  '42501',
  'not authenticated',
  'unauthenticated create is rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL at `06_` — `function create_invitation(...) does not exist`.

- [ ] **Step 3: Write the migration — `supabase/migrations/20260716000400_rpc_create_invitation.sql`**

```sql
-- create_invitation: admin-gated insert of a pending Type-A respondent invitation into the
-- church's single active run. SECURITY DEFINER = the only writer of invitations. Returned id = token.
create function public.create_invitation(
  p_church_id uuid,
  p_category_id text,
  p_invited_name text,
  p_invited_contact text,
  p_channel text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members
    where church_id = p_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'not an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;

  if v_run_id is null then
    raise exception 'no active run for this church';
  end if;

  insert into public.invitations
    (run_id, church_id, category_id, invited_name, invited_contact, channel, created_by)
  values
    (v_run_id, p_church_id, p_category_id, p_invited_name, p_invited_contact, p_channel, v_uid)
  returning id into v_invitation_id;

  return v_invitation_id;
end;
$$;

revoke all on function public.create_invitation(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text, text, text) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS — `06_` reports `ok 1..6`; all prior files still green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000400_rpc_create_invitation.sql supabase/tests/06_create_invitation_test.sql
git commit -m "feat(m4): create_invitation RPC (admin-gated, returns token) + pgTAP"
```

---

### Task 4: RPC `get_invitation_context` (+ pgTAP 07)

Anon-callable read that returns only safe render fields for a valid token, and a **uniform invalid** result for used/expired/unknown tokens (no oracle, zero response data).

**Files:**
- Create: `supabase/migrations/20260716000500_rpc_get_invitation_context.sql`
- Test: `supabase/tests/07_get_invitation_context_test.sql`

**Interfaces:**
- Consumes: `invitations`, `churches` (name), `assessment_runs`.
- Produces: `get_invitation_context(p_token uuid) → table(valid boolean, category_id text, church_id uuid, church_name text, run_id uuid)` (EXECUTE: `anon`, `authenticated`). Consumed by Task 11's respond page.

> **Why grant to `authenticated` too:** the respond page uses the anon *server* client, which runs as role `authenticated` when a logged-in admin opens the link. Granting both keeps the public page working in either session state.

- [ ] **Step 1: Write the failing test — `supabase/tests/07_get_invitation_context_test.sql`**

```sql
begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('88888888-8888-8888-8888-888888888888','authenticated','authenticated','admin8@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888","email":"admin8@test.com","role":"authenticated"}';
select create_church_with_admin('Context Test Church', '#888888', '0.1.0');
reset role;

-- seed three invitations with known ids: valid, expired, completed
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'c0000000-0000-0000-0000-000000000001',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Context Test Church'),
       'conn', 'pending', '88888888-8888-8888-8888-888888888888', now() + interval '30 days';
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'c0000000-0000-0000-0000-000000000002',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Context Test Church'),
       'conn', 'pending', '88888888-8888-8888-8888-888888888888', now() - interval '1 day';
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'c0000000-0000-0000-0000-000000000003',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Context Test Church'),
       'conn', 'completed', '88888888-8888-8888-8888-888888888888', now() + interval '30 days';

-- act as anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000001')), true,
          'valid pending unexpired token → valid = true');
select is((select category_id from get_invitation_context('c0000000-0000-0000-0000-000000000001')), 'conn',
          'valid token exposes category_id');
select is((select church_name from get_invitation_context('c0000000-0000-0000-0000-000000000001')),
          'Context Test Church', 'valid token exposes church name');

select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000002')), false,
          'expired token → valid = false');
select is((select category_id from get_invitation_context('c0000000-0000-0000-0000-000000000002')), null,
          'expired token leaks no category_id');
select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000003')), false,
          'completed token → valid = false');
select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000009')), false,
          'unknown token → valid = false (uniform invalid, no oracle)');
select is((select church_name from get_invitation_context('c0000000-0000-0000-0000-000000000009')), null,
          'unknown token leaks no church name');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL at `07_` — `function get_invitation_context(uuid) does not exist`.

- [ ] **Step 3: Write the migration — `supabase/migrations/20260716000500_rpc_get_invitation_context.sql`**

```sql
-- get_invitation_context: anon-callable. Returns only safe render fields for a valid token,
-- and a UNIFORM invalid row (valid=false, everything else null) for used/expired/revoked/unknown
-- tokens — no oracle distinguishing wrong-token from expired, zero response data.
create function public.get_invitation_context(p_token uuid)
returns table(valid boolean, category_id text, church_id uuid, church_name text, run_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invitations;
  v_church_name text;
begin
  select * into v_inv from public.invitations where id = p_token;

  if not found or v_inv.status <> 'pending' or v_inv.expires_at < now() then
    return query select false, null::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  select name into v_church_name from public.churches where id = v_inv.church_id;

  return query select true, v_inv.category_id, v_inv.church_id, v_church_name, v_inv.run_id;
end;
$$;

revoke all on function public.get_invitation_context(uuid) from public;
grant execute on function public.get_invitation_context(uuid) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS — `07_` reports `ok 1..8`; all prior files green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000500_rpc_get_invitation_context.sql supabase/tests/07_get_invitation_context_test.sql
git commit -m "feat(m4): get_invitation_context RPC (anon, uniform-invalid) + pgTAP"
```

---

### Task 5: RPC `submit_invited_response` (+ pgTAP 08)

Anon-callable atomic submit: re-check the token pending+unexpired inside the transaction, insert the answer rows, flip the invitation to `completed`. Single-use is enforced because the re-check and the flip share one transaction.

**Files:**
- Create: `supabase/migrations/20260716000600_rpc_submit_invited_response.sql`
- Test: `supabase/tests/08_submit_invited_response_test.sql`

**Interfaces:**
- Consumes: `invitations` (locked re-check), `responses`.
- Produces: `submit_invited_response(p_token uuid, p_respondent_label text, p_answers jsonb) → void` (EXECUTE: `anon`, `authenticated`). `p_answers` = array of `{item_id, value}`. Consumed by Task 11's route handler.

- [ ] **Step 1: Write the failing test — `supabase/tests/08_submit_invited_response_test.sql`**

```sql
begin;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('99999999-9999-9999-9999-999999999999','authenticated','authenticated','admin9@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","email":"admin9@test.com","role":"authenticated"}';
select create_church_with_admin('Submit Test Church', '#999999', '0.1.0');
reset role;

-- a valid pending invitation for the guest category, known token
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000001',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() + interval '30 days';

-- act as anon; submit 5 answers
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select lives_ok(
  $$select submit_invited_response(
      'd0000000-0000-0000-0000-000000000001',
      'Deacon Dana',
      '[{"item_id":"G1","value":3},{"item_id":"G2","value":5},{"item_id":"G3","value":7},
        {"item_id":"G4","value":2},{"item_id":"G5","value":9}]'::jsonb)$$,
  'anon submits 5 answers for a valid token');

reset role;
select is((select count(*)::int from responses where respondent_kind = 'invited'
           and invitation_id = 'd0000000-0000-0000-0000-000000000001'), 5,
          'five invited response rows inserted');
select is((select respondent_label from responses
           where invitation_id = 'd0000000-0000-0000-0000-000000000001' limit 1),
          'Deacon Dana', 'typed respondent label stored');
select is((select status from invitations where id = 'd0000000-0000-0000-0000-000000000001'),
          'completed', 'invitation flipped to completed');

-- double-submit is rejected (already completed)
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000001', 'X',
      '[{"item_id":"G1","value":1},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  'P0001',
  'invitation is no longer pending',
  'double-submit rejected (single-use)');

-- expired token is rejected
reset role;
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000002',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() - interval '1 day';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000002', 'X',
      '[{"item_id":"G1","value":1},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  'P0001',
  'invitation has expired',
  'expired token rejected');

-- out-of-range value is rejected by the DB CHECK
reset role;
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000003',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() + interval '30 days';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000003', 'X',
      '[{"item_id":"G1","value":11},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  '23514',
  'new row for relation "responses" violates check constraint "responses_value_check"',
  'out-of-range value rejected by DB CHECK');

select * from finish();
rollback;
```

> Note: the check-constraint name `responses_value_check` is Postgres's default for the inline `check (value between 1 and 10)` on `responses.value`. If a `db reset` reveals a different generated name, correct the errmsg string in this one assertion to match the actual constraint name.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL at `08_` — `function submit_invited_response(...) does not exist`.

- [ ] **Step 3: Write the migration — `supabase/migrations/20260716000600_rpc_submit_invited_response.sql`**

```sql
-- submit_invited_response: anon-callable atomic submit. Re-checks the token pending+unexpired
-- (FOR UPDATE lock), inserts the answer rows, flips the invitation to completed — all in one
-- transaction, so replay/double-submit is rejected. Value range is enforced by the DB CHECK.
create function public.submit_invited_response(
  p_token uuid,
  p_respondent_label text,
  p_answers jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_token for update;

  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation has expired';
  end if;

  insert into public.responses
    (run_id, church_id, category_id, item_id, value, respondent_kind, invitation_id, respondent_label)
  select v_inv.run_id, v_inv.church_id, v_inv.category_id,
         (a->>'item_id'), (a->>'value')::int, 'invited', p_token, p_respondent_label
  from jsonb_array_elements(p_answers) as a;

  update public.invitations
     set status = 'completed', completed_at = now()
   where id = p_token;
end;
$$;

revoke all on function public.submit_invited_response(uuid, text, jsonb) from public;
grant execute on function public.submit_invited_response(uuid, text, jsonb) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS — `08_` reports `ok 1..7`; all prior files green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000600_rpc_submit_invited_response.sql supabase/tests/08_submit_invited_response_test.sql
git commit -m "feat(m4): submit_invited_response RPC (atomic, single-use) + pgTAP"
```

---

### Task 6: RPC `submit_self_response` (+ pgTAP 09)

Member-gated UPSERT of the caller's answers for a category in the active run; re-answering **overwrites** via the §5.1 partial unique index.

**Files:**
- Create: `supabase/migrations/20260716000700_rpc_submit_self_response.sql`
- Test: `supabase/tests/09_submit_self_response_test.sql`

**Interfaces:**
- Consumes: `church_members` (member gate), `assessment_runs`, `profiles` (label), `responses` + `responses_member_unique` (Task 2).
- Produces: `submit_self_response(p_church_id uuid, p_category_id text, p_answers jsonb) → void` (EXECUTE: `authenticated`). Consumed by Task 12's server action.

- [ ] **Step 1: Write the failing test — `supabase/tests/09_submit_self_response_test.sql`**

```sql
begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('a1111111-1111-1111-1111-111111111111','authenticated','authenticated','selfadmin@test.com','x',now(),now()),
 ('a2222222-2222-2222-2222-222222222222','authenticated','authenticated','selfstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1111111-1111-1111-1111-111111111111","email":"selfadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Self Test Church', '#aaaaaa', '0.1.0');

-- member answers the guest category
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Self Test Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'member submits self answers');

reset role;
select is((select count(*)::int from responses where respondent_kind = 'member'
           and respondent_user_id = 'a1111111-1111-1111-1111-111111111111'), 5,
          'five member response rows inserted');

-- re-answer overwrites (still 5 rows, new values)
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1111111-1111-1111-1111-111111111111","email":"selfadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Self Test Church'), 'guest',
      '[{"item_id":"G1","value":8},{"item_id":"G2","value":8},{"item_id":"G3","value":8},
        {"item_id":"G4","value":8},{"item_id":"G5","value":8}]'::jsonb)$$,
  're-answer runs (overwrite)');

reset role;
select is((select count(*)::int from responses where respondent_kind = 'member'
           and respondent_user_id = 'a1111111-1111-1111-1111-111111111111'), 5,
          'still exactly 5 rows after re-answer (overwrite, not append)');
select is((select value from responses where respondent_kind = 'member'
           and respondent_user_id = 'a1111111-1111-1111-1111-111111111111' and item_id = 'G1'), 8,
          'overwritten value is the latest (8)');

-- a non-member cannot self-answer that church
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2222222-2222-2222-2222-222222222222","email":"selfstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Self Test Church'), 'guest',
      '[{"item_id":"G1","value":1},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  '42501',
  'not a member of this church',
  'non-member cannot self-answer');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL at `09_` — `function submit_self_response(...) does not exist`.

- [ ] **Step 3: Write the migration — `supabase/migrations/20260716000700_rpc_submit_self_response.sql`**

```sql
-- submit_self_response: member-gated UPSERT of the caller's answers for one category in the
-- active run. Overwrite via the responses_member_unique partial index (Decision 3).
create function public.submit_self_response(
  p_church_id uuid,
  p_category_id text,
  p_answers jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_label text;
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
    raise exception 'no active run for this church';
  end if;

  select coalesce(full_name, email, 'Member') into v_label from public.profiles where id = v_uid;
  if v_label is null then
    v_label := 'Member';
  end if;

  insert into public.responses
    (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
  select v_run_id, p_church_id, p_category_id,
         (a->>'item_id'), (a->>'value')::int, 'member', v_uid, v_label
  from jsonb_array_elements(p_answers) as a
  on conflict (run_id, item_id, respondent_user_id)
    where respondent_kind = 'member' and respondent_user_id is not null
  do update set value = excluded.value, category_id = excluded.category_id;
end;
$$;

revoke all on function public.submit_self_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_self_response(uuid, text, jsonb) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS — `09_` reports `ok 1..6`; all prior files green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000700_rpc_submit_self_response.sql supabase/tests/09_submit_self_response_test.sql
git commit -m "feat(m4): submit_self_response RPC (member overwrite UPSERT) + pgTAP"
```

---

### Task 7: RPC `get_run_coverage` (+ pgTAP 10)

Member-gated, **aggregate-only** read: per-item response counts + per-category respondent counts for the active run. Never returns raw values — this is why the dashboard needs no RLS SELECT policy on `responses`.

**Files:**
- Create: `supabase/migrations/20260716000800_rpc_get_run_coverage.sql`
- Test: `supabase/tests/10_get_run_coverage_test.sql`

**Interfaces:**
- Consumes: `church_members` (member gate), `assessment_runs`, `responses` (aggregation).
- Produces: `get_run_coverage(p_church_id uuid) → table(category_id text, item_id text, response_count int, respondent_count int)` (EXECUTE: `authenticated`). One row per *answered* item. Consumed by Task 8's `coverage()` and Task 13's dashboard.

- [ ] **Step 1: Write the failing test — `supabase/tests/10_get_run_coverage_test.sql`**

```sql
begin;
select plan(5);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('b1111111-1111-1111-1111-111111111111','authenticated','authenticated','covadmin@test.com','x',now(),now()),
 ('b2222222-2222-2222-2222-222222222222','authenticated','authenticated','covstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Coverage Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed responses directly (as superuser): guest category, G1..G3 answered by one invited respondent
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label)
select (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Coverage Test Church'),
       'guest', v.item, 5, 'invited', 'Someone'
from (values ('G1'),('G2'),('G3')) as v(item);

-- member reads aggregate coverage
set local role authenticated;
set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church'))), 3,
          'three answered items returned (G1,G2,G3)');
select is((select response_count from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church')) where item_id = 'G1'), 1,
          'per-item response_count is 1 for G1');
select is((select respondent_count from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church')) where item_id = 'G1'), 1,
          'per-category respondent_count is 1');

-- returns no raw values column (shape is aggregate-only): assert column set via a failing ref would be
-- overkill; instead assert an unanswered item is simply absent
select is((select count(*)::int from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church')) where item_id = 'G5'), 0,
          'unanswered item G5 is absent from the aggregate');

-- a non-member cannot read coverage
set local request.jwt.claims to '{"sub":"b2222222-2222-2222-2222-222222222222","email":"covstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_run_coverage((select id from churches where name = 'Coverage Test Church'))$$,
  '42501',
  'not a member of this church',
  'non-member cannot read coverage');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL at `10_` — `function get_run_coverage(uuid) does not exist`.

- [ ] **Step 3: Write the migration — `supabase/migrations/20260716000800_rpc_get_run_coverage.sql`**

```sql
-- get_run_coverage: member-gated, AGGREGATE-ONLY. Per-item response counts + per-category
-- respondent counts for the active run. Never returns raw values — the dashboard reads this
-- instead of the responses table, so responses stays default-deny (no RLS SELECT policy).
create function public.get_run_coverage(p_church_id uuid)
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
  with per_item as (
    select r.category_id, r.item_id, count(*)::int as response_count
    from public.responses r
    where r.run_id = v_run_id
    group by r.category_id, r.item_id
  ),
  per_cat as (
    select r.category_id,
           count(distinct coalesce(r.respondent_user_id::text, r.invitation_id::text))::int as respondent_count
    from public.responses r
    where r.run_id = v_run_id
    group by r.category_id
  )
  select pi.category_id, pi.item_id, pi.response_count, pc.respondent_count
  from per_item pi
  join per_cat pc on pc.category_id = pi.category_id;
end;
$$;

revoke all on function public.get_run_coverage(uuid) from public, anon;
grant execute on function public.get_run_coverage(uuid) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db`
Expected: PASS — `10_` reports `ok 1..5`; all prior files green. **Full DB baseline is now 76 + 6 + 8 + 7 + 6 + 5 = 108 assertions across 11 files.**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000800_rpc_get_run_coverage.sql supabase/tests/10_get_run_coverage_test.sql
git commit -m "feat(m4): get_run_coverage RPC (aggregate-only, member-gated) + pgTAP"
```

---

### Task 8: Pure `coverage()` classifier (vitest)

The pure, unit-tested function that turns `get_run_coverage` rows + methodology into per-category status and a covered count. Deterministic-engine discipline: the privileged aggregation is the RPC; the classification is pure TS.

**Files:**
- Create: `lib/coverage/coverage.ts`
- Test: `tests/coverage/coverage.test.ts`

**Interfaces:**
- Consumes: `Category` type from `@/lib/methodology/schema`; rows shaped like `get_run_coverage` output.
- Produces: `coverage(rows: CoverageRow[], categories: Category[]) → CoverageResult`. Consumed by Task 13's dashboard.

- [ ] **Step 1: Write the failing test — `tests/coverage/coverage.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { coverage, type CoverageRow } from '@/lib/coverage/coverage'
import type { Category } from '@/lib/methodology/schema'

// minimal two-category fixture (5 items each), matching the methodology shape
function cat(id: string, itemIds: string[]): Category {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'stage',
    position: 1,
    items: itemIds.map((iid) => ({
      id: iid,
      text: 't',
      signal: 'belief',
      anchors: { lo: 'l', mid: 'm', hi: 'h' },
    })),
  }
}

const CATS: Category[] = [
  cat('guest', ['G1', 'G2', 'G3', 'G4', 'G5']),
  cat('conn', ['C1', 'C2', 'C3', 'C4', 'C5']),
]

const rows = (items: Array<[string, string]>): CoverageRow[] =>
  items.map(([category_id, item_id]) => ({ category_id, item_id, response_count: 1, respondent_count: 1 }))

describe('coverage()', () => {
  it('classifies every category not_started when there are no rows', () => {
    const r = coverage([], CATS)
    expect(r.coveredCount).toBe(0)
    expect(r.categories.every((c) => c.status === 'not_started')).toBe(true)
  })

  it('classifies a category with all 5 items answered as covered', () => {
    const r = coverage(rows([['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3'], ['guest', 'G4'], ['guest', 'G5']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('covered')
    expect(r.categories.find((c) => c.category_id === 'conn')!.status).toBe('not_started')
    expect(r.coveredCount).toBe(1)
  })

  it('classifies a category with 3 of 5 items answered as partial', () => {
    const r = coverage(rows([['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('partial')
    expect(r.coveredCount).toBe(0)
  })

  it('treats a row with response_count 0 as not answered', () => {
    const zero: CoverageRow[] = [{ category_id: 'guest', item_id: 'G1', response_count: 0, respondent_count: 0 }]
    const r = coverage(zero, CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('not_started')
  })

  it('ignores rows for unknown items/categories', () => {
    const r = coverage(rows([['guest', 'ZZZ'], ['nope', 'X1']]), CATS)
    expect(r.categories.find((c) => c.category_id === 'guest')!.status).toBe('not_started')
    expect(r.coveredCount).toBe(0)
  })

  it('counts all covered categories', () => {
    const all = rows([
      ['guest', 'G1'], ['guest', 'G2'], ['guest', 'G3'], ['guest', 'G4'], ['guest', 'G5'],
      ['conn', 'C1'], ['conn', 'C2'], ['conn', 'C3'], ['conn', 'C4'], ['conn', 'C5'],
    ])
    expect(coverage(all, CATS).coveredCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- coverage`
Expected: FAIL — cannot resolve `@/lib/coverage/coverage`.

- [ ] **Step 3: Write the implementation — `lib/coverage/coverage.ts`**

```ts
import type { Category } from '@/lib/methodology/schema'

export type CoverageStatus = 'not_started' | 'partial' | 'covered'

export interface CoverageRow {
  category_id: string
  item_id: string
  response_count: number
  respondent_count: number
}

export interface CategoryCoverage {
  category_id: string
  status: CoverageStatus
}

export interface CoverageResult {
  categories: CategoryCoverage[]
  coveredCount: number
}

/**
 * Pure classifier. For each methodology category: not_started if none of its items have any
 * response; covered if every one of its items has >=1 response; partial otherwise. coveredCount
 * is the number of covered categories → the dashboard "N of 8 areas" header.
 */
export function coverage(rows: CoverageRow[], categories: Category[]): CoverageResult {
  const answered = new Set(
    rows.filter((r) => r.response_count > 0).map((r) => `${r.category_id}:${r.item_id}`),
  )

  const cats: CategoryCoverage[] = categories.map((cat) => {
    const answeredCount = cat.items.filter((it) => answered.has(`${cat.id}:${it.id}`)).length
    let status: CoverageStatus
    if (answeredCount === 0) status = 'not_started'
    else if (answeredCount === cat.items.length) status = 'covered'
    else status = 'partial'
    return { category_id: cat.id, status }
  })

  return { categories: cats, coveredCount: cats.filter((c) => c.status === 'covered').length }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- coverage`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/coverage/coverage.ts tests/coverage/coverage.test.ts
git commit -m "feat(m4): pure coverage() classifier (not_started/partial/covered) + vitest"
```

---

### Task 9: Pure YAML-semantic answer validator (vitest)

The TS layer that validates answers against the methodology YAML **before** any submit RPC (§6.1): category exists, exactly 5 answers, each item ∈ category, no duplicates, all 5 present, each value an integer 1..10.

**Files:**
- Create: `lib/answers/validate.ts`
- Test: `tests/answers/validate.test.ts`

**Interfaces:**
- Consumes: `Category` type from `@/lib/methodology/schema`.
- Produces: `validateCategoryAnswers(categoryId, answers, categories) → { ok: true; answers: AnswerInput[] } | { ok: false; error: string }`, plus `AnswerInput = { item_id: string; value: number }`. Consumed by Task 11 route handler + Task 12 server action.

- [ ] **Step 1: Write the failing test — `tests/answers/validate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { validateCategoryAnswers } from '@/lib/answers/validate'
import type { Category } from '@/lib/methodology/schema'

const guest: Category = {
  id: 'guest',
  name: 'Guest',
  kind: 'stage',
  position: 1,
  items: ['G1', 'G2', 'G3', 'G4', 'G5'].map((id) => ({
    id, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' },
  })),
}
const CATS = [guest]
const full = [
  { item_id: 'G1', value: 3 }, { item_id: 'G2', value: 4 }, { item_id: 'G3', value: 5 },
  { item_id: 'G4', value: 6 }, { item_id: 'G5', value: 7 },
]

describe('validateCategoryAnswers()', () => {
  it('accepts a complete, in-range set', () => {
    const r = validateCategoryAnswers('guest', full, CATS)
    expect(r.ok).toBe(true)
  })

  it('rejects an unknown category', () => {
    const r = validateCategoryAnswers('nope', full, CATS)
    expect(r).toEqual({ ok: false, error: expect.stringContaining('category') })
  })

  it('rejects a non-array payload', () => {
    const r = validateCategoryAnswers('guest', { G1: 3 }, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects the wrong number of answers', () => {
    const r = validateCategoryAnswers('guest', full.slice(0, 4), CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects an item that is not in the category', () => {
    const bad = [...full.slice(0, 4), { item_id: 'ZZ', value: 5 }]
    const r = validateCategoryAnswers('guest', bad, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects a duplicate item', () => {
    const dup = [...full.slice(0, 4), { item_id: 'G1', value: 5 }]
    const r = validateCategoryAnswers('guest', dup, CATS)
    expect(r.ok).toBe(false)
  })

  it('rejects an out-of-range value', () => {
    const bad = [...full.slice(0, 4), { item_id: 'G5', value: 11 }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })

  it('rejects a non-integer value', () => {
    const bad = [...full.slice(0, 4), { item_id: 'G5', value: 5.5 }]
    expect(validateCategoryAnswers('guest', bad, CATS).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot resolve `@/lib/answers/validate`.

- [ ] **Step 3: Write the implementation — `lib/answers/validate.ts`**

```ts
import type { Category } from '@/lib/methodology/schema'

export interface AnswerInput {
  item_id: string
  value: number
}

export type ValidateResult =
  | { ok: true; answers: AnswerInput[] }
  | { ok: false; error: string }

/**
 * Methodology-semantic validation (the single source of methodology truth is the YAML, so this
 * lives here, not in SQL). Checks: category exists, exactly N answers where N = the category's
 * item count, each item_id belongs to the category, no duplicates, every item present, and each
 * value is an integer 1..10.
 */
export function validateCategoryAnswers(
  categoryId: string,
  answers: unknown,
  categories: Category[],
): ValidateResult {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { ok: false, error: `Unknown category: ${categoryId}` }

  if (!Array.isArray(answers)) return { ok: false, error: 'Answers must be an array.' }

  const itemIds = category.items.map((i) => i.id)
  if (answers.length !== itemIds.length) {
    return { ok: false, error: `Expected ${itemIds.length} answers, got ${answers.length}.` }
  }

  const seen = new Set<string>()
  const clean: AnswerInput[] = []
  for (const a of answers) {
    if (typeof a !== 'object' || a === null) return { ok: false, error: 'Each answer must be an object.' }
    const itemId = (a as Record<string, unknown>).item_id
    const value = (a as Record<string, unknown>).value
    if (typeof itemId !== 'string' || !itemIds.includes(itemId)) {
      return { ok: false, error: `Item ${String(itemId)} does not belong to category ${categoryId}.` }
    }
    if (seen.has(itemId)) return { ok: false, error: `Duplicate answer for item ${itemId}.` }
    seen.add(itemId)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
      return { ok: false, error: `Value for ${itemId} must be an integer 1–10.` }
    }
    clean.push({ item_id: itemId, value })
  }

  // all items present (length + membership + no-dup already guarantees this, but be explicit)
  for (const id of itemIds) {
    if (!seen.has(id)) return { ok: false, error: `Missing answer for item ${id}.` }
  }

  return { ok: true, answers: clean }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- validate`
Expected: PASS — all 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/answers/validate.ts tests/answers/validate.test.ts
git commit -m "feat(m4): pure YAML-semantic answer validator + vitest"
```

---

### Task 10: Resend adapter + invite-create server action + invite panel

The decoupled email seam (persist-then-send, soft-fail) plus the admin-only server action that mints an invitation and hands the token to it, and a small client panel that shows the copyable link + a "couldn't email it" notice.

**Files:**
- Modify: `package.json`, `package-lock.json` (add `resend`)
- Create: `lib/email/send-invitation.ts`, `tests/email/send-invitation.test.ts`
- Create: `app/app/[churchId]/actions.ts`, `app/app/[churchId]/invite-panel.tsx`

**Interfaces:**
- Consumes: `create_invitation` RPC (Task 3), `validateCategoryAnswers` is *not* used here (no answers yet); methodology `loadMethodology()` for the category list; `APP_URL` env.
- Produces: `sendInvitationEmail({ to, link, churchName }) → Promise<{ ok: boolean }>`; server action `createInvitation(prev, formData) → Promise<InviteResult>` where `InviteResult = { link: string | null; emailed: boolean; error: string | null }`. Consumed by Task 13 (panel is mounted on the dashboard).

- [ ] **Step 1: Add the `resend` dependency**

Run: `npm install resend`
Expected: `resend` appears in `package.json` dependencies; lockfile updated. (Do **not** run `npm audit fix --force`.)

- [ ] **Step 2: Write the failing adapter test — `tests/email/send-invitation.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sendInvitationEmail } from '@/lib/email/send-invitation'

describe('sendInvitationEmail()', () => {
  const original = process.env.RESEND_API_KEY
  beforeEach(() => { delete process.env.RESEND_API_KEY })
  afterEach(() => { process.env.RESEND_API_KEY = original })

  it('soft-fails (ok:false) without throwing when RESEND_API_KEY is missing', async () => {
    const result = await sendInvitationEmail({
      to: 'someone@example.com',
      link: 'http://127.0.0.1:3000/respond/abc',
      churchName: 'Test Church',
    })
    expect(result).toEqual({ ok: false })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- send-invitation`
Expected: FAIL — cannot resolve `@/lib/email/send-invitation`.

- [ ] **Step 4: Write the adapter — `lib/email/send-invitation.ts`**

```ts
import { Resend } from 'resend'

export interface SendInvitationArgs {
  to: string
  link: string
  churchName: string
}

/**
 * Decoupled send (Decision 4). The invitation is already persisted before this is called, so any
 * failure here is soft: log and return { ok: false }; the caller surfaces the copyable link.
 * From-address onboarding@resend.dev works locally without domain verification.
 */
export async function sendInvitationEmail({ to, link, churchName }: SendInvitationArgs): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendInvitationEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to,
      subject: `You're invited to help assess ${churchName}`,
      html: `<p>${churchName} has invited you to answer a short set of questions.</p>
             <p><a href="${link}">Open your questions</a></p>
             <p>Or paste this link into your browser:<br>${link}</p>`,
    })
    if (error) {
      console.error('sendInvitationEmail: Resend returned an error', error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendInvitationEmail: send threw', e)
    return { ok: false }
  }
}
```

- [ ] **Step 5: Run the adapter test to verify it passes**

Run: `npm test -- send-invitation`
Expected: PASS.

- [ ] **Step 6: Write the server action — `app/app/[churchId]/actions.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email/send-invitation'

export interface InviteResult {
  link: string | null
  emailed: boolean
  error: string | null
}

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export async function createInvitation(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const categoryId = String(formData.get('category_id') ?? '')
  const invitedName = String(formData.get('invited_name') ?? '').trim() || null
  const invitedContact = String(formData.get('invited_contact') ?? '').trim() || null

  const methodology = loadMethodology()
  const category = methodology.questions.categories.find((c) => c.id === categoryId)
  if (!category) return { link: null, emailed: false, error: 'Please choose a valid category.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/sign-in?next=/app/${churchId}`)

  const { data: token, error } = await supabase.rpc('create_invitation', {
    p_church_id: churchId,
    p_category_id: categoryId,
    p_invited_name: invitedName,
    p_invited_contact: invitedContact,
    p_channel: 'email',
  })
  if (error) return { link: null, emailed: false, error: error.message }

  const link = `${APP_URL}/respond/${token as string}`

  let emailed = false
  if (invitedContact) {
    const sent = await sendInvitationEmail({ to: invitedContact, link, churchName: category ? '' : '' })
    emailed = sent.ok
  }

  return { link, emailed, error: null }
}
```

> **Correction for the implementer:** the `churchName` passed to `sendInvitationEmail` above is a placeholder — replace the `churchName: category ? '' : ''` expression with the real church name. Fetch it once before the send: after `getUser()`, add
> ```ts
> const { data: church } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()
> ```
> and pass `churchName: church?.name ?? 'your church'`. (Kept explicit here so the glue is not hand-waved.)

- [ ] **Step 7: Write the invite panel — `app/app/[churchId]/invite-panel.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { createInvitation, type InviteResult } from './actions'

const initial: InviteResult = { link: null, emailed: false, error: null }

const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function InvitePanel({
  churchId,
  categories,
}: {
  churchId: string
  categories: Array<{ id: string; name: string }>
}) {
  const [state, formAction, pending] = useActionState(createInvitation, initial)

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4">
      <input type="hidden" name="church_id" value={churchId} />
      <h2 className="font-display text-lg text-ink">Invite a leader</h2>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Category
        <select name="category_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Their name (optional)
        <input name="invited_name" type="text" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Their email (optional — we'll email the link)
        <input name="invited_contact" type="email" className={inputClass} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create invitation'}
      </button>

      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}

      {state.link && (
        <div className="flex flex-col gap-1 rounded-md border border-line bg-mist p-3">
          <p className="font-body text-sm text-ink">
            {state.emailed ? 'Invitation emailed. Link:' : "Invitation created — we couldn't email it, so share this link:"}
          </p>
          <code className="break-all font-body text-xs text-ink-soft">{state.link}</code>
        </div>
      )}
    </form>
  )
}
```

> If `bg-mist` is not a defined token, use `bg-paper`. Confirm available tokens in `app/globals.css` before finalizing.

- [ ] **Step 8: Verify gates (this task ships no new UI route yet — panel is mounted in Task 13)**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tsc 0, eslint 0, vitest all pass (including the new `send-invitation` test). The panel/action compile even though not yet imported.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json lib/email/send-invitation.ts tests/email/send-invitation.test.ts app/app/[churchId]/actions.ts app/app/[churchId]/invite-panel.tsx
git commit -m "feat(m4): Resend adapter (soft-fail) + create-invitation server action + invite panel"
```

---

### Task 11: `/respond/[token]` page + shared answer form + POST route handler

The public accountless flow: an RSC that reads context via the anon client and renders either the 5-item form or a uniform invalid state, a shared client form component, and the unauthenticated POST route that validates and submits.

**Files:**
- Create: `components/answer-form.tsx`
- Create: `app/respond/[token]/page.tsx`
- Create: `app/respond/[token]/respond-form.tsx`
- Create: `app/api/respond/[token]/route.ts`

**Interfaces:**
- Consumes: `get_invitation_context` (Task 4), `submit_invited_response` (Task 5), `validateCategoryAnswers` (Task 9), `loadMethodology()`.
- Produces: `AnswerForm` (shared client component) with props `{ category: { id, name }, items: Array<{ id: string; text: string }>, requireName: boolean, onSubmit: (answers: AnswerInput[], respondentLabel: string | null) => Promise<{ ok: boolean; error?: string }> }`. Reused by Task 12.

> **No middleware change needed:** `middleware.ts` only refreshes the session; it never redirects. `/respond/[token]` is reachable with no session because the page uses the anon server client and requires no `auth.uid()`.

- [ ] **Step 1: Write the shared answer form — `components/answer-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { AnswerInput } from '@/lib/answers/validate'

export interface AnswerFormItem {
  id: string
  text: string
}

export function AnswerForm({
  categoryName,
  items,
  requireName,
  onSubmit,
}: {
  categoryName: string
  items: AnswerFormItem[]
  requireName: boolean
  onSubmit: (answers: AnswerInput[], respondentLabel: string | null) => Promise<{ ok: boolean; error?: string }>
}) {
  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(items.map((i) => [i.id, 5])),
  )
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return <p className="font-body text-ink">Thank you — your answers have been recorded.</p>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (requireName && name.trim() === '') {
      setError('Please enter your name.')
      return
    }
    setPending(true)
    const answers: AnswerInput[] = items.map((i) => ({ item_id: i.id, value: values[i.id] }))
    const result = await onSubmit(answers, requireName ? name.trim() : null)
    setPending(false)
    if (result.ok) setDone(true)
    else setError(result.error ?? 'Something went wrong. Please try again.')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">{categoryName}</h1>

      {requireName && (
        <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
          Your name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink"
          />
        </label>
      )}

      {items.map((item) => (
        <fieldset key={item.id} className="flex flex-col gap-2">
          <legend className="font-body text-sm text-ink">{item.text}</legend>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={values[item.id]}
              onChange={(e) => setValues((v) => ({ ...v, [item.id]: Number(e.target.value) }))}
              className="w-full"
              aria-label={item.text}
            />
            <span className="w-6 text-right font-body text-sm text-ink">{values[item.id]}</span>
          </div>
        </fieldset>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit'}
      </button>

      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Write the respond-form client wrapper — `app/respond/[token]/respond-form.tsx`**

```tsx
'use client'

import { AnswerForm, type AnswerFormItem } from '@/components/answer-form'
import type { AnswerInput } from '@/lib/answers/validate'

export function RespondForm({
  token,
  categoryName,
  items,
}: {
  token: string
  categoryName: string
  items: AnswerFormItem[]
}) {
  async function onSubmit(answers: AnswerInput[], respondentLabel: string | null) {
    const res = await fetch(`/api/respond/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ respondent_label: respondentLabel, answers }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: body.error ?? 'Submission failed.' }
  }

  return <AnswerForm categoryName={categoryName} items={items} requireName onSubmit={onSubmit} />
}
```

- [ ] **Step 3: Write the public page — `app/respond/[token]/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { RespondForm } from './respond-form'

export default async function RespondPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_invitation_context', { p_token: token })
  const ctx = Array.isArray(data) ? data[0] : null

  const invalid = (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-12">
      <h1 className="font-display text-2xl text-ink">This link isn't valid</h1>
      <p className="font-body text-ink-soft">
        It may have expired, already been used, or been entered incorrectly. Please ask whoever
        invited you for a new link.
      </p>
    </main>
  )

  if (error || !ctx || !ctx.valid) return invalid

  const methodology = loadMethodology()
  const category = methodology.questions.categories.find((c) => c.id === ctx.category_id)
  if (!category) return invalid

  const items = category.items.map((i) => ({ id: i.id, text: i.text }))

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <p className="font-body text-sm text-ink-soft">Helping {ctx.church_name}</p>
      <RespondForm token={token} categoryName={category.name} items={items} />
    </main>
  )
}
```

- [ ] **Step 4: Write the POST route — `app/api/respond/[token]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { validateCategoryAnswers } from '@/lib/answers/validate'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const supabase = await createClient()

  // Look up the invitation context (anon) to learn the category, and to reject invalid tokens early.
  const { data, error: ctxError } = await supabase.rpc('get_invitation_context', { p_token: token })
  const ctx = Array.isArray(data) ? data[0] : null
  if (ctxError || !ctx || !ctx.valid) {
    return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const { respondent_label, answers } = (body ?? {}) as { respondent_label?: unknown; answers?: unknown }

  const label = typeof respondent_label === 'string' ? respondent_label.trim() : ''
  if (label === '') {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  }

  const methodology = loadMethodology()
  const validated = validateCategoryAnswers(ctx.category_id, answers, methodology.questions.categories)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { error } = await supabase.rpc('submit_invited_response', {
    p_token: token,
    p_respondent_label: label,
    p_answers: validated.answers,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Verify build + gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tsc 0, eslint 0, `next build` ok (middleware-deprecation warning allowed). The `/respond/[token]` and `/api/respond/[token]` routes appear in the build output.

- [ ] **Step 6: Runtime smoke via the preview browser**

Start the dev server (preview_start with the dev config) and confirm:
- `GET /respond/00000000-0000-0000-0000-000000000000` renders the "This link isn't valid" state (unknown token → uniform invalid).
- `POST /api/respond/00000000-0000-0000-0000-000000000000` with any body returns HTTP 400 `{ "error": "This link is no longer valid." }`.

(Real happy-path incognito e2e with a live token is done in verification-before-completion, Task 15/§verification.)

- [ ] **Step 7: Commit**

```bash
git add components/answer-form.tsx app/respond/[token]/page.tsx app/respond/[token]/respond-form.tsx app/api/respond/[token]/route.ts
git commit -m "feat(m4): public /respond/[token] page + shared AnswerForm + POST /api/respond route"
```

---

### Task 12: "Answer yourself" member flow

A member-only page at `app/app/[churchId]/answer/[categoryId]` that reuses `AnswerForm` (no name field) and a server action that validates and calls `submit_self_response`.

**Files:**
- Create: `app/app/[churchId]/answer/[categoryId]/page.tsx`
- Create: `app/app/[churchId]/answer/[categoryId]/actions.ts`
- Create: `app/app/[churchId]/answer/[categoryId]/self-form.tsx`

**Interfaces:**
- Consumes: `submit_self_response` (Task 6), `validateCategoryAnswers` (Task 9), `AnswerForm` (Task 11), `loadMethodology()`.
- Produces: the member answer route linked from the dashboard in Task 13.

- [ ] **Step 1: Write the server action — `app/app/[churchId]/answer/[categoryId]/actions.ts`**

```ts
'use server'

import { loadMethodology } from '@/lib/methodology/load'
import { createClient } from '@/lib/supabase/server'
import { validateCategoryAnswers, type AnswerInput } from '@/lib/answers/validate'

export async function submitSelfResponse(
  churchId: string,
  categoryId: string,
  answers: AnswerInput[],
): Promise<{ ok: boolean; error?: string }> {
  const methodology = loadMethodology()
  const validated = validateCategoryAnswers(categoryId, answers, methodology.questions.categories)
  if (!validated.ok) return { ok: false, error: validated.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { error } = await supabase.rpc('submit_self_response', {
    p_church_id: churchId,
    p_category_id: categoryId,
    p_answers: validated.answers,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 2: Write the client wrapper — `app/app/[churchId]/answer/[categoryId]/self-form.tsx`**

```tsx
'use client'

import { AnswerForm, type AnswerFormItem } from '@/components/answer-form'
import type { AnswerInput } from '@/lib/answers/validate'
import { submitSelfResponse } from './actions'

export function SelfForm({
  churchId,
  categoryId,
  categoryName,
  items,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  items: AnswerFormItem[]
}) {
  async function onSubmit(answers: AnswerInput[]) {
    return submitSelfResponse(churchId, categoryId, answers)
  }
  return <AnswerForm categoryName={categoryName} items={items} requireName={false} onSubmit={onSubmit} />
}
```

- [ ] **Step 3: Write the page — `app/app/[churchId]/answer/[categoryId]/page.tsx`**

```tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { SelfForm } from './self-form'

export default async function AnswerPage({
  params,
}: {
  params: Promise<{ churchId: string; categoryId: string }>
}) {
  const { churchId, categoryId } = await params
  const supabase = await createClient()

  // Permission wall: RLS hides churches the caller isn't a member of → 404.
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/sign-in?next=/app/${churchId}/answer/${categoryId}`)
    notFound()
  }

  const methodology = loadMethodology()
  const category = methodology.questions.categories.find((c) => c.id === categoryId)
  if (!category) notFound()

  const items = category.items.map((i) => ({ id: i.id, text: i.text }))

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <SelfForm churchId={churchId} categoryId={categoryId} categoryName={category.name} items={items} />
    </main>
  )
}
```

- [ ] **Step 4: Verify build + gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tsc 0, eslint 0, build ok; the `answer/[categoryId]` route appears.

- [ ] **Step 5: Commit**

```bash
git add "app/app/[churchId]/answer"
git commit -m "feat(m4): Answer-yourself member flow (page + server action, reuses AnswerForm)"
```

---

### Task 13: Dashboard wiring — coverage + enable the two M4 stubs

Modify the M3 dashboard to read `get_run_coverage`, classify with `coverage()`, show per-category status + a dynamic "N of 8 areas" header, mount the invite panel, and turn "Invite leaders" / "Answer yourself" into real links. "View diagnosis" / "Manage access" stay disabled (M5).

**Files:**
- Modify: `app/app/[churchId]/page.tsx`

**Interfaces:**
- Consumes: `get_run_coverage` (Task 7), `coverage()` (Task 8), `InvitePanel` (Task 10), `answer/[categoryId]` route (Task 12).
- Produces: no downstream consumer (leaf).

- [ ] **Step 1: Replace `app/app/[churchId]/page.tsx` with the coverage-wired version**

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { coverage, type CoverageRow, type CoverageStatus } from '@/lib/coverage/coverage'
import { ChainGlyph } from './chain-glyph'
import { InvitePanel } from './invite-panel'

function gatesLabel(gates: 'all' | string[] | undefined): string {
  if (gates === 'all') return 'all stages'
  if (Array.isArray(gates)) return gates.join(', ')
  return '—'
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  not_started: 'Not started',
  partial: 'In progress',
  covered: 'Covered',
}

// M5 stubs remain disabled; M4 stubs become links (rendered inline below).
const DISABLED_STUBS = [
  ['View diagnosis', 'M5'],
  ['Manage access', 'M5'],
] as const

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ churchId: string }>
}) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: church, error } = await supabase
    .from('churches')
    .select('id, name, brand_color')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) notFound()

  const { data: coverageData, error: coverageError } = await supabase.rpc('get_run_coverage', {
    p_church_id: churchId,
  })
  if (coverageError) throw coverageError
  const rows = (coverageData ?? []) as CoverageRow[]

  const methodology = loadMethodology()
  const brand = resolveBrand(church.name)
  const categories = methodology.questions.categories
  const enablers = methodology.rules.enablers

  const result = coverage(rows, categories)
  const statusById = new Map(result.categories.map((c) => [c.category_id, c.status]))
  const anyStarted = result.categories.some((c) => c.status !== 'not_started')
  const header = `${anyStarted ? 'Assessment in progress' : 'Assessment not started'} · ${result.coveredCount} of ${categories.length} areas`

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-md font-display text-xl text-white"
          style={{ backgroundColor: church.brand_color }}
        >
          {brand.monogram}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{church.name}</h1>
          <p className="font-body text-sm text-ink-soft">{header}</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((cat) => {
          const status = statusById.get(cat.id) ?? 'not_started'
          return (
            <article key={cat.id} className="rounded-lg border border-line bg-paper p-4">
              <h2 className="font-display text-lg text-ink">{cat.name}</h2>
              <div className="mt-2">
                {cat.position !== null ? (
                  <ChainGlyph position={cat.position} />
                ) : (
                  <span className="font-body text-xs text-sage">
                    Enabler · gates {gatesLabel(enablers[cat.id]?.gates)}
                  </span>
                )}
              </div>
              <p className="mt-3 font-body text-sm text-ink-soft">{STATUS_LABEL[status]}</p>
              <Link
                href={`/app/${churchId}/answer/${cat.id}`}
                className="mt-2 inline-block font-body text-sm text-ink underline underline-offset-2 hover:opacity-80"
              >
                Answer yourself
              </Link>
            </article>
          )
        })}
      </section>

      <InvitePanel churchId={churchId} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />

      <section className="flex flex-wrap gap-2">
        {DISABLED_STUBS.map(([label, milestone]) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
            {label} <span className="text-xs">({milestone})</span>
          </button>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Verify build + gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tsc 0, eslint 0, build ok.

- [ ] **Step 3: Runtime smoke via the preview browser**

With the dev server + a logged-in session on a church you own: the dashboard shows all 8 category cards with a status label each, the header reads "Assessment not started · 0 of 8 areas" for a fresh church, the invite panel renders, and each card has an "Answer yourself" link to `/app/[churchId]/answer/[categoryId]`. Answer one category → return to dashboard → that card reads "In progress" (or "Covered" if all 5 answered) and the header count updates. (Confirm via `read_page` / screenshot.)

- [ ] **Step 4: Commit**

```bash
git add "app/app/[churchId]/page.tsx"
git commit -m "feat(m4): dashboard coverage wiring + enable Invite/Answer-yourself, dynamic N-of-8 header"
```

---

### Task 14: `next.config.ts` output-file-tracing + build verify

Ensure the serverless bundle traces the `methodology/` YAML so `loadMethodology()` (which reads from `process.cwd()/methodology`) works when deployed (deferred #3).

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (build-config only).

- [ ] **Step 1: Write the config — replace `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Trace the methodology YAML into every server bundle that calls loadMethodology()
  // (it reads process.cwd()/methodology at runtime). Without this the files are pruned
  // from the serverless output and loadMethodology() throws in production.
  outputFileTracingIncludes: {
    '/app/[churchId]': ['./methodology/**'],
    '/app/[churchId]/answer/[categoryId]': ['./methodology/**'],
    '/respond/[token]': ['./methodology/**'],
    '/api/respond/[token]': ['./methodology/**'],
    '/get-started': ['./methodology/**'],
  },
}

export default nextConfig
```

- [ ] **Step 2: Verify the build honors it**

Run: `npm run build`
Expected: `next build` ok. If the build logs available route keys, confirm the include patterns match actual route ids; adjust any key Next reports as unmatched. (Keys are the route paths as Next lists them in the build output.)

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(m4): outputFileTracingIncludes so serverless bundles ship the methodology YAML"
```

---

## Verification before completion (own phase — not a task above)

After Task 14, run `superpowers:verification-before-completion`:

1. **Full gate sweep from clean:** `npm run typecheck && npm run lint && npm test && npm run test:db && npm run build` — all green; `test:db` reports the full extended assertion count from a clean reset.
2. **Real-browser incognito e2e (Eng-Spec §13 AC):** logged-in admin creates an invitation → copy the `/respond/[token]` link → open it in a **fresh incognito** session → answer 5 items, type a name, submit → thank-you → reload the link → uniform "not valid" (single-use confirmed). Back on the dashboard, the answered category shows coverage.
3. **Live Resend send:** with the user-supplied `RESEND_API_KEY` in `.env.local`, create an invitation addressed to the user's own inbox and confirm the email arrives (from `onboarding@resend.dev`); then confirm the soft-fail path (unset key → invite still succeeds, panel shows the copyable link + "couldn't email it").
4. **Confidentiality spot-check:** confirm no `lib/supabase/service.ts` exists and `invitations`/`responses` have no RLS policy (the dashboard reads only `get_run_coverage`).

Then: opus whole-branch review via `review-package $(git merge-base origin/master HEAD) HEAD`, then `superpowers:finishing-a-development-branch` **with the user** (push only on explicit go-ahead, as MylesM18).

---

## Self-Review (completed by plan author)

**1. Spec coverage** — every spec section maps to a task:
- §2 scope (Type A respondent + Answer-yourself + coverage + Resend + fold-ins) → Tasks 1–14. Non-goals (Type B `/accept`, `revoke_invitation`, confidence-weighting, real rate-limiting) → correctly absent.
- §5.1 partial unique index → Task 2. §5.2 base-table GRANTs → Task 2. §5.3 I1 → Task 1.
- §6 RPCs 1–5 → Tasks 3–7 (one migration + one pgTAP each). §6.1 validation split → SQL leans on CHECK/index (Tasks 5/6), TS validator → Task 9.
- §7 coverage model → Task 8 (pure) fed by Task 7 (RPC); dashboard header → Task 13.
- §8 UI + Resend seam → Tasks 10 (Resend + invite action), 11 (`/respond` + route + form), 12 (Answer-yourself), 13 (dashboard).
- §9 fold-ins: I1 → T1, I2 → T1, GRANTs → T2, `next.config` tracing → T14.
- §10 security posture → structural (UUID token, single-use in T5, 30-day expiry in T4/T5, admin-gate in T3, aggregate-only in T7). §11 testing → pgTAP T1/3–7, vitest T8/9/10-adapter, e2e in verification phase. §12 ACs → covered by the verification phase + pgTAP. §13 build order → Tasks ordered to match. §14 guardrails → Global Constraints.

**2. Placeholder scan** — one intentional, clearly-flagged glue detail in Task 10 Step 6 (the `churchName` fetch) is spelled out in the correction note with exact code, not left as "TODO". No "add error handling"/"similar to Task N"/"write tests for the above" placeholders; every code step carries full code.

**3. Type consistency** — `CoverageRow` (`{category_id, item_id, response_count, respondent_count}`) is identical between Task 7's RPC return, Task 8's type, and Task 13's cast. `AnswerInput` (`{item_id, value}`) is identical across Tasks 9/11/12. `AnswerForm` prop shape defined in Task 11 matches its uses in Tasks 11 (`RespondForm`) and 12 (`SelfForm`). RPC names/arg names match between each migration and its caller (`create_invitation`, `get_invitation_context`, `submit_invited_response`, `submit_self_response`, `get_run_coverage`).

**Intentional scope note (honors spec, flagged for the implementer/reviewer):** `get_run_coverage` returns per-item response counts **and** per-category `respondent_count` (spec §6 #5 asks for both). `coverage()` consumes only the per-item counts in M4; `respondent_count` is carried through unused now and becomes M5's confidence-weighting input (§7 defers confidence to M5). This is deliberate, matches the spec, and adds no unconsumed table surface.
