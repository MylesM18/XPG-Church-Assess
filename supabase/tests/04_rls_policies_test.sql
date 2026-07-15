begin;
select plan(12);

-- two users: a member (admin) and a non-member
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','member@test.com','x',now(),now()),
 ('55555555-5555-5555-5555-555555555555','authenticated','authenticated','stranger@test.com','x',now(),now());

-- member creates a church (seeds church + admin membership + run)
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select create_church_with_admin('RLS Test Church', '#444444', '0.1.0');

-- seed a diagnosis for the run (as superuser — the diagnosis writer is M5)
reset role;
insert into diagnoses (run_id, response_hash, methodology_version, payload)
select id, 'hash1', '0.1.0', '{"ok":true}'::jsonb from assessment_runs
 where church_id = (select id from churches where name = 'RLS Test Church');

-- MEMBER can read own church, run, diagnosis
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select is((select count(*)::int from churches where name = 'RLS Test Church'), 1, 'member selects own church');
select is((select count(*)::int from assessment_runs), 1, 'member selects own run');
select is((select count(*)::int from diagnoses), 1, 'member selects own diagnosis');
select is((select count(*)::int from church_members), 1, 'member sees own membership row');

-- member CANNOT self-insert another membership row (no write policy on church_members)
select throws_ok(
  $$insert into church_members (church_id, user_id, role)
    values ((select id from churches where name = 'RLS Test Church'),
            '44444444-4444-4444-4444-444444444444', 'admin')$$,
  '42501', 'new row violates row-level security policy for table "church_members"',
  'member cannot self-insert a church_members row');

-- member CANNOT insert a run (no write policy on assessment_runs)
select throws_ok(
  $$insert into assessment_runs (church_id, methodology_version)
    values ((select id from churches where name = 'RLS Test Church'), '0.1.0')$$,
  '42501', 'new row violates row-level security policy for table "assessment_runs"',
  'member cannot insert an assessment_run');

-- NON-MEMBER sees nothing
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","email":"stranger@test.com","role":"authenticated"}';
select is((select count(*)::int from churches), 0, 'non-member selects no church');
select is((select count(*)::int from assessment_runs), 0, 'non-member selects no run');
select is((select count(*)::int from diagnoses), 0, 'non-member selects no diagnosis');
select is((select count(*)::int from church_members), 0, 'non-member selects no membership');

-- profiles own-row: each user sees only their own auto-created profile row
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","email":"member@test.com","role":"authenticated"}';
select is((select count(*)::int from profiles), 1, 'member sees exactly their own profile');
select is((select id from profiles), '44444444-4444-4444-4444-444444444444'::uuid, 'and it is their row');

select * from finish();
rollback;
