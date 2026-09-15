begin;
select plan(15);

-- founder (admin), an invitee whose account the app provisioned, a legacy invitee (invited
-- before the binding column existed), and a stranger.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('e1000000-0000-0000-0000-000000000001','authenticated','authenticated','founder@bind.com','x',now(),now()),
 ('e1000000-0000-0000-0000-000000000002','authenticated','authenticated','Invitee@Bind.com','x',now(),now()),
 ('e1000000-0000-0000-0000-000000000003','authenticated','authenticated','legacy@bind.com','x',now(),now()),
 ('e1000000-0000-0000-0000-000000000004','authenticated','authenticated','stranger@bind.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000001","email":"founder@bind.com","role":"authenticated"}';
select create_church_with_admin('Binding Church', '#123456', '0.1.0');
reset role;

-- (1) schema: the binding column exists and is nullable
select has_column('public', 'member_invitations', 'invited_user_id', 'member_invitations.invited_user_id exists');

-- an admin-created invitation for the provisioned invitee (lower-cased, as create_member_invitation stores it)
insert into member_invitations (id, church_id, role, invited_email, expires_at, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        (select id from churches where name = 'Binding Church'),
        'viewer', 'invitee@bind.com', now() + interval '14 days',
        'e1000000-0000-0000-0000-000000000001');

-- (2) authenticated callers cannot bind — service role only
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000001","email":"founder@bind.com","role":"authenticated"}';
select throws_ok(
  $$select bind_invited_member('bbbbbbbb-0000-0000-0000-000000000001')$$,
  '42501',
  'permission denied for function bind_invited_member',
  'bind_invited_member is not executable by authenticated');
reset role;

-- (3) service role binds: membership row, deadline NULL, invited_user_id recorded, case-insensitive email
set local role service_role;
select is(
  bind_invited_member('bbbbbbbb-0000-0000-0000-000000000001'),
  'e1000000-0000-0000-0000-000000000002'::uuid,
  'bind resolves the invitee by e-mail, case-insensitively');
reset role;
select is((select count(*)::int from church_members
           where user_id = 'e1000000-0000-0000-0000-000000000002' and role = 'viewer'), 1,
          'binding inserts the viewer membership at invite time');
select is((select assessment_deadline_at from church_members
           where user_id = 'e1000000-0000-0000-0000-000000000002'), null,
          'binding leaves the completion clock unset');
select is((select invited_user_id from member_invitations where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'e1000000-0000-0000-0000-000000000002'::uuid, 'invitation records invited_user_id');
select is((select status from member_invitations where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'pending', 'binding does not accept — that happens at first sign-in');

-- (4) binding an invitation whose address has no account is refused
insert into member_invitations (id, church_id, role, invited_email, expires_at, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000009',
        (select id from churches where name = 'Binding Church'),
        'viewer', 'nobody@bind.com', now() + interval '14 days',
        'e1000000-0000-0000-0000-000000000001');
set local role service_role;
select throws_ok(
  $$select bind_invited_member('bbbbbbbb-0000-0000-0000-000000000009')$$,
  'P0001',
  'no account exists for the invited email',
  'bind refuses when the account has not been provisioned');
reset role;

-- (5) first sign-in settles: accepted + clock stamped ~3 days out; idempotent
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000002","email":"Invitee@Bind.com","role":"authenticated"}';
select is(settle_my_invitations(), 1, 'settle accepts the bound invitation');
select is(settle_my_invitations(), 0, 'settle is idempotent');
reset role;
select is((select status from member_invitations where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'accepted', 'settled invitation is accepted');
select ok((select assessment_deadline_at from church_members
           where user_id = 'e1000000-0000-0000-0000-000000000002')
          between now() + interval '2 days 23 hours' and now() + interval '3 days 1 hour',
          'settle stamps the 3-day completion clock');

-- (6) legacy invitation (no invited_user_id) is bound + accepted by e-mail match on sign-in
insert into member_invitations (id, church_id, role, invited_email, expires_at, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000002',
        (select id from churches where name = 'Binding Church'),
        'admin', 'legacy@bind.com', now() + interval '14 days',
        'e1000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000003","email":"legacy@bind.com","role":"authenticated"}';
select is(settle_my_invitations(), 1, 'a legacy pending invitation settles by e-mail match');
reset role;
select is((select role from church_members where user_id = 'e1000000-0000-0000-0000-000000000003'),
          'admin', 'legacy settle inserts the membership with the invited role');

-- (7) a stranger with no invitation settles nothing and gains nothing
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000004","email":"stranger@bind.com","role":"authenticated"}';
select is(settle_my_invitations(), 0, 'no invitation, nothing settled');
reset role;

select * from finish();
rollback;
