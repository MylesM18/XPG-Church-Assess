-- Admin-gated management of report_shares. The table has no RLS policy and no base-table
-- grant; these SECURITY DEFINER functions are its only authenticated-side entry points.
-- The admin guard is factored into require_church_admin below so the three RPCs cannot drift.

-- require_church_admin: shared guard for the three report-share RPCs. Resolves p_run_id to
-- its church, confirms the caller is an admin member of that church, and returns the church
-- id. Internal only — no execute grant, so only SECURITY DEFINER callers in this file can
-- reach it; clients must go through create_report_share / revoke_report_share / get_report_share.
create function public.require_church_admin(p_run_id uuid)
returns uuid
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

  return v_church_id;
end;
$$;

revoke all on function public.require_church_admin(uuid) from public, anon, authenticated;

create function public.create_report_share(p_run_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_church_id uuid := public.require_church_admin(p_run_id);
  v_existing public.report_shares;
  v_id uuid;
begin
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
begin
  perform public.require_church_admin(p_run_id);

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
begin
  perform public.require_church_admin(p_run_id);

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
