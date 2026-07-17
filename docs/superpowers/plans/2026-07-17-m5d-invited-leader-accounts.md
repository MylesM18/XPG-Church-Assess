# M5d — Invited-Leader Accounts (accept + manage-access) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Type-B (account-holder) path M4 deferred — admins invite co-admins/viewers by email, invitees accept via magic-link/Google, and a Manage-access screen lists members + pending invites, revokes a pending invite, and removes an accepted member.

**Architecture:** UI + a thin RPC layer over machinery that already exists (M2 shipped `member_invitations`, its admin-only RLS, and `accept_member_invitation`). Add four SECURITY DEFINER RPCs (create/preview/list/remove), two route pairs (`/access`, `/accept/[token]`), an email adapter, a pure accept-state resolver, and flip the dashboard stub to a live link. Anon-key client + RLS + SECURITY DEFINER RPCs only — no service-role.

**Tech Stack:** Next.js 15 (App Router, RSC + server actions), Supabase (Postgres, `@supabase/ssr` anon-key client), Tailwind v4 `@theme` tokens, Resend (soft-fail email), vitest, pgTAP.

**Source spec:** `docs/superpowers/specs/2026-07-17-m5d-invited-leader-accounts-accept-manage-design.md` (self-contained — full SQL in §4, routes in §5, edge cases §6, tests §9, manifest §10). **Governing design:** `docs/superpowers/specs/2026-07-15-invited-leader-accounts-design.md`.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from spec §11.

- **anon-key → RLS only. NO `lib/supabase/service.ts`.** All writes go through SECURITY DEFINER RPCs.
- `invitations`/`responses` keep **NO** authenticated RLS policy (respondent path stays service-role only). `member_invitations` stays admin-gated.
- **NO passwords** — magic-link + Google only. Accept requires exact `auth.email() = invited_email` (enforced inside `accept_member_invitation`, unchanged).
- `church_members` inserts ONLY via `create_church_with_admin` + `accept_member_invitation`. The **sole DELETE** is `remove_member` (admin-gated, last-admin-guarded). M5d adds NO new insert path.
- **Revoke pending = scoped RLS `update … set status='revoked'` in the action** (`minv_update` already enforces admin). **NO new RPC** for revoke.
- `--berry #8E2B3E` is foreground error/terminal text only — never a tile/background fill. Existing Tailwind-v4 `@theme` tokens only (`paper`, `ink`, `ink-soft`, `line`, `berry`, `berry-deep`, `sage`, `sand`; `font-display` Fraunces, `font-body` Hanken). No new tokens. Dashboard shell = `max-w-3xl`, `px-6 py-10`.
- New migrations numbered `20260717000000`+ (M5a used through `20260716001100`). Do **NOT** `npm audit fix --force`.
- **Baseline never drops (additions only):** `npm run typecheck` = 0 errors, `npm run lint` = 0 errors, `npm test` (vitest) = **116 passing → grows**, `npm run test:db` (pgTAP) = **Files=13 / Tests=125 → grows**. `npm run build` succeeds.
- `.superpowers/` stays **UNTRACKED**. Push to PRIVATE `github.com/MylesM18/XPG-Church-Assess` (gh user **MylesM18**) **only on explicit go-ahead**.
- Local env: Supabase DB `:54321`, Mailpit `:54324`, Studio `:54323`. `npm run test:db` = `supabase db reset && supabase test db`. Auth e2e MUST run on `http://127.0.0.1:3000` (GoTrue allows only `127.0.0.1:3000/**`).

## §7 open item — RESOLVED at plan time

**Signed-out accept branch → option (a): redirect to the existing `/sign-in?next=/accept/${token}`**, plus a small guarded `?email=` seed added to `app/sign-in/page.tsx` for pre-fill. Rationale from the reads:
- `app/sign-in/page.tsx` is a client component that already forwards `?next=` through the magic link via `resolveNext(window.location.search)` and `/auth/callback` honors it (open-redirect–guarded, `app/auth/callback/route.ts:11-12`). Reusing it means **zero duplication of the Supabase auth calls** and keeps the accept page a pure server component.
- It does **not** currently read an email hint (`email` state starts `''`). Task 8 adds a ~2-line, effect-based seed from `?email=` (display convenience only; the authoritative gate stays the server-side `auth.email() = invited_email` check inside `accept_member_invitation`).
- `next` stays a **relative path** (`/accept/${token}`) so the existing open-redirect guard covers it.

## File Structure

**New — DB (all SECURITY DEFINER; grants revoke public/anon then grant to the stated role):**
- `supabase/migrations/20260717000000_rpc_create_member_invitation.sql` — admin-gated create, 14-day expiry (spec §4.1)
- `supabase/migrations/20260717000100_rpc_get_member_invitation_preview.sql` — anon+authenticated display-only, no `church_id` (spec §4.2)
- `supabase/migrations/20260717000200_rpc_get_church_members.sql` — admin-only, crosses the profiles own-row wall (spec §4.3)
- `supabase/migrations/20260717000300_rpc_remove_member.sql` — admin-gated, last-admin-guarded DELETE (spec §4.4)
- `supabase/tests/13_member_invitations_manage_test.sql` — create + preview + members (built up across Tasks 1–3)
- `supabase/tests/14_remove_member_test.sql` — remove_member (Task 4)

**New — pure TS + email (real vitest units):**
- `lib/access/accept-state.ts` — `resolveAcceptState`, `acceptLink`, `roleLabel`
- `tests/access/accept-state.test.ts`
- `lib/email/send-member-invitation.ts` — mirror of `lib/email/send-invitation.ts`
- `tests/access/send-member-invitation.test.ts` — template render (mock Resend)

**New — routes / components (verified in the e2e phase, gate-checked per task):**
- `app/app/[churchId]/access/page.tsx` — server component, admin-gated
- `app/app/[churchId]/access/actions.ts` — `inviteMember`, `revokeInvitation`, `removeMember`
- `app/app/[churchId]/access/invite-member-form.tsx` — `'use client'`, mirrors `invite-panel.tsx`
- `app/app/[churchId]/access/members-list.tsx` — server component
- `app/app/[churchId]/access/pending-invites-list.tsx` — server component
- `app/accept/[token]/page.tsx` — server component (renders `resolveAcceptState` branches)
- `app/accept/[token]/actions.ts` — `acceptInvitation`
- `app/accept/[token]/accept-button.tsx` — `'use client'`, submits the accept action

**Changed:**
- `app/sign-in/page.tsx` — seed `email` state from `?email=` query param (Task 8)
- `app/app/[churchId]/page.tsx` — delete `DISABLED_STUBS` (const `:25` + render `:158-168`); add admin-only "Manage access" `<Link>` (Task 10)

**Task order & dependencies:** 1→2→3→4 (DB, independent of each other but share test files; do in order for monotonic plan counts) → 5 (pure resolver) → 6 (email) → 7 (access actions, consumes 1/6) → 8 (access page + components + accept page + action + accept-button + sign-in seed, consumes 2/3/5/7) → 9 (dashboard flip). Task 8 is split into 8a (accept flow) and 8b (manage-access screen) below for reviewer granularity.

---

## Task 1: `create_member_invitation` RPC

**Files:**
- Create: `supabase/migrations/20260717000000_rpc_create_member_invitation.sql`
- Test: `supabase/tests/13_member_invitations_manage_test.sql` (new; this task establishes it)

**Interfaces:**
- Produces: `create_member_invitation(p_church_id uuid, p_role text, p_invited_email text) → uuid` (the new invite id = token). Grant: `authenticated`.

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/13_member_invitations_manage_test.sql`

```sql
begin;
select plan(6);

-- admin + a viewer member + a stranger
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('c1000000-0000-0000-0000-000000000001','authenticated','authenticated','cadmin@test.com','x',now(),now()),
 ('c1000000-0000-0000-0000-000000000002','authenticated','authenticated','cviewer@test.com','x',now(),now()),
 ('c1000000-0000-0000-0000-000000000003','authenticated','authenticated','cstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Create Invite Church', '#c1c1c1', '0.1.0');
reset role;

-- seed a viewer member (superuser) so the already-member guard has a target
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Create Invite Church'),
        'c1000000-0000-0000-0000-000000000002', 'viewer',
        'c1000000-0000-0000-0000-000000000001');

-- admin creates a pending invite for a brand-new email
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'admin', 'NewCoAdmin@Test.com')$$,
  'admin can create a pending member invitation');

reset role;
select is(
  (select count(*)::int from member_invitations
   where church_id = (select id from churches where name = 'Create Invite Church')
     and invited_email = 'newcoadmin@test.com' and role = 'admin' and status = 'pending'
     and created_by = 'c1000000-0000-0000-0000-000000000001'
     and expires_at between now() + interval '13 days' and now() + interval '15 days'), 1,
  'invite is pending, email-normalized, 14-day expiry, created_by = caller');

-- a viewer cannot create
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000002","email":"cviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'viewer', 'x@test.com')$$,
  '42501', 'must be an admin of this church', 'a viewer cannot create an invitation');

-- a non-member cannot create
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000003","email":"cstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'viewer', 'x@test.com')$$,
  '42501', 'must be an admin of this church', 'a non-member cannot create an invitation');

-- already-member email rejected
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'viewer', 'cviewer@test.com')$$,
  'P0001', 'that person is already a member of this church', 'an existing member email is rejected');

-- invalid role rejected
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'owner', 'y@test.com')$$,
  'P0001', 'role must be admin or viewer', 'an invalid role is rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: `13_member_invitations_manage_test.sql` FAILS — `function create_member_invitation(...) does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20260717000000_rpc_create_member_invitation.sql`

Copy the SQL verbatim from spec §4.1 (lines 73–130): the function body with, in order — `auth.uid()` null-check → admin check → `p_role in ('admin','viewer')` → normalize `v_email = lower(trim(coalesce(p_invited_email,'')))` + empty-reject → already-member reject (join `auth.users`→`church_members` on lowered email) → duplicate-live-pending reject → insert `(church_id, role, invited_email=v_email, status='pending', expires_at=now()+interval '14 days', created_by=v_uid) returning id` → `revoke all … from public, anon; grant execute … to authenticated`. Lead with a one-line comment: `-- create_member_invitation: admin-gated Type-B invite create; 14-day expiry (tighter than the 30d respondent invite on purpose). SECURITY DEFINER.`

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db`
Expected: `13_...` passes 6/6; pgTAP total `Files=13 / Tests=131`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000000_rpc_create_member_invitation.sql supabase/tests/13_member_invitations_manage_test.sql
git commit -m "feat(m5d): create_member_invitation RPC (admin-gated, 14-day expiry)"
```

---

## Task 2: `get_member_invitation_preview` RPC

**Files:**
- Create: `supabase/migrations/20260717000100_rpc_get_member_invitation_preview.sql`
- Modify: `supabase/tests/13_member_invitations_manage_test.sql` (bump `plan()`, append preview tests)

**Interfaces:**
- Produces: `get_member_invitation_preview(p_token uuid) → table(church_name text, role text, invited_email text, status text, is_expired boolean)`. Grant: `anon, authenticated`. Zero rows for unknown token. Never returns `church_id` or assessment data.

- [ ] **Step 1: Extend the failing test** — in `13_member_invitations_manage_test.sql`, change `select plan(6);` → `select plan(10);` and append **before** `select * from finish();`:

```sql
-- get_member_invitation_preview: seed one live invite with a known id
insert into member_invitations (id, church_id, role, invited_email, status, expires_at, created_by)
select 'c1aaaaaa-0000-0000-0000-000000000001',
       (select id from churches where name = 'Create Invite Church'),
       'viewer', 'previewee@test.com', 'pending', now() + interval '10 days',
       'c1000000-0000-0000-0000-000000000001';

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select church_name from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000001')),
          'Create Invite Church', 'anon may read the preview church name');
select is((select is_expired from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000001')),
          false, 'a live invite is not expired');
select is((select invited_email from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000001')),
          'previewee@test.com', 'preview exposes the invited email');
select is((select count(*)::int from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000009')),
          0, 'unknown token → zero rows');
reset role;
```

Note: the "no `church_id`" guarantee is enforced by the return-type signature (it has no `church_id` column) — the type itself is the test. `set local role anon` proves anon-callability.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `function get_member_invitation_preview(...) does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20260717000100_rpc_get_member_invitation_preview.sql`

Copy verbatim from spec §4.2 (lines 140–153): a `language sql stable security definer` function selecting `c.name, mi.role, mi.invited_email, mi.status, (mi.expires_at < now())` from `member_invitations mi join churches c on c.id = mi.church_id where mi.id = p_token`; then `revoke all … from public; grant execute … to anon, authenticated`. Lead comment: `-- get_member_invitation_preview: anon-callable, display-only. Returns church name/role/email/status/expiry ONLY — never church_id or assessment data. The token IS the URL secret.`

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db`
Expected: `13_...` passes 10/10; pgTAP total `Files=13 / Tests=135`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000100_rpc_get_member_invitation_preview.sql supabase/tests/13_member_invitations_manage_test.sql
git commit -m "feat(m5d): get_member_invitation_preview RPC (anon display-only, no church_id)"
```

---

## Task 3: `get_church_members` RPC

**Files:**
- Create: `supabase/migrations/20260717000200_rpc_get_church_members.sql`
- Modify: `supabase/tests/13_member_invitations_manage_test.sql` (bump `plan()`, append members tests)

**Interfaces:**
- Produces: `get_church_members(p_church_id uuid) → table(user_id uuid, full_name text, email text, role text, joined_at timestamptz)`, one row per member ordered by `created_at asc`; `full_name` may be null (UI falls back to email). Grant: `authenticated`.

- [ ] **Step 1: Extend the failing test** — change `select plan(10);` → `select plan(13);` and append before `finish()`:

```sql
-- get_church_members: admin sees name/email/role/joined for every member
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_church_members((select id from churches where name = 'Create Invite Church'))),
          2, 'admin sees both members (admin + seeded viewer)');
select is((select email from get_church_members((select id from churches where name = 'Create Invite Church'))
           where role = 'viewer'), 'cviewer@test.com', 'members list exposes the viewer email');

-- a viewer cannot list members
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000002","email":"cviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select get_church_members((select id from churches where name = 'Create Invite Church'))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot list members');
reset role;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `function get_church_members(...) does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20260717000200_rpc_get_church_members.sql`

Copy verbatim from spec §4.3 (lines 163–196): plpgsql `security definer`; `auth.uid()` null-check → admin check → `return query select cm.user_id, p.full_name, coalesce(p.email, u.email) as email, cm.role, cm.created_at from church_members cm left join profiles p on p.id = cm.user_id left join auth.users u on u.id = cm.user_id where cm.church_id = p_church_id order by cm.created_at asc`; then `revoke all … from public, anon; grant execute … to authenticated`. Lead comment: `-- get_church_members: admin-only. Crosses the profiles own-row wall to name/email members — for admins of THIS church only. SECURITY DEFINER.`

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db`
Expected: `13_...` passes 13/13; pgTAP total `Files=13 / Tests=138`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000200_rpc_get_church_members.sql supabase/tests/13_member_invitations_manage_test.sql
git commit -m "feat(m5d): get_church_members RPC (admin-only, crosses profiles wall)"
```

---

## Task 4: `remove_member` RPC

**Files:**
- Create: `supabase/migrations/20260717000300_rpc_remove_member.sql`
- Test: `supabase/tests/14_remove_member_test.sql` (new)

**Interfaces:**
- Produces: `remove_member(p_church_id uuid, p_user_id uuid) → void`. Admin-gated; refuses to remove the last admin; non-member target = no-op. The only DELETE on `church_members`. Grant: `authenticated`.

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/14_remove_member_test.sql`

```sql
begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d4000000-0000-0000-0000-000000000001','authenticated','authenticated','radmin@test.com','x',now(),now()),
 ('d4000000-0000-0000-0000-000000000002','authenticated','authenticated','rviewer@test.com','x',now(),now()),
 ('d4000000-0000-0000-0000-000000000003','authenticated','authenticated','radmin2@test.com','x',now(),now()),
 ('d4000000-0000-0000-0000-000000000004','authenticated','authenticated','rstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000001","email":"radmin@test.com","role":"authenticated"}';
select create_church_with_admin('Remove Test Church', '#d4d4d4', '0.1.0');
reset role;

-- seed a viewer + a second admin (superuser)
insert into church_members (church_id, user_id, role, granted_by) values
 ((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002', 'viewer',  'd4000000-0000-0000-0000-000000000001'),
 ((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000003', 'admin',   'd4000000-0000-0000-0000-000000000001');

-- a viewer cannot remove
set local role authenticated;
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000002","email":"rviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002')$$,
  '42501', 'must be an admin of this church', 'a viewer cannot remove members');

-- a non-member cannot remove
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000004","email":"rstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002')$$,
  '42501', 'must be an admin of this church', 'a non-member cannot remove members');

-- admin removes the viewer → row gone
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000001","email":"radmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002')$$,
  'admin removes a viewer');
reset role;
select is((select count(*)::int from church_members
           where church_id = (select id from churches where name = 'Remove Test Church')
             and user_id = 'd4000000-0000-0000-0000-000000000002'), 0,
          'viewer membership row is gone');

-- removing a non-member is a no-op (does not raise)
set local role authenticated;
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000001","email":"radmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000004')$$,
  'removing a non-member is a no-op');

-- last-admin guard: remove admin2 first (two admins → allowed), then removing the last admin raises
select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000001')$$,
  'P0001', 'cannot remove the last admin of this church', 'the last admin cannot be removed');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `function remove_member(...) does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20260717000300_rpc_remove_member.sql`

Copy verbatim from spec §4.4 (lines 205–245): plpgsql `security definer`; `auth.uid()` null-check → admin check → `select role into v_target_role … ; if not found then return; end if;` → if target role = admin, `count(*)` admins, `if <= 1 raise 'cannot remove the last admin of this church'` → `delete from church_members where church_id and user_id`; then `revoke all … from public, anon; grant execute … to authenticated`. Lead comment: `-- remove_member: admin-gated, last-admin-guarded. The SOLE DELETE on church_members. Non-member target = no-op. SECURITY DEFINER.`

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db`
Expected: `14_...` passes 6/6; pgTAP total `Files=14 / Tests=144`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000300_rpc_remove_member.sql supabase/tests/14_remove_member_test.sql
git commit -m "feat(m5d): remove_member RPC (admin-gated, last-admin-guarded; sole church_members DELETE)"
```

---

## Task 5: pure `resolveAcceptState` + helpers

**Files:**
- Create: `lib/access/accept-state.ts`
- Test: `tests/access/accept-state.test.ts`

**Interfaces:**
- Produces:
  - `type AcceptPreview = { church_name: string; role: string; invited_email: string; status: string; is_expired: boolean }`
  - `type AcceptState = 'not_found' | 'revoked' | 'accepted' | 'expired' | 'sign_in' | 'wrong_email' | 'ready'`
  - `resolveAcceptState(input: { preview: AcceptPreview | null; signedIn: boolean; sessionEmail: string | null }): AcceptState`
  - `acceptLink(appUrl: string, token: string): string` → `${appUrl}/accept/${token}`
  - `roleLabel(role: string): string` → `admin`→`'co-admin'`, `viewer`→`'viewer'`, else the role verbatim
- Consumed by: Task 8a (`app/accept/[token]/page.tsx`), Task 6 (`roleLabel`), Tasks 7/8b (`acceptLink`).

**Branch precedence (drives §5.3):** `null`→`not_found`; `status==='revoked'`→`revoked`; `status==='accepted'`→`accepted`; `is_expired`→`expired`; then `!signedIn`→`sign_in`; then case-insensitive `sessionEmail !== invited_email`→`wrong_email`; else `ready`.

- [ ] **Step 1: Write the failing test** — `tests/access/accept-state.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { resolveAcceptState, acceptLink, roleLabel, type AcceptPreview } from '@/lib/access/accept-state'

const live: AcceptPreview = { church_name: 'Grace', role: 'viewer', invited_email: 'inv@test.com', status: 'pending', is_expired: false }

describe('resolveAcceptState', () => {
  it('null preview → not_found', () => {
    expect(resolveAcceptState({ preview: null, signedIn: false, sessionEmail: null })).toBe('not_found')
  })
  it('revoked → revoked (even if signed in and matching)', () => {
    expect(resolveAcceptState({ preview: { ...live, status: 'revoked' }, signedIn: true, sessionEmail: 'inv@test.com' })).toBe('revoked')
  })
  it('accepted → accepted', () => {
    expect(resolveAcceptState({ preview: { ...live, status: 'accepted' }, signedIn: true, sessionEmail: 'inv@test.com' })).toBe('accepted')
  })
  it('expired → expired (before the sign-in check)', () => {
    expect(resolveAcceptState({ preview: { ...live, is_expired: true }, signedIn: false, sessionEmail: null })).toBe('expired')
  })
  it('pending & live & signed-out → sign_in', () => {
    expect(resolveAcceptState({ preview: live, signedIn: false, sessionEmail: null })).toBe('sign_in')
  })
  it('signed-in wrong email → wrong_email', () => {
    expect(resolveAcceptState({ preview: live, signedIn: true, sessionEmail: 'other@test.com' })).toBe('wrong_email')
  })
  it('signed-in matching email (case-insensitive) → ready', () => {
    expect(resolveAcceptState({ preview: live, signedIn: true, sessionEmail: 'INV@Test.com' })).toBe('ready')
  })
})

describe('helpers', () => {
  it('acceptLink builds the URL', () => {
    expect(acceptLink('http://127.0.0.1:3000', 'abc')).toBe('http://127.0.0.1:3000/accept/abc')
  })
  it('roleLabel maps admin→co-admin, viewer→viewer', () => {
    expect(roleLabel('admin')).toBe('co-admin')
    expect(roleLabel('viewer')).toBe('viewer')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- accept-state`
Expected: FAIL — cannot resolve `@/lib/access/accept-state`.

- [ ] **Step 3: Write the implementation** — `lib/access/accept-state.ts`

```ts
export type AcceptPreview = {
  church_name: string
  role: string
  invited_email: string
  status: string
  is_expired: boolean
}

export type AcceptState =
  | 'not_found' | 'revoked' | 'accepted' | 'expired' | 'sign_in' | 'wrong_email' | 'ready'

/**
 * Pure resolver for the /accept/[token] page. Precedence: terminal invite states
 * (not_found/revoked/accepted/expired) win over auth state; then signed-out →
 * sign_in; then a case-insensitive email mismatch → wrong_email; else ready.
 * The authoritative email gate is server-side in accept_member_invitation — this
 * is a friendly pre-check only.
 */
export function resolveAcceptState(input: {
  preview: AcceptPreview | null
  signedIn: boolean
  sessionEmail: string | null
}): AcceptState {
  const { preview, signedIn, sessionEmail } = input
  if (!preview) return 'not_found'
  if (preview.status === 'revoked') return 'revoked'
  if (preview.status === 'accepted') return 'accepted'
  if (preview.is_expired) return 'expired'
  if (!signedIn) return 'sign_in'
  if ((sessionEmail ?? '').toLowerCase() !== preview.invited_email.toLowerCase()) return 'wrong_email'
  return 'ready'
}

export function acceptLink(appUrl: string, token: string): string {
  return `${appUrl}/accept/${token}`
}

export function roleLabel(role: string): string {
  if (role === 'admin') return 'co-admin'
  if (role === 'viewer') return 'viewer'
  return role
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- accept-state`
Expected: PASS (9 assertions). Then `npm run typecheck` = 0.

- [ ] **Step 5: Commit**

```bash
git add lib/access/accept-state.ts tests/access/accept-state.test.ts
git commit -m "feat(m5d): pure resolveAcceptState + acceptLink/roleLabel helpers"
```

---

## Task 6: member-invitation email adapter

**Files:**
- Create: `lib/email/send-member-invitation.ts`
- Test: `tests/access/send-member-invitation.test.ts`

**Interfaces:**
- Consumes: `roleLabel` from `lib/access/accept-state.ts`.
- Produces: `sendMemberInvitationEmail({ to, link, churchName, role }: { to: string; link: string; churchName: string; role: string }): Promise<{ ok: boolean }>` — decoupled soft-fail; `RESEND_API_KEY` absent → `{ ok: false }`. Subject `You're invited to help lead ${churchName}`; body references the church name + role label + the link.

- [ ] **Step 1: Write the failing test** — `tests/access/send-member-invitation.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))

import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.RESEND_API_KEY
})

describe('sendMemberInvitationEmail', () => {
  it('returns soft failure with no API key (and never calls Resend)', async () => {
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(res).toEqual({ ok: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends member-appropriate copy with church name + co-admin role label', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'admin' })
    expect(res).toEqual({ ok: true })
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe('a@test.com')
    expect(arg.subject).toBe("You're invited to help lead Grace")
    expect(arg.html).toContain('Grace')
    expect(arg.html).toContain('co-admin')
    expect(arg.html).toContain('http://x/accept/t')
  })

  it('maps viewer → viewer', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: null })
    await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'viewer' })
    expect(sendMock.mock.calls[0][0].html).toContain('viewer')
  })

  it('returns soft failure when Resend errors', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockResolvedValue({ error: { message: 'boom' } })
    const res = await sendMemberInvitationEmail({ to: 'a@test.com', link: 'http://x/accept/t', churchName: 'Grace', role: 'viewer' })
    expect(res).toEqual({ ok: false })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- send-member-invitation`
Expected: FAIL — cannot resolve `@/lib/email/send-member-invitation`.

- [ ] **Step 3: Write the implementation** — `lib/email/send-member-invitation.ts` (mirror `lib/email/send-invitation.ts` exactly; member copy + role label)

```ts
import { Resend } from 'resend'
import { roleLabel } from '@/lib/access/accept-state'

export interface SendMemberInvitationArgs {
  to: string
  link: string
  churchName: string
  role: string
}

/**
 * Decoupled send (mirrors sendInvitationEmail). The invitation is already persisted before this
 * is called, so any failure here is soft: log and return { ok: false }; the caller surfaces the
 * copyable link. From-address onboarding@resend.dev only delivers to the Resend account owner
 * locally — everyone else relies on the copyable-link fallback.
 */
export async function sendMemberInvitationEmail(
  { to, link, churchName, role }: SendMemberInvitationArgs,
): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('sendMemberInvitationEmail: RESEND_API_KEY not set — skipping send, returning soft failure')
    return { ok: false }
  }
  const label = roleLabel(role)
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to,
      subject: `You're invited to help lead ${churchName}`,
      html: `<p>${churchName} has invited you to help lead as a ${label}.</p>
             <p><a href="${link}">Accept your invitation</a></p>
             <p>Or paste this link into your browser:<br>${link}</p>`,
    })
    if (error) {
      console.error('sendMemberInvitationEmail: Resend returned an error', error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendMemberInvitationEmail: send threw', e)
    return { ok: false }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- send-member-invitation`
Expected: PASS. Then `npm run typecheck` = 0.

- [ ] **Step 5: Commit**

```bash
git add lib/email/send-member-invitation.ts tests/access/send-member-invitation.test.ts
git commit -m "feat(m5d): sendMemberInvitationEmail adapter (soft-fail, member copy)"
```

---

## Task 7: Manage-access server actions

**Files:**
- Create: `app/app/[churchId]/access/actions.ts`

**Interfaces:**
- Consumes: `create_member_invitation` RPC (Task 1), `remove_member` RPC (Task 4), `sendMemberInvitationEmail` (Task 6), the existing `InviteResult` shape (`{ link, emailed, error }` — re-declared locally, matching `app/app/[churchId]/actions.ts:14-18`).
- Produces:
  - `inviteMember(_prev: InviteResult, formData: FormData): Promise<InviteResult>` — used by `invite-member-form.tsx` (Task 8b) via `useActionState`.
  - `revokeInvitation(formData: FormData): Promise<void>` — used by `pending-invites-list.tsx`.
  - `removeMember(formData: FormData): Promise<void>` — used by `members-list.tsx`.
- `APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'` (same const as `app/app/[churchId]/actions.ts:20`).

**No unit test** (server action over Supabase; behavior proven in the e2e phase). Gate = typecheck + lint. Every action re-checks `getUser()` + admin server-side (never trust the client); the RPCs re-enforce anyway.

- [ ] **Step 1: Write the implementation** — `app/app/[churchId]/access/actions.ts`

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendMemberInvitationEmail } from '@/lib/email/send-member-invitation'
import { acceptLink } from '@/lib/access/accept-state'

export interface InviteResult {
  link: string | null
  emailed: boolean
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

export async function inviteMember(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const churchId = String(formData.get('church_id') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const roleInput = String(formData.get('role') ?? '')
  const role = roleInput === 'Co-admin' ? 'admin' : roleInput === 'Viewer' ? 'viewer' : roleInput

  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, emailed: false, error: authErr }

  const { data: church } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()

  const { data: token, error } = await supabase.rpc('create_member_invitation', {
    p_church_id: churchId, p_role: role, p_invited_email: email,
  })
  if (error) return { link: null, emailed: false, error: error.message }

  const link = acceptLink(APP_URL, token as string)
  const sent = await sendMemberInvitationEmail({
    to: email, link, churchName: church?.name ?? 'your church', role,
  })
  revalidatePath(`/app/${churchId}/access`)
  return { link, emailed: sent.ok, error: null }
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const churchId = String(formData.get('church_id') ?? '')
  const id = String(formData.get('invite_id') ?? '')
  const { supabase, error } = await requireAdmin(churchId)
  if (error) return
  // Scoped RLS update (minv_update enforces admin); matches only a still-pending invite → idempotent.
  await supabase.from('member_invitations')
    .update({ status: 'revoked' })
    .eq('id', id).eq('church_id', churchId).eq('status', 'pending')
  revalidatePath(`/app/${churchId}/access`)
}

export async function removeMember(formData: FormData): Promise<void> {
  const churchId = String(formData.get('church_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const { supabase, error } = await requireAdmin(churchId)
  if (error) return
  await supabase.rpc('remove_member', { p_church_id: churchId, p_user_id: userId })
  revalidatePath(`/app/${churchId}/access`)
}
```

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/app/\[churchId\]/access/actions.ts
git commit -m "feat(m5d): manage-access server actions (invite/revoke/remove)"
```

---

## Task 8a: Accept flow — page, action, accept-button, sign-in email seed

**Files:**
- Create: `app/accept/[token]/page.tsx`, `app/accept/[token]/actions.ts`, `app/accept/[token]/accept-button.tsx`
- Modify: `app/sign-in/page.tsx` (seed `email` from `?email=`)

**Interfaces:**
- Consumes: `get_member_invitation_preview` RPC (Task 2), `accept_member_invitation` RPC (existing), `resolveAcceptState`/`roleLabel` (Task 5).
- Produces: `acceptInvitation(token: string): Promise<{ ok: boolean; error?: string }>` (used by `accept-button.tsx`). The success path `redirect('/app/'+churchId)` is the **last statement, outside any try/catch** (`redirect()` throws `NEXT_REDIRECT` by design — mirror `app/app/[churchId]/actions.ts:110`).

**No unit test on the page** (resolver is already unit-tested in Task 5); gate = typecheck + lint + build; behavior proven in e2e.

- [ ] **Step 1: Write the accept action** — `app/accept/[token]/actions.ts`

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function acceptInvitation(token: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in to accept.' }

  const { data: churchId, error } = await supabase.rpc('accept_member_invitation', { p_token: token })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/app/${churchId as string}`)
  redirect(`/app/${churchId as string}`) // last statement — NEXT_REDIRECT throws by design
}
```

- [ ] **Step 2: Write the accept button** — `app/accept/[token]/accept-button.tsx`

```tsx
'use client'

import { useState } from 'react'
import { acceptInvitation } from './actions'

export function AcceptButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setError(null)
          setPending(true)
          const res = await acceptInvitation(token) // success redirects; only errors return
          if (res && !res.ok) { setError(res.error ?? 'Could not accept the invitation.'); setPending(false) }
        }}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Accepting…' : 'Accept invitation'}
      </button>
      {error && <p className="font-body text-sm text-berry">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Write the accept page** — `app/accept/[token]/page.tsx`

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolveAcceptState, roleLabel, type AcceptPreview } from '@/lib/access/accept-state'
import { AcceptButton } from './accept-button'

const shell = 'mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6'

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  const { data: rows } = await supabase.rpc('get_member_invitation_preview', { p_token: token })
  const preview = (rows?.[0] ?? null) as AcceptPreview | null

  const { data: { user } } = await supabase.auth.getUser()
  const state = resolveAcceptState({
    preview, signedIn: !!user, sessionEmail: user?.email ?? null,
  })

  if (state === 'not_found') {
    return <main className={shell}><h1 className="font-display text-2xl text-ink">Invitation not found</h1>
      <p className="font-body text-ink-soft">This link isn’t valid. Ask whoever invited you for a fresh one.</p></main>
  }
  if (state === 'revoked') {
    return <main className={shell}><h1 className="font-display text-2xl text-ink">Invitation revoked</h1>
      <p className="font-body text-berry">This invitation was revoked. Ask an admin to invite you again.</p></main>
  }
  if (state === 'accepted') {
    return <main className={shell}><h1 className="font-display text-2xl text-ink">Already accepted</h1>
      <p className="font-body text-ink-soft">You’ve already accepted this invitation.</p>
      <Link href="/app" className="font-body text-sm text-ink underline underline-offset-2">Go to your churches</Link></main>
  }
  if (state === 'expired') {
    return <main className={shell}><h1 className="font-display text-2xl text-ink">Invitation expired</h1>
      <p className="font-body text-berry">This invitation has expired. Ask an admin for a new one.</p></main>
  }

  // preview is guaranteed non-null past this point (resolver returns terminal states for null).
  const p = preview!
  const label = roleLabel(p.role)

  if (state === 'sign_in') {
    const next = encodeURIComponent(`/accept/${token}`)
    const email = encodeURIComponent(p.invited_email)
    return (
      <main className={shell}>
        <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
        <p className="font-body text-ink-soft">You’ve been invited to help lead {p.church_name} as a {label}. Sign in as {p.invited_email} to accept.</p>
        <Link href={`/sign-in?next=${next}&email=${email}`}
          className="rounded-md border border-line bg-ink px-4 py-2 text-center font-body text-paper transition-opacity hover:opacity-90">
          Sign in to accept
        </Link>
      </main>
    )
  }

  if (state === 'wrong_email') {
    return (
      <main className={shell}>
        <h1 className="font-display text-2xl text-ink">Wrong account</h1>
        <p className="font-body text-berry">You’re signed in as {user!.email}, but this invitation is for {p.invited_email}. Sign out and sign back in as {p.invited_email}.</p>
        <Link href="/sign-in" className="font-body text-sm text-ink underline underline-offset-2">Go to sign in</Link>
      </main>
    )
  }

  // state === 'ready'
  return (
    <main className={shell}>
      <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
      <p className="font-body text-ink-soft">Accept your invitation to help lead {p.church_name} as a {label}.</p>
      <AcceptButton token={token} />
    </main>
  )
}
```

- [ ] **Step 4: Seed the sign-in email from `?email=`** — in `app/sign-in/page.tsx`, add `useEffect` import and an effect that seeds the email once on mount (keep everything else). Insert after the `const [error, ...]` state declaration:

```tsx
  // Pre-fill the email when arriving from an accept link (/sign-in?email=…). Display convenience
  // only — the accept RPC still gates on the exact signed-in email server-side.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hint = new URLSearchParams(window.location.search).get('email')
    if (hint) setEmail(hint)
  }, [])
```

Update the React import at the top: `import { useEffect, useState } from 'react'`.

- [ ] **Step 5: Gate + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/accept app/sign-in/page.tsx
git commit -m "feat(m5d): accept flow (preview page, accept action/button, sign-in email seed)"
```

---

## Task 8b: Manage-access screen — page + three components

**Files:**
- Create: `app/app/[churchId]/access/page.tsx`, `app/app/[churchId]/access/invite-member-form.tsx`, `app/app/[churchId]/access/members-list.tsx`, `app/app/[churchId]/access/pending-invites-list.tsx`

**Interfaces:**
- Consumes: `get_church_members` RPC (Task 3), `member_invitations` `minv_select` RLS read, `inviteMember`/`revokeInvitation`/`removeMember` actions (Task 7), `acceptLink` (Task 5).
- Admin-gated exactly like the dashboard: `select … from churches` → `notFound()` if null; `getUser()` + `select role from church_members` → `role !== 'admin'` → `notFound()` (mirror `app/app/[churchId]/page.tsx:59-66`).

**No unit test**; gate = typecheck + lint + build; behavior proven in e2e.

- [ ] **Step 1: Write `invite-member-form.tsx`** (`'use client'`, mirrors `invite-panel.tsx`)

```tsx
'use client'

import { useActionState } from 'react'
import { inviteMember, type InviteResult } from './actions'

const initial: InviteResult = { link: null, emailed: false, error: null }
const inputClass =
  'rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function InviteMemberForm({ churchId }: { churchId: string }) {
  const [state, formAction, pending] = useActionState(inviteMember, initial)
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4">
      <input type="hidden" name="church_id" value={churchId} />
      <h2 className="font-display text-lg text-ink">Invite a leader</h2>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Their email
        <input name="email" type="email" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 font-body text-sm text-ink-soft">
        Role
        <select name="role" required defaultValue="Viewer" className={inputClass}>
          <option value="Viewer">Viewer</option>
          <option value="Co-admin">Co-admin</option>
        </select>
      </label>

      <button type="submit" disabled={pending}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending ? 'Inviting…' : 'Send invitation'}
      </button>

      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}
      {state.link && (
        <div className="flex flex-col gap-1 rounded-md border border-line bg-paper p-3">
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

- [ ] **Step 2: Write `members-list.tsx`** (server component; Remove form per row; last admin disabled)

```tsx
import { removeMember } from './actions'

export type Member = { user_id: string; full_name: string | null; email: string | null; role: string; joined_at: string }

export function MembersList({
  churchId, members, currentUserId, disableRemoveFor,
}: {
  churchId: string
  members: Member[]
  currentUserId: string | null
  disableRemoveFor: string | null
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-lg text-ink">Members</h2>
      <ul className="flex flex-col divide-y divide-line">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId
          const noRemove = m.user_id === disableRemoveFor
          return (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-ink">
                  {m.full_name ?? m.email ?? 'Unknown'}{isSelf && <span className="text-ink-soft"> (you)</span>}
                </p>
                <p className="font-body text-xs text-ink-soft">{m.role === 'admin' ? 'Co-admin' : 'Viewer'} · joined {new Date(m.joined_at).toLocaleDateString()}</p>
              </div>
              {noRemove ? (
                <span className="font-body text-xs text-ink-soft" title="A church must keep at least one admin.">Last admin</span>
              ) : (
                <form action={removeMember}>
                  <input type="hidden" name="church_id" value={churchId} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <button type="submit" className="font-body text-xs text-berry underline underline-offset-2 hover:opacity-80">Remove</button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 3: Write `pending-invites-list.tsx`** (server component; Revoke form + copyable accept link)

```tsx
import { revokeInvitation } from './actions'
import { acceptLink } from '@/lib/access/accept-state'

export type PendingInvite = { id: string; invited_email: string; role: string; expires_at: string }

export function PendingInvitesList({
  churchId, invites, appUrl,
}: {
  churchId: string
  invites: PendingInvite[]
  appUrl: string
}) {
  if (invites.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-paper p-4">
        <h2 className="font-display text-lg text-ink">Pending invitations</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">No pending invitations.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-lg text-ink">Pending invitations</h2>
      <ul className="flex flex-col divide-y divide-line">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-ink">{inv.invited_email}</p>
                <p className="font-body text-xs text-ink-soft">{inv.role === 'admin' ? 'Co-admin' : 'Viewer'} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
              </div>
              <form action={revokeInvitation}>
                <input type="hidden" name="church_id" value={churchId} />
                <input type="hidden" name="invite_id" value={inv.id} />
                <button type="submit" className="font-body text-xs text-berry underline underline-offset-2 hover:opacity-80">Revoke</button>
              </form>
            </div>
            <code className="break-all font-body text-xs text-ink-soft">{acceptLink(appUrl, inv.id)}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Write `page.tsx`** (server component, admin-gated)

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteMemberForm } from './invite-member-form'
import { MembersList, type Member } from './members-list'
import { PendingInvitesList, type PendingInvite } from './pending-invites-list'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000'

export default async function AccessPage({ params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params
  const supabase = await createClient()

  const { data: church } = await supabase
    .from('churches').select('id, name').eq('id', churchId).maybeSingle()
  if (!church) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members').select('role')
    .eq('church_id', churchId).eq('user_id', user?.id ?? '').maybeSingle()
  if (membership?.role !== 'admin') notFound()

  const { data: memberRows } = await supabase.rpc('get_church_members', { p_church_id: churchId })
  const members = (memberRows ?? []) as Member[]

  const { data: pendingRows } = await supabase
    .from('member_invitations')
    .select('id, invited_email, role, status, expires_at, created_at')
    .eq('church_id', churchId).eq('status', 'pending')
    .order('created_at', { ascending: false })
  const pending = (pendingRows ?? []) as PendingInvite[]

  const admins = members.filter((m) => m.role === 'admin')
  const disableRemoveFor = admins.length <= 1 ? (admins[0]?.user_id ?? null) : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/app/${churchId}`} className="font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80">← Back to {church.name}</Link>
        <h1 className="font-display text-2xl text-ink">Manage access</h1>
      </header>

      <InviteMemberForm churchId={churchId} />
      <MembersList churchId={churchId} members={members} currentUserId={user?.id ?? null} disableRemoveFor={disableRemoveFor} />
      <PendingInvitesList churchId={churchId} invites={pending} appUrl={APP_URL} />
    </main>
  )
}
```

- [ ] **Step 5: Gate + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/app/\[churchId\]/access/page.tsx app/app/\[churchId\]/access/invite-member-form.tsx app/app/\[churchId\]/access/members-list.tsx app/app/\[churchId\]/access/pending-invites-list.tsx
git commit -m "feat(m5d): manage-access screen (page + invite form + members + pending lists)"
```

---

## Task 9: Dashboard — flip the stub to a live "Manage access" link

**Files:**
- Modify: `app/app/[churchId]/page.tsx` (delete `DISABLED_STUBS` const `:25` + render block `:158-168`; add admin-only `<Link>`)

**No unit test**; gate = typecheck + lint + build; verified in e2e.

- [ ] **Step 1: Delete the `DISABLED_STUBS` const** — remove lines 23–25:

```tsx
// 'View diagnosis' is now a live control (see the diagnosis section below).
// 'Manage access' stays disabled until M5d.
const DISABLED_STUBS = [['Manage access', 'M5d']] as const
```

- [ ] **Step 2: Replace the render block** — replace the `{DISABLED_STUBS.map(...)}` block (`:158-168`) with an admin-only live link styled like "View diagnosis":

```tsx
        {role === 'admin' && (
          <Link
            href={`/app/${churchId}/access`}
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90"
          >
            Manage access
          </Link>
        )}
```

- [ ] **Step 3: Gate + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errors, build succeeds. (`Link` and `role` are already in scope — no import/logic changes.)

- [ ] **Step 4: Commit**

```bash
git add app/app/\[churchId\]/page.tsx
git commit -m "feat(m5d): flip dashboard 'Manage access' stub to a live admin-only link"
```

---

## Task 10: Full-suite verification gate (pre-e2e)

**Files:** none (verification only).

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck && npm run lint && npm test && npm run test:db && npm run build
```

Expected:
- typecheck: 0 errors
- lint: 0 errors
- vitest: **116 + new (accept-state 9 assertions across 8 tests + email 4 tests) → still all green**, count ≥ 116 preserved and grown
- pgTAP: `Files=14 / Tests=144` (13 → 14 files, 125 → 144 tests)
- build: succeeds

- [ ] **Step 2: If all green, hand to the verification phase**

Do **not** claim completion here — proceed to `superpowers:verification-before-completion` for the browser e2e (spec §9), all on `http://127.0.0.1:3000`, Mailpit `:54324`:

> admin opens **Manage access** → invites a **co-admin** by email → grabs the accept link (copyable fallback or Mailpit) → **accepts in an isolated browser context** (magic-link sign-in as the invitee) → invitee lands on the church **dashboard** as a member → admin sees them in the **members list** → admin **removes** them → they disappear; separately, **revoke** a pending invite and confirm it leaves the list.

Then `superpowers:finishing-a-development-branch` WITH the user (push as MylesM18 only on explicit go-ahead).

---

## Self-Review (run against the spec)

**1. Spec coverage:**
- §4.1 create_member_invitation → Task 1 ✅ · §4.2 preview → Task 2 ✅ · §4.3 get_church_members → Task 3 ✅ · §4.4 remove_member → Task 4 ✅
- §5.1 access page → 8b ✅ · §5.2 actions → 7 ✅ · §5.3 accept page → 8a ✅ · §5.4 acceptInvitation → 8a ✅ · §5.5 email adapter → 6 ✅ · §5.6 dashboard flip → 9 ✅ · §5.7 components → 8b ✅
- §6 edge cases: already-member/dup/invalid-role (Task 1 tests), double-accept (existing RPC idempotent), wrong-email (resolver Task 5 + page 8a), expired/revoked (resolver + page), revoke non-pending (action `.eq('status','pending')`), remove last admin / non-member (Task 4 tests) ✅
- §7 sign-in reuse → resolved to option (a) + `?email=` seed (Task 8a) ✅
- §9 tests: pgTAP 13/14 (Tasks 1–4), vitest accept-state (Task 5) + email (Task 6), e2e (Task 10) ✅
- §10 manifest: all 16 new + 2 changed files covered ✅
- §11 guardrails → Global Constraints ✅

**2. Placeholder scan:** none — every code step carries full code; SQL steps reference the spec's verbatim blocks by exact section+line and restate the guard order.

**3. Type consistency:** `InviteResult {link,emailed,error}` identical in Task 7 + form (8b). `AcceptPreview`/`AcceptState`/`resolveAcceptState`/`acceptLink`/`roleLabel` defined in Task 5, consumed unchanged in 6/7/8a/8b. `Member`/`PendingInvite` defined in their component files, consumed by page.tsx (8b). RPC names/params match spec §4 verbatim.
