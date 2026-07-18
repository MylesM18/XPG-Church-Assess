# M6a — Opt-in Public Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can mint a revocable, 30-day link that lets someone without an account read one church's diagnosis report — with respondent names stripped — and revoking it makes the URL 404 immediately.

**Architecture:** `public.report_shares` already exists from M2; no new table. Five `security definer` RPCs own it (it stays default-deny with no RLS policy and no table grant). Mint/revoke/read-state are admin-gated and reached from server actions; `get_shared_report` is granted to `anon` and returns a uniform invalid row for revoked, expired, and unknown tokens alike. Respondent names are removed twice independently: once in SQL via an `immutable` `strip_respondents` helper, once at render via a new `'shared'` value on `ReportAudience`.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), `@supabase/ssr` 0.12.3 anon client → Postgres RLS/RPC, Postgres 17 + pgTAP, vitest, Tailwind v4, TypeScript.

## Global Constraints

- **NEVER run `npm run test:db`.** `seed.sql` is 0 bytes, so `supabase db reset` wipes the local e2e fixtures. The pgTAP gate in this plan is **`supabase migration up --local && supabase test db`** — applies pending migrations without resetting. Every task that adds a migration uses exactly that command.
- **Do not touch `next.config.ts` or `vitest.config.ts`.**
- **`.superpowers/` stays UNTRACKED.** Never `git add` it.
- anon key + RLS only. **No service-role client in application code.**
- `report_shares` gets **no RLS policy and no base-table grant** — RPCs stay its sole readers and writers, per `20260715000400_rls_policies.sql:67`.
- Revoked / expired / nonexistent share tokens must be **indistinguishable** — 404, never 403. Same invariant `app/api/report/[runId]/pdf/route.ts` holds for run ids.
- **pgTAP discipline (recorded bug class):** `plan(N)` must equal the exact number of assertions run — re-count by hand after writing each file. Use the **4-arg** `throws_ok(sql, sqlstate, errmsg, description)` form; the 3-arg form binds arg 3 as *description*, not *errmsg*, and silently passes.
- **Positive controls are mandatory.** A zero-match confidentiality assertion proves nothing unless the same detector is shown to fire against a surface that *does* contain the data.
- Gates green after every task: `npm run typecheck` (tsc 0) · `npm run lint` (eslint 0) · `npm test` (vitest, currently 158 passing) · `supabase migration up --local && supabase test db` (currently Files=16 / Tests=154) · `npm run build`.
- Push as **MylesM18**, on explicit go-ahead only. Do not push during plan execution.
- **Deferred — do NOT fold in:** the prose cache-check at `app/app/[churchId]/actions.ts:118-121` is scoped only by `response_hash`, not `church_id`.
- Migration filenames continue the sequence after `20260717000400_rpc_save_prose.sql`.
- pgTAP filenames continue after `15_save_prose_test.sql`.

## Addendum to the approved spec

The spec's Architecture section names four RPCs. Implementation requires a **fifth**: `get_report_share(p_run_id uuid)`, admin-gated and read-only.

**Why:** `report_shares` has no RLS policy and no table grant, so the diagnosis page cannot `select` from it. The locked decision *"one active link per run → one obvious dashboard state: shared, or not"* requires the page to know that state on load. `create_report_share` is idempotent but is still a **writer** — calling it during render would mint a link merely by visiting the page. A separate read-only RPC is the only way to satisfy the locked decision without minting on render.

It carries the identical admin guard as the other two writers and returns zero rows when no live share exists. It is added in Task 2 and tested in pgTAP 17.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260718000100_fn_strip_respondents.sql` | Pure `immutable` payload rewriter |
| `supabase/migrations/20260718000200_report_shares_one_active_index.sql` | Partial unique index enforcing one live share per run |
| `supabase/migrations/20260718000300_rpc_report_share_manage.sql` | `create_report_share`, `revoke_report_share`, `get_report_share` |
| `supabase/migrations/20260718000400_rpc_get_shared_report.sql` | Anon-callable tokenized read, uniform-invalid |
| `supabase/tests/16_strip_respondents_test.sql` | Helper purity + index enforcement |
| `supabase/tests/17_report_share_manage_test.sql` | Admin guard, idempotency, expiry replacement, revoke |
| `supabase/tests/18_get_shared_report_test.sql` | Uniform-invalid contract + SQL strip, with positive control |
| `lib/report/view.ts` (modify) | `ReportAudience` gains `'shared'`; `nextStep` becomes optional |
| `lib/report/pdf/document.tsx` (modify) | Guard the now-optional `nextStep` |
| `app/app/[churchId]/diagnosis/page.tsx` (modify) | Guard `nextStep`; render the share control |
| `app/r/[shareToken]/page.tsx` (create) | Public Server Component rendering the shared report |
| `lib/report/share-link.ts` (create) | Pure `/r/<token>` URL builder (importable from both server and client) |
| `app/app/[churchId]/diagnosis/actions.ts` (create) | `shareReport` / `revokeShare` server actions |
| `app/app/[churchId]/diagnosis/share-control.tsx` (create) | Client control beside Download PDF |
| `scripts/forge-auth-cookie.mjs` (create) | Cookie-forging helper for headless runtime verification |
| `docs/XPG-Engineering-Spec.md:39` (modify) | Record the server-action deviation |

The report section components in `app/app/[churchId]/diagnosis/report.tsx` are plain Server Components with no `'use client'` directive; `/r/[shareToken]/page.tsx` imports them directly rather than duplicating the report UI.

---

### Task 1: `strip_respondents` helper + one-active-share index

**Files:**
- Create: `supabase/migrations/20260718000100_fn_strip_respondents.sql`
- Create: `supabase/migrations/20260718000200_report_shares_one_active_index.sql`
- Test: `supabase/tests/16_strip_respondents_test.sql`

**Interfaces:**
- Consumes: `public.report_shares` (`20260715000100_schema.sql:88`), `public.create_church_with_admin(text, text, text)`.
- Produces: `public.strip_respondents(p_payload jsonb) returns jsonb` — `immutable`, called by `get_shared_report` in Task 3. Index `report_shares_one_active_per_run` on `report_shares (run_id) where not revoked`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/16_strip_respondents_test.sql`:

```sql
begin;
select plan(9);

-- ── strip_respondents: pure function, tested against crafted payloads ──────
select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'dispersion_flags' -> 0 -> 'respondents',
  '[]'::jsonb,
  'strip_respondents empties the respondents array');

select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'dispersion_flags' -> 0 -> 'spread',
  '2.2'::jsonb,
  'strip_respondents preserves spread on the flag');

select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'overall_score',
  '55'::jsonb,
  'strip_respondents preserves unrelated top-level keys');

select is(
  strip_respondents('{"overall_score":55}'::jsonb),
  '{"overall_score":55}'::jsonb,
  'payload with no dispersion_flags key passes through unchanged');

select is(
  strip_respondents('{"dispersion_flags":[]}'::jsonb) -> 'dispersion_flags',
  '[]'::jsonb,
  'empty dispersion_flags array stays an empty array');

select is(
  (select count(*) from jsonb_array_elements(
     strip_respondents('{"dispersion_flags":[{"respondents":[{"label":"A","mean":1}]},{"respondents":[{"label":"B","mean":2}]}]}'::jsonb)
       -> 'dispersion_flags') as f
   where f -> 'respondents' <> '[]'::jsonb),
  0::bigint,
  'every flag in a multi-flag payload is stripped');

-- ── the partial unique index ───────────────────────────────────────────────
select has_index('public', 'report_shares', 'report_shares_one_active_per_run',
                 'report_shares_one_active_per_run index exists');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('16161616-1616-1616-1616-161616161616','authenticated','authenticated','admin16@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"16161616-1616-1616-1616-161616161616","email":"admin16@test.com","role":"authenticated"}';
select create_church_with_admin('Strip Test Church', '#161616', '0.1.0');
reset role;

insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
select 'd0000000-0000-0000-0000-000000000001',
       (select id from assessment_runs where church_id = (select id from churches where name = 'Strip Test Church')),
       (select id from churches where name = 'Strip Test Church'),
       '16161616-1616-1616-1616-161616161616', false, now() + interval '30 days';

select throws_ok(
  $$insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
    select 'd0000000-0000-0000-0000-000000000002',
           (select id from assessment_runs where church_id = (select id from churches where name = 'Strip Test Church')),
           (select id from churches where name = 'Strip Test Church'),
           '16161616-1616-1616-1616-161616161616', false, now() + interval '30 days'$$,
  '23505',
  'duplicate key value violates unique constraint "report_shares_one_active_per_run"',
  'a second unrevoked share for the same run is rejected');

update report_shares set revoked = true where id = 'd0000000-0000-0000-0000-000000000001';

select lives_ok(
  $$insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
    select 'd0000000-0000-0000-0000-000000000003',
           (select id from assessment_runs where church_id = (select id from churches where name = 'Strip Test Church')),
           (select id from churches where name = 'Strip Test Church'),
           '16161616-1616-1616-1616-161616161616', false, now() + interval '30 days'$$,
  'a new unrevoked share is allowed once the previous one is revoked');

select * from finish();
rollback;
```

Assertion count: 6 (`strip_respondents`) + 1 (`has_index`) + 1 (`throws_ok`) + 1 (`lives_ok`) = **9**. Matches `plan(9)`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`

Expected: FAIL — `16_strip_respondents_test.sql` errors with `function strip_respondents(jsonb) does not exist`. (Do **not** run `npm run test:db`.)

- [ ] **Step 3: Write the migrations**

Create `supabase/migrations/20260718000100_fn_strip_respondents.sql`:

```sql
-- strip_respondents: removes the per-person name-to-score list from a stored diagnosis
-- payload, leaving every other key intact. Kept standalone and IMMUTABLE (it touches no
-- table) so pgTAP can exercise it directly against crafted payloads, and so the SQL half
-- of M6a's defence-in-depth is testable independently of any RPC.
create function public.strip_respondents(p_payload jsonb)
returns jsonb language sql immutable as $$
  select case
    when p_payload ? 'dispersion_flags' then jsonb_set(
      p_payload, '{dispersion_flags}',
      coalesce((
        select jsonb_agg(jsonb_set(flag, '{respondents}', '[]'::jsonb))
        from jsonb_array_elements(p_payload->'dispersion_flags') as flag
      ), '[]'::jsonb))
    else p_payload
  end;
$$;
```

Create `supabase/migrations/20260718000200_report_shares_one_active_index.sql`:

```sql
-- At most one live share per run. `revoked` is a plain column, so this predicate is
-- immutable and indexable. Expiry is deliberately NOT in the predicate — a now()
-- comparison is not immutable. create_report_share revokes an expired-but-unrevoked
-- row before minting, which keeps "one active link per run" true without it.
create unique index report_shares_one_active_per_run
  on public.report_shares (run_id) where not revoked;
```

- [ ] **Step 4: Apply the migrations and re-run the test**

Run: `supabase migration up --local && supabase test db`

Expected: PASS. Files=17, Tests=163 (154 baseline + 9).

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`

Expected: tsc 0 errors, eslint 0 problems, vitest 158 passing (unchanged — this task is SQL-only).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718000100_fn_strip_respondents.sql \
        supabase/migrations/20260718000200_report_shares_one_active_index.sql \
        supabase/tests/16_strip_respondents_test.sql
git commit -m "feat(m6a): strip_respondents helper + one-active-share-per-run index"
```

---

### Task 2: `create_report_share` / `revoke_report_share` / `get_report_share`

**Files:**
- Create: `supabase/migrations/20260718000300_rpc_report_share_manage.sql`
- Test: `supabase/tests/17_report_share_manage_test.sql`

**Interfaces:**
- Consumes: `report_shares_one_active_per_run` (Task 1), `public.church_members`, `public.assessment_runs`.
- Produces:
  - `public.create_report_share(p_run_id uuid) returns uuid` — the share token.
  - `public.revoke_report_share(p_run_id uuid) returns void`.
  - `public.get_report_share(p_run_id uuid) returns table(token uuid, expires_at timestamptz)` — zero rows when nothing is live.
  - All three `grant execute ... to authenticated` only. Task 6's server actions call all three.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/17_report_share_manage_test.sql`:

```sql
begin;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('17171717-1717-1717-1717-171717171717','authenticated','authenticated','admin17@test.com','x',now(),now()),
 ('17171717-1717-1717-1717-171717171718','authenticated','authenticated','viewer17@test.com','x',now(),now()),
 ('17171717-1717-1717-1717-171717171719','authenticated','authenticated','outsider17@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';
select create_church_with_admin('Share Manage Church', '#171717', '0.1.0');
reset role;

insert into church_members (church_id, user_id, role)
select (select id from churches where name = 'Share Manage Church'),
       '17171717-1717-1717-1717-171717171718', 'viewer';

create temp table t_run as
select id from assessment_runs
where church_id = (select id from churches where name = 'Share Manage Church');

-- ── admin can mint ─────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

create temp table t_first as select create_report_share((select id from t_run)) as token;

select isnt((select token from t_first), null, 'admin mint returns a token');

select is(create_report_share((select id from t_run)), (select token from t_first),
          'minting twice returns the same live token');

select ok(
  (select expires_at from report_shares where id = (select token from t_first))
    between now() + interval '29 days' and now() + interval '31 days',
  'the minted share expires ~30 days out');

select is((select token from get_report_share((select id from t_run))), (select token from t_first),
          'get_report_share returns the live token');

-- ── guards ─────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171718","email":"viewer17@test.com","role":"authenticated"}';

select throws_ok(
  $$select create_report_share((select id from t_run))$$,
  '42501', 'must be an admin of this church',
  'a viewer cannot mint a share');

select throws_ok(
  $$select revoke_report_share((select id from t_run))$$,
  '42501', 'must be an admin of this church',
  'a viewer cannot revoke a share');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171719","email":"outsider17@test.com","role":"authenticated"}';

select throws_ok(
  $$select create_report_share((select id from t_run))$$,
  '42501', 'must be an admin of this church',
  'a non-member cannot mint a share');

-- ── revoke ─────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

select revoke_report_share((select id from t_run));

select is((select revoked from report_shares where id = (select token from t_first)), true,
          'revoke_report_share marks the live share revoked');

select is((select count(*) from get_report_share((select id from t_run))), 0::bigint,
          'get_report_share returns no rows once revoked');

select lives_ok(
  $$select revoke_report_share((select id from t_run))$$,
  'revoking when nothing is active is a no-op, not an error');

create temp table t_second as select create_report_share((select id from t_run)) as token;

select isnt((select token from t_second), (select token from t_first),
            'minting after a revoke returns a NEW token');

-- ── expired-but-unrevoked occupies the slot; mint must replace it ──────────
update report_shares set expires_at = now() - interval '1 day' where id = (select token from t_second);

select isnt(create_report_share((select id from t_run)), (select token from t_second),
            'minting when the live share has expired revokes it and returns a new token');

select * from finish();
rollback;
```

Assertion count: 4 (mint block) + 3 (guards) + 4 (revoke block) + 1 (expiry) = **12**. Matches `plan(12)`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`

Expected: FAIL — `function create_report_share(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718000300_rpc_report_share_manage.sql`:

```sql
-- Admin-gated management of report_shares. The table has no RLS policy and no base-table
-- grant; these SECURITY DEFINER functions are its only authenticated-side entry points.
-- The admin guard is copied verbatim from create_member_invitation so the two cannot drift.

create function public.create_report_share(p_run_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_church_id uuid;
  v_existing public.report_shares;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select church_id into v_church_id from public.assessment_runs where id = p_run_id;
  if v_church_id is null then
    -- No such run. Refuse with the same message a non-admin gets, so the error is not
    -- an oracle for which run ids exist.
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members
    where church_id = v_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from public.report_shares
  where run_id = p_run_id and not revoked;

  if found then
    if v_existing.expires_at > now() then
      return v_existing.id;              -- still live: idempotent
    end if;
    -- Expired but unrevoked: it still occupies the partial unique index slot, so free it.
    update public.report_shares set revoked = true where id = v_existing.id;
  end if;

  insert into public.report_shares (run_id, church_id, created_by, revoked, expires_at)
  values (p_run_id, v_church_id, v_uid, false, now() + interval '30 days')
  returning id into v_id;

  return v_id;
end;
$$;

create function public.revoke_report_share(p_run_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_church_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select church_id into v_church_id from public.assessment_runs where id = p_run_id;
  if v_church_id is null then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members
    where church_id = v_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent: matches nothing when no live share exists.
  update public.report_shares set revoked = true
  where run_id = p_run_id and not revoked;
end;
$$;

-- Read-only companion. The dashboard needs to know whether a run is currently shared, and
-- report_shares is unreadable from the client. create_report_share cannot serve this — it
-- is a writer, and calling it on render would mint a link merely by visiting the page.
create function public.get_report_share(p_run_id uuid)
returns table(token uuid, expires_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_church_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select church_id into v_church_id from public.assessment_runs where id = p_run_id;
  if v_church_id is null then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members
    where church_id = v_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  return query
    select s.id, s.expires_at from public.report_shares s
    where s.run_id = p_run_id and not s.revoked and s.expires_at > now();
end;
$$;

revoke all on function public.create_report_share(uuid) from public, anon;
revoke all on function public.revoke_report_share(uuid) from public, anon;
revoke all on function public.get_report_share(uuid)    from public, anon;
grant execute on function public.create_report_share(uuid) to authenticated;
grant execute on function public.revoke_report_share(uuid) to authenticated;
grant execute on function public.get_report_share(uuid)    to authenticated;
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase migration up --local && supabase test db`

Expected: PASS. Files=18, Tests=175 (163 + 12).

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`

Expected: tsc 0, eslint 0, vitest 158 passing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718000300_rpc_report_share_manage.sql \
        supabase/tests/17_report_share_manage_test.sql
git commit -m "feat(m6a): admin-gated create/revoke/get report share RPCs"
```

---

### Task 3: `get_shared_report` — anon tokenized read

**Files:**
- Create: `supabase/migrations/20260718000400_rpc_get_shared_report.sql`
- Test: `supabase/tests/18_get_shared_report_test.sql`

**Interfaces:**
- Consumes: `public.strip_respondents(jsonb)` (Task 1), `public.create_report_share(uuid)` (Task 2), `public.diagnoses`, `public.churches`.
- Produces: `public.get_shared_report(p_token uuid) returns table(valid boolean, payload jsonb, prose jsonb, church_name text, brand_color text)`, granted to `anon, authenticated`. Task 5's page consumes it.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/18_get_shared_report_test.sql`:

```sql
begin;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('18181818-1818-1818-1818-181818181818','authenticated','authenticated','admin18@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
select create_church_with_admin('Shared Report Church', '#181818', '0.1.0');
reset role;

create temp table t_run as
select id from assessment_runs
where church_id = (select id from churches where name = 'Shared Report Church');

-- A diagnosis whose payload genuinely CONTAINS respondent names. The whole point of the
-- SQL strip is that this is the real stored shape.
insert into diagnoses (run_id, response_hash, payload, prose, prose_source)
select (select id from t_run), 'hash18',
  '{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb,
  '{"verdict":"v"}'::jsonb, 'fallback';

-- POSITIVE CONTROL: prove the detector fires against the unstripped stored row before any
-- zero-match assertion below is trusted.
select ok(
  (select payload::text from diagnoses where response_hash = 'hash18') like '%Dana Okafor%',
  'POSITIVE CONTROL: the stored payload really does contain a respondent name');

set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
create temp table t_token as select create_report_share((select id from t_run)) as token;
reset role;

-- ── act as anon ────────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select valid from get_shared_report((select token from t_token))), true,
          'a live token is valid');

select is((select church_name from get_shared_report((select token from t_token))),
          'Shared Report Church', 'a live token exposes the church name');

select is((select brand_color from get_shared_report((select token from t_token))),
          '#181818', 'a live token exposes the brand color');

select is(
  (select payload -> 'dispersion_flags' -> 0 -> 'respondents' from get_shared_report((select token from t_token))),
  '[]'::jsonb,
  'the returned payload has its respondents stripped');

select ok(
  (select payload::text from get_shared_report((select token from t_token))) not like '%Dana Okafor%',
  'no respondent name survives anywhere in the returned payload');

select is(
  (select payload -> 'overall_score' from get_shared_report((select token from t_token))),
  '55'::jsonb,
  'the rest of the payload survives the strip');

-- ── uniform invalid ────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
select revoke_report_share((select id from t_run));
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select valid from get_shared_report((select token from t_token))), false,
          'a revoked token is invalid');

select is((select payload from get_shared_report((select token from t_token))), null,
          'a revoked token returns no payload');

select is((select valid from get_shared_report('e0000000-0000-0000-0000-000000000009')), false,
          'an unknown token is invalid');

select is(
  (select row(valid, payload, prose, church_name, brand_color)::text
     from get_shared_report((select token from t_token))),
  (select row(valid, payload, prose, church_name, brand_color)::text
     from get_shared_report('e0000000-0000-0000-0000-000000000009')),
  'revoked and unknown tokens return IDENTICAL rows — no oracle');

select * from finish();
rollback;
```

Assertion count: 1 (positive control) + 6 (valid-token block) + 4 (uniform-invalid block) = **11**. Matches `plan(11)`.

Note: expiry is covered by `17`'s expiry assertion plus the `expires_at < now()` branch below; the revoked and unknown paths are the two that must be byte-identical and both are asserted here.

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`

Expected: FAIL — `function get_shared_report(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718000400_rpc_get_shared_report.sql`:

```sql
-- get_shared_report: anon-callable tokenized read of one diagnosis. Mirrors the security
-- contract of get_invitation_context exactly — revoked, expired and unknown tokens all
-- return the IDENTICAL invalid row, so there is no oracle distinguishing them. The payload
-- is passed through strip_respondents so respondent names never leave Postgres on this path.
create function public.get_shared_report(p_token uuid)
returns table(valid boolean, payload jsonb, prose jsonb, church_name text, brand_color text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_share public.report_shares;
  v_diag public.diagnoses;
  v_church public.churches;
begin
  select * into v_share from public.report_shares where id = p_token;

  if not found or v_share.revoked or v_share.expires_at is null or v_share.expires_at < now() then
    return query select false, null::jsonb, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_diag from public.diagnoses
  where run_id = v_share.run_id
  order by generated_at desc
  limit 1;

  if not found then
    return query select false, null::jsonb, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_church from public.churches where id = v_share.church_id;

  if not found then
    return query select false, null::jsonb, null::jsonb, null::text, null::text;
    return;
  end if;

  return query select true,
                      public.strip_respondents(v_diag.payload),
                      v_diag.prose,
                      v_church.name,
                      v_church.brand_color;
end;
$$;

revoke all on function public.get_shared_report(uuid) from public;
grant execute on function public.get_shared_report(uuid) to anon, authenticated;
```

- [ ] **Step 4: Apply and re-run**

Run: `supabase migration up --local && supabase test db`

Expected: PASS. Files=19, Tests=186 (175 + 11).

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`

Expected: tsc 0, eslint 0, vitest 158 passing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718000400_rpc_get_shared_report.sql \
        supabase/tests/18_get_shared_report_test.sql
git commit -m "feat(m6a): get_shared_report anon RPC (uniform-invalid, SQL-stripped)"
```

---

### Task 4: `'shared'` report audience

**Files:**
- Modify: `lib/report/view.ts:6` (the `ReportAudience` type), `lib/report/view.ts:19` (`nextStep` becomes optional), `lib/report/view.ts:23-31` (the doc comment), `lib/report/view.ts:69-76` (the dispersion + nextStep construction)
- Modify: `lib/report/pdf/document.tsx:137-141`
- Modify: `app/app/[churchId]/diagnosis/page.tsx:101-105`
- Test: `tests/report/view.test.ts`

**Interfaces:**
- Consumes: `buildReportView(d, blocks, methodology, { audience })` as it exists today.
- Produces: `ReportAudience = 'screen' | 'pdf' | 'shared'`; `ReportView.nextStep` becomes `{ callType: string; hook: string; text: string } | undefined`. Task 5's page passes `audience: 'shared'`.

Making `nextStep` optional is a deliberate ripple: it is currently non-optional and rendered unconditionally in two places, both of which must gain a guard or `tsc` fails.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('buildReportView', ...)` block in `tests/report/view.test.ts`, before the closing `});`:

```typescript
  it('drops respondent names for the shared audience but keeps the section', () => {
    const v = buildReportView(diagnosis(WITH_DISPERSION), blocks({ dispersion: 'Your leaders split.' }),
      methodology, { audience: 'shared' });
    expect(v.dispersion).toBeDefined();
    expect(v.dispersion?.text).toBe('Your leaders split.');
    expect(v.dispersion?.respondents).toEqual([]);
  });

  it('drops the next-step CTA for the shared audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'shared' });
    expect(v.nextStep).toBeUndefined();
  });

  // Asserted separately from 'shared' on purpose: a future change to one audience must not
  // be able to silently redefine the other.
  it('keeps the next-step CTA for the pdf audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'pdf' });
    expect(v.nextStep?.text).toBe('Start with the first weekend touchpoint.');
  });

  it('keeps the next-step CTA for the screen audience', () => {
    const v = buildReportView(diagnosis(), blocks(), methodology, { audience: 'screen' });
    expect(v.nextStep?.text).toBe('Start with the first weekend touchpoint.');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/report/view.test.ts`

Expected: FAIL — TypeScript rejects `audience: 'shared'` (`Type '"shared"' is not assignable to type 'ReportAudience'`).

- [ ] **Step 3: Widen the audience type and apply the shared rules**

In `lib/report/view.ts`, replace line 6:

```typescript
export type ReportAudience = 'screen' | 'pdf' | 'shared';
```

Replace line 19 (`nextStep` in the `ReportView` interface):

```typescript
  nextStep?: { callType: string; hook: string; text: string };
```

Replace the doc comment at lines 23-31:

```typescript
/**
 * Resolves everything both report surfaces need, once. The page and the PDF
 * document consume this so section content and ordering cannot drift apart;
 * only layout primitives differ between them.
 *
 * audience 'pdf' and 'shared' both empty dispersion.respondents. Each leaves the
 * permission wall, so the per-person name-to-score list must not travel with
 * them. The field stays present-but-empty so the narrative still renders.
 *
 * audience 'shared' additionally drops nextStep: the CTA is an admin action, and
 * a board member reading a forwarded link cannot take it.
 */
```

Replace lines 69-76 (the `dispersion` and `nextStep` entries in the returned object):

```typescript
    dispersion: blocks.dispersion
      ? {
          text: blocks.dispersion,
          respondents:
            opts.audience === 'pdf' || opts.audience === 'shared'
              ? []
              : (flag?.respondents ?? []),
        }
      : undefined,

    nextStep:
      opts.audience === 'shared'
        ? undefined
        : { callType: d.offer.call_type, hook: d.offer.hook, text: blocks.next_step },
```

- [ ] **Step 4: Guard the now-optional `nextStep` in the PDF document**

In `lib/report/pdf/document.tsx`, replace lines 137-141:

```tsx
        {view.nextStep && (
          <View style={s.section}>
            <Text style={s.h2}>Your next step</Text>
            <Text>{view.nextStep.text}</Text>
            <Text style={s.refs}>{view.nextStep.callType} — {view.nextStep.hook}</Text>
          </View>
        )}
```

- [ ] **Step 5: Guard the now-optional `nextStep` on the diagnosis page**

In `app/app/[churchId]/diagnosis/page.tsx`, replace lines 101-105:

```tsx
      {view.nextStep && (
        <NextStep
          callType={view.nextStep.callType}
          hook={view.nextStep.hook}
          nextStep={view.nextStep.text}
        />
      )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/report/view.test.ts tests/report/pdf-document.test.ts`

Expected: PASS, including the four new assertions.

- [ ] **Step 7: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: tsc 0, eslint 0, vitest 162 passing (158 + 4), `next build` succeeds (the middleware-deprecation warning is expected and allowed).

- [ ] **Step 8: Commit**

```bash
git add lib/report/view.ts lib/report/pdf/document.tsx \
        "app/app/[churchId]/diagnosis/page.tsx" tests/report/view.test.ts
git commit -m "feat(m6a): add 'shared' report audience (strips respondents, drops CTA)"
```

---

### Task 5: `/r/[shareToken]` public page

**Files:**
- Create: `app/r/[shareToken]/page.tsx`

**Interfaces:**
- Consumes: `public.get_shared_report(p_token uuid)` (Task 3), `buildReportView(..., { audience: 'shared' })` (Task 4), the section components exported from `app/app/[churchId]/diagnosis/report.tsx`, `loadMethodology()`, `resolveBrand(name)`, `fallbackProse(diagnosis, methodology)`.
- Produces: the public route. Task 6's server action builds URLs pointing at it; Task 7 fetches it.

This is a **Server Component with no `'use client'` directive**, and it passes only the built `ReportView` (plus the already-SQL-stripped `Diagnosis` that `Appendix` needs) to children. It must never hand the raw RPC row to a Client Component — names would travel to the browser inside RSC flight data while staying invisible in the rendered page. The imported section components are themselves Server Components, so nothing here is serialized to the client.

No middleware change is required: `middleware.ts` only refreshes the Supabase session and does not gate routes.

- [ ] **Step 1: Write the page**

Create `app/r/[shareToken]/page.tsx`:

```tsx
// app/r/[shareToken]/page.tsx
// Public, tokenized, read-only report. No auth. Rendered with audience 'shared', which is
// the SECOND of two independent respondent-name strips — get_shared_report already removed
// them in SQL. Both must fail before a name can leak.
//
// This is a Server Component and stays one: it passes only the built ReportView and the
// already-stripped Diagnosis to children. Handing the raw RPC row to a Client Component
// would ship respondent names to the browser inside RSC flight data.
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadMethodology } from '@/lib/methodology/load'
import { resolveBrand } from '@/lib/brand/resolve'
import { fallbackProse, type ReportBlocks } from '@/lib/ai/fallback'
import { buildReportView } from '@/lib/report/view'
import type { Diagnosis } from '@/lib/engine/types'
import {
  VerdictHeader,
  ChainWalk,
  EvidenceReceipt,
  BlindSpots,
  CostSection,
  GatingFlags,
  GenerositySplit,
  Disagreement,
  Appendix,
} from '@/app/app/[churchId]/diagnosis/report'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ shareToken: string }>
}) {
  const { shareToken } = await params

  // Malformed token: fail before touching the database, as the PDF route does.
  if (!UUID.test(shareToken)) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_shared_report', { p_token: shareToken })

  if (error) {
    // Reason only — never the payload, the blocks, or respondent data.
    console.warn('[m6a] shared report RPC failed:', error.message)
    notFound()
  }

  const row = Array.isArray(data) ? data[0] : null

  // Revoked, expired and unknown all arrive here identically, and all 404. Never a 403 —
  // that would let a caller probe which tokens exist.
  if (!row || !row.valid) notFound()

  const diagnosis = row.payload as Diagnosis
  const methodology = loadMethodology()
  const brand = resolveBrand(row.church_name)

  const PROSE_MODE = process.env.PROSE_MODE ?? 'fallback'
  const blocks: ReportBlocks =
    PROSE_MODE !== 'fallback' && row.prose
      ? (row.prose as ReportBlocks)
      : fallbackProse(diagnosis, methodology)

  const view = buildReportView(diagnosis, blocks, methodology, { audience: 'shared' })

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <VerdictHeader
        name={row.church_name}
        brandColor={row.brand_color}
        monogram={brand.monogram}
        verdict={view.verdict}
        overallScore={view.overallScore}
        confidence={view.confidence}
      />

      <ChainWalk stages={view.stages} />

      {view.evidence && <EvidenceReceipt text={view.evidence.text} refs={view.evidence.refs} />}
      {view.blindSpot && <BlindSpots text={view.blindSpot} />}
      {view.cost && <CostSection cost={view.cost.cost} doNotWorkOn={view.cost.doNotWorkOn} />}
      {view.gating && <GatingFlags text={view.gating} />}
      {view.generosityMode !== null && <GenerositySplit mode={view.generosityMode} />}
      {view.dispersion && (
        <Disagreement text={view.dispersion.text} respondents={view.dispersion.respondents} />
      )}

      <Appendix
        diagnosis={diagnosis}
        methodology={methodology}
        benchmarkNote={view.appendix.benchmarkNote}
      />

      <p className="font-body text-sm text-ink-soft">
        Shared read-only view. This link expires and can be revoked at any time.
      </p>
    </main>
  )
}
```

There is deliberately **no** `Download PDF` link and **no** `NextStep` section here: the PDF route keeps its 401-without-session behaviour, and `audience: 'shared'` leaves `view.nextStep` undefined.

- [ ] **Step 2: Verify it compiles and builds**

Run: `npm run typecheck && npm run lint && npm run build`

Expected: tsc 0, eslint 0, `next build` succeeds and lists `/r/[shareToken]` among the routes.

- [ ] **Step 3: Verify the route 404s for a malformed and an unknown token**

With the dev server running (`npm run dev`), run:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/r/not-a-uuid
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/r/e0000000-0000-0000-0000-000000000009
```

Expected: `404` from both. No cookie is sent, which is the point — this route must be reachable and refusing without a session.

- [ ] **Step 4: Run the full gate**

Run: `npm test`

Expected: vitest 162 passing.

- [ ] **Step 5: Commit**

```bash
git add "app/r/[shareToken]/page.tsx"
git commit -m "feat(m6a): public /r/[shareToken] read-only report page"
```

---

### Task 6: Share control, server actions, and the spec amendment

**Files:**
- Create: `lib/report/share-link.ts`
- Create: `app/app/[churchId]/diagnosis/actions.ts`
- Create: `app/app/[churchId]/diagnosis/share-control.tsx`
- Modify: `app/app/[churchId]/diagnosis/page.tsx` (add the control beside the Download PDF link at line 83-88)
- Modify: `docs/XPG-Engineering-Spec.md:39`

**Interfaces:**
- Consumes: `create_report_share`, `revoke_report_share`, `get_report_share` (Task 2); `/r/[shareToken]` (Task 5).
- Produces:
  - `shareLink(appUrl: string, token: string): string` from `lib/report/share-link.ts`.
  - `shareReport(prev: ShareResult, formData: FormData): Promise<ShareResult>` and `revokeShare(prev: ShareResult, formData: FormData): Promise<ShareResult>`, both taking `run_id` and `church_id` form fields. `ShareResult = { link: string | null; error: string | null }`.

`shareLink` lives in `lib/`, **not** in the actions module: Next.js requires every export from a `'use server'` file to be an async server action, so a synchronous exported helper there would fail the build.

The `requireAdmin` shape matches `app/app/[churchId]/access/actions.ts:20-29`. The RPCs re-check admin server-side regardless; the action-level check exists to produce a friendly message rather than a raw Postgres error.

- [ ] **Step 1: Write the link builder**

Create `lib/report/share-link.ts`:

```typescript
/**
 * Builds the public URL for a share token. Lives here rather than in the diagnosis
 * actions module because Next.js requires every export from a 'use server' file to be
 * an async server action — a sync helper exported there fails the build.
 */
export function shareLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/r/${token}`
}
```

- [ ] **Step 2: Write the server actions**

Create `app/app/[churchId]/diagnosis/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { shareLink } from '@/lib/report/share-link'

export interface ShareResult {
  link: string | null
  error: string | null
}

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

async function requireAdmin(churchId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'You must be signed in.' as const }
  const { data: membership } = await supabase
    .from('church_members').select('role')
    .eq('church_id', churchId).eq('user_id', user.id).maybeSingle()
  if (membership?.role !== 'admin') return { supabase, error: 'You must be an admin of this church.' as const }
  return { supabase, error: null }
}

export async function shareReport(_prev: ShareResult, formData: FormData): Promise<ShareResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const runId = String(formData.get('run_id') ?? '')

  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr }

  const { data: token, error } = await supabase.rpc('create_report_share', { p_run_id: runId })
  // The RPC refuses a non-admin and a nonexistent run with the same message on purpose —
  // surface it verbatim rather than saying whether the run exists.
  if (error) return { link: null, error: error.message }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: shareLink(APP_URL, token as string), error: null }
}

export async function revokeShare(_prev: ShareResult, formData: FormData): Promise<ShareResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const runId = String(formData.get('run_id') ?? '')

  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr }

  const { error } = await supabase.rpc('revoke_report_share', { p_run_id: runId })
  if (error) return { link: null, error: error.message }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: null, error: null }
}
```

- [ ] **Step 3: Write the test for the link builder**

Create `tests/report/share-link.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shareLink } from '@/lib/report/share-link';

describe('shareLink', () => {
  it('builds a /r/<token> url from the app origin', () => {
    expect(shareLink('http://127.0.0.1:3000', 'abc-123')).toBe('http://127.0.0.1:3000/r/abc-123');
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(shareLink('https://example.test/', 'abc-123')).toBe('https://example.test/r/abc-123');
  });
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/report/share-link.test.ts`

Expected: PASS (2 assertions).

- [ ] **Step 5: Write the share control component**

Create `app/app/[churchId]/diagnosis/share-control.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { shareReport, revokeShare, type ShareResult } from './actions'

const EMPTY: ShareResult = { link: null, error: null }

export function ShareControl({
  churchId, runId, existingLink,
}: {
  churchId: string
  runId: string
  existingLink: string | null
}) {
  const [minted, mintAction, minting] = useActionState(shareReport, EMPTY)
  const [revoked, revokeAction, revoking] = useActionState(revokeShare, EMPTY)

  // `existingLink` is the single source of truth for shared-or-not. Both actions call
  // revalidatePath, so the server re-renders this component with the correct value after
  // every mint and every revoke — there is no need to reconcile client-side action state
  // against it. The action results are consulted only for their error messages.
  const link = existingLink
  const error = minted.error ?? revoked.error

  return (
    <div className="flex flex-col gap-2">
      {link ? (
        <>
          <p className="font-body text-sm text-ink-soft">
            Anyone with this link can read this report until it expires.
          </p>
          <code className="font-body break-all rounded border border-line bg-paper p-2 text-sm text-ink">
            {link}
          </code>
          <form action={revokeAction}>
            <input type="hidden" name="church_id" value={churchId} />
            <input type="hidden" name="run_id" value={runId} />
            <button
              type="submit"
              disabled={revoking}
              className="font-body text-sm text-ink-soft underline underline-offset-4"
            >
              {revoking ? 'Revoking…' : 'Revoke share link'}
            </button>
          </form>
        </>
      ) : (
        <form action={mintAction}>
          <input type="hidden" name="church_id" value={churchId} />
          <input type="hidden" name="run_id" value={runId} />
          <button
            type="submit"
            disabled={minting}
            className="font-body text-sm text-ink-soft underline underline-offset-4"
          >
            {minting ? 'Creating…' : 'Create share link'}
          </button>
        </form>
      )}

      {error && <p className="font-body text-sm text-ink">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Render the control on the diagnosis page**

In `app/app/[churchId]/diagnosis/page.tsx`, add the imports beside the existing ones:

```tsx
import { shareLink } from '@/lib/report/share-link'
import { ShareControl } from './share-control'
```

Then replace the Download PDF anchor block (lines 83-88) with:

```tsx
      <div className="flex flex-col gap-4">
        <a
          href={`/api/report/${run!.id}/pdf`}
          className="font-body text-sm text-ink-soft underline underline-offset-4"
        >
          Download PDF
        </a>

        <ShareControl
          churchId={churchId}
          runId={run!.id}
          existingLink={existingShareToken ? shareLink(APP_URL, existingShareToken) : null}
        />
      </div>
```

And read the current share state after the `diagRow` block (after line 56), before the `if (!diagRow)` early return is fine either way — put it immediately after the `diagRow` assignment:

```tsx
  // report_shares has no RLS policy and no table grant, so it is unreadable from the client.
  // get_report_share is the admin-gated read; a viewer gets an error here and simply sees no
  // share control, which is correct — only admins can mint or revoke.
  let existingShareToken: string | null = null
  if (run) {
    const { data: shareRows } = await supabase.rpc('get_report_share', { p_run_id: run.id })
    const shareRow = Array.isArray(shareRows) ? shareRows[0] : null
    existingShareToken = shareRow?.token ?? null
  }
```

Add the `APP_URL` constant near the top of the file, below the imports:

```tsx
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'
```

- [ ] **Step 7: Amend the engineering spec**

In `docs/XPG-Engineering-Spec.md`, replace line 39:

```
  /api/report-share       POST / DELETE (auth, admin)
```

with:

```
  (share mint/revoke are SERVER ACTIONS, not a route — see M6a)
```

Then append this note immediately after the closing ``` of that repository-shape block:

```markdown
> **M6a deviation (2026-07-18):** mint and revoke of report shares are implemented as server
> actions in `app/app/[churchId]/diagnosis/actions.ts`, not as `POST / DELETE /api/report-share`.
> This matches the codebase's convergence on server actions for every dashboard mutation
> (`createInvitation`, `generateDiagnosis`, the M5d access panel), gains CSRF protection and
> progressive enhancement for free, and avoids adding a second public route.
> `/r/[shareToken]` is the only new public route in M6a.
```

- [ ] **Step 8: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: tsc 0, eslint 0, vitest 164 passing (162 + 2), `next build` succeeds.

- [ ] **Step 9: Commit**

```bash
git add lib/report/share-link.ts \
        "app/app/[churchId]/diagnosis/actions.ts" \
        "app/app/[churchId]/diagnosis/share-control.tsx" \
        "app/app/[churchId]/diagnosis/page.tsx" \
        tests/report/share-link.test.ts \
        docs/XPG-Engineering-Spec.md
git commit -m "feat(m6a): share control + server actions; record spec deviation"
```

---

### Task 7: Runtime verification by fetching

**Files:**
- Create: `scripts/forge-auth-cookie.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1-6, the local Supabase stack, and the local fixtures.
- Produces: a reusable cookie-forging helper (M6b and M6c will want it too) and the recorded evidence that the confidentiality claim holds at runtime.

**Fixtures — DO NOT WIPE. Never run `npm run test:db`.**

| Thing | Value |
|---|---|
| Church | `Redwood Chapel Community Church` · `03e6121e-270a-4d7e-8106-a73da7b6ba59` |
| Run | `f5451c2b-9646-4f30-b1d6-9f35c12c9367` |
| Diagnosis | `2549974d-d898-4083-9836-bc29510fe564` (payload HAS respondent names) |
| Users | `cairn.{admin,viewer,outsider}@example.test` / `fixture-password-9271` |

- [ ] **Step 1: Write the cookie-forging helper**

The 0x0-viewport preview bug and PKCE make browser-driven auth unreliable here. Forge the session cookie directly from a GoTrue password grant instead.

Create `scripts/forge-auth-cookie.mjs`:

```javascript
// Forges the sb-<ref>-auth-token cookie from a GoTrue password grant, so curl can fetch
// authenticated pages without a browser. Sidesteps PKCE and the 0x0-viewport preview bug.
//
// Usage: node scripts/forge-auth-cookie.mjs <email> <password>
// Prints a Cookie header value suitable for `curl -b "$(node scripts/forge-auth-cookie.mjs ...)"`.
import { createChunks, stringToBase64URL } from '@supabase/ssr'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('usage: node scripts/forge-auth-cookie.mjs <email> <password>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!anon) {
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (source it from .env.local)')
  process.exit(1)
}

const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: anon },
  body: JSON.stringify({ email, password }),
})

if (!res.ok) {
  console.error(`password grant failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const session = await res.json()

// The cookie name is derived from the project ref — the first label of the Supabase host.
// Locally that host is 127.0.0.1, so the ref is "127" and the name is sb-127-auth-token.
const ref = new URL(url).hostname.split('.')[0]
const name = `sb-${ref}-auth-token`

const value = `base64-${stringToBase64URL(JSON.stringify(session))}`
const chunks = createChunks(name, value)

console.log(chunks.map((c) => `${c.name}=${c.value}`).join('; '))
```

- [ ] **Step 2: Verify the helper produces a working session**

```bash
cd /Users/newmac/Desktop/XPG-Church-Assess
set -a; . ./.env.local; set +a
COOKIE="$(node scripts/forge-auth-cookie.mjs cairn.admin@example.test fixture-password-9271)"
echo "${COOKIE:0:40}…"
curl -s -o /dev/null -w '%{http_code}\n' -b "$COOKIE" \
  http://127.0.0.1:3000/app/03e6121e-270a-4d7e-8106-a73da7b6ba59/diagnosis
```

Expected: a non-empty cookie string, then `200`. If it is `307` or `200` on the sign-in page, the cookie name or chunking is wrong — fix before continuing; every step below depends on it.

- [ ] **Step 3: Establish the positive control**

This must be done **before** trusting any zero-match result. Grep the authenticated diagnosis page for the fixture respondent names.

```bash
curl -s -b "$COOKIE" \
  http://127.0.0.1:3000/app/03e6121e-270a-4d7e-8106-a73da7b6ba59/diagnosis \
  > /tmp/m6a-authed.html
# List the respondent labels actually present in the fixture payload:
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c \
  "select jsonb_array_elements(jsonb_array_elements(payload->'dispersion_flags')->'respondents')->>'label'
   from diagnoses where id = '2549974d-d898-4083-9836-bc29510fe564';"
```

For each label printed, run:

```bash
grep -c "<label>" /tmp/m6a-authed.html
```

Expected: **at least 1 match per label.** A zero here means the detector does not work and every confidentiality result below is meaningless — stop and fix the grep before proceeding.

- [ ] **Step 4: Mint a share link and fetch it with no cookie**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c \
  "select set_config('request.jwt.claims',
     json_build_object('sub', (select id from auth.users where email='cairn.admin@example.test'),
                       'role','authenticated')::text, true),
          set_config('role','authenticated', true);
   select create_report_share('f5451c2b-9646-4f30-b1d6-9f35c12c9367');"
```

Take the printed token as `TOKEN`, then:

```bash
curl -s -o /tmp/m6a-shared.html -w '%{http_code}\n' "http://127.0.0.1:3000/r/$TOKEN"
grep -c "Redwood Chapel" /tmp/m6a-shared.html
```

Expected: `200`, and at least 1 match for the church name — proving the page rendered real report content with **no cookie sent**.

- [ ] **Step 5: Assert no respondent name reaches the shared surface**

For each label from Step 3:

```bash
grep -c "<label>" /tmp/m6a-shared.html
```

Expected: **0 for every label.** This is only meaningful because Step 3 showed the same grep firing against `/tmp/m6a-authed.html`.

Also check the raw bytes, not just the rendered text, since RSC flight data is inlined in the HTML:

```bash
for L in <label1> <label2>; do echo -n "$L: "; grep -o "$L" /tmp/m6a-shared.html | wc -l; done
```

Expected: 0 for each.

- [ ] **Step 6: Revoke and confirm the URL dies indistinguishably**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c \
  "select set_config('request.jwt.claims',
     json_build_object('sub', (select id from auth.users where email='cairn.admin@example.test'),
                       'role','authenticated')::text, true),
          set_config('role','authenticated', true);
   select revoke_report_share('f5451c2b-9646-4f30-b1d6-9f35c12c9367');"

curl -s -o /tmp/m6a-revoked.html -w '%{http_code}\n' "http://127.0.0.1:3000/r/$TOKEN"
curl -s -o /tmp/m6a-unknown.html -w '%{http_code}\n' \
  "http://127.0.0.1:3000/r/e0000000-0000-0000-0000-000000000009"
diff /tmp/m6a-revoked.html /tmp/m6a-unknown.html && echo "IDENTICAL — no oracle"
```

Expected: `404` from both, and `diff` reports no differences followed by `IDENTICAL — no oracle`. A 403 anywhere here is a failure.

- [ ] **Step 7: Confirm the PDF route is still closed on the shared path**

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3000/api/report/f5451c2b-9646-4f30-b1d6-9f35c12c9367/pdf
```

Expected: `401`. M6a adds no PDF access for unauthenticated readers.

- [ ] **Step 8: Run the full gate one final time**

Run: `npm run typecheck && npm run lint && npm test && supabase migration up --local && supabase test db && npm run build`

Expected: tsc 0 · eslint 0 · vitest 164 passing · pgTAP Files=19 / Tests=186 · `next build` succeeds.

- [ ] **Step 9: Confirm `.superpowers/` is still untracked**

Run: `git status --porcelain | grep superpowers || echo "clean — .superpowers untracked"`

Expected: `clean — .superpowers untracked`.

- [ ] **Step 10: Commit**

```bash
git add scripts/forge-auth-cookie.mjs
git commit -m "test(m6a): headless auth cookie helper for runtime share-link verification"
```

Do **not** push. Pushing as MylesM18 happens only on explicit go-ahead.

---

## Verification summary

| Spec requirement | Where it is satisfied |
|---|---|
| One active link per run | Task 1 index + Task 2 idempotent mint; pgTAP 16 assertions 7-9, pgTAP 17 assertion 2 |
| 30-day expiry set at mint | Task 2; pgTAP 17 assertion 3 |
| `ReportAudience` gains `'shared'`, distinct from `'pdf'` | Task 4; `tests/report/view.test.ts` asserts the two audiences separately |
| Respondent names stripped in SQL | Task 1 + Task 3; pgTAP 18 with a positive control |
| Respondent names stripped at render | Task 4; vitest |
| Both strips proven at runtime | Task 7 steps 3+5 (positive control then zero-match) |
| No PDF on the shared page | Task 5 (no link rendered); Task 7 step 7 (route still 401s) |
| Mint/revoke are server actions | Task 6 |
| Share control beside Download PDF | Task 6 step 6 |
| Revoked/expired/unknown indistinguishable, 404 never 403 | Task 3 (uniform invalid row) + Task 5 (`notFound()`); pgTAP 18 assertion 11, Task 7 step 6 `diff` |
| `XPG-Engineering-Spec.md:39` amended | Task 6 step 7 |
| Server Component only; no raw payload to a client | Task 5 |
| No middleware change | Task 5 (documented; none made) |
| Deferred prose cache bug untouched | Not referenced by any task |
