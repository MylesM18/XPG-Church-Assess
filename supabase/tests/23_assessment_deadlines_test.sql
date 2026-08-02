begin;
select plan(8);

-- Two users: a founder/admin and an invited viewer.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','dl_admin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','dl_invitee@test.com','x',now(),now());

-- Founder creates the church (untimed). Capture the church id for reuse.
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"dl_admin@test.com","role":"authenticated"}';
select create_church_with_admin('Deadline Church', '#abcabc', '0.1.0');

-- (1) Founder is untimed.
reset role;
select is(
  (select assessment_deadline_at from church_members cm
     join churches c on c.id = cm.church_id
   where c.name = 'Deadline Church' and cm.user_id = 'd1111111-1111-1111-1111-111111111111'),
  null::timestamptz,
  'founder has a null (untimed) deadline');

-- Founder invites the viewer; capture the returned token.
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"dl_admin@test.com","role":"authenticated"}';
create temporary table t_tok as
  select create_member_invitation(
    (select id from churches where name = 'Deadline Church'),
    'viewer', 'dl_invitee@test.com') as token;

-- Invited viewer accepts.
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"dl_invitee@test.com","role":"authenticated"}';
select accept_member_invitation((select token from t_tok));

-- (2) Accept stamped a non-null, ~3-day-out deadline.
reset role;
select isnt(
  (select assessment_deadline_at from church_members where user_id = 'd2222222-2222-2222-2222-222222222222'),
  null::timestamptz,
  'accept sets a completion deadline for the invited member');
select ok(
  (select assessment_deadline_at from church_members where user_id = 'd2222222-2222-2222-2222-222222222222')
    > now() + interval '2 days',
  'the stamped deadline is roughly 3 days out');

-- (3) A timed member past their deadline is locked out of submit; untimed founder is not.
update church_members set assessment_deadline_at = now() - interval '1 hour'
  where user_id = 'd2222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"dl_invitee@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Deadline Church'), 'guest',
      '[{"item_id":"G1","value":5}]'::jsonb)$$,
  'P0001',
  'your assessment window has closed; ask an admin to reopen it',
  'a timed member past deadline cannot submit');

set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"dl_admin@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Deadline Church'), 'guest',
      '[{"item_id":"G1","value":5}]'::jsonb)$$,
  'the untimed founder can still submit');

-- (4) extend_member_deadline: admin reopens the locked member; founder stays untimed (no-op).
select ok(
  (select extend_member_deadline(
     (select id from churches where name = 'Deadline Church'),
     'd2222222-2222-2222-2222-222222222222') > now() + interval '2 days'),
  'admin extend resets the member deadline ~3 days out');
select is(
  extend_member_deadline(
    (select id from churches where name = 'Deadline Church'),
    'd1111111-1111-1111-1111-111111111111'),
  null::timestamptz,
  'extend is a no-op on the untimed founder (stays null)');

-- (5) Invite-window guard: backdate the earliest invite; a new invite is refused.
reset role;
update member_invitations set created_at = now() - interval '4 days'
  where church_id = (select id from churches where name = 'Deadline Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"dl_admin@test.com","role":"authenticated"}';
select throws_ok(
  $$select create_member_invitation(
      (select id from churches where name = 'Deadline Church'), 'viewer', 'late@test.com')$$,
  'P0001',
  'your 3-day invitation window has closed',
  'no new invite after the 3-day invite window closes');

select * from finish();
rollback;
