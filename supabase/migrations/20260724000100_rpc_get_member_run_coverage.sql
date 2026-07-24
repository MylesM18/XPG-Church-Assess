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
