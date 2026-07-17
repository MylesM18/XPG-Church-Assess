begin;
select plan(7);

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
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')), 'complete',
          'the run is flipped to complete');
select ok((select completed_at is not null from assessment_runs
           where church_id = (select id from churches where name = 'Save Test Church')),
          'completed_at is set');

-- idempotency: re-open the run, save again with the SAME hash → still one row
update assessment_runs set status = 'in_progress', completed_at = null
where church_id = (select id from churches where name = 'Save Test Church');
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

-- no active run → raise (the run is complete again after the idempotent save above)
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"saveadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_diagnosis((select id from churches where name = 'Save Test Church'), 'hash-abc', '0.1.0', '{"overall_score":50}'::jsonb)$$,
  'no active run for this church',
  'admin save with no in_progress run is rejected');

select * from finish();
rollback;
