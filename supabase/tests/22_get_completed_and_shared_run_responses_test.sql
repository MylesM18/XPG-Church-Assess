-- pgTAP for CT-2(c)'s two response-read RPCs (20260728000300 / 20260728000400).
--
-- OWNER-APPLIED: the agent never runs `npm run test:db` / `supabase test db`. This file was
-- written against the structure of 11_get_run_responses_test.sql (get_completed_run_responses is
-- the completed-run inverse of get_run_responses) and 18_get_shared_report_test.sql (the
-- token-validity contract), NOT executed here. Read it against those mirrors before applying.
begin;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','ccradmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','ccrstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"ccradmin@test.com","role":"authenticated"}';
select create_church_with_admin('Completed Responses Church', '#cccccc', '0.1.0');
reset role;

-- create_church_with_admin seeds only an in_progress run; add a COMPLETE run for this church.
-- ADR 0003: get_completed_run_responses resolves the run through current_run() — the EARLIEST run
-- by created_at, status-agnostic — so this complete run is back-dated to be the church's current run.
insert into assessment_runs (church_id, methodology_version, status, completed_at, created_at)
values ((select id from churches where name = 'Completed Responses Church'), '0.1.0', 'complete', now(), now() - interval '1 day');

-- seed three responses on the COMPLETE run (guest G1..G3), plus ONE on the in_progress run
-- (conn C1) that get_completed_run_responses must EXCLUDE — the inverse of test 11.
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
select (select id from assessment_runs
        where church_id = (select id from churches where name = 'Completed Responses Church') and status = 'complete'),
       (select id from churches where name = 'Completed Responses Church'),
       'guest', v.item, 5, 'member',
       'd1111111-1111-1111-1111-111111111111',
       'Someone'
from (values ('G1'),('G2'),('G3')) as v(item);

insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
values ((select id from assessment_runs
         where church_id = (select id from churches where name = 'Completed Responses Church') and status = 'in_progress'),
        (select id from churches where name = 'Completed Responses Church'),
        'conn', 'C1', 9, 'member',
        'd1111111-1111-1111-1111-111111111111',
        'Elder');

-- ── get_completed_run_responses ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"ccradmin@test.com","role":"authenticated"}';

select is((select count(*)::int from get_completed_run_responses(
            (select id from churches where name = 'Completed Responses Church'))), 3,
          'member gets the COMPLETE run''s three response rows');

select is((select respondent_user_id from get_completed_run_responses(
            (select id from churches where name = 'Completed Responses Church')) where item_id = 'G1'),
          'd1111111-1111-1111-1111-111111111111'::uuid,
          'respondent_user_id is returned and matches the seeded member');

select is((select count(*)::int from get_completed_run_responses(
            (select id from churches where name = 'Completed Responses Church')) where item_id = 'C1'), 0,
          'the later run''s rows are EXCLUDED (current_run = the earliest run)');

-- a non-member cannot read
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"ccrstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_completed_run_responses((select id from churches where name = 'Completed Responses Church'))$$,
  '42501', 'not a member of this church', 'non-member cannot read completed responses');

-- anon cannot execute the function at all (revoked); assert SQLSTATE only
set local role anon;
select throws_ok(
  $$select * from get_completed_run_responses((select id from churches where name = 'Completed Responses Church'))$$,
  '42501');

-- ── get_shared_run_responses ────────────────────────────────────────────────
reset role;
update churches set attendance_band = '100_249' where name = 'Completed Responses Church';

-- a valid share on the COMPLETE run (fixed id so anon can reference it)
insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        (select id from assessment_runs
         where church_id = (select id from churches where name = 'Completed Responses Church') and status = 'complete'),
        (select id from churches where name = 'Completed Responses Church'),
        'd1111111-1111-1111-1111-111111111111',
        false,
        now() + interval '7 days');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*)::int from get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')), 3,
          'anon with a live token gets the complete run''s response rows');

select is((select respondent_user_id from get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')
             where item_id = 'G1'),
          'd1111111-1111-1111-1111-111111111111'::uuid,
          'the REAL respondent_user_id is returned (opaque identity, not PII)');

select is((select respondent_label from get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')
             where item_id = 'G1'),
          '',
          'respondent_label is REDACTED to the empty string (Option B), not null');

select is((select attendance_band from get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')
             where item_id = 'G1'),
          '100_249',
          'attendance_band is denormalized onto each returned row');

-- a revoked share returns ZERO rows (no oracle, no raise)
reset role;
update report_shares set revoked = true where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')), 0,
          'a revoked share returns zero rows');

-- ── ADR 0003: status-agnostic — the same rows come back once the current run is in_progress ──
reset role;
update assessment_runs set status = 'in_progress', completed_at = null
where church_id = (select id from churches where name = 'Completed Responses Church')
  and status = 'complete';
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"ccradmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_completed_run_responses(
            (select id from churches where name = 'Completed Responses Church'))), 3,
          'returns rows when the current run is in_progress (status-agnostic — ADR 0003)');

select * from finish();
rollback;
