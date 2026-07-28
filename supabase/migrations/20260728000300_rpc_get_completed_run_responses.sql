-- get_completed_run_responses: the COMPLETED-run sibling of get_run_responses.
--
-- CT-2(c) re-derives the Diagnosis at render from a run's stored responses under the CURRENT
-- methodology, on the two AUTHENTICATED report surfaces (the diagnosis page and the PDF route).
-- get_run_responses (20260728000100) is scoped to the single in_progress run — the assessment a
-- church is still filling in — which is the wrong run for a report: generateDiagnosis flips the
-- run to 'complete' when it saves the diagnosis, so by render time the responses live on a
-- COMPLETE run. This function is byte-identical to get_run_responses except it selects the
-- oldest COMPLETE run instead of the in_progress one.
--
-- respondent_user_id is returned (added in 20260728000100) so normalize() can key on a stable
-- identity rather than the display label — two members with neither a name nor an email both
-- write the label 'Member' and would otherwise merge into one respondent (spec §4.4). Everything
-- else — the authentication gate, the church_members membership check, the run-scoping (oldest
-- first), and the grants — matches get_run_responses exactly.
create or replace function public.get_completed_run_responses(p_church_id uuid)
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
  where church_id = p_church_id and status = 'complete'
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

revoke all on function public.get_completed_run_responses(uuid) from public, anon;
grant execute on function public.get_completed_run_responses(uuid) to authenticated;
