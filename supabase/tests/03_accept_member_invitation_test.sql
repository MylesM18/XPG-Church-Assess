begin;
select plan(6);

-- founder (admin) + invitee users
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','founder@test.com','x',now(),now()),
 ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','viewer@test.com','x',now(),now());

-- founder creates a church (seeds admin membership)
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","email":"founder@test.com","role":"authenticated"}';
select create_church_with_admin('Accept Test Church', '#333333', '0.1.0');
reset role;

-- an admin-created invitation for viewer@test.com (seeded as superuser; the invite-create
-- endpoint is M4 — here we only test the ACCEPT RPC)
insert into member_invitations (id, church_id, role, invited_email, expires_at, created_by)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       (select id from churches where name = 'Accept Test Church'),
       'viewer', 'viewer@test.com', now() + interval '7 days',
       '22222222-2222-2222-2222-222222222222';

-- wrong signed-in email is rejected (exact-match, not a bearer token)
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","email":"someone-else@test.com","role":"authenticated"}';
select throws_ok(
  $$select accept_member_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001',
  'signed-in email does not match the invited email',
  'accept rejects when auth.email() != invited_email');

-- correct email accepts
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","email":"viewer@test.com","role":"authenticated"}';
select lives_ok(
  $$select accept_member_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'accept succeeds for the invited email');

reset role;
select is((select count(*)::int from church_members
           where user_id = '33333333-3333-3333-3333-333333333333' and role = 'viewer'), 1,
          'viewer membership row inserted');
select is((select status from member_invitations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          'accepted', 'invitation marked accepted');
select is((select accepted_by from member_invitations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          '33333333-3333-3333-3333-333333333333'::uuid, 'accepted_by = auth.uid()');

-- re-accepting an already-accepted (non-pending) invite is rejected
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","email":"viewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select accept_member_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001',
  'invitation is no longer pending',
  'a non-pending invitation is rejected');

select * from finish();
rollback;
