-- Invite = account creation, bound to the inviting church
-- (docs/superpowers/specs/2026-09-14-invite-account-binding-design.md).
--
-- Until now a church_members row for an invitee was written only by accept_member_invitation,
-- i.e. at the END of the invite path, and only when the invitee reached /accept/<token> with a
-- session for the invited address. Every other way in (homepage CTA, /sign-in, Google, an unopened
-- invitation) arrived with no membership and /get-started handed them a church to create — twelve
-- duplicate churches for one congregation on 2026-09-11.
--
-- Three changes, all additive:
--   1. member_invitations.invited_user_id — the auth user the app provisioned for this invitation.
--   2. bind_invited_member(invitation) — service-role ONLY. Inserts the membership the moment the
--      invitation is sent, resolving the user by e-mail inside Postgres. Third (and last) writer of
--      church_members alongside create_church_with_admin and accept_member_invitation.
--   3. settle_my_invitations() — authenticated. Called after every successful sign-in: marks the
--      caller's pending invitations accepted, stamps the 3-day completion clock where it is still
--      null, and — for invitations created BEFORE this migration (invited_user_id null) — binds by
--      e-mail match so a legacy invitee who signs in any other way still lands on their church.
-- Plus: accept_member_invitation keeps its exact-token contract but, when the membership was
-- pre-bound (deadline null), stamps the clock instead of silently leaving the member untimed.
--
-- ⚠️ Owner-applied: `supabase db push`, then `npm run test:db` (pgTAP 28_invite_account_binding).

-- ── 1. the binding column ─────────────────────────────────────────────────────────────────────
alter table public.member_invitations
  add column invited_user_id uuid references auth.users on delete set null;

-- ── 2. bind_invited_member: service-role only ─────────────────────────────────────────────────
-- Authority comes from the invitation row itself: it exists only because an admin passed
-- create_member_invitation's gates moments earlier. The e-mail lookup is case-insensitive on
-- both sides because create_member_invitation lower()s invited_email while auth.users keeps the
-- address as entered.
create function public.bind_invited_member(p_invitation_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.member_invitations;
  v_user_id uuid;
begin
  select * into v_inv from public.member_invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(v_inv.invited_email)
  order by u.created_at asc
  limit 1;
  if v_user_id is null then
    raise exception 'no account exists for the invited email';
  end if;

  -- deadline deliberately NULL: the 3-day clock starts at first sign-in (settle / accept), not now.
  insert into public.church_members (church_id, user_id, role, granted_by)
  values (v_inv.church_id, v_user_id, v_inv.role, v_inv.created_by)
  on conflict (church_id, user_id) do nothing;

  update public.member_invitations
     set invited_user_id = v_user_id
   where id = p_invitation_id;

  return v_user_id;
end;
$$;

revoke all on function public.bind_invited_member(uuid) from public, anon, authenticated;
grant execute on function public.bind_invited_member(uuid) to service_role;

-- ── 3. settle_my_invitations: the first-sign-in hook ──────────────────────────────────────────
-- Idempotent. Returns how many invitations it settled. Two populations:
--   (a) bound rows (invited_user_id = auth.uid()) — accepted regardless of expires_at: the
--       membership already exists, so expiry only ever governed the emailed link.
--   (b) legacy unbound rows matching auth.email() case-insensitively — bound + accepted, but only
--       while still pending AND unexpired, mirroring accept_member_invitation's own gate.
create function public.settle_my_invitations()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_inv record;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  for v_inv in
    select id, church_id, role, created_by
    from public.member_invitations
    where status = 'pending'
      and (
        invited_user_id = v_uid
        or (invited_user_id is null
            and v_email is not null
            and lower(invited_email) = lower(v_email)
            and expires_at >= now())
      )
    order by created_at asc
  loop
    insert into public.church_members (church_id, user_id, role, granted_by, assessment_deadline_at)
    values (v_inv.church_id, v_uid, v_inv.role, v_inv.created_by, now() + interval '3 days')
    on conflict (church_id, user_id) do update
      set assessment_deadline_at = coalesce(public.church_members.assessment_deadline_at,
                                            excluded.assessment_deadline_at);

    update public.member_invitations
       set status = 'accepted', accepted_by = v_uid, invited_user_id = v_uid
     where id = v_inv.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.settle_my_invitations() from public, anon;
grant execute on function public.settle_my_invitations() to authenticated;

-- ── 4. accept_member_invitation: stamp the clock on a pre-bound membership ───────────────────
-- Byte-identical to 20260801000200 except the ON CONFLICT clause: `do nothing` left a pre-bound
-- (deadline-null) member untimed forever; `coalesce` keeps an existing clock (a re-accept still
-- preserves the ORIGINAL deadline, pgTAP 23) and fills only a null one.
create or replace function public.accept_member_invitation(p_token uuid)
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

  insert into public.church_members (church_id, user_id, role, granted_by, assessment_deadline_at)
  values (v_inv.church_id, v_uid, v_inv.role, v_inv.created_by, now() + interval '3 days')
  on conflict (church_id, user_id) do update
    set assessment_deadline_at = coalesce(public.church_members.assessment_deadline_at,
                                          excluded.assessment_deadline_at);

  update public.member_invitations
     set status = 'accepted', accepted_by = v_uid, invited_user_id = v_uid
   where id = p_token;

  return v_inv.church_id;
end;
$$;

revoke all on function public.accept_member_invitation(uuid) from public, anon;
grant execute on function public.accept_member_invitation(uuid) to authenticated;
