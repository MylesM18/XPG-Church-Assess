-- Outreach questions (methodology 0.3.0): get_completed_run_responses also returns the
-- response's reflection text, which the report view groups into "Voices on outreach".
--
-- DROP + recreate rather than CREATE OR REPLACE: the return type changes (42P13).
-- The run is still resolved INLINE here, deliberately — 20260730000100's header
-- defers converting these RPCs to current_run() to a follow-up under pgTAP.

drop function if exists public.get_completed_run_responses(uuid);

create function public.get_completed_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)
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
  where church_id = p_church_id and status = 'complete'
  order by created_at asc
  limit 1;
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_completed_run_responses(uuid) from public, anon;
grant execute on function public.get_completed_run_responses(uuid) to authenticated;
