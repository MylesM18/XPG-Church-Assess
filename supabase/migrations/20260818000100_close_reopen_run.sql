-- Close / Reopen assessment (docs/adr/0003-admin-close-reopen-decoupled-from-diagnosis.md, which
-- amends docs/adr/0001-review-only-completion-defer-multi-run.md; spec
-- docs/superpowers/specs/2026-08-18-close-assessment-design.md).
--
-- Completion becomes an explicit, REVERSIBLE admin action. Until now the only writer of
-- assessment_runs.status = 'complete' was save_diagnosis (20260730000100:138-140), so the moment an
-- admin generated a diagnosis every member who had not finished — including people invited
-- afterwards — landed on read-only pages and submit_self_response refused their writes.
--
-- 1. assessment_runs gains the audit pair closed_at / closed_by. Nullable; no CHECK change — status
--    stays 'in_progress' | 'complete'; completed_at is still stamped on close so existing readers
--    (report cover date, pgTAP seeds) keep working. closed_by follows granted_by / accepted_by:
--    `references auth.users`, no ON DELETE clause.
-- 2. close_run(p_church_id) / reopen_run(p_church_id): SECURITY DEFINER, run resolved through
--    current_run() (never an inline status filter — tests/coverage/current-run-dedup.test.ts), then
--    gated by require_church_admin — which takes the RUN id (20260718000300:9), so resolution comes
--    first, exactly as save_report does (20260814000100:48-57).
-- 3. save_diagnosis re-created byte-identical to 20260730000100:103-145 MINUS the
--    `run is already complete` gate and the status/completed_at flip (and the now-unused v_status).
--    Generate no longer touches run status; it works before and after Close.
-- 4. get_run_responses / get_completed_run_responses re-created with the inline
--    `status = 'in_progress'` / `status = 'complete'` lookups replaced by current_run(). Both are now
--    status-agnostic and equivalent; the names are kept so the four call sites (diagnosis/actions.ts
--    generate + regenerate, diagnosis/page.tsx, pdf/route.ts) do not move — unification is a later
--    slice (ADR 0003). This closes ADR 0001's own "still pending" follow-up for these two.
--
-- Untouched: submit_self_response (still refuses on 'complete' — that is what makes Close mean
-- read-only), completion_reminder_recipients (reminders stop on Close, resume on Reopen — accepted),
-- deadline RPCs, sharing RPCs, save_report, RLS (members already have runs_select, so they can read
-- closed_at without a policy change).
--
-- ⚠️ Owner-gated: apply with `supabase db push` and verify with `npm run test:db` (pgTAP 11_/12_/
-- 22_/24_/26_/27_). The agent cannot run either; the vitest tripwire
-- tests/runs/close-reopen-migration.test.ts only source-reads this file. Every replaced function
-- keeps its return type, so plain `create or replace` applies; if `db push` reports 42P13 on one of
-- them, use `drop function … ; create function …` for that one in this same file.

-- ── 1. audit columns ────────────────────────────────────────────────────────────────────────────
alter table public.assessment_runs
  add column closed_at timestamptz null,
  add column closed_by uuid null references auth.users;

-- ── 2a. close_run ───────────────────────────────────────────────────────────────────────────────
create function public.close_run(p_church_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.assessment_runs;
begin
  select * into v_run from public.current_run(p_church_id);
  if v_run.id is null then
    raise exception 'no run for this church';
  end if;

  -- require_church_admin takes a RUN id, not a church id (20260718000300:9). It also authenticates
  -- (raises 'not authenticated' on a null auth.uid()). It has no execute grant — reachable only
  -- because this function is security definer and runs as the owner.
  perform public.require_church_admin(v_run.id);

  if v_run.status = 'complete' then
    raise exception 'run is already closed';
  end if;

  update public.assessment_runs
  set status = 'complete',
      completed_at = now(),
      closed_at = now(),
      closed_by = auth.uid()
  where id = v_run.id;
end;
$$;

revoke all on function public.close_run(uuid) from public, anon;
grant execute on function public.close_run(uuid) to authenticated;

-- ── 2b. reopen_run ──────────────────────────────────────────────────────────────────────────────
create function public.reopen_run(p_church_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.assessment_runs;
begin
  select * into v_run from public.current_run(p_church_id);
  if v_run.id is null then
    raise exception 'no run for this church';
  end if;

  perform public.require_church_admin(v_run.id);

  if v_run.status <> 'complete' then
    raise exception 'run is not closed';
  end if;

  update public.assessment_runs
  set status = 'in_progress',
      completed_at = null,
      closed_at = null,
      closed_by = null
  where id = v_run.id;
end;
$$;

revoke all on function public.reopen_run(uuid) from public, anon;
grant execute on function public.reopen_run(uuid) to authenticated;

-- ── 3. save_diagnosis: no status gate, no status write ──────────────────────────────────────────
create or replace function public.save_diagnosis(
  p_church_id uuid,
  p_response_hash text,
  p_methodology_version text,
  p_payload jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
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

  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    raise exception 'no active run for this church';
  end if;

  insert into public.diagnoses (run_id, response_hash, methodology_version, payload)
  values (v_run_id, p_response_hash, p_methodology_version, p_payload)
  on conflict (run_id, response_hash) do nothing;
end;
$$;

revoke all on function public.save_diagnosis(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_diagnosis(uuid, text, text, jsonb) to authenticated;

-- ── 4a. get_run_responses: current_run(), status-agnostic ───────────────────────────────────────
create or replace function public.get_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members where church_id = p_church_id and user_id = v_uid
  ) then
    raise exception 'not a member of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_run_responses(uuid) from public, anon;
grant execute on function public.get_run_responses(uuid) to authenticated;

-- ── 4b. get_completed_run_responses: current_run(), status-agnostic ─────────────────────────────
create or replace function public.get_completed_run_responses(p_church_id uuid)
returns table(category_id text, item_id text, value int, respondent_label text, respondent_user_id uuid, reflection text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.church_members where church_id = p_church_id and user_id = v_uid
  ) then
    raise exception 'not a member of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id from public.current_run(p_church_id);
  if v_run_id is null then
    return;
  end if;

  return query
  select r.category_id, r.item_id, r.value, r.respondent_label, r.respondent_user_id, r.reflection
  from public.responses r
  where r.run_id = v_run_id;
end;
$$;

revoke all on function public.get_completed_run_responses(uuid) from public, anon;
grant execute on function public.get_completed_run_responses(uuid) to authenticated;
