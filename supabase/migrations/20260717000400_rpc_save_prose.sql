create function public.save_prose(
  p_church_id uuid,
  p_response_hash text,
  p_prose jsonb,
  p_prose_source text default 'ai'
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  n int;
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

  update public.diagnoses dg
     set prose = p_prose, prose_source = p_prose_source, generated_at = now()
    from public.assessment_runs ar
   where dg.run_id = ar.id
     and ar.church_id = p_church_id
     and dg.response_hash = p_response_hash;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'no diagnosis found to attach prose to';
  end if;
end;
$$;

revoke all on function public.save_prose(uuid, text, jsonb, text) from public, anon;
grant execute on function public.save_prose(uuid, text, jsonb, text) to authenticated;
