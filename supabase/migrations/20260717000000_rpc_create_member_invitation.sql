-- create_member_invitation: admin-gated Type-B invite create; 14-day expiry (tighter than the 30d respondent invite on purpose). SECURITY DEFINER.

create function public.create_member_invitation(
  p_church_id uuid,
  p_role text,
  p_invited_email text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_invited_email, '')));
  v_id uuid;
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
  if p_role not in ('admin', 'viewer') then
    raise exception 'role must be admin or viewer';
  end if;
  if v_email = '' then
    raise exception 'an email is required';
  end if;

  -- already an active member of this church?
  if exists (
    select 1 from auth.users u
    join public.church_members cm on cm.user_id = u.id
    where cm.church_id = p_church_id and lower(u.email) = v_email
  ) then
    raise exception 'that person is already a member of this church';
  end if;

  -- a live pending invite already exists for this church + email?
  if exists (
    select 1 from public.member_invitations
    where church_id = p_church_id and lower(invited_email) = v_email
      and status = 'pending' and expires_at > now()
  ) then
    raise exception 'a pending invitation already exists for that email';
  end if;

  insert into public.member_invitations (church_id, role, invited_email, status, expires_at, created_by)
  values (p_church_id, p_role, v_email, 'pending', now() + interval '14 days', v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_member_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_member_invitation(uuid, text, text) to authenticated;
