# Cairn M2 — Schema + RLS + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Enforce superpowers:test-driven-development on every task — the RLS/permission-wall tests are the milestone acceptance gate and MUST be written first and fail before the migration/policy that makes them pass.

**Goal:** Stand up the Postgres schema (Engineering Spec §4 + the approved invited-leader-accounts design additions), the two `SECURITY DEFINER` write RPCs, and the Row-Level-Security permission wall — with pgTAP tests that prove every design §7 acceptance criterion — so that a logged-in non-member can read nothing of a church, no user can self-insert a membership, and anonymous requests can select nothing.

**Architecture:** A Supabase local stack (Postgres 15 in Docker). Four ordered SQL migrations under `supabase/migrations/`: (1) full schema — all tables, constraints, the `profiles` auto-create trigger, and `RLS ENABLE` on every table with **no policies** (default-deny); (2) `create_church_with_admin`; (3) `accept_member_invitation`; (4) all RLS policies. `church_members` is written **only** by the two RPCs (both `SECURITY DEFINER`, which bypass RLS) — there is no client write path. pgTAP tests in `supabase/tests/` assert schema shape, each RPC's behavior, each policy, and finally the four §7 acceptance ACs, running as the real `anon`/`authenticated`/superuser roles via `set local role` + `request.jwt.claims`.

**Tech Stack:** Supabase CLI 2.104.0 (local dev + `supabase test db` pgTAP runner), Postgres 15, pgTAP, `pg_prove` (in the Supabase test container). No new TypeScript. The M1 engine (`lib/engine`, `lib/methodology`, vitest 75/75) is untouched — M2's entire surface is SQL under `supabase/`, outside `lib/engine`, so engine purity is structurally preserved.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from `docs/XPG-Engineering-Spec.md` (§2, §4), `docs/superpowers/specs/2026-07-15-invited-leader-accounts-design.md` (§4–§7), and the three round-28/29/30 plan-write handoffs.

- **Prime directive 1 — deterministic engine, additive AI.** M2 adds a DB layer that lives **entirely under `supabase/`**, outside `lib/engine`. Do **not** import Supabase, Postgres, or any client into `lib/engine`; do **not** modify any file under `lib/engine`, `lib/methodology`, `lib/ai`, or `lib/report`. The Supabase CLI is a local devtool / devDependency, **never a lib import**. After M2, the engine-purity grep must still be clean and vitest must still be 75/75.
- **Prime directive 2 — the permission wall lives in Postgres RLS, not the UI.** This IS the point of M2. Every table is RLS-enabled, default-deny. Access is keyed on a `church_members` row (`auth.uid()`), never on "having an account." A logged-in user with no membership for church X reads nothing about X.
- **Prime directive 3 — methodology is versioned data.** M2 stores `methodology_version` on `assessment_runs` (and later `diagnoses`); it never re-derives methodology in SQL. `create_church_with_admin` receives `methodology_version` as a **required parameter** (the RPC is pure SQL and cannot read the YAML — the caller passes `loadMethodology().questions.version`, currently `"0.1.0"`).
- **LOCKED (round-30 DELTA 1) — `create_church_with_admin` seeds the run atomically.** In ONE transaction it inserts the `churches` row, the `church_members(role='admin')` row for `auth.uid()`, AND the first `assessment_runs` row (`status='in_progress'`). It returns `(church_id uuid, run_id uuid)`. Required params: `p_name`, `p_brand_color`, `p_methodology_version`; the ten church-profile fields default `null`. **Consequence:** `assessment_runs` gets **NO authenticated INSERT/UPDATE policy in M2** — it is SELECT-only, membership-gated; the only writer is this RPC. Exact signature is transcribed in Task 3.
- **LOCKED (round-29, user) — coverage/completeness gate DEFERRED to M4.** M2 = schema + RLS + auth only. The `responses.value` `CHECK (value between 1 and 10)` **ships in M2** (it is part of Engineering Spec §4's schema — the value-range half). The coverage gate ("don't diagnose a run before all categories are answered → an unanswered category silently scores 0 → phantom primary constraint") is **out of M2 scope**. Note it as an M4 / engine-hardening item (see the "Deferred to M4" note below); add **no** coverage logic to M2 and do **not** touch `lib/engine`.
- **LOCKED (design §7, round-28 reconciliation #1) — `church_members` has NO write policy.** Engineering Spec §4's `members_write` `FOR ALL` policy is **dropped / never created**. `church_members` gets a `members_select` policy only. The two `SECURITY DEFINER` RPCs are the sole writers. No direct client insert/update/delete into `church_members` is ever permitted in M2 (member-removal UI is M4).
- **LOCKED (design §7) — respondent `invitations` and `responses` get NO authenticated policy at all.** Both are RLS-enabled and default-deny with **zero policies** in M2 → denied to `anon` AND `authenticated` alike. Their entire runtime surface is the two service-role `/api/respond/*` handlers, which are **M4** and bypass RLS via the service-role key. Members read the aggregated `diagnoses` (membership-gated), never raw `responses` — this also preserves respondent confidentiality. (See "Reconciliation to flag at review" — this resolves the one place where design §7 bullet 2 lists `responses` among membership-gated selects but the explicit bullet 4 says "invited responses: no authenticated policy at all"; the explicit bullet + confidentiality win.)
- **Membership-gated SELECT applies to:** `churches`, `assessment_runs`, `diagnoses`, `member_invitations`. `churches` also gets an admin-only UPDATE. `member_invitations` also gets admin-only INSERT and UPDATE (revoke). `profiles`: a user reads/writes only their own row. `report_shares`: **table-only in M2** — RLS-enabled, no policy (deny-all); its share handler/flow + policies are M6.
- **Harness (round-30 DELTA 2, confirmed via Context7 /supabase/cli):** pgTAP via `supabase test db`. `supabase test new <name>` writes `supabase/tests/<name>_test.sql` (the pgTAP template auto-prepends `create extension if not exists pgtap with schema extensions; set search_path to public, extensions;`). `supabase test db` runs `pg_prove` in a container mounting `supabase/tests`. **Locked run command: `supabase db reset && supabase test db`** (`db reset` re-applies every migration from scratch onto the local DB, then pg_prove runs the tests). Docker + `supabase start` must be up first. Each test file is wrapped `begin; select plan(N); … select * from finish(); rollback;` so seeding never persists.
- **No passwords anywhere (design §9).** Magic link + Google only. M2 creates no password columns and no password logic.
- **Push only on explicit user go-ahead, as `MylesM18`.** Repo is PRIVATE `github.com/MylesM18/XPG-Church-Assess`. The machine's other gh accounts (`CornerLeague`, `nataliemagee`) are pull-only → 403 on push. Do not push without a go-ahead.
- **Commits:** small, one per task. Conventional-commit messages (`feat:`, `test:`, `chore:`). `.superpowers/sdd/` is git-ignored scratch.

## Baseline to preserve (verify by RUNNING, never by reading)

M1 is DONE and pushed (`origin/master @ 1641b4f`; local `master @ d62c3ac`, 1 ahead = the design-doc commit, intentional). After every M2 task and again at the end:

- `npx vitest run` → **75/75 (24 files)** — unchanged.
- `npm run typecheck` → **exit 0** — unchanged (M2 adds no TS).
- Engine purity grep clean: `! grep -rnE "from '(next|@supabase|@anthropic-ai|node:fs|node:net|node:http)" lib/engine` → no matches (exit 1).

## Sign-off / review flags (STOP and surface to the user; do not silently bury)

1. **Reconciliation to flag at Task 5 review — `responses` gets NO authenticated SELECT policy.** Design §7 bullet 2 lists `responses` among "membership-gated selects," but design §7 bullet 4 explicitly says "invited `responses`: no authenticated policy at all," and respondent confidentiality argues members should read the aggregated `diagnoses`, not raw individual `responses`. This plan resolves the conflict toward **no authenticated policy on `responses`** (deny-all in M2; service-role handlers in M4 are its only reader/writer). Both readings pass every §7 negative AC; this reading is stricter and preserves confidentiality. **Surface this at the Task 5 review** so the user can veto — if they want members to read raw responses, add a `responses_select` membership-gated policy mirroring `diagnoses_select` and update Task 6's acceptance test accordingly.

## Deferred to M4 (recorded here so it is not lost — build NOTHING for it in M2)

- **Coverage / completeness gate.** A run diagnosed before all categories are answered lets an unanswered category score 0 → `< break 45` → a manufactured primary constraint from absent data. Surfaces only when responses flow into `diagnose()` (the M4 respond/aggregate path). Fix direction (M4): gate on required-item coverage / `respondentCount === 0` before diagnosing, or represent an unanswered category as null/excluded rather than 0. **Do not add this to M2; do not touch `lib/engine`.** Ledger reference: `.superpowers/sdd/progress.md` lines 52–55.
- **Account-holder invite + accept UI** (`/accept/[token]`, `POST /api/invitations` for members) and the two respondent `/api/respond/[token]` service-role handlers (respondent enters own name → `respondent_label`; email pre-filled). The RPCs and tables they call ship in M2; the UI/handlers are M4.
- **`report_shares` share flow** + its RLS policies + `/r/[shareToken]` — M6. M2 creates the table only.

## File Structure

```
/supabase/
  config.toml                                    generated by `supabase init`; project_id="cairn"   (Task 1)
  .gitignore                                     generated by `supabase init` (.branches, .temp)     (Task 1)
  migrations/
    20260715000100_schema.sql                    all 9 tables + constraints + RLS ENABLE (no policies) + profiles trigger  (Task 2)
    20260715000200_rpc_create_church.sql         create_church_with_admin (SECURITY DEFINER)         (Task 3)
    20260715000300_rpc_accept_invitation.sql     accept_member_invitation (SECURITY DEFINER)         (Task 4)
    20260715000400_rls_policies.sql              every RLS policy (default-deny stays for the rest)   (Task 5)
  tests/
    00_smoke_test.sql                            pgTAP harness smoke                                  (Task 1)
    01_schema_test.sql                           tables, columns, constraints, RLS-enabled, trigger  (Task 2)
    02_create_church_with_admin_test.sql         RPC seeds church+admin+run atomically                (Task 3)
    03_accept_member_invitation_test.sql         RPC email-match + membership insert + status flip    (Task 4)
    04_rls_policies_test.sql                     each policy: member CAN, non-member CANNOT           (Task 5)
    05_permission_wall_acceptance_test.sql       the four design §7 ACs = M2 acceptance gate          (Task 6)
/package.json                                    + "supabase" devDep pin + "test:db" script           (Task 1)
```

`config.toml` and `supabase/.gitignore` are authored by `supabase init` — do not hand-write them beyond the one edit in Task 1. All 9 tables (churches, church_members, assessment_runs, invitations, responses, diagnoses, report_shares, profiles, member_invitations) are created in the single Task-2 migration so RLS is complete and the DB is whole in one reviewable unit.

## Task index

1. Supabase local scaffold + pgTAP harness (smoke)
2. Schema migration — 9 tables, constraints, RLS-enable (default-deny), `profiles` trigger
3. RPC `create_church_with_admin` (seeds church + admin + run atomically)
4. RPC `accept_member_invitation` (email-match, membership insert, status flip)
5. RLS policies — membership-gated selects, admin writes, profiles own-row; `church_members` select-only; NO policy on `invitations`/`responses`/`report_shares`
6. Permission-wall acceptance tests — the four design §7 ACs (M2 acceptance gate)
7. Final verification — M1 baseline preserved + full `supabase test db` green + engine purity

---

### Task 1: Supabase local scaffold + pgTAP harness

**Files:**
- Create (via CLI): `supabase/config.toml`, `supabase/.gitignore`, `supabase/seed.sql` (empty), `supabase/functions/` (unused)
- Create: `supabase/tests/00_smoke_test.sql`
- Modify: `package.json` (add `supabase` devDep + `test:db` script)

**Interfaces:**
- Produces: a working local Supabase stack and the locked test command `supabase db reset && supabase test db` that every later task's pgTAP file runs under. No SQL contract yet.

- [ ] **Step 1: Confirm Docker is running and the CLI is present**

Run: `docker info >/dev/null 2>&1 && echo docker-ok ; supabase --version`
Expected: `docker-ok` and `2.104.0` (Docker must be running; the local stack needs it).

- [ ] **Step 2: Initialize the Supabase project**

Run:
```bash
cd /Users/newmac/Desktop/XPG-Church-Assess
supabase init
```
Expected: creates `supabase/config.toml`, `supabase/.gitignore`, `supabase/seed.sql`. If it prompts to generate VS Code settings / Deno config, answer **N** (not needed).

- [ ] **Step 3: Set the project id in `config.toml`**

Edit `supabase/config.toml` — set the top project id line to:
```toml
project_id = "cairn"
```
Leave every other generated default (Postgres `major_version = 15`, ports, etc.) as-is.

- [ ] **Step 4: Pin the CLI as a devDependency and add a db-test script**

Edit `package.json`. Add to `devDependencies` (keep alphabetical-ish; do not touch `dependencies`):
```json
    "supabase": "2.104.0"
```
Add to `scripts`:
```json
    "test:db": "supabase db reset && supabase test db"
```
Do **not** add anything to `dependencies` — the CLI is a devtool, never imported by app code.

- [ ] **Step 5: Write the failing harness smoke test** `supabase/tests/00_smoke_test.sql`

```sql
begin;
select plan(1);

select ok(true, 'pgTAP harness runs');

select * from finish();
rollback;
```

- [ ] **Step 6: Start the stack and run the smoke test**

Run:
```bash
supabase start
npm run test:db
```
Expected: `supabase start` prints local URLs/keys; `npm run test:db` runs `supabase db reset` (no migrations yet — clean) then `supabase test db` →
```
supabase/tests/00_smoke_test.sql .. ok
All tests successful.
Result: PASS
```

- [ ] **Step 7: Verify the M1 baseline is untouched**

Run: `npx vitest run && npm run typecheck`
Expected: `75/75 (24 files)`; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add supabase package.json package-lock.json && git commit -m "chore: supabase local scaffold + pgTAP harness (M2 task 1)"
```

---

### Task 2: Schema migration — 9 tables, constraints, RLS-enable, `profiles` trigger

**Files:**
- Create: `supabase/migrations/20260715000100_schema.sql`
- Create: `supabase/tests/01_schema_test.sql`

**Interfaces:**
- Consumes: the running local stack + pgTAP harness (Task 1).
- Produces: tables `churches`, `church_members`, `assessment_runs`, `invitations`, `responses`, `diagnoses`, `report_shares`, `profiles`, `member_invitations` — every one RLS-enabled with **no policies** (default-deny). The `public.handle_new_user()` trigger auto-creates a `profiles` row on `auth.users AFTER INSERT`. Later tasks add RPCs (3, 4) and policies (5). Column names here are the contract every RPC and policy relies on — transcribe exactly.

- [ ] **Step 1: Write the failing test** `supabase/tests/01_schema_test.sql`

```sql
begin;
select plan(24);

-- all nine tables exist
select has_table('public','churches','churches exists');
select has_table('public','church_members','church_members exists');
select has_table('public','assessment_runs','assessment_runs exists');
select has_table('public','invitations','invitations exists');
select has_table('public','responses','responses exists');
select has_table('public','diagnoses','diagnoses exists');
select has_table('public','report_shares','report_shares exists');
select has_table('public','profiles','profiles exists');
select has_table('public','member_invitations','member_invitations exists');

-- key columns / not-null the RPCs and policies depend on
select col_not_null('public','churches','brand_color','churches.brand_color NOT NULL');
select col_not_null('public','assessment_runs','methodology_version','runs.methodology_version NOT NULL');
select col_not_null('public','responses','respondent_label','responses.respondent_label NOT NULL');

-- the constraints that ship in M2
select col_has_check('public','responses','value','responses.value has a CHECK (1..10)');
select col_has_check('public','church_members','role','church_members.role has a CHECK');
select col_has_check('public','member_invitations','role','member_invitations.role has a CHECK');

-- responses.value 1..10 actually enforced (the value-range half of the M2-boundary finding)
select throws_ok(
  $$insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label)
    values (gen_random_uuid(), gen_random_uuid(), 'guest', 'G1', 11, 'invited', 'x')$$,
  '23514', 'responses.value = 11 is rejected by the CHECK');

-- RLS enabled on every table (default-deny)
select is(relrowsecurity, true, 'churches RLS enabled')  from pg_class where oid = 'public.churches'::regclass;
select is(relrowsecurity, true, 'church_members RLS enabled') from pg_class where oid = 'public.church_members'::regclass;
select is(relrowsecurity, true, 'assessment_runs RLS enabled') from pg_class where oid = 'public.assessment_runs'::regclass;
select is(relrowsecurity, true, 'invitations RLS enabled') from pg_class where oid = 'public.invitations'::regclass;
select is(relrowsecurity, true, 'responses RLS enabled') from pg_class where oid = 'public.responses'::regclass;
select is(relrowsecurity, true, 'diagnoses RLS enabled') from pg_class where oid = 'public.diagnoses'::regclass;
select is(relrowsecurity, true, 'report_shares RLS enabled') from pg_class where oid = 'public.report_shares'::regclass;
select is(relrowsecurity, true, 'profiles RLS enabled') from pg_class where oid = 'public.profiles'::regclass;
select is(relrowsecurity, true, 'member_invitations RLS enabled') from pg_class where oid = 'public.member_invitations'::regclass;

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `01_schema_test.sql` errors because the tables/trigger do not exist yet.

- [ ] **Step 3: Create the migration** `supabase/migrations/20260715000100_schema.sql`

```sql
-- Cairn M2 — full schema (Engineering Spec §4 + invited-leader-accounts design §4).
-- Every table is RLS-enabled here with NO policies (default-deny). Policies land in 20260715000400.

-- ── CHURCHES ─────────────────────────────────────────────────────────────
create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  denomination text,
  context text,                    -- urban | suburban | small_town | rural
  attendance_band text,
  adults_band text,
  staff_fte_band text,
  budget_band text,
  church_age_band text,
  growth_trajectory text,
  brand_color text not null,       -- resolved monogram tile color
  logo_url text,                   -- nullable, future
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

-- ── MEMBERSHIP = the permission table ────────────────────────────────────
create table public.church_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text not null check (role in ('admin','viewer')),
  granted_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (church_id, user_id)
);

-- ── ASSESSMENT RUN (v1: one active run per church) ───────────────────────
create table public.assessment_runs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches on delete cascade not null,
  methodology_version text not null,
  status text not null default 'in_progress' check (status in ('in_progress','complete')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- ── INVITATION (respondent, Type A) — the id IS the token ────────────────
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,
  category_id text not null,
  invited_name text,
  invited_contact text,
  channel text check (channel in ('email','sms')),
  status text not null default 'pending' check (status in ('pending','completed','revoked')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

-- ── RESPONSES ────────────────────────────────────────────────────────────
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,  -- denormalized for RLS
  category_id text not null,
  item_id text not null,
  value int not null check (value between 1 and 10),
  respondent_kind text not null check (respondent_kind in ('invited','member')),
  invitation_id uuid references public.invitations on delete set null,
  respondent_user_id uuid references auth.users,
  respondent_label text not null,
  created_at timestamptz default now()
);

-- ── DIAGNOSIS cache ──────────────────────────────────────────────────────
create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  response_hash text not null,
  methodology_version text not null,
  payload jsonb not null,
  prose jsonb,
  prose_source text check (prose_source in ('ai','fallback')),
  generated_at timestamptz default now(),
  unique (run_id, response_hash)
);

-- ── OPTIONAL share links (table-only in M2; policies + flow are M6) ───────
create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,
  created_by uuid references auth.users not null,
  revoked boolean not null default false,
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- ── PROFILES (account-holders only; 1:1 with auth.users) ─────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ── MEMBER_INVITATIONS (account-holder invites, Type B) — the id IS token ─
create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches on delete cascade not null,
  role text not null check (role in ('admin','viewer')),
  invited_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users,
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

-- ── profiles auto-create trigger (standard Supabase pattern) ─────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ENABLE on every table (default-deny; policies added in 000400) ────
alter table public.churches            enable row level security;
alter table public.church_members      enable row level security;
alter table public.assessment_runs     enable row level security;
alter table public.invitations         enable row level security;
alter table public.responses           enable row level security;
alter table public.diagnoses           enable row level security;
alter table public.report_shares       enable row level security;
alter table public.profiles            enable row level security;
alter table public.member_invitations  enable row level security;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db`
Expected: `01_schema_test.sql .. ok` (24/24); `Result: PASS`. (`00_smoke_test.sql` still passes.)

- [ ] **Step 5: Verify the M1 baseline is untouched**

Run: `npx vitest run && npm run typecheck`
Expected: `75/75 (24 files)`; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260715000100_schema.sql supabase/tests/01_schema_test.sql
git commit -m "feat: M2 schema — 9 tables, constraints, RLS-enable, profiles trigger"
```

---

### Task 3: RPC `create_church_with_admin` (seeds church + admin + run atomically)

**Files:**
- Create: `supabase/migrations/20260715000200_rpc_create_church.sql`
- Create: `supabase/tests/02_create_church_with_admin_test.sql`

**Interfaces:**
- Consumes: the Task-2 schema (`churches`, `church_members`, `assessment_runs`).
- Produces: `public.create_church_with_admin(...) returns table(church_id uuid, run_id uuid)` — `SECURITY DEFINER`. In one transaction: inserts `churches` (with `brand_color` + all profile bands + `created_by = auth.uid()`), `church_members(role='admin', user_id = auth.uid(), granted_by = auth.uid())`, and `assessment_runs(status='in_progress', methodology_version = p_methodology_version)`. Raises `insufficient_privilege` if `auth.uid()` is null. This is the **only** writer of the first `church_members` row and the first run. Required params: `p_name`, `p_brand_color`, `p_methodology_version`.

- [ ] **Step 1: Write the failing test** `supabase/tests/02_create_church_with_admin_test.sql`

```sql
begin;
select plan(7);

-- a fake authenticated user
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','founder@test.com','x', now(), now());

-- act AS that user (SECURITY DEFINER function still reads auth.uid() from the GUC)
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","email":"founder@test.com","role":"authenticated"}';

select lives_ok(
  $$select create_church_with_admin('Cornerstone Community Church', '#2E5D5B', '0.1.0')$$,
  'create_church_with_admin runs for an authenticated user');

-- reset to superuser to inspect the rows the SECURITY DEFINER function wrote
reset role;

select is((select count(*)::int from churches where name = 'Cornerstone Community Church'), 1, 'one church row created');
select is((select count(*)::int from church_members
           where user_id = '11111111-1111-1111-1111-111111111111' and role = 'admin'), 1,
          'creator is the admin member');
select is((select count(*)::int from assessment_runs
           where status = 'in_progress' and methodology_version = '0.1.0'), 1,
          'first in_progress run seeded with the passed methodology_version');
select is((select brand_color from churches where name = 'Cornerstone Community Church'), '#2E5D5B',
          'brand_color stored on the church');
select is((select created_by from churches where name = 'Cornerstone Community Church'),
          '11111111-1111-1111-1111-111111111111'::uuid, 'created_by = auth.uid()');

-- anonymous / unauthenticated caller is rejected
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';   -- no sub → auth.uid() is null
select throws_ok(
  $$select create_church_with_admin('No Auth Church', '#000000', '0.1.0')$$,
  '42501', 'unauthenticated create is rejected (auth.uid() null)');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `create_church_with_admin` does not exist yet.

- [ ] **Step 3: Create the migration** `supabase/migrations/20260715000200_rpc_create_church.sql`

```sql
-- create_church_with_admin: seeds churches + church_members(admin) + first in_progress run
-- atomically, returns (church_id, run_id). SECURITY DEFINER = bypasses RLS; the ONLY writer
-- of the first membership row and the first run. (LOCKED, round-30 DELTA 1.)
create function public.create_church_with_admin(
  p_name text,
  p_brand_color text,
  p_methodology_version text,
  p_denomination text default null,
  p_context text default null,
  p_attendance_band text default null,
  p_adults_band text default null,
  p_staff_fte_band text default null,
  p_budget_band text default null,
  p_church_age_band text default null,
  p_growth_trajectory text default null,
  p_logo_url text default null
) returns table(church_id uuid, run_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_church_id uuid;
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  insert into public.churches (
    name, denomination, context, attendance_band, adults_band, staff_fte_band,
    budget_band, church_age_band, growth_trajectory, brand_color, logo_url, created_by
  ) values (
    p_name, p_denomination, p_context, p_attendance_band, p_adults_band, p_staff_fte_band,
    p_budget_band, p_church_age_band, p_growth_trajectory, p_brand_color, p_logo_url, v_uid
  ) returning id into v_church_id;

  insert into public.church_members (church_id, user_id, role, granted_by)
  values (v_church_id, v_uid, 'admin', v_uid);

  insert into public.assessment_runs (church_id, methodology_version, status)
  values (v_church_id, p_methodology_version, 'in_progress')
  returning id into v_run_id;

  return query select v_church_id, v_run_id;
end;
$$;

-- only signed-in users may call it (RLS is still the real wall; this just narrows EXECUTE)
revoke all on function public.create_church_with_admin(
  text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_church_with_admin(
  text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db`
Expected: `02_create_church_with_admin_test.sql .. ok` (7/7); all prior tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260715000200_rpc_create_church.sql supabase/tests/02_create_church_with_admin_test.sql
git commit -m "feat: M2 create_church_with_admin RPC — seeds church + admin + run atomically"
```

---

### Task 4: RPC `accept_member_invitation` (email-match, membership insert, status flip)

**Files:**
- Create: `supabase/migrations/20260715000300_rpc_accept_invitation.sql`
- Create: `supabase/tests/03_accept_member_invitation_test.sql`

**Interfaces:**
- Consumes: Task-2 schema (`member_invitations`, `church_members`, `churches`) + Task-3 RPC (to seed a church in the test).
- Produces: `public.accept_member_invitation(p_token uuid) returns uuid` — `SECURITY DEFINER`. Loads the `member_invitations` row by `id = p_token`; raises if not found, `status <> 'pending'`, or `expires_at < now()`; **requires `auth.email() = invited_email`** (exact match) or raises; inserts `church_members(church_id, user_id = auth.uid(), role, granted_by = created_by)` (`on conflict (church_id,user_id) do nothing`); sets the invitation `status='accepted', accepted_by = auth.uid()`; returns the `church_id`. Second writer of `church_members` (the only other one besides Task 3).

- [ ] **Step 1: Write the failing test** `supabase/tests/03_accept_member_invitation_test.sql`

```sql
begin;
select plan(6);

-- founder (admin) + invitee users
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','founder@test.com','x',now(),now()),
 ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','viewer@test.com','x',now(),now());

-- founder creates a church (seeds admin membership)
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","email":"founder@test.com","role":"authenticated"}';
select create_church_with_admin('Accept Test Church', '#333333', '0.1.0');
reset role;

-- an admin-created invitation for viewer@test.com (seeded as superuser; the invite-create
-- endpoint is M4 — here we only test the ACCEPT RPC)
insert into member_invitations (id, church_id, role, invited_email, expires_at, created_by)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       (select id from churches where name = 'Accept Test Church'),
       'viewer', 'viewer@test.com', now() + interval '7 days',
       '22222222-2222-2222-2222-222222222222';

-- wrong signed-in email is rejected (exact-match, not a bearer token)
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","email":"someone-else@test.com","role":"authenticated"}';
select throws_ok(
  $$select accept_member_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'accept rejects when auth.email() != invited_email');

-- correct email accepts
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","email":"viewer@test.com","role":"authenticated"}';
select lives_ok(
  $$select accept_member_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'accept succeeds for the invited email');

reset role;
select is((select count(*)::int from church_members
           where user_id = '33333333-3333-3333-3333-333333333333' and role = 'viewer'), 1,
          'viewer membership row inserted');
select is((select status from member_invitations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          'accepted', 'invitation marked accepted');
select is((select accepted_by from member_invitations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          '33333333-3333-3333-3333-333333333333'::uuid, 'accepted_by = auth.uid()');

-- re-accepting an already-accepted (non-pending) invite is rejected
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","email":"viewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select accept_member_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'a non-pending invitation is rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `accept_member_invitation` does not exist yet.

- [ ] **Step 3: Create the migration** `supabase/migrations/20260715000300_rpc_accept_invitation.sql`

```sql
-- accept_member_invitation: validated, server-side acceptance of a Type-B (account-holder)
-- invite. SECURITY DEFINER = bypasses RLS; the SECOND (and last) writer of church_members.
-- A user can never self-insert a church_members row — only this RPC and create_church_with_admin.
create function public.accept_member_invitation(p_token uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_inv public.member_invitations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_inv from public.member_invitations where id = p_token;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation has expired';
  end if;
  if v_email is null or v_email <> v_inv.invited_email then
    raise exception 'signed-in email does not match the invited email';
  end if;

  insert into public.church_members (church_id, user_id, role, granted_by)
  values (v_inv.church_id, v_uid, v_inv.role, v_inv.created_by)
  on conflict (church_id, user_id) do nothing;

  update public.member_invitations
     set status = 'accepted', accepted_by = v_uid
   where id = p_token;

  return v_inv.church_id;
end;
$$;

revoke all on function public.accept_member_invitation(uuid) from public, anon;
grant execute on function public.accept_member_invitation(uuid) to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db`
Expected: `03_accept_member_invitation_test.sql .. ok` (6/6); all prior tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260715000300_rpc_accept_invitation.sql supabase/tests/03_accept_member_invitation_test.sql
git commit -m "feat: M2 accept_member_invitation RPC — email-match, membership insert, status flip"
```

---

### Task 5: RLS policies

**Files:**
- Create: `supabase/migrations/20260715000400_rls_policies.sql`
- Create: `supabase/tests/04_rls_policies_test.sql`

**Interfaces:**
- Consumes: Task-2 schema (RLS already enabled) + Tasks 3–4 RPCs (to seed a church/member in the test).
- Produces the policies:
  - `churches`: `churches_select` (members), `churches_update` (admins).
  - `church_members`: `members_select` (members of that church) **only — NO write policy** (the two RPCs are the sole writers; Eng-Spec §4's `members_write` is intentionally NOT created).
  - `assessment_runs`: `runs_select` (members) **only — NO write policy** (seeded by the RPC; LOCKED round-30 DELTA 1).
  - `diagnoses`: `diagnoses_select` (members).
  - `member_invitations`: `minv_select` / `minv_insert` / `minv_update` — all admin-of-church only.
  - `profiles`: `profiles_select_own` / `profiles_update_own` (own row only).
  - `invitations`, `responses`, `report_shares`: **no policy at all** (stay default-deny; service-role / M4 / M6 own them).
- **REVIEW FLAG:** at this task's review, surface the `responses` = no-authenticated-policy reconciliation (see "Sign-off / review flags" above) for the user to confirm or veto.

- [ ] **Step 1: Write the failing test** `supabase/tests/04_rls_policies_test.sql`

```sql
begin;
select plan(12);

-- two users: a member (admin) and a non-member
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','member@test.com','x',now(),now()),
 ('55555555-5555-5555-5555-555555555555','authenticated','authenticated','stranger@test.com','x',now(),now());

-- member creates a church (seeds church + admin membership + run)
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select create_church_with_admin('RLS Test Church', '#444444', '0.1.0');

-- seed a diagnosis for the run (as superuser — the diagnosis writer is M5)
reset role;
insert into diagnoses (run_id, response_hash, methodology_version, payload)
select id, 'hash1', '0.1.0', '{"ok":true}'::jsonb from assessment_runs
 where church_id = (select id from churches where name = 'RLS Test Church');

-- MEMBER can read own church, run, diagnosis
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select is((select count(*)::int from churches where name = 'RLS Test Church'), 1, 'member selects own church');
select is((select count(*)::int from assessment_runs), 1, 'member selects own run');
select is((select count(*)::int from diagnoses), 1, 'member selects own diagnosis');
select is((select count(*)::int from church_members), 1, 'member sees own membership row');

-- member CANNOT self-insert another membership row (no write policy on church_members)
select throws_ok(
  $$insert into church_members (church_id, user_id, role)
    values ((select id from churches where name = 'RLS Test Church'),
            '44444444-4444-4444-4444-444444444444', 'admin')$$,
  '42501', 'member cannot self-insert a church_members row');

-- member CANNOT insert a run (no write policy on assessment_runs)
select throws_ok(
  $$insert into assessment_runs (church_id, methodology_version)
    values ((select id from churches where name = 'RLS Test Church'), '0.1.0')$$,
  '42501', 'member cannot insert an assessment_run');

-- NON-MEMBER sees nothing
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","email":"stranger@test.com","role":"authenticated"}';
select is((select count(*)::int from churches), 0, 'non-member selects no church');
select is((select count(*)::int from assessment_runs), 0, 'non-member selects no run');
select is((select count(*)::int from diagnoses), 0, 'non-member selects no diagnosis');
select is((select count(*)::int from church_members), 0, 'non-member selects no membership');

-- profiles own-row: each user sees only their own auto-created profile row
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select is((select count(*)::int from profiles), 1, 'member sees exactly their own profile');
select is((select id from profiles), '44444444-4444-4444-4444-444444444444'::uuid, 'and it is their row');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db`
Expected: FAIL — with no policies, the member's positive selects return 0 (default-deny), so the `is(..., 1, ...)` assertions fail.

- [ ] **Step 3: Create the migration** `supabase/migrations/20260715000400_rls_policies.sql`

```sql
-- Cairn M2 — RLS policies. Everything not granted here stays default-deny.
-- Membership helper is inlined per policy: a user is a member of a church iff a church_members
-- row matches auth.uid(). church_members itself is SELECT-only (RPCs are the sole writers);
-- invitations / responses / report_shares get NO policy (service-role / M4 / M6 own them).

-- ── churches ─────────────────────────────────────────────────────────────
create policy churches_select on public.churches for select to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid()));

create policy churches_update on public.churches for update to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid() and m.role = 'admin'))
  with check (exists (select 1 from public.church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid() and m.role = 'admin'));

-- ── church_members: SELECT only. NO write policy (Eng-Spec §4 members_write is dropped) ──
create policy members_select on public.church_members for select to authenticated
  using (exists (select 1 from public.church_members me
                 where me.church_id = church_members.church_id and me.user_id = auth.uid()));

-- ── assessment_runs: SELECT only (seeded by create_church_with_admin; LOCKED DELTA 1) ────
create policy runs_select on public.assessment_runs for select to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = assessment_runs.church_id and m.user_id = auth.uid()));

-- ── diagnoses: members read (this is what members read — not raw responses) ──────────────
create policy diagnoses_select on public.diagnoses for select to authenticated
  using (exists (select 1 from public.church_members m
                 join public.assessment_runs r on r.church_id = m.church_id
                 where r.id = diagnoses.run_id and m.user_id = auth.uid()));

-- ── member_invitations: only admins of the church may insert/select/revoke ───────────────
create policy minv_select on public.member_invitations for select to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin'));

create policy minv_insert on public.member_invitations for insert to authenticated
  with check (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin')
              and created_by = auth.uid());

create policy minv_update on public.member_invitations for update to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin'))
  with check (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin'));

-- ── profiles: a user reads/writes only their own row ─────────────────────────────────────
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- invitations, responses, report_shares: intentionally NO policy — default-deny stays.
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db`
Expected: `04_rls_policies_test.sql .. ok` (12/12); all prior tests still PASS.

- [ ] **Step 5: REVIEW FLAG — surface the `responses` reconciliation**

At review, tell the user: this plan gives `responses` **no authenticated SELECT policy** (deny-all in M2; service-role in M4 is its only reader), resolving the design §7 bullet-2-vs-bullet-4 conflict toward confidentiality. If they want members to read raw responses, add a `responses_select` membership-gated policy and extend Task 6. Do not proceed past merge without noting their choice.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260715000400_rls_policies.sql supabase/tests/04_rls_policies_test.sql
git commit -m "feat: M2 RLS policies — membership-gated selects, admin writes, profiles own-row"
```

---

### Task 6: Permission-wall acceptance tests (the four design §7 ACs) — M2 acceptance gate

**Files:**
- Create: `supabase/tests/05_permission_wall_acceptance_test.sql`

**Interfaces:**
- Consumes: everything (schema + both RPCs + all policies).
- Produces: the M2 acceptance gate — one pgTAP file asserting the four design §7 acceptance criteria as a single, self-contained proof. This adds **no** migration; it is pure test. When this is green (and Tasks 2–5 are green), M2's acceptance criteria are met.

The four ACs (design §7 / Engineering Spec §13 M2 AC line 501):
1. A logged-in **non-member** can read **nothing** of a church (runs, responses, diagnoses, invitations).
2. A signed-in user **cannot** insert their own `church_members` row (only the two `SECURITY DEFINER` RPCs can).
3. **Anon** cannot select `invitations`, `member_invitations`, `responses`, or any church internals.
4. The email-match check in `accept_member_invitation` is enforced (a mismatched sign-in cannot accept).

- [ ] **Step 1: Write the acceptance test** `supabase/tests/05_permission_wall_acceptance_test.sql`

```sql
begin;
select plan(14);

-- founder (member/admin), a stranger (logged-in non-member), and an invitee
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('66666666-6666-6666-6666-666666666666','authenticated','authenticated','founder@ac.com','x',now(),now()),
 ('77777777-7777-7777-7777-777777777777','authenticated','authenticated','stranger@ac.com','x',now(),now()),
 ('88888888-8888-8888-8888-888888888888','authenticated','authenticated','invitee@ac.com','x',now(),now());

-- founder creates a church (church + admin membership + run)
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","email":"founder@ac.com","role":"authenticated"}';
select create_church_with_admin('Acceptance Church', '#556677', '0.1.0');

-- seed a diagnosis, an invited invitation, invited responses, and a member_invitation (superuser)
reset role;
insert into diagnoses (run_id, response_hash, methodology_version, payload)
select id,'h','0.1.0','{}'::jsonb from assessment_runs
 where church_id = (select id from churches where name='Acceptance Church');
insert into invitations (run_id, church_id, category_id, created_by)
select r.id, r.church_id, 'guest', '66666666-6666-6666-6666-666666666666'
 from assessment_runs r where r.church_id = (select id from churches where name='Acceptance Church');
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label)
select r.id, r.church_id, 'guest', 'G1', 7, 'invited', 'Pastor'
 from assessment_runs r where r.church_id = (select id from churches where name='Acceptance Church');
insert into member_invitations (church_id, role, invited_email, expires_at, created_by)
values ((select id from churches where name='Acceptance Church'), 'viewer', 'invitee@ac.com',
        now() + interval '7 days', '66666666-6666-6666-6666-666666666666');

-- ── AC1: logged-in NON-member reads nothing ─────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","email":"stranger@ac.com","role":"authenticated"}';
select is((select count(*)::int from churches),        0, 'AC1 non-member: no churches');
select is((select count(*)::int from assessment_runs), 0, 'AC1 non-member: no runs');
select is((select count(*)::int from diagnoses),       0, 'AC1 non-member: no diagnoses');
select is((select count(*)::int from invitations),     0, 'AC1 non-member: no invitations');
select is((select count(*)::int from responses),       0, 'AC1 non-member: no responses');
select is((select count(*)::int from member_invitations), 0, 'AC1 non-member: no member_invitations');

-- ── AC2: a signed-in user cannot self-insert a membership ───────────────
select throws_ok(
  $$insert into church_members (church_id, user_id, role)
    values ((select id from churches where name='Acceptance Church' limit 1),
            '77777777-7777-7777-7777-777777777777','admin')$$,
  '42501', 'AC2 no self-insert into church_members');

-- ── AC3: ANON can select nothing ────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from invitations),        0, 'AC3 anon: no invitations');
select is((select count(*)::int from member_invitations), 0, 'AC3 anon: no member_invitations');
select is((select count(*)::int from responses),          0, 'AC3 anon: no responses');
select is((select count(*)::int from churches),           0, 'AC3 anon: no churches');
select is((select count(*)::int from assessment_runs),    0, 'AC3 anon: no runs');
select is((select count(*)::int from diagnoses),          0, 'AC3 anon: no diagnoses');

-- ── AC4: accept_member_invitation email-match enforced ──────────────────
-- (positive path is covered in Task 4; here we prove the negative: mismatched sign-in cannot accept)
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","email":"stranger@ac.com","role":"authenticated"}';
select throws_ok(
  $$select accept_member_invitation(
      (select id from member_invitations where invited_email='invitee@ac.com'))$$,
  'P0001', 'AC4 mismatched sign-in cannot accept the invite');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it passes**

Run: `npm run test:db`
Expected: `05_permission_wall_acceptance_test.sql .. ok` (14/14); the whole suite (00–05) PASS. **This is the M2 acceptance gate — all four §7 ACs proven.**

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/05_permission_wall_acceptance_test.sql
git commit -m "test: M2 permission-wall acceptance — the four design §7 ACs proven in pgTAP"
```

---

### Task 7: Final verification — M1 baseline preserved + full db suite green + engine purity

**Files:** none (verification only).

**Interfaces:**
- Consumes: the whole M2 build.
- Produces: evidence that M2 is complete and M1 is intact. Uses **superpowers:verification-before-completion** — every claim below must be backed by the actual command output, not assertion.

- [ ] **Step 1: Full DB suite from a clean reset**

Run: `npm run test:db`
Expected: `supabase db reset` re-applies all four migrations cleanly, then all six test files PASS:
```
supabase/tests/00_smoke_test.sql .. ok
supabase/tests/01_schema_test.sql .. ok
supabase/tests/02_create_church_with_admin_test.sql .. ok
supabase/tests/03_accept_member_invitation_test.sql .. ok
supabase/tests/04_rls_policies_test.sql .. ok
supabase/tests/05_permission_wall_acceptance_test.sql .. ok
All tests successful.
Result: PASS
```

- [ ] **Step 2: M1 baseline unchanged**

Run: `npx vitest run && npm run typecheck`
Expected: `Test Files 24 passed (24)`, `Tests 75 passed (75)`; typecheck exit 0.

- [ ] **Step 3: Engine purity still clean**

Run: `! grep -rnE "from '(next|@supabase|@anthropic-ai|node:fs|node:net|node:http)" lib/engine && echo PURE`
Expected: `PURE` (no matches under `lib/engine`; the entire M2 surface is SQL under `supabase/`).

- [ ] **Step 4: Confirm the git state and stop**

Run: `git status && git log --oneline -8`
Expected: tree clean; the seven M2 commits sit on top of `d62c3ac`. **Do NOT push** — pushing needs an explicit user go-ahead, as `MylesM18` (private repo; other gh accounts 403).

- [ ] **Step 5: Report M2 complete with evidence**

State M2 done ONLY after Steps 1–4 have produced the expected output. Report: 6/6 pgTAP files green (schema + 2 RPCs + policies + acceptance), M1 still 75/75 + tsc 0, engine purity clean, four §7 ACs proven. Note the two carried-forward items for the user: (a) the `responses` no-authenticated-policy reconciliation (Task 5 review flag) and (b) the coverage/completeness gate deferred to M4.

---

## Self-review (author checklist — done before handing to execution)

- **Spec coverage.** Design §10 build units: migration (Task 2 — all 9 tables incl. `profiles`+trigger, `member_invitations`, `church_members.role` CHECK, `responses.value` 1..10 CHECK) ✓; RPCs (Tasks 3–4, both `SECURITY DEFINER`, `create_church_with_admin` seeds the run per DELTA 1) ✓; RLS (Task 5 — default-deny, membership-gated selects, `profiles` own-row, `church_members` select-only with §4 `members_write` dropped, no policy on respondent `invitations`/`responses`, no write policy on `assessment_runs`) ✓; RLS/permission-wall tests proving every §7 AC (Task 6) ✓. UI deferred to M4 ✓. Coverage gate noted as M4, not built ✓.
- **Placeholder scan.** Every step carries the actual SQL / command / expected output. No "TBD", no "add validation", no "similar to Task N".
- **Type/identifier consistency.** Table + column names match Engineering Spec §4 verbatim; RPC signatures match round-30 DELTA 1; policy predicates key on `church_members` + `auth.uid()`; migration filenames are strictly increasing timestamps so `supabase db reset` applies schema → RPCs → policies in dependency order.
- **Harness locked.** pgTAP via `supabase test db`; run command `supabase db reset && supabase test db`; test files `begin … rollback`-wrapped; roles switched via `set local role` + `request.jwt.claims`.
