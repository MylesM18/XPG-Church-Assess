# M5d — Invited-leader accounts: accept + manage-access (design spec)

- **Date:** 2026-07-17
- **Milestone:** M5d (second of four M5 sub-projects; build order **M5a ✅ → M5d (this) → M5b → M5c**)
- **Branch (when build starts):** `feat/m5d-invited-leader-accounts` off `master`
- **Status:** design approved (brainstorm shaping Q1–Q3 locked 2026-07-17); this spec is the writing-plans input.
- **Governing design (approved 2026-07-15):** `docs/superpowers/specs/2026-07-15-invited-leader-accounts-design.md` (§2 actors, §3 invariant, §6 accept flow, §7 RLS). This spec builds the M4-deferred UI for that model.

## 1. Goal

Ship the **Type-B (account-holder) path** the governing design defined and M4 deferred: an **admin** invites co-admins/viewers by email → the invitee **accepts** via magic-link/Google → a **Manage-access** admin screen lists members + pending invites, **revokes** a pending invite, and **removes** an accepted member. The respondent/Type-A path is untouched.

M5d is **UI + a thin RPC layer over machinery that already exists.** M2 shipped the `member_invitations` table (`20260715000100_schema.sql:108-118`), its three admin-only RLS policies (`20260715000400_rls_policies.sql:44-58`), and the complete `accept_member_invitation(p_token uuid)` RPC (`20260715000300_rpc_accept_invitation.sql` — validates pending/expired + exact `auth.email() = invited_email`, inserts `church_members ON CONFLICT DO NOTHING`, returns `church_id`). M5d adds: three new read/create SECURITY DEFINER RPCs, one guarded removal RPC, two route pairs (`/access`, `/accept/[token]`), an email adapter, and the dashboard link flip.

### Non-goals (explicitly out of scope for M5d)

- **In-place role change.** v1 covers it with remove + re-invite. No "change viewer → admin" control.
- **Password auth.** Magic-link + Google only (governing design §9).
- **Any respondent/Type-A change.** `invitations`, `/respond/[token]`, and the respondent service-role handlers stay exactly as-is.
- Public share links (**M6**); AI prose (**M5b**); multi-run history; editing a member's profile; transferring church ownership; bulk invites.

## 2. The permission model this rides on (non-negotiable — governing design §3/§7)

**Core invariant:** having an account never grants church access; only a `church_members` row does. Restated for M5d:

- `church_members` is **inserted** by exactly two SECURITY DEFINER RPCs — `create_church_with_admin` (first admin) and `accept_member_invitation` (validated accept). **M5d adds NO new insert path.**
- **Removal** is a `DELETE` via the new `remove_member` RPC (admin-gated, **last-admin-guarded**) — outside the insert invariant, and the only DELETE on `church_members`.
- Accept requires exact `auth.email() = invited_email` (already enforced inside `accept_member_invitation`).
- **No `lib/supabase/service.ts`.** Anon-key client + RLS + SECURITY DEFINER RPCs only.
- `--berry #8E2B3E` is foreground error/terminal text only — never a tile/background fill.

## 3. Architecture & data flow

Two independent flows: **invite/manage** (admin, authenticated) and **accept** (invitee).

```
Manage-access screen  /app/[churchId]/access   (server component, ADMIN-ONLY)
  ├─ createClient(); select churches(name, brand_color) ──▶ notFound() if null (RLS non-member)
  ├─ getUser() + select role from church_members  ──▶ role !== 'admin' → notFound()   (mirror page.tsx:59-66)
  ├─ rpc get_church_members(churchId) ─────────────▶ human-readable list (crosses profiles own-row wall; admin-only)
  ├─ select member_invitations where status='pending' ─▶ pending list (minv_select RLS — admins only)
  └─ render InviteMemberForm · MembersList · PendingInvitesList
        InviteMemberForm  ──action──▶ inviteMember   ──▶ rpc create_member_invitation ──▶ email + copyable link
        PendingInvitesList──action──▶ revokeInvitation──▶ scoped RLS update status='revoked'  (minv_update; NO new RPC)
        MembersList       ──action──▶ removeMember    ──▶ rpc remove_member  (admin + last-admin guard)

Accept page  /accept/[token]   (server component)
  ├─ rpc get_member_invitation_preview(token)  ── anon-callable, display-only ──▶ {church_name, role, invited_email, status, is_expired}
  ├─ zero rows            → NotFound message
  ├─ status='revoked'     → terminal message      status='accepted' → "already accepted — sign in"
  ├─ is_expired           → terminal message
  └─ pending & live:
       ├─ signed-out                          → sign-in (magic-link + Google) → /auth/callback?next=/accept/[token], email pre-filled
       ├─ signed-in, session email ≠ invited  → "signed in as X; invite is for Y — sign out"  (compare BEFORE calling RPC)
       └─ signed-in, email matches            → [Accept] → acceptInvitation ──▶ rpc accept_member_invitation ──▶ redirect /app/[church_id]
```

**Confidentiality guarantee:** `get_member_invitation_preview` returns **only** church name / role / invited email / status / expiry — never assessment data and never `church_id`. `get_church_members` crosses the own-row `profiles` wall, but only for **admins of that church**, exposing member name/email to the people who already administer them. Neither RPC widens the anonymous respondent surface.

## 4. New database surface (migrations `20260717*`, all SECURITY DEFINER)

Style mirrors `accept_member_invitation` + the M5a RPCs: `auth.uid()` null-check → role/membership check → act; `revoke all … from public, anon; grant execute … to <role>`. Methodology/semantics stay out of these — they only move rows. New migrations numbered from `20260717000000` (M5a used through `20260716001100`).

> **Reading `auth.users`:** SECURITY DEFINER runs as the function owner (the migration/superuser role), which can read `auth.users` — the same space `handle_new_user` and `accept_member_invitation` already operate in. The already-member and members-list checks join `auth.users`/`profiles` by (lowered) email; pgTAP asserts this works under the definer.

### 4.1 `create_member_invitation(p_church_id uuid, p_role text, p_invited_email text) → uuid` — `20260717000000_rpc_create_member_invitation.sql`

- **Gate:** caller must be **admin** of the church. **Grant:** `authenticated`.
- **Guards, in order:** authenticated → admin → `p_role in ('admin','viewer')` (matches the table CHECK) → normalize `v_email = lower(trim(p_invited_email))`, reject empty → **reject already-member** (an `auth.users` row with that email that has a `church_members` row for this church) → **reject duplicate pending** (a live `pending` `member_invitations` row for this church+email).
- **Insert:** `(church_id, role, invited_email=v_email, status='pending', expires_at = now() + interval '14 days', created_by = auth.uid())`; **return** the new `id` (the token).
- **14-day expiry (locked):** tighter than the Type-A respondent invite (30d, `invitations.expires_at` default) **on purpose** — a co-admin/viewer invite grants standing church access, so the shorter window is the more defensible posture. `member_invitations.expires_at` has **no default**, so this RPC is the sole setter.

```sql
create function public.create_member_invitation(
  p_church_id uuid,
  p_role text,
  p_invited_email text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_invited_email, '')));
  v_id uuid;
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
  if p_role not in ('admin', 'viewer') then
    raise exception 'role must be admin or viewer';
  end if;
  if v_email = '' then
    raise exception 'an email is required';
  end if;

  -- already an active member of this church?
  if exists (
    select 1 from auth.users u
    join public.church_members cm on cm.user_id = u.id
    where cm.church_id = p_church_id and lower(u.email) = v_email
  ) then
    raise exception 'that person is already a member of this church';
  end if;

  -- a live pending invite already exists for this church + email?
  if exists (
    select 1 from public.member_invitations
    where church_id = p_church_id and lower(invited_email) = v_email
      and status = 'pending' and expires_at > now()
  ) then
    raise exception 'a pending invitation already exists for that email';
  end if;

  insert into public.member_invitations (church_id, role, invited_email, status, expires_at, created_by)
  values (p_church_id, p_role, v_email, 'pending', now() + interval '14 days', v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_member_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_member_invitation(uuid, text, text) to authenticated;
```

### 4.2 `get_member_invitation_preview(p_token uuid) → table(...)` — `20260717000100_rpc_get_member_invitation_preview.sql`

- **Gate:** NONE beyond holding the token (the `id` **is** the URL secret). **Grant:** `anon` **and** `authenticated`.
- **Returns:** `table(church_name text, role text, invited_email text, status text, is_expired boolean)`. Zero rows for an unknown token. **Only** those fields — never church assessment data, never `church_id`.
- **Anon-callable rationale (flagged + approved):** the accept page must show context (which church, which role, which email) **before** the invitee authenticates, so they know what they're accepting and which address to sign in with. Acceptance itself stays strictly email-gated by `accept_member_invitation`. The token was already emailed to the invited address; disclosing church-name/role/email to whoever holds it is the same disclosure the email itself made.

```sql
create function public.get_member_invitation_preview(p_token uuid)
returns table(church_name text, role text, invited_email text, status text, is_expired boolean)
language sql
stable
security definer set search_path = public
as $$
  select c.name, mi.role, mi.invited_email, mi.status, (mi.expires_at < now())
  from public.member_invitations mi
  join public.churches c on c.id = mi.church_id
  where mi.id = p_token;
$$;

revoke all on function public.get_member_invitation_preview(uuid) from public;
grant execute on function public.get_member_invitation_preview(uuid) to anon, authenticated;
```

### 4.3 `get_church_members(p_church_id uuid) → table(...)` — `20260717000200_rpc_get_church_members.sql`

- **Gate:** caller must be **admin** of the church. **Grant:** `authenticated`.
- **Why an RPC:** `members_select` RLS lets any member read `church_members` rows, but `profiles` is **own-row-only**, so a plain client-side join yields opaque `user_id`s with no names/emails. This definer RPC crosses that wall — for admins only.
- **Returns:** `table(user_id uuid, full_name text, email text, role text, joined_at timestamptz)`, one row per member, `order by cm.created_at`. `full_name` may be **null** for an invited member who never created a church (their `profiles.full_name` was never filled); the UI falls back to email.

```sql
create function public.get_church_members(p_church_id uuid)
returns table(user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members cm
    where cm.church_id = p_church_id and cm.user_id = v_uid and cm.role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  return query
  select cm.user_id,
         p.full_name,
         coalesce(p.email, u.email) as email,
         cm.role,
         cm.created_at
  from public.church_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.church_id = p_church_id
  order by cm.created_at asc;
end;
$$;

revoke all on function public.get_church_members(uuid) from public, anon;
grant execute on function public.get_church_members(uuid) to authenticated;
```

### 4.4 `remove_member(p_church_id uuid, p_user_id uuid) → void` — `20260717000300_rpc_remove_member.sql`

- **Gate:** caller must be **admin** of the church. **Grant:** `authenticated`.
- **Guards:** authenticated → admin → **refuse to remove the last admin** (if the target is an `admin` and the church has `≤1` admin, raise) → `DELETE` the `church_members` row. Self-removal is allowed **unless** it would remove the last admin (same guard). Deleting a non-member touches 0 rows → no-op (idempotent).

```sql
create function public.remove_member(p_church_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_role text;
  v_admin_count int;
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

  select role into v_target_role from public.church_members
  where church_id = p_church_id and user_id = p_user_id;
  if not found then
    return; -- not a member: no-op
  end if;

  if v_target_role = 'admin' then
    select count(*) into v_admin_count from public.church_members
    where church_id = p_church_id and role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'cannot remove the last admin of this church';
    end if;
  end if;

  delete from public.church_members
  where church_id = p_church_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
```

**`church_members` write-surface after M5d:** inserts only via `create_church_with_admin` + `accept_member_invitation`; the sole DELETE is `remove_member` (admin-gated, last-admin-guarded). **Revoke pending** is a scoped RLS `update … set status='revoked'` in the action (`minv_update` already enforces admin) — **no new RPC.**

## 5. New routes / components

### 5.1 `app/app/[churchId]/access/page.tsx` (server component, admin-gated)

1. `createClient()`; `select id, name, brand_color from churches where id = churchId` → `notFound()` if null (RLS returns null for non-members).
2. `getUser()` + `select role from church_members where church_id and user_id` (mirror `page.tsx:59-66`). **`role !== 'admin'` → `notFound()`** (viewers/non-admins never see this screen).
3. `members = rpc get_church_members(churchId)`.
4. `pending = select id, invited_email, role, status, expires_at, created_at from member_invitations where church_id = churchId and status = 'pending' order by created_at desc` (via `minv_select`).
5. Compute `adminCount = members.filter(m => m.role==='admin').length` → pass a `disableRemove` flag for the last admin.
6. Render `<InviteMemberForm churchId>`, `<MembersList members currentUserId disableRemoveFor>`, `<PendingInvitesList churchId invites appUrl>`.

Mobile-first, `max-w-3xl` shell matching the dashboard (`px-6 py-10`), existing tokens only.

### 5.2 `app/app/[churchId]/access/actions.ts` (`'use server'`)

- **`inviteMember(_prev, formData): Promise<InviteResult>`** — parse `email` + `role` (`Viewer`→`viewer`, `Co-admin`→`admin`); `createClient`; re-check `getUser()` + admin (server-side, never trust the client); `rpc create_member_invitation` → on `error` return `{link:null, emailed:false, error}`; build `link = ${APP_URL}/accept/${id}`; `sendMemberInvitationEmail`; `revalidatePath('/app/'+churchId+'/access')`; return `{ link, emailed, error:null }`. **Shape reuses the existing `InviteResult`** so `InviteMemberForm` mirrors `invite-panel.tsx`.
- **`revokeInvitation(formData)`** — re-check auth+admin; `update member_invitations set status='revoked' where id = <id> and church_id = churchId and status = 'pending'` (scoped; `minv_update` enforces admin); `revalidatePath`.
- **`removeMember(formData)`** — re-check auth+admin; `rpc remove_member`; `revalidatePath`.

`APP_URL` from `process.env.APP_URL ?? 'http://127.0.0.1:3000'` (same const as `app/app/[churchId]/actions.ts:20`).

### 5.3 `app/accept/[token]/page.tsx` (server component)

- `rpc get_member_invitation_preview(token)` → `preview | none`.
- Branch: **none** → NotFound message; **`status='revoked'`** → terminal message; **`status='accepted'`** → "already accepted" + sign-in link to `/app`; **`is_expired`** → terminal "expired, ask for a new invite"; **pending & live** →
  - `getUser()`: **signed-out** → sign-in block (magic-link + Google) targeting `/auth/callback?next=/accept/${token}`, email pre-filled from `preview.invited_email`.
  - **signed-in, email mismatch** → WrongEmail message ("You're signed in as X; this invite is for Y — sign out and use Y") + sign-out. The comparison is **case-insensitive** (`user.email.toLowerCase() !== preview.invited_email.toLowerCase()`) because `create_member_invitation` stores `lower(trim(email))`; compared **before** the Accept button is enabled. The authoritative gate remains the server-side `auth.email() = invited_email` check inside `accept_member_invitation` (unchanged); this page-level compare is a friendly pre-check.
  - **signed-in, email matches** → `<AcceptButton token>` → `acceptInvitation` action.

### 5.4 `app/accept/[token]/actions.ts` (`'use server'`)

- **`acceptInvitation(token): Promise<{ ok:boolean; error?:string }>`** — `createClient`; `getUser()` guard; `const { data: churchId, error } = await supabase.rpc('accept_member_invitation', { p_token: token })`; on `error` return `{ ok:false, error: error.message }`; `revalidatePath('/app/'+churchId)`; `redirect('/app/'+churchId)` — **last statement, outside any try/catch** (`redirect()` throws `NEXT_REDIRECT` by design; see the M5a action, `actions.ts:110`).

### 5.5 `lib/email/send-member-invitation.ts`

Mirror `lib/email/send-invitation.ts` exactly (decoupled soft-fail, `onboarding@resend.dev`, `{ ok }` return, RESEND_API_KEY-absent → soft `{ ok:false }`). **Member-appropriate copy:** subject `You're invited to help lead ${churchName}`; body `${churchName} has invited you to help lead as a ${roleLabel}.` + accept link + paste-able URL. `roleLabel`: `admin` → "co-admin", `viewer` → "viewer".

> **Resend sandbox (durable gotcha):** `onboarding@resend.dev` only delivers to the Resend account owner `mylesmagee562@gmail.com`. Everyone else relies on the copyable-link fallback surfaced in `InviteMemberForm`. To email arbitrary invitees, verify a domain at resend.com/domains and change the from-address — out of scope here.

### 5.6 Dashboard — `app/app/[churchId]/page.tsx` (changed)

`'Manage access'` is the **only** remaining entry in `DISABLED_STUBS` (const at `:25`, rendered at `:158-168`). Replace it:

- **Delete** the `DISABLED_STUBS` const and its `.map(...)` render block.
- In the same actions `<section>`, add — **only when `role === 'admin'`** (`role` is already computed at `:66`) — a real `<Link href={/app/${churchId}/access}>` styled like the "View diagnosis" link, labeled **"Manage access"**. Non-admins see nothing there.

### 5.7 Presentational components (co-located under `app/app/[churchId]/access/`)

- **`invite-member-form.tsx`** (`'use client'`) — `useActionState(inviteMember, initial)`; email input + role `<select>` (Viewer / Co-admin) + submit + `state.error` (berry) + copyable-link fallback block. Direct mirror of `invite-panel.tsx`.
- **`members-list.tsx`** — server component; a row per member (name-or-email, role, joined date) with a **Remove** button (small `form action={removeMember}`), **disabled with reason** for the last admin (`disableRemoveFor`). Shows "(you)" on the current user's row.
- **`pending-invites-list.tsx`** — server component; a row per pending invite (email, role, expiry) with **Revoke** (`form action={revokeInvitation}`) + a copyable accept link (`${APP_URL}/accept/${id}`).

## 6. Edge cases (folded in)

| Case | Handling |
|---|---|
| Admin invites their own email | rejected by the already-member guard in `create_member_invitation` |
| Duplicate pending invite | rejected at create (live-pending guard) |
| Invalid role posted | rejected at create (`p_role` check) |
| Double-accept / already accepted | `accept_member_invitation` is idempotent (`ON CONFLICT DO NOTHING` + status→accepted); preview `accepted` branch shows a friendly state; `acceptInvitation` redirect is idempotent |
| Signed-in wrong email | friendly pre-RPC message on the accept page; Accept never enabled |
| Expired / revoked invite | terminal messages on the accept page; `accept_member_invitation` also rejects server-side as defense-in-depth |
| Revoke a non-pending invite | scoped update matches only `status='pending'` → no-op |
| Remove the last admin (incl. self) | blocked by `remove_member` |
| Remove a non-member | 0 rows deleted → no-op |

## 7. Sign-in reuse (resolved at plan-time)

The signed-out accept branch needs magic-link + Google targeting `/auth/callback?next=/accept/${token}` with email pre-filled. Two options, decided when the plan reads `app/sign-in/page.tsx`'s current props: **(a)** redirect to the existing `/sign-in?next=…` page (simplest; pre-fill depends on whether `/sign-in` accepts an email hint), or **(b)** an inline sign-in block on the accept page reusing the same Supabase auth calls. Either way: **relative `next` only** (the callback already rejects open-redirects — `app/auth/callback/route.ts:11-12`), **no passwords**, `next` points back at `/accept/[token]` so acceptance resumes after the round-trip.

## 8. Styling / tokens

Existing Tailwind-v4 `@theme` tokens only (`paper`, `ink`, `ink-soft`, `line`, `berry` (+`berry-deep`), `sage`, `sand`; `font-display` Fraunces, `font-body` Hanken). **`--berry` = error/terminal text only**, never a tile/background. Match the dashboard shell (`max-w-3xl`, `px-6 py-10`). No new tokens.

## 9. Testing (baselines never drop: **tsc 0, eslint 0, vitest 116, pgTAP Files=13 / Tests=125**; additions only)

**pgTAP** (`supabase/tests/`, run via `npm run test:db` = `supabase db reset && supabase test db`; next file numbers are `13_`, `14_`):

- `13_member_invitations_manage_test.sql`
  - `create_member_invitation`: an **admin** creates a pending invite (`status='pending'`, `expires_at` ≈ `now()+14d`, `created_by` = caller); a **viewer** and a **non-member** are rejected (`insufficient_privilege`); rejects an **already-member** email; rejects a **duplicate live pending**; rejects an **invalid role**.
  - `get_member_invitation_preview`: callable as the **`anon`** role; returns the five display fields incl. `is_expired`; **exposes no `church_id`/church data**; returns **zero rows** for a bogus token.
  - `get_church_members`: an **admin** gets one row per member with name/email/role/joined; a **viewer** and a **non-member** are rejected.
- `14_remove_member_test.sql`
  - `remove_member`: an admin removes a **viewer** (row gone); **blocks removing the last admin**; a **viewer/non-member** caller is rejected; removing a **non-member** is a no-op; with **two admins**, one admin can be removed.

*(Plan may consolidate 13/14 into one file — the point is explicit growth of the pgTAP file/test count, never a drop.)*

**vitest** (`tests/access/`, run via `npm test`) — pure helpers only:

- `accept-state.test.ts`: a pure resolver `resolveAcceptState({ preview, signedIn, sessionEmail }) → 'not_found'|'revoked'|'accepted'|'expired'|'sign_in'|'wrong_email'|'ready'` tested across every branch (drives §5.3; keeps the page a thin renderer).
- link building (`accept` URL from `APP_URL` + id), email template render (subject/body contains church name + role label), and role-label mapping (`admin`→"co-admin", `viewer`→"viewer").

**Browser e2e** (verification phase — M4/M5a discipline, **all on `http://127.0.0.1:3000`**, Mailpit `:54324` for the magic link): admin opens **Manage access** → invites a **co-admin** by email → grabs the accept link (copyable fallback or Mailpit) → **accepts in an isolated browser context** (magic-link sign-in as the invitee) → invitee lands on the church **dashboard** as a member → admin sees them in the **members list** → admin **removes** them → they disappear; separately, **revoke** a pending invite and confirm it leaves the list.

## 10. File manifest

**New:**
- `supabase/migrations/20260717000000_rpc_create_member_invitation.sql`
- `supabase/migrations/20260717000100_rpc_get_member_invitation_preview.sql`
- `supabase/migrations/20260717000200_rpc_get_church_members.sql`
- `supabase/migrations/20260717000300_rpc_remove_member.sql`
- `supabase/tests/13_member_invitations_manage_test.sql`
- `supabase/tests/14_remove_member_test.sql`
- `lib/email/send-member-invitation.ts`
- `app/app/[churchId]/access/page.tsx`
- `app/app/[churchId]/access/actions.ts`
- `app/app/[churchId]/access/invite-member-form.tsx`
- `app/app/[churchId]/access/members-list.tsx`
- `app/app/[churchId]/access/pending-invites-list.tsx`
- `app/accept/[token]/page.tsx`
- `app/accept/[token]/actions.ts`
- `lib/access/accept-state.ts` (pure resolver + role-label/link helpers for the vitest units)
- `tests/access/accept-state.test.ts`

**Changed:**
- `app/app/[churchId]/page.tsx` — delete `DISABLED_STUBS` (const `:25` + render `:158-168`); add the admin-only "Manage access" `<Link>`.

## 11. Guardrails (carried from the brainstorm; never traded away)

- anon-key → RLS only; **no `lib/supabase/service.ts`**; writes go through SECURITY DEFINER RPCs.
- `invitations`/`responses` keep **NO** authenticated RLS policy (respondent path stays service-role only). `member_invitations` stays admin-gated.
- **No passwords** — magic-link + Google only. Accept requires exact `auth.email() = invited_email`.
- `church_members` inserts ONLY via `create_church_with_admin` + `accept_member_invitation`; the sole DELETE is `remove_member` (admin-gated, last-admin-guarded).
- `--berry #8E2B3E` foreground/error text only, never a tile/background.
- New migrations `20260717000000`+. Do **not** `npm audit fix --force`.
- **Baseline never drops:** tsc 0, eslint 0, vitest **116**, pgTAP Files=**13** / Tests=**125** (adding is fine).
- Branch `feat/m5d-invited-leader-accounts` off `master`. Push to the PRIVATE `github.com/MylesM18/XPG-Church-Assess` (gh user **MylesM18**) **only on explicit go-ahead**. `.superpowers/` stays **UNTRACKED**.
