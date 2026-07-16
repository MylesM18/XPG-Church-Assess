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
