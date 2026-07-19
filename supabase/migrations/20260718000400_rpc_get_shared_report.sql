-- get_shared_report: anon-callable tokenized read of one diagnosis. Mirrors the security
-- contract of get_invitation_context exactly — revoked, expired and unknown tokens all
-- return the IDENTICAL invalid row, so there is no oracle distinguishing them. The payload
-- is passed through strip_respondents so respondent names never leave Postgres on this path.
create function public.get_shared_report(p_token uuid)
returns table(valid boolean, payload jsonb, prose jsonb, church_name text, brand_color text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_share public.report_shares;
  v_diag public.diagnoses;
  v_church public.churches;
begin
  select * into v_share from public.report_shares where id = p_token;

  if not found or v_share.revoked or v_share.expires_at is null or v_share.expires_at < now() then
    return query select false, null::jsonb, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_diag from public.diagnoses
  where run_id = v_share.run_id
  order by generated_at desc
  limit 1;

  if not found then
    return query select false, null::jsonb, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_church from public.churches where id = v_share.church_id;

  if not found then
    return query select false, null::jsonb, null::jsonb, null::text, null::text;
    return;
  end if;

  return query select true,
                      public.strip_respondents(v_diag.payload),
                      v_diag.prose,
                      v_church.name,
                      v_church.brand_color;
end;
$$;

revoke all on function public.get_shared_report(uuid) from public;
grant execute on function public.get_shared_report(uuid) to anon, authenticated;
