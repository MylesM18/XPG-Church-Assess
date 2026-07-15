-- accept_member_invitation: validated, server-side acceptance of a Type-B (account-holder)
-- invite. SECURITY DEFINER = bypasses RLS; the SECOND (and last) writer of church_members.
-- A user can never self-insert a church_members row — only this RPC and create_church_with_admin.
create function public.accept_member_invitation(p_token uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_inv public.member_invitations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_inv from public.member_invitations where id = p_token;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation has expired';
  end if;
  if v_email is null or v_email <> v_inv.invited_email then
    raise exception 'signed-in email does not match the invited email';
  end if;

  insert into public.church_members (church_id, user_id, role, granted_by)
  values (v_inv.church_id, v_uid, v_inv.role, v_inv.created_by)
  on conflict (church_id, user_id) do nothing;

  update public.member_invitations
     set status = 'accepted', accepted_by = v_uid
   where id = p_token;

  return v_inv.church_id;
end;
$$;

revoke all on function public.accept_member_invitation(uuid) from public, anon;
grant execute on function public.accept_member_invitation(uuid) to authenticated;
