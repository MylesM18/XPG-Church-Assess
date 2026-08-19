begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','saveadmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','saveviewer@test.com','x',now(),now()),
 ('d3333333-3333-3333-3333-333333333333','authenticated','authenticated','savestranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Save Test Church', '#bbbbbb', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Save Test Church'),
        'd2222222-2222-2222-2222-222222222222', 'viewer',
        'd1111111-1111-1111-1111-111111111111');

-- admin saves a diagnosis
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Save Test Church'),
  'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;

select is((select count(*)::int from diagnoses d
           join assessment_runs r on r.id = d.run_id
           where r.church_id = (select id from churches where name = 'Save Test Church')), 1,
          'admin save inserts exactly one diagnoses row');
-- ADR 0003: save_diagnosis no longer writes run status. Closing is a separate admin action
-- (close_run, 20260818000100); Generate leaves the run exactly as it found it.
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')), 'in_progress',
          'save_diagnosis leaves the run in_progress (status is close_run''s job — ADR 0003)');
select ok((select completed_at is null from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')),
          'save_diagnosis leaves completed_at null');

-- idempotency: save again with the SAME hash → still one row
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Save Test Church'),
  'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;
select is((select count(*)::int from diagnoses d
           join assessment_runs r on r.id = d.run_id
           where r.church_id = (select id from churches where name = 'Save Test Church')), 1,
          'a second identical save is idempotent — no duplicate row');

-- a viewer cannot save
set local role authenticated;
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"saveviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-xyz', '0.1.0', '{}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a viewer cannot save a diagnosis');

-- a non-member cannot save
set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333","email":"savestranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-xyz', '0.1.0', '{}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a non-member cannot save a diagnosis');

-- ADR 0003: a manually-completed (closed) run STILL accepts save_diagnosis — Generate and
-- Regenerate work after Close — and the save does not touch the status.
reset role;
update assessment_runs set status = 'complete', completed_at = now()
where church_id = (select id from churches where name = 'Save Test Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-def', '0.1.0', '{"overall_score":60}'::jsonb)$$,
  'admin save on a closed (complete) run succeeds — Generate works after Close');
reset role;
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')), 'complete',
          'save_diagnosis does not touch the status of a closed run');

select * from finish();
rollback;
