begin;
select plan(13);

-- admin + a viewer member + a stranger
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('c1000000-0000-0000-0000-000000000001','authenticated','authenticated','cadmin@test.com','x',now(),now()),
 ('c1000000-0000-0000-0000-000000000002','authenticated','authenticated','cviewer@test.com','x',now(),now()),
 ('c1000000-0000-0000-0000-000000000003','authenticated','authenticated','cstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Create Invite Church', '#c1c1c1', '0.1.0');
reset role;

-- seed a viewer member (superuser) so the already-member guard has a target
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Create Invite Church'),
        'c1000000-0000-0000-0000-000000000002', 'viewer',
        'c1000000-0000-0000-0000-000000000001');

-- admin creates a pending invite for a brand-new email
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'admin', 'NewCoAdmin@Test.com')$$,
  'admin can create a pending member invitation');

reset role;
select is(
  (select count(*)::int from member_invitations
   where church_id = (select id from churches where name = 'Create Invite Church')
     and invited_email = 'newcoadmin@test.com' and role = 'admin' and status = 'pending'
     and created_by = 'c1000000-0000-0000-0000-000000000001'
     and expires_at between now() + interval '13 days' and now() + interval '15 days'), 1,
  'invite is pending, email-normalized, 14-day expiry, created_by = caller');

-- a viewer cannot create
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000002","email":"cviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'viewer', 'x@test.com')$$,
  '42501', 'must be an admin of this church', 'a viewer cannot create an invitation');

-- a non-member cannot create
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000003","email":"cstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'viewer', 'x@test.com')$$,
  '42501', 'must be an admin of this church', 'a non-member cannot create an invitation');

-- already-member email rejected
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'viewer', 'cviewer@test.com')$$,
  'P0001', 'that person is already a member of this church', 'an existing member email is rejected');

-- invalid role rejected
select throws_ok(
  $$select create_member_invitation((select id from churches where name = 'Create Invite Church'), 'owner', 'y@test.com')$$,
  'P0001', 'role must be admin or viewer', 'an invalid role is rejected');

-- get_member_invitation_preview: seed one live invite with a known id
insert into member_invitations (id, church_id, role, invited_email, status, expires_at, created_by)
select 'c1aaaaaa-0000-0000-0000-000000000001',
       (select id from churches where name = 'Create Invite Church'),
       'viewer', 'previewee@test.com', 'pending', now() + interval '10 days',
       'c1000000-0000-0000-0000-000000000001';

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select church_name from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000001')),
          'Create Invite Church', 'anon may read the preview church name');
select is((select is_expired from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000001')),
          false, 'a live invite is not expired');
select is((select invited_email from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000001')),
          'previewee@test.com', 'preview exposes the invited email');
select is((select count(*)::int from get_member_invitation_preview('c1aaaaaa-0000-0000-0000-000000000009')),
          0, 'unknown token → zero rows');
reset role;

-- get_church_members: admin sees name/email/role/joined for every member
set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","email":"cadmin@test.com","role":"authenticated"}';
select is((select count(*)::int from get_church_members((select id from churches where name = 'Create Invite Church'))),
          2, 'admin sees both members (admin + seeded viewer)');
select is((select email from get_church_members((select id from churches where name = 'Create Invite Church'))
           where role = 'viewer'), 'cviewer@test.com', 'members list exposes the viewer email');

-- a viewer cannot list members
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000002","email":"cviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select get_church_members((select id from churches where name = 'Create Invite Church'))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot list members');
reset role;

select * from finish();
rollback;
