-- get_member_invitation_preview: anon-callable, display-only. Returns church name/role/email/status/expiry ONLY — never church_id or assessment data. The token IS the URL secret.

create function public.get_member_invitation_preview(p_token uuid)
returns table(church_name text, role text, invited_email text, status text, is_expired boolean)
language sql
stable
security definer set search_path = public
as $$
  select c.name, mi.role, mi.invited_email, mi.status, (mi.expires_at < now())
  from public.member_invitations mi
  join public.churches c on c.id = mi.church_id
  where mi.id = p_token;
$$;

revoke all on function public.get_member_invitation_preview(uuid) from public;
grant execute on function public.get_member_invitation_preview(uuid) to anon, authenticated;
