begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('b1111111-1111-1111-1111-111111111111','authenticated','authenticated','covadmin@test.com','x',now(),now()),
 ('b2222222-2222-2222-2222-222222222222','authenticated','authenticated','covstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Coverage Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed responses directly (as superuser): guest category, G1..G3 answered by one member
-- respondent (post-invitations-drop: 'member' rows carry respondent_user_id, not invitation_id;
-- coalesce(respondent_user_id, invitation_id) in get_run_coverage counts them the same way)
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label)
select (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Coverage Test Church'),
       'guest', v.item, 5, 'member',
       'b1111111-1111-1111-1111-111111111111',
       'Someone'
from (values ('G1'),('G2'),('G3')) as v(item);

-- member reads aggregate coverage
set local role authenticated;
set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church'))), 3,
          'three answered items returned (G1,G2,G3)');
select is((select response_count from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church')) where item_id = 'G1'), 1,
          'per-item response_count is 1 for G1');
select is((select respondent_count from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church')) where item_id = 'G1'), 1,
          'per-category respondent_count is 1');

-- returns no raw values column (shape is aggregate-only): assert column set via a failing ref would be
-- overkill; instead assert an unanswered item is simply absent
select is((select count(*)::int from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church')) where item_id = 'G5'), 0,
          'unanswered item G5 is absent from the aggregate');

-- a non-member cannot read coverage
set local request.jwt.claims to '{"sub":"b2222222-2222-2222-2222-222222222222","email":"covstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_run_coverage((select id from churches where name = 'Coverage Test Church'))$$,
  '42501',
  'not a member of this church',
  'non-member cannot read coverage');

-- REGRESSION (completion-survives-diagnosis): save_diagnosis flips the church's single run
-- in_progress -> complete. Coverage MUST survive that. Pre-fix the run-selection filtered
-- status='in_progress', found no run once complete, and returned empty -> the dashboard showed
-- every category "Not started". Complete the run and assert the aggregate still returns G1..G3.
reset role;
update assessment_runs set status = 'complete'
where church_id = (select id from churches where name = 'Coverage Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111","email":"covadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_run_coverage(
            (select id from churches where name = 'Coverage Test Church'))), 3,
          'aggregate coverage still returns the 3 answered items after the run is completed');

select * from finish();
rollback;
