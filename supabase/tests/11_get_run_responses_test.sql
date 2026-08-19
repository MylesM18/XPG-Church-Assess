begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('c1111111-1111-1111-1111-111111111111','authenticated','authenticated','respadmin@test.com','x',now(),now()),
 ('c2222222-2222-2222-2222-222222222222','authenticated','authenticated','respstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Responses Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed three responses on the in_progress run (mirrors 10_get_run_coverage_test): guest
-- category, G1..G3 answered by one member respondent (no invitations table post-drop)
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
select (select id from assessment_runs
        where church_id = (select id from churches where name = 'Responses Test Church') and status = 'in_progress'),
       (select id from churches where name = 'Responses Test Church'),
       'guest', v.item, 5, 'member',
       'c1111111-1111-1111-1111-111111111111',
       'Someone'
from (values ('G1'),('G2'),('G3')) as v(item);

-- member reads the raw rows
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'member gets the run''s three raw response rows');
select is((select value from get_run_responses(
            (select id from churches where name = 'Responses Test Church')) where item_id = 'G1'), 5,
          'raw value for G1 is 5');
select is((select respondent_label from get_run_responses(
            (select id from churches where name = 'Responses Test Church')) where item_id = 'G1'), 'Someone',
          'raw respondent_label for G1 is preserved');
select is((select respondent_user_id from get_run_responses(
            (select id from churches where name = 'Responses Test Church')) where item_id = 'G1'),
          'c1111111-1111-1111-1111-111111111111'::uuid,
          'respondent_user_id is returned and matches the seeded member');

-- run-scoping: a second (complete) run's rows are excluded
reset role;
insert into assessment_runs (church_id, methodology_version, status, completed_at)
values ((select id from churches where name = 'Responses Test Church'), '0.1.0', 'complete', now());
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
values ((select id from assessment_runs
         where church_id = (select id from churches where name = 'Responses Test Church') and status = 'complete'),
        (select id from churches where name = 'Responses Test Church'),
        'conn', 'C1', 9, 'member',
        'c1111111-1111-1111-1111-111111111111',
        'Elder');
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'only the church''s CURRENT run''s rows are returned (a later run is excluded)');

-- a non-member cannot read
set local request.jwt.claims to '{"sub":"c2222222-2222-2222-2222-222222222222","email":"respstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_run_responses((select id from churches where name = 'Responses Test Church'))$$,
  '42501', 'not a member of this church', 'non-member cannot read raw responses');

-- anon cannot execute the function at all (revoked); assert SQLSTATE only
set local role anon;
select throws_ok(
  $$select * from get_run_responses((select id from churches where name = 'Responses Test Church'))$$,
  '42501');

-- ADR 0003: the run is resolved through current_run() (status-agnostic). Completing the church's
-- run must NOT hide its rows — Generate / Regenerate work after Close.
reset role;
update assessment_runs set status = 'complete', completed_at = now()
where church_id = (select id from churches where name = 'Responses Test Church') and status = 'in_progress';
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"respadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_responses(
            (select id from churches where name = 'Responses Test Church'))), 3,
          'returns rows when the run is complete (status-agnostic — ADR 0003)');

select * from finish();
rollback;
