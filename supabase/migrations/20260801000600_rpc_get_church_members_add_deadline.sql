-- get_church_members gains assessment_deadline_at so the admin roster can show each timed member's
-- days-left + an Extend control. Changing the returns-table shape requires DROP then CREATE
-- (Postgres forbids create-or-replace across a changed return signature). Otherwise byte-identical
-- to 20260717000200 with the one extra projected column.
drop function public.get_church_members(uuid);

create function public.get_church_members(p_church_id uuid)
returns table(
  user_id uuid, full_name text, email text, role text,
  joined_at timestamptz, assessment_deadline_at timestamptz
)
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
  select cm.user_id,
         p.full_name,
         coalesce(p.email, u.email) as email,
         cm.role,
         cm.created_at,
         cm.assessment_deadline_at
  from public.church_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.church_id = p_church_id
  order by cm.created_at asc;
end;
$$;

revoke all on function public.get_church_members(uuid) from public, anon;
grant execute on function public.get_church_members(uuid) to authenticated;
