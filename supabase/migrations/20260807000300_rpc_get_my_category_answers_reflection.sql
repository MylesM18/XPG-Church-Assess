-- Outreach questions (methodology 0.3.0): get_my_category_answers also returns the
-- caller's own reflection text, so the answer form can prefill the textarea the same
-- way it prefills the rating.
--
-- DROP + recreate rather than CREATE OR REPLACE: Postgres refuses to change a
-- function's return type in place (42P13). Same pattern as 20260728000100.

drop function if exists public.get_my_category_answers(uuid, text);

create function public.get_my_category_answers(p_church_id uuid, p_category_id text)
returns table(item_id text, value int, reflection text)
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
  select r.item_id, r.value, r.reflection
  from public.responses r
  where r.run_id = v_run_id
    and r.category_id = p_category_id
    and r.respondent_kind = 'member'
    and r.respondent_user_id = v_uid;
end;
$$;

revoke all on function public.get_my_category_answers(uuid, text) from public, anon;
grant execute on function public.get_my_category_answers(uuid, text) to authenticated;
