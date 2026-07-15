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
