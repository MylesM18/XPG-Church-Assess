-- get_run_responses gains respondent_user_id.
--
-- normalize() (lib/engine/normalize.ts) keyed respondents on respondent_label, which is
-- written as coalesce(full_name, email, 'Member') at submit time. Two members with neither
-- a name nor an email on file both write the label 'Member', so the engine's per-respondent
-- map merged them into ONE respondent -- corrupting respondent_count, the dispersion stddev,
-- and the disagreement flag (spec S4.4). The engine could not disambiguate because this
-- function never returned a stable identity, only the display label. It does now:
-- respondent_user_id is added as an extra returned column so normalize() can key on identity
-- instead of label.
--
-- Everything else is byte-identical to the origin migration (20260716001000): same
-- authentication/membership gate, same run-scoping (single in_progress run, oldest first),
-- same grants.
create or replace function public.get_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid)
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
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_run_responses(uuid) from public, anon;
grant execute on function public.get_run_responses(uuid) to authenticated;
