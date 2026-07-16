-- get_invitation_context: anon-callable. Returns only safe render fields for a valid token,
-- and a UNIFORM invalid row (valid=false, everything else null) for used/expired/revoked/unknown
-- tokens — no oracle distinguishing wrong-token from expired, zero response data.
create function public.get_invitation_context(p_token uuid)
returns table(valid boolean, category_id text, church_id uuid, church_name text, run_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invitations;
  v_church_name text;
begin
  select * into v_inv from public.invitations where id = p_token;

  if not found or v_inv.status <> 'pending' or v_inv.expires_at < now() then
    return query select false, null::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  select name into v_church_name from public.churches where id = v_inv.church_id;

  return query select true, v_inv.category_id, v_inv.church_id, v_church_name, v_inv.run_id;
end;
$$;

revoke all on function public.get_invitation_context(uuid) from public;
grant execute on function public.get_invitation_context(uuid) to anon, authenticated;
