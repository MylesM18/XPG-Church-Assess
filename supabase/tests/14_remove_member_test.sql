begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d4000000-0000-0000-0000-000000000001','authenticated','authenticated','radmin@test.com','x',now(),now()),
 ('d4000000-0000-0000-0000-000000000002','authenticated','authenticated','rviewer@test.com','x',now(),now()),
 ('d4000000-0000-0000-0000-000000000003','authenticated','authenticated','radmin2@test.com','x',now(),now()),
 ('d4000000-0000-0000-0000-000000000004','authenticated','authenticated','rstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000001","email":"radmin@test.com","role":"authenticated"}';
select create_church_with_admin('Remove Test Church', '#d4d4d4', '0.1.0');
reset role;

-- seed a viewer + a second admin (superuser)
insert into church_members (church_id, user_id, role, granted_by) values
 ((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002', 'viewer',  'd4000000-0000-0000-0000-000000000001'),
 ((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000003', 'admin',   'd4000000-0000-0000-0000-000000000001');

-- a viewer cannot remove
set local role authenticated;
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000002","email":"rviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002')$$,
  '42501', 'must be an admin of this church', 'a viewer cannot remove members');

-- a non-member cannot remove
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000004","email":"rstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002')$$,
  '42501', 'must be an admin of this church', 'a non-member cannot remove members');

-- admin removes the viewer → row gone
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000001","email":"radmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000002')$$,
  'admin removes a viewer');
reset role;
select is((select count(*)::int from church_members
           where church_id = (select id from churches where name = 'Remove Test Church')
             and user_id = 'd4000000-0000-0000-0000-000000000002'), 0,
          'viewer membership row is gone');

-- removing a non-member is a no-op (does not raise)
set local role authenticated;
set local request.jwt.claims to '{"sub":"d4000000-0000-0000-0000-000000000001","email":"radmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000004')$$,
  'removing a non-member is a no-op');

-- last-admin guard: remove admin2 first (two admins → allowed), then removing the last admin raises
select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select remove_member((select id from churches where name = 'Remove Test Church'), 'd4000000-0000-0000-0000-000000000001')$$,
  'P0001', 'cannot remove the last admin of this church', 'the last admin cannot be removed');
reset role;

select * from finish();
rollback;
