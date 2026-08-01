-- submit_self_response gains the completion-window lock: an invited member whose 3-day clock has run
-- out can no longer write answers (already-saved answers still count). The lock is the authoritative
-- enforcement; the dashboard banner only mirrors it. Untimed rows (null deadline: founder,
-- pre-existing members) are never locked. Byte-identical to 20260730000100's submit_self_response
-- body EXCEPT the lock block after the membership check, before run resolution.
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

  -- completion window: a timed member past their deadline is locked out of new writes.
  if exists (
    select 1 from public.church_members
    where church_id = p_church_id and user_id = v_uid
      and assessment_deadline_at is not null and now() > assessment_deadline_at
  ) then
    raise exception 'your assessment window has closed; ask an admin to reopen it';
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
