-- remove_member: admin-gated, last-admin-guarded. The SOLE DELETE on church_members. Non-member target = no-op. SECURITY DEFINER.

create function public.remove_member(p_church_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_role text;
  v_admin_count int;
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

  select role into v_target_role from public.church_members
  where church_id = p_church_id and user_id = p_user_id;
  if not found then
    return; -- not a member: no-op
  end if;

  if v_target_role = 'admin' then
    -- Lock this church's admin rows so a concurrent remover blocks and re-reads the
    -- true post-commit count (prevents two admins removing each other from both passing
    -- the last-admin guard and orphaning the church with zero admins).
    perform 1 from public.church_members
      where church_id = p_church_id and role = 'admin'
      for update;

    select count(*) into v_admin_count from public.church_members
    where church_id = p_church_id and role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'cannot remove the last admin of this church';
    end if;
  end if;

  delete from public.church_members
  where church_id = p_church_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
