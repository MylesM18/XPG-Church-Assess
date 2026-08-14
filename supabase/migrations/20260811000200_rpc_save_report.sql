-- 4 args, mirroring save_diagnosis. archetype, tier, facts, sections and section_sources are
-- read out of p_payload into their own columns, so the columns stay queryable and constrained
-- while the signature never has to change when a section is added.
create function public.save_report(
  p_church_id uuid,
  p_inputs_hash text,
  p_methodology_version text,
  p_payload jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_run_id uuid;
begin
  -- ⚠️ NO STATUS FILTER. save_diagnosis (current definition:
  -- 20260730000100_fn_current_run_dedup_resolution.sql) resolves the run via current_run() and
  -- then flips it to 'complete' before this function ever runs in the same action, so a
  -- status = 'in_progress' predicate here would find no run and raise on every call.
  -- current_run() is the house's status-agnostic resolver (same migration) — use it rather than
  -- hand-rolling the 5-line lookup it was introduced specifically to eliminate.
  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    raise exception 'no run for this church';
  end if;

  -- ⚠️ require_church_admin takes a RUN id, not a church id
  -- (20260718000300_rpc_report_share_manage.sql:9). It also authenticates, so there is no
  -- separate auth.uid() null check here. It has no execute grant — reachable only because this
  -- function is security definer and runs as the owner.
  perform public.require_church_admin(v_run_id);

  insert into public.reports (
    run_id, church_id, inputs_hash, methodology_version,
    archetype, tier, facts, sections, section_sources
  )
  values (
    v_run_id, p_church_id, p_inputs_hash, p_methodology_version,
    p_payload ->> 'archetype',
    p_payload ->> 'tier',
    coalesce(p_payload -> 'facts', '{}'::jsonb),
    coalesce(p_payload -> 'sections', '{}'::jsonb),
    coalesce(p_payload -> 'section_sources', '{}'::jsonb)
  )
  on conflict (run_id, inputs_hash) do nothing;
end;
$$;

revoke all on function public.save_report(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_report(uuid, text, text, jsonb) to authenticated;
