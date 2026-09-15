-- Results-viewed email to XP Gathering (spec docs/superpowers/specs/2026-09-15-results-viewed-email-design.md).
--
-- The first time a church admin opens the report of a CLOSED assessment, the app emails
-- kevin@xpgathering.com one short summary. These two functions are the database half of "once": the
-- diagnosis page claims, sends, then marks. Delivery is at-least-once: a failed send leaves the run
-- unmarked, and a later admin view retries once the 5-minute claim hold has passed.
--
-- 1. assessment_runs gains results_viewed_email_claimed_at / results_viewed_emailed_at. Nullable,
--    no backfill (owner decision: a run closed before this ships sends on its next admin view).
-- 2. claim_results_viewed_email(p_church_id) returns boolean: resolved through current_run(), then ONE
--    conditional update. Two concurrent claims serialize on the row lock; the second re-checks the
--    predicate against the first one's new claimed_at and updates nothing, so at most one caller gets
--    true within the hold.
-- 3. mark_results_viewed_emailed(p_church_id): same resolution; stamps emailed_at once.
--
-- Both are SERVICE-ROLE ONLY (the bind_invited_member pattern, 20260914000100): granted to service_role
-- and revoked from public, anon, and authenticated. With an authenticated grant a church admin could call
-- mark with their own session to suppress Kevin's email, or keep re-claiming to postpone it (PR #91
-- review). There is deliberately no require_church_admin: service_role has no auth.uid(). The caller
-- authorizes instead: the diagnosis page runs only for the church's admin (RLS-backed role check) and
-- calls through lib/notify/results-viewed-store.ts.
--
-- Untouched: close_run / reopen_run (reopening and closing again never re-sends) and RLS (members read
-- assessment_runs through runs_select and have no update policy, so these functions are the only writers
-- of the two timestamps, which are not sensitive).
--
-- Owner-gated: apply with `supabase db push`, verify with `npm run test:db`
-- (supabase/tests/29_results_viewed_email_test.sql). The agent runs neither; the vitest tripwire
-- tests/notify/results-viewed-migration.test.ts only source-reads this file. Until this is applied, or
-- while SUPABASE_SERVICE_ROLE_KEY is unset, the claim returns false and no email is sent.

-- ── 1. columns ──────────────────────────────────────────────────────────────────────────────────
alter table public.assessment_runs
  add column results_viewed_email_claimed_at timestamptz null,
  add column results_viewed_emailed_at timestamptz null;

-- ── 2. claim ────────────────────────────────────────────────────────────────────────────────────
create function public.claim_results_viewed_email(p_church_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.assessment_runs;
  v_claimed public.assessment_runs.id%type;
begin
  select * into v_run from public.current_run(p_church_id);
  if v_run.id is null then
    raise exception 'no run for this church';
  end if;

  update public.assessment_runs
  set results_viewed_email_claimed_at = now()
  where id = v_run.id
    and status = 'complete'
    and results_viewed_emailed_at is null
    and (results_viewed_email_claimed_at is null
         or results_viewed_email_claimed_at < now() - interval '5 minutes')
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_results_viewed_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_results_viewed_email(uuid) to service_role;

-- ── 3. mark ─────────────────────────────────────────────────────────────────────────────────────
create function public.mark_results_viewed_emailed(p_church_id uuid)
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

  update public.assessment_runs
  set results_viewed_emailed_at = now()
  where id = v_run.id
    and results_viewed_emailed_at is null;
end;
$$;

revoke all on function public.mark_results_viewed_emailed(uuid) from public, anon, authenticated;
grant execute on function public.mark_results_viewed_emailed(uuid) to service_role;
