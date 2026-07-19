-- strip_respondents (v2): extends the M6a SQL-side strip (20260718000100) to also scrub
-- respondent names out of evidence_trail[].refs, not just dispersion_flags[].respondents.
--
-- lib/engine/assemble.ts buildEvidenceTrail() builds every dispersion:<category_id>
-- evidence_trail entry 1:1 from that category's dispersion_flags[].respondents: each ref's
-- `ref` string is "<categoryId>.<Respondent Name>" and the sibling `value` is that same
-- person's mean score (e.g. {"ref":"guest.Marcus Ellingsworth","kind":"metric","value":3.8}).
-- That is the identical per-person disclosure dispersion_flags[].respondents exists to
-- prevent — the score alone, still attached to a per-person ref position, is the same
-- leak. No other evidence_trail claim carries per-person data (primary_constraint:* refs
-- are item ids, blind_spot:* refs are "<categoryId>.belief"/"<categoryId>.evidence",
-- generosity_mode:* refs are item ids), so only dispersion:* entries need touching, and
-- emptying the whole refs array on those (mirroring how dispersion_flags[].respondents is
-- emptied) removes both the ref and its paired value together.
--
-- CREATE OR REPLACE, not an edit to 20260718000100: that migration is already applied to
-- the local database, which is never reset, so an in-place edit would never take effect
-- there and would silently desync the migration file from the live schema.
create or replace function public.strip_respondents(p_payload jsonb)
returns jsonb language sql immutable as $$
  select
    case
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
    end
  from (
    select case
      when p_payload ? 'dispersion_flags' then jsonb_set(
        p_payload, '{dispersion_flags}',
        coalesce((
          select jsonb_agg(jsonb_set(flag, '{respondents}', '[]'::jsonb))
          from jsonb_array_elements(p_payload->'dispersion_flags') as flag
        ), '[]'::jsonb))
      else p_payload
    end as result
  ) t;
$$;
