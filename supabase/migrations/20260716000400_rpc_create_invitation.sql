-- create_invitation: admin-gated insert of a pending Type-A respondent invitation into the
-- church's single active run. SECURITY DEFINER = the only writer of invitations. Returned id = token.
create function public.create_invitation(
  p_church_id uuid,
  p_category_id text,
  p_invited_name text,
  p_invited_contact text,
  p_channel text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members
    where church_id = p_church_id and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'not an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;

  if v_run_id is null then
    raise exception 'no active run for this church';
  end if;

  insert into public.invitations
    (run_id, church_id, category_id, invited_name, invited_contact, channel, created_by)
  values
    (v_run_id, p_church_id, p_category_id, p_invited_name, p_invited_contact, p_channel, v_uid)
  returning id into v_invitation_id;

  return v_invitation_id;
end;
$$;

revoke all on function public.create_invitation(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text, text, text) to authenticated;
