begin;
select plan(6);

-- Two members in ONE church: A (admin via create_church_with_admin) and B (viewer, seeded).
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('c1111111-1111-1111-1111-111111111111','authenticated','authenticated','covadmin@test.com','x',now(),now()),
 ('c2222222-2222-2222-2222-222222222222','authenticated','authenticated','covviewer@test.com','x',now(),now()),
 ('c3333333-3333-3333-3333-333333333333','authenticated','authenticated','covstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Coverage Test Church', '#cccccc', '0.1.0');

-- seed B as a viewer member (church_members has NO write policy → seed as superuser)
reset role;
insert into public.church_members (church_id, user_id, role)
select id, 'c2222222-2222-2222-2222-222222222222', 'viewer'
from churches where name = 'Coverage Test Church';

-- A answers one category (the 5 'guest' items)
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Coverage Test Church'), 'guest',
  '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
    {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb);

-- A's personal coverage: the 5 guest items appear, each with response_count = 1
select is(
  (select count(*)::int from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where category_id = 'guest'),
  5, 'A sees own 5 guest items in personal coverage');
select is(
  (select response_count from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where item_id = 'G1'),
  1, 'A personal response_count for G1 is 1');

-- B (answered nothing) sees an EMPTY personal coverage — NOT A's answers
set local request.jwt.claims to '{"sub":"c2222222-2222-2222-2222-222222222222","email":"covviewer@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))),
  0, 'B (no answers) sees empty personal coverage, not A''s');

-- Positive control / contrast: the AGGREGATE still shows the guest items to B
select is(
  (select count(*)::int from get_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where category_id = 'guest'),
  5, 'aggregate coverage still shows guest items to any member (contrast with personal)');

-- a non-member cannot read personal coverage
set local request.jwt.claims to '{"sub":"c3333333-3333-3333-3333-333333333333","email":"covstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_member_run_coverage((select id from churches where name = 'Coverage Test Church'))$$,
  '42501',
  'not a member of this church',
  'non-member cannot read personal coverage');

-- REGRESSION (completion-survives-diagnosis): after save_diagnosis completes the run, A's own
-- personal coverage MUST survive. Pre-fix the status='in_progress' run-selection returned empty
-- once the run was complete -> the viewer/admin card counters reset to zero. Complete the run and
-- assert A still sees own 5 guest items.
reset role;
update assessment_runs set status = 'complete'
where church_id = (select id from churches where name = 'Coverage Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_member_run_coverage(
     (select id from churches where name = 'Coverage Test Church'))
   where category_id = 'guest'),
  5, 'personal coverage still returns own 5 guest items after the run is completed');

select * from finish();
rollback;
