-- Fix: assessment completion must SURVIVE diagnosis generation.
--
-- One run per church (create_church inserts a single assessment_runs row, status='in_progress').
-- save_diagnosis flips that run in_progress -> complete (20260716001100). But all three coverage
-- RPCs resolved "the run" with `where church_id = p_church_id and status = 'in_progress'`, so once
-- the diagnosis completed the run they found nothing and returned EMPTY -- and coverage() then
-- classified every category as not_started. Net effect after an admin generated the diagnosis:
-- the assessment menu showed every category "Not started", per-card counts reset to 0, and the
-- admin Member x Category matrix went blank -- permanently, surviving logout/login.
--
-- Root-cause fix: drop ONLY the `and status = 'in_progress'` filter from the run-selection in each
-- of the three coverage RPCs. `order by created_at asc limit 1` still resolves the church's single
-- run, now regardless of status. This aligns these RPCs with how the dashboard (page.tsx) and
-- generateDiagnosis (actions.ts) already resolve the run: newest-first/oldest-first by created_at,
-- no status filter. save_diagnosis is intentionally left unchanged -- its completion of the run is
-- load-bearing (the one-shot submit/diagnosis gate still requires an in_progress run).
--
-- Everything else in each function is byte-identical to its origin migration
-- (get_run_coverage 20260716000800, get_member_run_coverage 20260724000100,
--  get_member_category_coverage 20260725000100): same return shapes, member/admin gates, grants.

create or replace function public.get_run_coverage(p_church_id uuid)
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
  where church_id = p_church_id
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

create or replace function public.get_member_run_coverage(p_church_id uuid)
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
  where church_id = p_church_id
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

create or replace function public.get_member_category_coverage(p_church_id uuid)
returns table(respondent_user_id uuid, category_id text, answered_count int)
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
    select 1 from public.church_members cm
    where cm.church_id = p_church_id and cm.user_id = v_uid and cm.role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id
  order by created_at asc
  limit 1;
  if v_run_id is null then
    return;
  end if;

  return query
  select r.respondent_user_id, r.category_id, count(distinct r.item_id)::int as answered_count
  from public.responses r
  where r.run_id = v_run_id
    and r.respondent_kind = 'member'
    and r.respondent_user_id is not null
  group by r.respondent_user_id, r.category_id;
end;
$$;

revoke all on function public.get_member_category_coverage(uuid) from public, anon;
grant execute on function public.get_member_category_coverage(uuid) to authenticated;
