begin;
select plan(9);

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
