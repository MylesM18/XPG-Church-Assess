-- pgTAP for reopen_run (20260818000100_close_reopen_run.sql; ADR 0003).
--
-- OWNER-APPLIED: the agent never runs `npm run test:db` / `supabase test db`. Mirrors
-- 26_close_run_test.sql; NOT executed by the agent.
begin;
select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('27272727-2727-2727-2727-272727272727','authenticated','authenticated','reopenadmin@test.com','x',now(),now()),
 ('27272727-2727-2727-2727-272727272728','authenticated','authenticated','reopenviewer@test.com','x',now(),now()),
 ('27272727-2727-2727-2727-272727272729','authenticated','authenticated','reopenstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Reopen Run Church', '#272727', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Reopen Run Church'),
        '27272727-2727-2727-2727-272727272728', 'viewer',
        '27272727-2727-2727-2727-272727272727');

-- ── reopening an OPEN run raises ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  'run is not closed',
  'reopening an open run raises');

-- ── close it first (through close_run, the only production writer) ──────────
select lives_ok(
  $$select close_run((select id from churches where name = 'Reopen Run Church'))$$,
  'admin closes the run');
reset role;
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')), 'complete',
          'precondition: the run is closed');

-- ── admin gate ──────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272728","email":"reopenviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot reopen the run');

set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272729","email":"reopenstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  '42501', 'must be an admin of this church', 'a non-member cannot reopen the run');

reset role;
set local role anon;
select throws_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  '42501');

-- ── while closed, the member is refused ─────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272728","email":"reopenviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Reopen Run Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'run is complete; answers are read-only',
  'a member cannot answer while the run is closed');

-- ── admin reopens ───────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  'admin reopens the run');
reset role;

select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')), 'in_progress',
          'reopen sets status = in_progress');
select ok((select closed_at is null and closed_by is null and completed_at is null from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')),
          'reopen clears closed_at, closed_by and completed_at');

-- ── the member can answer again ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272728","email":"reopenviewer@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Reopen Run Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'a member can answer again after reopen');

-- ── coverage RPCs are unaffected by the round trip ──────────────────────────
select is((select count(*)::int from get_member_run_coverage(
            (select id from churches where name = 'Reopen Run Church'))), 5,
          'get_member_run_coverage returns the member''s 5 answered items after reopen');

-- ── old-path run (complete, closed_at null — closed by Generate before ADR 0003) reopens ──
reset role;
update assessment_runs set status = 'complete', completed_at = now(), closed_at = null, closed_by = null
where church_id = (select id from churches where name = 'Reopen Run Church');
set local role authenticated;
set local request.jwt.claims to '{"sub":"27272727-2727-2727-2727-272727272727","email":"reopenadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select reopen_run((select id from churches where name = 'Reopen Run Church'))$$,
  'an old-path complete run (closed_at null) can be reopened — the Test Church fix');
reset role;
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Reopen Run Church')), 'in_progress',
          'the old-path run is in_progress after reopen');

select * from finish();
rollback;
