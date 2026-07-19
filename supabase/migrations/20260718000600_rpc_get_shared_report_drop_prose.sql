-- Drop `prose` from get_shared_report's return type. 20260718000400:4-6 claimed respondent
-- names never leave Postgres on this path; that was true of `payload` (strip_respondents) but
-- NOT of `prose`, which was returned raw. `prose` is AI-generated text whose prompt embeds the
-- full Diagnosis — including dispersion_flags[].respondents[].label — so under PROSE_MODE=ai it
-- carried respondent names straight through to the public /r/[shareToken] page, past BOTH the
-- SQL strip and the render-layer 'shared' audience strip. This migration is what makes
-- 20260718000400's claim true: prose is now structurally absent from the anon path, so the
-- public page has no choice but deterministic fallbackProse, which is provably name-free.
--
-- `create or replace function` cannot change a return type, so this drops and recreates.
-- A drop also discards the revoke/grant, which are re-applied below.
drop function public.get_shared_report(uuid);

create function public.get_shared_report(p_token uuid)
returns table(valid boolean, payload jsonb, church_name text, brand_color text)
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
    return query select false, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_diag from public.diagnoses
  where run_id = v_share.run_id
  order by generated_at desc
  limit 1;

  if not found then
    return query select false, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_church from public.churches where id = v_share.church_id;

  if not found then
    return query select false, null::jsonb, null::text, null::text;
    return;
  end if;

  return query select true,
                      public.strip_respondents(v_diag.payload),
                      v_church.name,
                      v_church.brand_color;
end;
$$;

revoke all on function public.get_shared_report(uuid) from public;
grant execute on function public.get_shared_report(uuid) to anon, authenticated;
