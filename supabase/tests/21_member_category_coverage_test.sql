begin;
select plan(7);

-- Three users: A (admin via create_church_with_admin), B (viewer member, seeded), C (stranger).
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','mccadmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','mccviewer@test.com','x',now(),now()),
 ('d3333333-3333-3333-3333-333333333333','authenticated','authenticated','mccstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"mccadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Matrix Test Church', '#cccccc', '0.1.0');

-- seed B as a viewer member (church_members has NO write policy → seed as superuser)
reset role;
insert into public.church_members (church_id, user_id, role)
select id, 'd2222222-2222-2222-2222-222222222222', 'viewer'
from churches where name = 'Matrix Test Church';

-- A answers all 5 guest items and 2 of the conn items
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"mccadmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Matrix Test Church'), 'guest',
  '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
    {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb);
select submit_self_response(
  (select id from churches where name = 'Matrix Test Church'), 'conn',
  '[{"item_id":"C1","value":2},{"item_id":"C2","value":2}]'::jsonb);

-- B answers 3 guest items
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"mccviewer@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Matrix Test Church'), 'guest',
  '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2}]'::jsonb);

-- As admin A: correct per-(member,category) counts
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"mccadmin@test.com","role":"authenticated"}';
select is(
  (select answered_count from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))
   where respondent_user_id = 'd1111111-1111-1111-1111-111111111111' and category_id = 'guest'),
  5, 'admin sees A guest = 5');
select is(
  (select answered_count from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))
   where respondent_user_id = 'd1111111-1111-1111-1111-111111111111' and category_id = 'conn'),
  2, 'admin sees A conn = 2 (partial)');
select is(
  (select answered_count from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))
   where respondent_user_id = 'd2222222-2222-2222-2222-222222222222' and category_id = 'guest'),
  3, 'admin sees B guest = 3');
select is(
  (select count(*)::int from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))),
  3, 'exactly three (member,category) rows: A guest, A conn, B guest');

-- B (viewer, non-admin) is rejected — stricter than the member-gated coverage RPCs
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"mccviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))$$,
  '42501', 'must be an admin of this church', 'non-admin member is rejected');

-- C (non-member) is rejected
set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333","email":"mccstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))$$,
  '42501', 'must be an admin of this church', 'non-member is rejected');

-- REGRESSION (completion-survives-diagnosis): after save_diagnosis completes the run, the admin
-- Member x Category matrix MUST survive. Pre-fix the status='in_progress' run-selection returned
-- empty once complete -> the matrix went blank. Complete the run and assert all three
-- (member,category) rows still come back to the admin.
reset role;
update assessment_runs set status = 'complete'
where church_id = (select id from churches where name = 'Matrix Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"mccadmin@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_member_category_coverage((select id from churches where name = 'Matrix Test Church'))),
  3, 'matrix still returns three (member,category) rows after the run is completed');

select * from finish();
rollback;
