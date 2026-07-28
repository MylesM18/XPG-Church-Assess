-- strip_respondents (v3): the report reform branch (Task 13) renamed
-- Diagnosis.dispersion_flags -> disagreement_flags in the engine, but this function
-- still only checked for the literal key 'dispersion_flags'. New payloads carry
-- 'disagreement_flags' instead, so `p_payload ? 'dispersion_flags'` was false for
-- every post-rename row and the whole strip silently no-op'd on the new key: the
-- ELSE branch returned p_payload untouched, respondent labels and all.
--
-- That is a real gap in the "two independent strips, both must fail" posture
-- 20260718000600 documents for the public /r/[shareToken] route: TypeScript's
-- audience: 'shared' strip in lib/report/view.ts still empties respondents client-
-- side, so this was never a live browser-visible leak, but the SQL side of the
-- belt-and-braces pair was silently disarmed for anything diagnosed after the
-- rename landed.
--
-- Fix: check BOTH keys. Rows persisted before this branch still carry the old
-- 'dispersion_flags' key (jsonb payloads are immutable historical data — nothing
-- migrates them in place), and everything diagnosed from here on carries the new
-- 'disagreement_flags' key. A payload only ever has one of the two; stripping both
-- unconditionally is a no-op on whichever key is absent.
--
-- The evidence_trail[].refs strip is unaffected by the rename: buildEvidenceTrail()
-- in lib/engine/assemble.ts still tags dispersion evidence with
-- `claim: \`dispersion:${category_id}\`` (that string literal was deliberately left
-- alone in Task 13 — renaming it would have broken this exact LIKE match), so the
-- 'dispersion:%' prefix check below still matches every payload the engine emits,
-- old or new.
--
-- CREATE OR REPLACE, not an edit to 20260718000500: that migration is already
-- applied to the local database, which is never reset, so an in-place edit would
-- never take effect there and would silently desync the migration file from the
-- live schema.
create or replace function public.strip_respondents(p_payload jsonb)
returns jsonb language sql immutable as $$
  with strip_legacy_dispersion_flags as (
    -- Rows persisted before Task 13's rename.
    select case
      when p_payload ? 'dispersion_flags' then jsonb_set(
        p_payload, '{dispersion_flags}',
        coalesce((
          select jsonb_agg(jsonb_set(flag, '{respondents}', '[]'::jsonb))
          from jsonb_array_elements(p_payload->'dispersion_flags') as flag
        ), '[]'::jsonb))
      else p_payload
    end as result
  ),
  strip_disagreement_flags as (
    -- Everything diagnosed after Task 13's rename.
    select case
      when result ? 'disagreement_flags' then jsonb_set(
        result, '{disagreement_flags}',
        coalesce((
          select jsonb_agg(jsonb_set(flag, '{respondents}', '[]'::jsonb))
          from jsonb_array_elements(result->'disagreement_flags') as flag
        ), '[]'::jsonb))
      else result
    end as result
    from strip_legacy_dispersion_flags
  ),
  strip_evidence_trail as (
    select case
      when result ? 'evidence_trail' then jsonb_set(
        result, '{evidence_trail}',
        coalesce((
          select jsonb_agg(
            case
              when entry ->> 'claim' like 'dispersion:%'
                then jsonb_set(entry, '{refs}', '[]'::jsonb)
              else entry
            end)
          from jsonb_array_elements(result -> 'evidence_trail') as entry
        ), '[]'::jsonb))
      else result
    end as result
    from strip_disagreement_flags
  )
  select result from strip_evidence_trail;
$$;
