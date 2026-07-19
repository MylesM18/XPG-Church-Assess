begin;
select plan(17);

-- ── strip_respondents: pure function, tested against crafted payloads ──────
select is(
  strip_respondents('{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb)
    -> 'dispersion_flags' -> 0 -> 'respondents',
  '[]'::jsonb,
  'strip_respondents empties the respondents array');

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

-- Real fixture payload: diagnosis 2549974d-d898-4083-9836-bc29510fe564, run
-- f5451c2b-9646-4f30-b1d6-9f35c12c9367 (Redwood Chapel). Scoped by primary key AND
-- run_id together, so this can never become a multi-row subquery against the local
-- e2e fixtures. Proves the three respondent names actually present in the committed
-- fixture data are gone after strip_respondents, with a positive control proving the
-- same ref-level LIKE probe matches them beforehand.
select is(
  (select count(*)
   from diagnoses, jsonb_array_elements(payload -> 'evidence_trail') as entry,
        jsonb_array_elements(entry -> 'refs') as r
   where id = '2549974d-d898-4083-9836-bc29510fe564'
     and run_id = 'f5451c2b-9646-4f30-b1d6-9f35c12c9367'
     and (r::text like '%Marcus Ellingsworth%'
          or r::text like '%Priscilla Vandermeer%'
          or r::text like '%Theodore Nakashima%')),
  15::bigint,
  'positive control: the real fixture diagnosis carries respondent-named refs in evidence_trail before stripping');

select is(
  (select count(*)
   from (
     select strip_respondents(payload) as stripped from diagnoses
     where id = '2549974d-d898-4083-9836-bc29510fe564'
       and run_id = 'f5451c2b-9646-4f30-b1d6-9f35c12c9367'
   ) s, jsonb_array_elements(stripped -> 'evidence_trail') as entry,
        jsonb_array_elements(entry -> 'refs') as r
   where r::text like '%Marcus Ellingsworth%'
      or r::text like '%Priscilla Vandermeer%'
      or r::text like '%Theodore Nakashima%'),
  0::bigint,
  'strip_respondents removes all three respondent needles from the real fixture diagnosis evidence_trail');

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
