begin;
select plan(5);

-- One church, three users: A (admin via create_church_with_admin), B (seeded viewer), C (stranger).
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','myaadmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','myaviewer@test.com','x',now(),now()),
 ('d3333333-3333-3333-3333-333333333333','authenticated','authenticated','myastranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"myaadmin@test.com","role":"authenticated"}';
select create_church_with_admin('My Answers Test Church', '#dddddd', '0.1.0');

-- seed B as a viewer member (church_members has no write policy → seed as superuser)
reset role;
insert into public.church_members (church_id, user_id, role)
select id, 'd2222222-2222-2222-2222-222222222222', 'viewer'
from churches where name = 'My Answers Test Church';

-- A saves a PARTIAL set: 3 of the 5 guest items
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"myaadmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'My Answers Test Church'), 'guest',
  '[{"item_id":"G1","value":3},{"item_id":"G2","value":6},{"item_id":"G3","value":9}]'::jsonb);

-- A reads back own guest answers: exactly the 3 saved rows, correct value
select is(
  (select count(*)::int from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')),
  3, 'A reads back own 3 partial guest answers');
select is(
  (select value from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')
   where item_id = 'G2'),
  6, 'A own value for G2 is 6');

-- B (answered nothing) reads an EMPTY set — never A's answers (own-data isolation)
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"myaviewer@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')),
  0, 'B (no answers) reads empty, not A''s answers');

-- a non-member cannot read personal answers
set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333","email":"myastranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_my_category_answers((select id from churches where name = 'My Answers Test Church'), 'guest')$$,
  '42501',
  'not a member of this church',
  'non-member cannot read personal answers');

-- REGRESSION (completion-survives-diagnosis): save_diagnosis flips the church's single run
-- in_progress -> complete. Form-resume prefill MUST survive that. Pre-fix the run-selection filtered
-- status='in_progress', found no run once complete, and returned empty -> the "Take Again" answer
-- page prefilled BLANK despite the dashboard showing the category covered. Complete the run and
-- assert A still reads back own 3 guest answers.
reset role;
update assessment_runs set status = 'complete'
where church_id = (select id from churches where name = 'My Answers Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"myaadmin@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')),
  3, 'A still reads back own 3 guest answers after the run is completed');

select * from finish();
rollback;
