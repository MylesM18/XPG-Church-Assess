-- submit_rpcs_bounds_guard: adds a payload BOUNDS guard (plumbing only) to both
-- submit_invited_response and submit_self_response. This is NOT methodology validation —
-- "exactly N answers for the category", item-in-category membership, and dedup logic all
-- remain the responsibility of lib/answers/validate.ts (the TS validator). The guard here
-- only rejects payloads that are structurally impossible to be a real submission (not a
-- JSON array, empty, or absurdly large), so that a bare PostgREST call bypassing the TS
-- validator can't insert zero rows while still burning a single-use invitation token (see
-- submit_invited_response, which previously flipped status to 'completed' even when
-- p_answers was `[]`).
--
-- Both functions are recreated here via `create or replace` with their EXACT prior
-- signatures — (uuid, text, jsonb) — language, and security settings unchanged; the only
-- new logic is the bounds guard itself. Grants are re-stated at the end so this migration
-- is self-documenting and correct if ever applied from scratch.

create or replace function public.submit_invited_response(
  p_token uuid,
  p_respondent_label text,
  p_answers jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_token for update;

  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation has expired';
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array'
     or jsonb_array_length(p_answers) not between 1 and 50 then
    raise exception 'invalid answer payload';
  end if;

  insert into public.responses
    (run_id, church_id, category_id, item_id, value, respondent_kind, invitation_id, respondent_label)
  select v_inv.run_id, v_inv.church_id, v_inv.category_id,
         (a->>'item_id'), (a->>'value')::int, 'invited', p_token, p_respondent_label
  from jsonb_array_elements(p_answers) as a;

  update public.invitations
     set status = 'completed', completed_at = now()
   where id = p_token;
end;
$$;

revoke all on function public.submit_invited_response(uuid, text, jsonb) from public;
grant execute on function public.submit_invited_response(uuid, text, jsonb) to anon, authenticated;

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
