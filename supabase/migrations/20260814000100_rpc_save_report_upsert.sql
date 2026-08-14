-- save_report becomes a real upsert, and stamps generated_at on every write.
--
-- 20260811000200_rpc_save_report.sql ended `on conflict (run_id, inputs_hash) do nothing`. That
-- made a re-save whose inputs hash was UNCHANGED a silent no-op, which defeats the two callers
-- that exist to replace stored content:
--
--   1. Generation (app/app/[churchId]/actions.ts:220-233). The I9 guard deliberately treats a
--      100%-fallback row as a cache MISS — "a row written when every AI section failed its gate
--      is 100% fallback, and treating it as a hit would pin that report to fallback forever with
--      no regenerate path". It then recomposes... and `do nothing` discarded the result, so the
--      unusable row survived anyway. The guard was correct and the write undid it. This is the
--      exact shape of the pinned-to-fallback failure: a church whose report was first composed
--      with no OPENAI_API_KEY set could never obtain AI sections afterwards, and every retry
--      silently re-spent the model call.
--   2. regenerateReport (same file, :302). Its stated recovery case moves the inputs hash, so it
--      inserts a NEW row and was never blocked — but any regenerate at an unchanged hash (a
--      partially-failed compose, a newly-set key) was dropped on the floor.
--
-- The argument signature and return type are unchanged, so this is a plain CREATE OR REPLACE
-- (same idiom as 20260807000200_rpc_submit_self_response_reflection.sql). The body below is
-- byte-identical to 20260811000200 through the VALUES list; only the ON CONFLICT action changes.
--
-- `generated_at = now()` mirrors save_prose (20260717000400_rpc_save_prose.sql:25), the house's
-- existing "regenerated content bumps its timestamp" precedent. Without it the column would keep
-- the FIRST composition's time forever and no caller could tell stale content from fresh.
--
-- church_id is deliberately NOT in the update list: run_id determines the church (the run is
-- resolved by current_run(p_church_id)), so it cannot legitimately differ between two writes that
-- collide on the same run_id.
create or replace function public.save_report(
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
  on conflict (run_id, inputs_hash) do update
     set methodology_version = excluded.methodology_version,
         archetype           = excluded.archetype,
         tier                = excluded.tier,
         facts               = excluded.facts,
         sections            = excluded.sections,
         section_sources     = excluded.section_sources,
         generated_at        = now();
end;
$$;

revoke all on function public.save_report(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_report(uuid, text, text, jsonb) to authenticated;
