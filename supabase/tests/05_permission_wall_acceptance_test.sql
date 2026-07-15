begin;
select plan(21);

-- founder (member/admin), a stranger (logged-in non-member), and an invitee
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('66666666-6666-6666-6666-666666666666','authenticated','authenticated','founder@ac.com','x',now(),now()),
 ('77777777-7777-7777-7777-777777777777','authenticated','authenticated','stranger@ac.com','x',now(),now()),
 ('88888888-8888-8888-8888-888888888888','authenticated','authenticated','invitee@ac.com','x',now(),now());

-- founder creates a church (church + admin membership + run)
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","email":"founder@ac.com","role":"authenticated"}';
select create_church_with_admin('Acceptance Church', '#556677', '0.1.0');

-- seed a diagnosis, an invited invitation, invited responses, and a member_invitation (superuser)
reset role;
insert into diagnoses (run_id, response_hash, methodology_version, payload)
select id,'h','0.1.0','{}'::jsonb from assessment_runs
 where church_id = (select id from churches where name='Acceptance Church');
insert into invitations (run_id, church_id, category_id, created_by)
select r.id, r.church_id, 'guest', '66666666-6666-6666-6666-666666666666'
 from assessment_runs r where r.church_id = (select id from churches where name='Acceptance Church');
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label)
select r.id, r.church_id, 'guest', 'G1', 7, 'invited', 'Pastor'
 from assessment_runs r where r.church_id = (select id from churches where name='Acceptance Church');
-- explicit id: AC4/the invitee-accept step must reference this invitation while acting as
-- the stranger/invitee, and minv_select is admin-only, so a `where invited_email=...`
-- subquery run under either of those roles would be RLS-hidden and resolve to NULL
-- (accept_member_invitation(NULL) then fails with "invitation not found", masking the
-- actual email-match check under test) — a literal id sidesteps needing that SELECT.
insert into member_invitations (id, church_id, role, invited_email, expires_at, created_by)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        (select id from churches where name='Acceptance Church'), 'viewer', 'invitee@ac.com',
        now() + interval '7 days', '66666666-6666-6666-6666-666666666666');

-- ── AC1: logged-in NON-member reads nothing ─────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","email":"stranger@ac.com","role":"authenticated"}';
select is((select count(*)::int from churches),        0, 'AC1 non-member: no churches');
select is((select count(*)::int from assessment_runs), 0, 'AC1 non-member: no runs');
select is((select count(*)::int from diagnoses),       0, 'AC1 non-member: no diagnoses');
select is((select count(*)::int from invitations),     0, 'AC1 non-member: no invitations');
select is((select count(*)::int from responses),       0, 'AC1 non-member: no responses');
select is((select count(*)::int from member_invitations), 0, 'AC1 non-member: no member_invitations');

-- ── AC2: a signed-in user cannot self-insert a membership ───────────────
-- (stranger's church subquery returns NULL under RLS; probed on live PG17 the RLS 42501
--  fires before the not-null 23502, so this discriminates on the wall, not the constraint)
select throws_ok(
  $$insert into church_members (church_id, user_id, role)
    values ((select id from churches where name='Acceptance Church' limit 1),
            '77777777-7777-7777-7777-777777777777','admin')$$,
  '42501',
  'new row violates row-level security policy for table "church_members"',
  'AC2 no self-insert into church_members');

-- ── AC3: ANON can select nothing ────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from invitations),        0, 'AC3 anon: no invitations');
select is((select count(*)::int from member_invitations), 0, 'AC3 anon: no member_invitations');
select is((select count(*)::int from responses),          0, 'AC3 anon: no responses');
select is((select count(*)::int from churches),           0, 'AC3 anon: no churches');
select is((select count(*)::int from assessment_runs),    0, 'AC3 anon: no runs');
select is((select count(*)::int from diagnoses),          0, 'AC3 anon: no diagnoses');

-- ── AC4: accept_member_invitation email-match enforced ──────────────────
-- (positive path is covered in Task 4; here we prove the negative: mismatched sign-in cannot accept)
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","email":"stranger@ac.com","role":"authenticated"}';
select throws_ok(
  $$select accept_member_invitation('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'P0001',
  'signed-in email does not match the invited email',
  'AC4 mismatched sign-in cannot accept the invite');

-- ── minv_* backfill: member_invitations admin-gate (SELECT/INSERT/UPDATE) ─────────────────
-- the invitee@ac.com invitation is still 'pending' (AC4's failed accept rolled back via
-- savepoint), so the invitee can now accept it for real.

-- invitee accepts their own (still-pending) invite and becomes a non-admin (viewer) member
set local role authenticated;
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888","email":"invitee@ac.com","role":"authenticated"}';
select lives_ok(
  $$select accept_member_invitation('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'invitee accepts their viewer invite (becomes a non-admin member)');

-- viewer cannot read member_invitations (minv_select is admin-only)
select is((select count(*)::int from member_invitations), 0, 'minv viewer: cannot read invitations');

-- viewer cannot create an invitation (church_id resolves non-null since viewer sees own
-- church via churches_select — this is a clean RLS 42501 throw, not a not-null collision)
select throws_ok(
  $$insert into member_invitations (church_id, role, invited_email, expires_at, created_by)
    values ((select id from churches where name='Acceptance Church' limit 1),
            'viewer','forged@ac.com', now()+interval '7 days',
            '88888888-8888-8888-8888-888888888888')$$,
  '42501',
  'new row violates row-level security policy for table "member_invitations"',
  'minv viewer: cannot create an invitation');

-- switch to admin: founder can read own church's invitations
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","email":"founder@ac.com","role":"authenticated"}';
select is((select count(*)::int from member_invitations), 1, 'minv admin: reads own church invitations');

-- admin can create an invitation
select lives_ok(
  $$insert into member_invitations (church_id, role, invited_email, expires_at, created_by)
    values ((select id from churches where name='Acceptance Church' limit 1),
            'viewer','second@ac.com', now()+interval '7 days','66666666-6666-6666-6666-666666666666')$$,
  'minv admin: can create an invitation');

-- admin can revoke an invitation
select lives_ok(
  $$update member_invitations set status='revoked' where invited_email='second@ac.com'$$,
  'minv admin: can revoke an invitation');

select is((select status from member_invitations where invited_email='second@ac.com'), 'revoked',
          'minv admin: revoke persisted');

select * from finish();
rollback;
