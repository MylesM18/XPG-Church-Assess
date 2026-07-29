-- Fix: form-resume prefill (get_my_category_answers) must SURVIVE diagnosis generation.
--
-- Companion to 20260727000100 (which fixed the three COVERAGE RPCs). save_diagnosis flips the
-- church's single assessment_run in_progress -> complete. get_my_category_answers resolved "the run"
-- with `where church_id = p_church_id and status = 'in_progress'`, so once the diagnosis completed
-- the run it found nothing and returned EMPTY. Now that completion persists on the dashboard, the
-- whole-assessment CTA becomes "Take Again" (lib/coverage/assessment-cta.ts) and lands on the answer
-- page (app/app/[churchId]/answer/[categoryId]/page.tsx), which prefills from this RPC -> a BLANK
-- form despite the dashboard showing the category covered.
--
-- Root-cause fix: drop ONLY the `and status = 'in_progress'` filter from the run-selection.
-- `order by created_at asc limit 1` still resolves the church's single run, now regardless of status
-- -- exactly the change 20260727000100 made to the coverage RPCs, and matching how page.tsx /
-- actions.ts already resolve the run. save_diagnosis is unchanged (its completion of the run is
-- load-bearing: the one-shot submit/diagnosis path still requires an in_progress run).
--
-- Everything else is byte-identical to the origin migration 20260724000400: same signature, return
-- shape, auth gates (authenticated + church_members), own-data-only projection (responses stays
-- default-deny -- no RLS SELECT policy), revoke/grant.

create or replace function public.get_my_category_answers(p_church_id uuid, p_category_id text)
returns table(item_id text, value int)
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
  select r.item_id, r.value
  from public.responses r
  where r.run_id = v_run_id
    and r.category_id = p_category_id
    and r.respondent_kind = 'member'
    and r.respondent_user_id = v_uid;
end;
$$;

revoke all on function public.get_my_category_answers(uuid, text) from public, anon;
grant execute on function public.get_my_category_answers(uuid, text) to authenticated;
