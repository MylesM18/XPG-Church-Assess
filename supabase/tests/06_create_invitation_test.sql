begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('66666666-6666-6666-6666-666666666666','authenticated','authenticated','admin6@test.com','x',now(),now()),
 ('77777777-7777-7777-7777-777777777777','authenticated','authenticated','stranger6@test.com','x',now(),now());

-- admin creates a church (seeds admin membership + in_progress run)
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","email":"admin6@test.com","role":"authenticated"}';
select create_church_with_admin('Invite Test Church', '#666666', '0.1.0');

-- admin can create an invitation for a category
select lives_ok(
  $$select create_invitation(
      (select id from churches where name = 'Invite Test Church'),
      'guest', 'Pastor Pat', 'pat@example.com', 'email')$$,
  'admin creates an invitation for the guest category');

-- NOTE: every assertion below is scoped to this test's own church. The subqueries
-- must not be scoped by category_id alone: any committed invitation row (e.g. the
-- local e2e fixtures) would make them return more than one row and abort the file.
reset role;
select is((select count(*)::int from invitations
            where church_id = (select id from churches where name = 'Invite Test Church')
              and category_id = 'guest' and status = 'pending'), 1,
          'one pending invitation row created');
select is((select run_id from invitations
            where church_id = (select id from churches where name = 'Invite Test Church')
              and category_id = 'guest')
          = (select id from assessment_runs
              where church_id = (select id from churches where name = 'Invite Test Church')
                and status = 'in_progress'), true,
          'invitation attached to the church active run');
select is((select created_by from invitations
            where church_id = (select id from churches where name = 'Invite Test Church')
              and category_id = 'guest'),
          '66666666-6666-6666-6666-666666666666'::uuid, 'created_by = auth.uid()');

-- a non-admin (stranger) cannot create an invitation for that church
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","email":"stranger6@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_invitation(
      (select id from churches where name = 'Invite Test Church'),
      'guest', 'X', 'x@example.com', 'email')$$,
  '42501',
  'not an admin of this church',
  'non-admin cannot create an invitation');

-- unauthenticated caller rejected
set local request.jwt.claims to '{"role":"authenticated"}';
select throws_ok(
  $$select create_invitation(
      (select id from churches where name = 'Invite Test Church'),
      'guest', 'X', 'x@example.com', 'email')$$,
  '42501',
  'not authenticated',
  'unauthenticated create is rejected');

select * from finish();
rollback;
