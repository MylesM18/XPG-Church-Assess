-- M2 I1 hardening (deferred from M2): narrow EXECUTE on is_church_member.
-- The shipped 20260715000400_rls_policies.sql created it with default (public) EXECUTE.
-- Only authenticated users ever need it (via members_select); revoke the rest.
revoke all on function public.is_church_member(uuid) from public, anon;
grant execute on function public.is_church_member(uuid) to authenticated;
