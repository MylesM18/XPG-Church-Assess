-- get_my_category_answers: caller-scoped read of the CALLER's OWN saved answers for one category
-- in the active run. Mirrors get_member_run_coverage's auth gate + active-run resolution. Powers
-- form resume (prefill). Returns raw own (item_id, value) ONLY — never scores, aggregates, or any
-- other respondent's rows — so responses stays default-deny (no RLS SELECT policy).
create function public.get_my_category_answers(p_church_id uuid, p_category_id text)
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
  where church_id = p_church_id and status = 'in_progress'
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
