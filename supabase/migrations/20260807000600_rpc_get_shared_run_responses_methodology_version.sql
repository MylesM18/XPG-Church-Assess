-- Outreach questions (methodology 0.3.0): the shared (anon) report path needs the
-- run's methodology_version so it can score old runs against the old item list.
-- get_shared_report returns only (valid, payload, church_name, brand_color) and stays
-- untouched, so this RPC is the only place the version can travel. It is denormalized
-- from assessment_runs the same way attendance_band is denormalized from churches.
--
-- This function deliberately does NOT return reflection. Reflections never reach the
-- shared surface: excluded here in SQL, absent from SharedRunResponseRow in TypeScript,
-- and gated by audience !== 'shared' in the report view builder.
--
-- DROP + recreate rather than CREATE OR REPLACE: the return type changes (42P13).

drop function if exists public.get_shared_run_responses(uuid);

-- get_shared_run_responses: the TOKEN-gated sibling of get_shared_report, for the public,
-- unauthenticated /r/[shareToken] page under CT-2(c).
--
-- The anon share page re-derives the Diagnosis from the run's responses under the current
-- methodology (deriveDiagnosisForRun) instead of reading the cached diagnoses.payload. It cannot
-- call get_completed_run_responses (that is member-gated), and it cannot query churches (RLS),
-- so this function serves both the responses and the church's attendance_band, gated only by a
-- valid share token — the exact validity contract get_shared_report uses (20260718000400 /
-- 20260718000600): a revoked, expired or unknown token returns NOTHING (zero rows), never an
-- error, so there is no oracle distinguishing the three.
--
-- Owner-ruled "Option B" redaction: respondent_label is REDACTED to the empty string ('') — it
-- stays a non-null text, never null — while respondent_user_id is returned REAL. A user id is an
-- opaque UUID, not PII, and normalize() keys respondents on respondent_user_id ?? respondent_label,
-- so the re-derived scores are bit-identical to the authenticated path while no human-readable
-- name ever leaves Postgres. attendance_band is denormalized onto every row because the anon page
-- has no other way to read it. (The 'shared' render audience strips the respondents list again at
-- the view layer — two independent name defenses.)
create function public.get_shared_run_responses(p_token uuid)
returns table(
  category_id text,
  item_id text,
  value int,
  respondent_label text,
  respondent_user_id uuid,
  attendance_band text,
  methodology_version text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_share public.report_shares;
  v_church public.churches;
  v_run public.assessment_runs;
begin
  select * into v_share from public.report_shares where id = p_token;

  -- Revoked, expired and unknown all return the identical empty result — no oracle, no raise.
  if not found or v_share.revoked or v_share.expires_at is null or v_share.expires_at < now() then
    return;
  end if;

  select * into v_church from public.churches where id = v_share.church_id;
  select * into v_run from public.assessment_runs where id = v_share.run_id;

  return query
  select r.category_id,
         r.item_id,
         r.value,
         ''::text as respondent_label,   -- redacted (Option B); never null
         r.respondent_user_id,           -- real, opaque identity — keeps scores identical
         v_church.attendance_band,
         v_run.methodology_version
  from public.responses r
  where r.run_id = v_share.run_id;
end;
$$;

revoke all on function public.get_shared_run_responses(uuid) from public;
grant execute on function public.get_shared_run_responses(uuid) to anon, authenticated;
