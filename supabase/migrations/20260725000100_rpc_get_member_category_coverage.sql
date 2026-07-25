-- get_member_category_coverage: ADMIN-ONLY per-member × per-category answered counts for the
-- active run. Stricter gate than get_run_coverage / get_member_run_coverage (which allow any
-- member) because this exposes who answered what. Powers the admin dashboard Member × Category
-- matrix; lib/coverage/member-matrix.ts pivots the sparse rows into a dense grid.
create function public.get_member_category_coverage(p_church_id uuid)
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
  where church_id = p_church_id and status = 'in_progress'
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
