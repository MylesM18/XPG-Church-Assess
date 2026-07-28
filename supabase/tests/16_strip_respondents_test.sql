begin;
select plan(20);

-- ── strip_respondents: pure function, tested against crafted payloads ──────
-- These use the LEGACY key, dispersion_flags — rows persisted before Task 13's
-- engine rename (Diagnosis.dispersion_flags -> disagreement_flags) still carry
-- it verbatim, and strip_respondents must keep covering them (20260728000200).
select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'dispersion_flags' -> 0 -> 'respondents',
  '[]'::jsonb,
  'strip_respondents empties the respondents array (legacy dispersion_flags key)');

select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'dispersion_flags' -> 0 -> 'spread',
  '2.2'::jsonb,
  'strip_respondents preserves spread on the flag');

select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'overall_score',
  '55'::jsonb,
  'strip_respondents preserves unrelated top-level keys');

select is(
  strip_respondents('{"overall_score":55}'::jsonb),
  '{"overall_score":55}'::jsonb,
  'payload with no dispersion_flags key passes through unchanged');

select is(
  strip_respondents('{"dispersion_flags":[]}'::jsonb) -> 'dispersion_flags',
  '[]'::jsonb,
  'empty dispersion_flags array stays an empty array');

select is(
  (select count(*) from jsonb_array_elements(
     strip_respondents('{"dispersion_flags":[{"respondents":[{"label":"A","mean":1}]},{"respondents":[{"label":"B","mean":2}]}]}'::jsonb)
       -> 'dispersion_flags') as f
   where f -> 'respondents' <> '[]'::jsonb),
  0::bigint,
  'every flag in a multi-flag payload is stripped');

select is(
  jsonb_array_length(
    strip_respondents('{"dispersion_flags":[{"respondents":[{"label":"A","mean":1}]},{"respondents":[{"label":"B","mean":2}]}]}'::jsonb)
      -> 'dispersion_flags'),
  2,
  'both flags survive stripping');

-- ── the CURRENT key: disagreement_flags (Task 13 renamed the engine's field;
-- this is what every diagnosis persisted from here on carries). Before
-- 20260728000200, strip_respondents only ever checked for the literal key
-- 'dispersion_flags' — these three assertions fail against that function,
-- because `p_payload ? 'dispersion_flags'` is false for a disagreement_flags-
-- keyed payload and the whole strip silently no-ops (the ELSE branch returns
-- p_payload untouched). That is the fix this migration proves.
select is(
  strip_respondents('{"overall_score":55,"disagreement_flags":[{"category_id":"guest","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'disagreement_flags' -> 0 -> 'respondents',
  '[]'::jsonb,
  'strip_respondents empties the respondents array (current disagreement_flags key)');

select is(
  strip_respondents('{"overall_score":55,"disagreement_flags":[{"category_id":"guest","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'disagreement_flags' -> 0 -> 'spread',
  '2.2'::jsonb,
  'strip_respondents preserves spread on the flag (current disagreement_flags key)');

select is(
  (select count(*) from jsonb_array_elements(
     strip_respondents('{"disagreement_flags":[{"respondents":[{"label":"A","mean":1}]},{"respondents":[{"label":"B","mean":2}]}]}'::jsonb)
       -> 'disagreement_flags') as f
   where f -> 'respondents' <> '[]'::jsonb),
  0::bigint,
  'every flag in a multi-flag payload is stripped (current disagreement_flags key)');

-- ── evidence_trail[].refs: dispersion claims embed the same respondent names, paired
-- with their individual mean score, in refs like "guest.Dana Okafor" -> 3.1. That is
-- the exact per-person disclosure dispersion_flags[].respondents exists to prevent, so
-- it must be stripped too. Every zero-match assertion below is paired with a positive
-- control run against the identical detector query (same LIKE/length probe, no strip)
-- so the zero-match cannot pass vacuously.

-- Positive control: the crafted payload's dispersion:* entry carries respondent refs
-- before strip_respondents ever runs.
select is(
  (select count(*) from jsonb_array_elements(
     '{"evidence_trail":[
        {"claim":"primary_constraint:guest","refs":[{"ref":"G1","kind":"item","value":33}]},
        {"claim":"dispersion:guest","refs":[
           {"ref":"guest.Dana Okafor","kind":"metric","value":3.1},
           {"ref":"guest.Sam Ito","kind":"metric","value":7.4}]},
        {"claim":"blind_spot:guest","refs":[{"ref":"guest.belief","kind":"metric","value":5}]}
      ]}'::jsonb -> 'evidence_trail') as entry
   where entry ->> 'claim' like 'dispersion:%'
     and jsonb_array_length(entry -> 'refs') > 0),
  1::bigint,
  'positive control: the crafted payload has a dispersion evidence_trail entry with respondent refs before stripping');

select is(
  (select count(*) from jsonb_array_elements(
     strip_respondents('{"evidence_trail":[
        {"claim":"primary_constraint:guest","refs":[{"ref":"G1","kind":"item","value":33}]},
        {"claim":"dispersion:guest","refs":[
           {"ref":"guest.Dana Okafor","kind":"metric","value":3.1},
           {"ref":"guest.Sam Ito","kind":"metric","value":7.4}]},
        {"claim":"blind_spot:guest","refs":[{"ref":"guest.belief","kind":"metric","value":5}]}
      ]}'::jsonb) -> 'evidence_trail') as entry
   where entry ->> 'claim' like 'dispersion:%'
     and jsonb_array_length(entry -> 'refs') > 0),
  0::bigint,
  'strip_respondents empties refs on every dispersion:* evidence_trail entry');

select is(
  jsonb_array_length(
    strip_respondents('{"evidence_trail":[
        {"claim":"primary_constraint:guest","refs":[{"ref":"G1","kind":"item","value":33}]},
        {"claim":"dispersion:guest","refs":[{"ref":"guest.Dana Okafor","kind":"metric","value":3.1}]}
      ]}'::jsonb) -> 'evidence_trail'),
  2,
  'evidence_trail keeps both entries; only the dispersion entry''s refs are emptied');

select is(
  strip_respondents('{"evidence_trail":[
      {"claim":"dispersion:guest","refs":[{"ref":"guest.Dana Okafor","kind":"metric","value":3.1}]}
    ]}'::jsonb) -> 'evidence_trail' -> 0 ->> 'claim',
  'dispersion:guest',
  'the dispersion entry''s claim key survives stripping; only refs is emptied');

select is(
  strip_respondents('{"evidence_trail":[
      {"claim":"primary_constraint:guest","refs":[{"ref":"G1","kind":"item","value":33}]}
    ]}'::jsonb) -> 'evidence_trail' -> 0 -> 'refs',
  '[{"ref":"G1","kind":"item","value":33}]'::jsonb,
  'non-dispersion evidence_trail refs (primary_constraint, blind_spot, generosity_mode) are left untouched');

-- Crafted fixture payload mirroring a real diagnosis: respondent names appear in
-- dispersion:* evidence_trail refs (e.g. "guest.Marcus Ellingsworth" -> 3.1) across two
-- categories (guest, formation). Inlined rather than read from the diagnoses table
-- because the committed e2e fixtures are NOT loaded by `supabase db reset` (config.toml
-- [db.seed] seeds ./seed.sql only, which carries no diagnoses), so a table-scoped probe
-- finds zero rows on a clean reset. The positive control proves the same ref-level LIKE
-- probe matches the three respondent names before stripping; the paired assertion proves
-- they are all gone after strip_respondents (every needle ref lives in a dispersion:*
-- entry, which strip_respondents empties).
select is(
  (select count(*)
   from jsonb_array_elements(
     '{"overall_score":58,"evidence_trail":[
        {"claim":"primary_constraint:guest","refs":[{"ref":"G1","kind":"item","value":33}]},
        {"claim":"dispersion:guest","refs":[
           {"ref":"guest.Marcus Ellingsworth","kind":"metric","value":3.1},
           {"ref":"guest.Priscilla Vandermeer","kind":"metric","value":7.4},
           {"ref":"guest.Theodore Nakashima","kind":"metric","value":5.2}]},
        {"claim":"dispersion:formation","refs":[
           {"ref":"formation.Marcus Ellingsworth","kind":"metric","value":2.8},
           {"ref":"formation.Priscilla Vandermeer","kind":"metric","value":6.1},
           {"ref":"formation.Theodore Nakashima","kind":"metric","value":4.4}]},
        {"claim":"blind_spot:guest","refs":[{"ref":"guest.belief","kind":"metric","value":5}]}
      ]}'::jsonb -> 'evidence_trail') as entry,
        jsonb_array_elements(entry -> 'refs') as r
   where r::text like '%Marcus Ellingsworth%'
      or r::text like '%Priscilla Vandermeer%'
      or r::text like '%Theodore Nakashima%'),
  6::bigint,
  'positive control: the crafted fixture carries respondent-named refs in evidence_trail before stripping');

select is(
  (select count(*)
   from (
     select strip_respondents(
       '{"overall_score":58,"evidence_trail":[
          {"claim":"primary_constraint:guest","refs":[{"ref":"G1","kind":"item","value":33}]},
          {"claim":"dispersion:guest","refs":[
             {"ref":"guest.Marcus Ellingsworth","kind":"metric","value":3.1},
             {"ref":"guest.Priscilla Vandermeer","kind":"metric","value":7.4},
             {"ref":"guest.Theodore Nakashima","kind":"metric","value":5.2}]},
          {"claim":"dispersion:formation","refs":[
             {"ref":"formation.Marcus Ellingsworth","kind":"metric","value":2.8},
             {"ref":"formation.Priscilla Vandermeer","kind":"metric","value":6.1},
             {"ref":"formation.Theodore Nakashima","kind":"metric","value":4.4}]},
          {"claim":"blind_spot:guest","refs":[{"ref":"guest.belief","kind":"metric","value":5}]}
        ]}'::jsonb) as stripped
   ) s, jsonb_array_elements(stripped -> 'evidence_trail') as entry,
        jsonb_array_elements(entry -> 'refs') as r
   where r::text like '%Marcus Ellingsworth%'
      or r::text like '%Priscilla Vandermeer%'
      or r::text like '%Theodore Nakashima%'),
  0::bigint,
  'strip_respondents removes all three respondent needles from the crafted evidence_trail');

-- ── the partial unique index ───────────────────────────────────────────────
select has_index('public', 'report_shares', 'report_shares_one_active_per_run',
                 'report_shares_one_active_per_run index exists');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('16161616-1616-1616-1616-161616161616','authenticated','authenticated','admin16@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"16161616-1616-1616-1616-161616161616","email":"admin16@test.com","role":"authenticated"}';
select create_church_with_admin('Strip Test Church', '#161616', '0.1.0');
reset role;

insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
select 'd0000000-0000-0000-0000-000000000001',
       (select id from assessment_runs where church_id = (select id from churches where name = 'Strip Test Church')),
       (select id from churches where name = 'Strip Test Church'),
       '16161616-1616-1616-1616-161616161616', false, now() + interval '30 days';

select throws_ok(
  $$insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
    select 'd0000000-0000-0000-0000-000000000002',
           (select id from assessment_runs where church_id = (select id from churches where name = 'Strip Test Church')),
           (select id from churches where name = 'Strip Test Church'),
           '16161616-1616-1616-1616-161616161616', false, now() + interval '30 days'$$,
  '23505',
  'duplicate key value violates unique constraint "report_shares_one_active_per_run"',
  'a second unrevoked share for the same run is rejected');

update report_shares set revoked = true where id = 'd0000000-0000-0000-0000-000000000001';

select lives_ok(
  $$insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
    select 'd0000000-0000-0000-0000-000000000003',
           (select id from assessment_runs where church_id = (select id from churches where name = 'Strip Test Church')),
           (select id from churches where name = 'Strip Test Church'),
           '16161616-1616-1616-1616-161616161616', false, now() + interval '30 days'$$,
  'a new unrevoked share is allowed once the previous one is revoked');

select * from finish();
rollback;
