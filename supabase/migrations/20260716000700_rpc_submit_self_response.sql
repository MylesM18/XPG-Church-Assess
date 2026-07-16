-- submit_self_response: member-gated UPSERT of the caller's answers for one category in the
-- active run. Overwrite via the responses_member_unique partial index (Decision 3).
create function public.submit_self_response(
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
  v_label text;
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
    raise exception 'no active run for this church';
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
