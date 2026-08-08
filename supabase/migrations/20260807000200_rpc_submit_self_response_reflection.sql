-- Outreach questions (methodology 0.3.0): carry an optional per-answer reflection.
--
-- DEVIATION FROM THE SPEC'S LETTER (approved, see the plan's Deviation 2): the spec
-- sketched a trailing `p_reflection text` argument, which cannot carry two reflections
-- in one whole-category submit (Guest Experience has G6+G7, Communication COM6+COM7).
-- Instead each element of p_answers may carry an optional `reflection` key:
--   { "item_id": "G6", "value": 7, "reflection": "..." }
-- The argument signature is unchanged (uuid, text, jsonb), so this is a plain
-- CREATE OR REPLACE. Absent key => NULL. Empty/whitespace-only => NULL, which means a
-- re-answer with the textarea cleared clears the stored text (value and reflection
-- always travel together).
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

  if exists (
    select 1
    from jsonb_array_elements(p_answers) as a
    where char_length(btrim(a->>'reflection')) > 2000
  ) then
    raise exception 'reflection too long (max 2000 characters)';
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

  insert into public.responses (
    run_id, church_id, category_id, item_id, value,
    respondent_kind, respondent_user_id, respondent_label, reflection
  )
  select v_run_id, p_church_id, p_category_id,
         (a->>'item_id'), (a->>'value')::int, 'member', v_uid, v_label,
    nullif(btrim(a->>'reflection'), '')
  from jsonb_array_elements(p_answers) as a
  on conflict (run_id, item_id, respondent_user_id)
    where respondent_kind = 'member' and respondent_user_id is not null
  do update set
    value = excluded.value,
    category_id = excluded.category_id,
    reflection = excluded.reflection;
end;
$$;

revoke all on function public.submit_self_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_self_response(uuid, text, jsonb) to authenticated;
