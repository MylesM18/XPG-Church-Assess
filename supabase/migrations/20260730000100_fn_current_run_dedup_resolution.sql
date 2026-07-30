-- Wave 2 of "review-only completion" (docs/adr/0001-review-only-completion-defer-multi-run.md):
-- give "which run is the church's run" ONE home.
--
-- Until now the 5-line run lookup
--   select id from public.assessment_runs where church_id = p_church_id
--   [and status = 'in_progress'] order by created_at asc limit 1
-- was copy-pasted into every RPC, and the optional `status = 'in_progress'` clause was a POLICY
-- ("this run may still be written to") smuggled into a lookup. Reads dropped the clause
-- (20260727000100/200) so completion survives; writes kept it (submit_self_response, save_diagnosis)
-- and raised the misleading `no active run for this church` on a completed run. Same rule, two
-- expressions, drifting.
--
-- This migration introduces `current_run(church_id)` as the single, status-AGNOSTIC resolver, and
-- rewrites six RPCs onto it. Writability is no longer a hidden filter inside the lookup — the two
-- write RPCs resolve the run status-agnostically, then GATE explicitly on its status with an accurate
-- message. Every function body below is byte-identical to its latest prior definition EXCEPT the
-- run-resolution block; return shapes, auth/admin gates, projections, and grants are unchanged.
--
-- Still resolving the run inline (status-agnostic, correct — convert in a follow-up under pgTAP):
--   get_run_responses (20260728000100), get_completed_run_responses (20260728000300),
--   get_shared_run_responses (20260728000400).
--
-- ⚠️ Owner-gated: apply with `supabase db push` and verify with `npm run test:db` (pgTAP). The agent
-- cannot run either; the vitest tripwires only source-read this file.

-- ── the seam ───────────────────────────────────────────────────────────────────────────────────
-- The church's single assessment run (v1 is single-run; create_church_with_admin seeds exactly one),
-- resolved regardless of status. SECURITY INVOKER: called from within the SECURITY DEFINER RPCs it
-- runs in the definer's context (as before); called directly by an authenticated member it is gated
-- by RLS (runs_select). 0 rows when the church has no run.
create or replace function public.current_run(p_church_id uuid)
returns setof public.assessment_runs
language sql
stable
set search_path = public
as $$
  select *
  from public.assessment_runs
  where church_id = p_church_id
  order by created_at asc
  limit 1
$$;

revoke all on function public.current_run(uuid) from public, anon;
grant execute on function public.current_run(uuid) to authenticated;

-- ── writes: resolve status-agnostically, then gate on writability with an accurate message ───────
create or replace function public.submit_self_response(
  p_church_id uuid,
  p_category_id text,
  p_answers jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_status text;
  v_label text;
begin
  if jsonb_typeof(p_answers) is distinct from 'array'
     or jsonb_array_length(p_answers) not between 1 and 50 then
    raise exception 'invalid answer payload';
  end if;

  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members where church_id = p_church_id and user_id = v_uid
  ) then
    raise exception 'not a member of this church' using errcode = 'insufficient_privilege';
  end if;

  select id, status into v_run_id, v_status from public.current_run(p_church_id);
  if v_run_id is null then
    raise exception 'no active run for this church';
  elsif v_status <> 'in_progress' then
    raise exception 'run is complete; answers are read-only';
  end if;

  select coalesce(full_name, email, 'Member') into v_label from public.profiles where id = v_uid;
  if v_label is null then
    v_label := 'Member';
  end if;

  insert into public.responses
    (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
  select v_run_id, p_church_id, p_category_id,
         (a->>'item_id'), (a->>'value')::int, 'member', v_uid, v_label
  from jsonb_array_elements(p_answers) as a
  on conflict (run_id, item_id, respondent_user_id)
    where respondent_kind = 'member' and respondent_user_id is not null
  do update set value = excluded.value, category_id = excluded.category_id;
end;
$$;

revoke all on function public.submit_self_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_self_response(uuid, text, jsonb) to authenticated;

create or replace function public.save_diagnosis(
  p_church_id uuid,
  p_response_hash text,
  p_methodology_version text,
  p_payload jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members
    where church_id = p_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  select id, status into v_run_id, v_status from public.current_run(p_church_id);
  if v_run_id is null then
    raise exception 'no active run for this church';
  elsif v_status <> 'in_progress' then
    raise exception 'run is already complete';
  end if;

  insert into public.diagnoses (run_id, response_hash, methodology_version, payload)
  values (v_run_id, p_response_hash, p_methodology_version, p_payload)
  on conflict (run_id, response_hash) do nothing;

  update public.assessment_runs
  set status = 'complete', completed_at = coalesce(completed_at, now())
  where id = v_run_id;
end;
$$;

revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated;

-- ── reads: same resolution, now via the shared seam (status-agnostic, unchanged behavior) ────────
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

  select id into v_run_id from public.current_run(p_church_id);
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

  select id into v_run_id from public.current_run(p_church_id);
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

  select id into v_run_id from public.current_run(p_church_id);
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

  select id into v_run_id from public.current_run(p_church_id);
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
