begin;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('18181818-1818-1818-1818-181818181818','authenticated','authenticated','admin18@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
select create_church_with_admin('Shared Report Church', '#181818', '0.1.0');
reset role;

create temp table t_run as
select id from assessment_runs
where church_id = (select id from churches where name = 'Shared Report Church');
grant select on t_run to authenticated, anon;

-- A diagnosis whose payload genuinely CONTAINS respondent names. The whole point of the
-- SQL strip is that this is the real stored shape.
insert into diagnoses (run_id, response_hash, methodology_version, payload, prose, prose_source)
select (select id from t_run), 'hash18', '0.1.0',
  '{"overall_score":55,"dispersion_flags":[{"category_id":"guest_experience","spread":2.2,"respondents":[{"label":"Dana Okafor","mean":3.1}]}]}'::jsonb,
  '{"verdict":"v"}'::jsonb, 'fallback';

-- POSITIVE CONTROL: prove the detector fires against the unstripped stored row before any
-- zero-match assertion below is trusted.
select ok(
  (select payload::text from diagnoses where response_hash = 'hash18') like '%Dana Okafor%',
  'POSITIVE CONTROL: the stored payload really does contain a respondent name');

set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
create temp table t_token as select create_report_share((select id from t_run)) as token;
grant select on t_token to authenticated, anon;
reset role;

-- ── act as anon ────────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select valid from get_shared_report((select token from t_token))), true,
          'a live token is valid');

select is((select church_name from get_shared_report((select token from t_token))),
          'Shared Report Church', 'a live token exposes the church name');

select is((select brand_color from get_shared_report((select token from t_token))),
          '#181818', 'a live token exposes the brand color');

select is(
  (select payload -> 'dispersion_flags' -> 0 -> 'respondents' from get_shared_report((select token from t_token))),
  '[]'::jsonb,
  'the returned payload has its respondents stripped');

select ok(
  (select payload::text from get_shared_report((select token from t_token))) not like '%Dana Okafor%',
  'no respondent name survives anywhere in the returned payload');

select is(
  (select payload -> 'overall_score' from get_shared_report((select token from t_token))),
  '55'::jsonb,
  'the rest of the payload survives the strip');

-- ── uniform invalid ────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
select revoke_report_share((select id from t_run));
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select valid from get_shared_report((select token from t_token))), false,
          'a revoked token is invalid');

select is((select payload from get_shared_report((select token from t_token))), null,
          'a revoked token returns no payload');

select is((select valid from get_shared_report('e0000000-0000-0000-0000-000000000009')), false,
          'an unknown token is invalid');

select is(
  (select row(valid, payload, prose, church_name, brand_color)::text
     from get_shared_report((select token from t_token))),
  (select row(valid, payload, prose, church_name, brand_color)::text
     from get_shared_report('e0000000-0000-0000-0000-000000000009')),
  'revoked and unknown tokens return IDENTICAL rows — no oracle');

-- ── an EXPIRED token must be indistinguishable from revoked and unknown too ──
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"18181818-1818-1818-1818-181818181818","email":"admin18@test.com","role":"authenticated"}';
create temp table t_expired as select create_report_share((select id from t_run)) as token;
grant select on t_expired to authenticated, anon;
reset role;

update report_shares set expires_at = now() - interval '1 day'
where id = (select token from t_expired);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select row(valid, payload, prose, church_name, brand_color)::text
     from get_shared_report((select token from t_expired))),
  (select row(valid, payload, prose, church_name, brand_color)::text
     from get_shared_report('e0000000-0000-0000-0000-000000000009')),
  'expired and unknown tokens return IDENTICAL rows — no oracle');

select * from finish();
rollback;
