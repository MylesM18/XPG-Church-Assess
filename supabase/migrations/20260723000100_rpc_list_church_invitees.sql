-- list_church_invitees: admin-only. Returns each distinct prior invitee for the church (deduped by
-- contact, falling back to name) plus the category slugs where they CURRENTLY have a pending invite.
-- SECURITY DEFINER — invitations has RLS enabled with no SELECT policy (default-deny), so this RPC
-- is the only read path, mirroring create_invitation / get_church_members.
create function public.list_church_invitees(p_church_id uuid)
returns table(invited_name text, invited_contact text, pending_category_ids text[])
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members cm
    where cm.church_id = p_church_id and cm.user_id = v_uid and cm.role = 'admin'
  ) then
    raise exception 'must be an admin of this church' using errcode = 'insufficient_privilege';
  end if;

  return query
  with contacts as (
    select
      coalesce(nullif(i.invited_contact, ''), i.invited_name) as dedup_key,
      max(i.invited_name)    as invited_name,
      max(i.invited_contact) as invited_contact,
      array_remove(
        array_agg(distinct case when i.status = 'pending' then i.category_id end),
        null
      ) as pending_category_ids
    from public.invitations i
    where i.church_id = p_church_id
      and coalesce(nullif(i.invited_contact, ''), i.invited_name) is not null
    group by 1
  )
  select c.invited_name, c.invited_contact, c.pending_category_ids
  from contacts c
  order by c.invited_name nulls last, c.invited_contact nulls last;
end;
$$;

revoke all on function public.list_church_invitees(uuid) from public, anon;
grant execute on function public.list_church_invitees(uuid) to authenticated;
