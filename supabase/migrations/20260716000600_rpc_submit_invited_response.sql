-- submit_invited_response: anon-callable atomic submit. Re-checks the token pending+unexpired
-- (FOR UPDATE lock), inserts the answer rows, flips the invitation to completed — all in one
-- transaction, so replay/double-submit is rejected. Value range is enforced by the DB CHECK.
create function public.submit_invited_response(
  p_token uuid,
  p_respondent_label text,
  p_answers jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_token for update;

  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation has expired';
  end if;

  insert into public.responses
    (run_id, church_id, category_id, item_id, value, respondent_kind, invitation_id, respondent_label)
  select v_inv.run_id, v_inv.church_id, v_inv.category_id,
         (a->>'item_id'), (a->>'value')::int, 'invited', p_token, p_respondent_label
  from jsonb_array_elements(p_answers) as a;

  update public.invitations
     set status = 'completed', completed_at = now()
   where id = p_token;
end;
$$;

revoke all on function public.submit_invited_response(uuid, text, jsonb) from public;
grant execute on function public.submit_invited_response(uuid, text, jsonb) to anon, authenticated;
