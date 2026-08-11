-- Final-report redesign plan 1 (spec "Data model & schema changes"): four optional
-- church-profile columns for report calibration. All nullable — the report omits any
-- empty field gracefully (locked decision 6), and create_church_with_admin is UNTOUCHED:
-- these are post-creation settings written through the existing churches_update RLS
-- policy (admin-only, 20260715000400), no new RPC.
--
-- facility_status is free text constrained to the four known values when present
-- (owned | rented | portable | mixed); leadership_history and consultant_notes are
-- long-form notes (consultant_notes may carry roles/context the assessment doesn't
-- collect, spec P6).

alter table public.churches
  add column if not exists campuses_band text,
  add column if not exists facility_status text
    check (facility_status is null or facility_status in ('owned','rented','portable','mixed')),
  add column if not exists leadership_history text,
  add column if not exists consultant_notes text;
