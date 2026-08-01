-- extend_member_deadline: an admin resets an invited member's completion clock to now()+3 days
-- ("Extend 3 days" / reopen). Same admin-of-church gate as create_member_invitation. The
-- `assessment_deadline_at is not null` guard makes it a NO-OP for untimed members (the founder),
-- so extending can never turn an untimed person into a timed one. Returns the target's current
-- deadline (the new one when timed; null when untimed or the target is not a member here).
create function public.extend_member_deadline(p_church_id uuid, p_user_id uuid)
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deadline timestamptz;
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

  update public.church_members
     set assessment_deadline_at = now() + interval '3 days'
   where church_id = p_church_id and user_id = p_user_id
     and assessment_deadline_at is not null;

  select assessment_deadline_at into v_deadline
  from public.church_members
  where church_id = p_church_id and user_id = p_user_id;

  return v_deadline;
end;
$$;

revoke all on function public.extend_member_deadline(uuid, uuid) from public, anon;
grant execute on function public.extend_member_deadline(uuid, uuid) to authenticated;
