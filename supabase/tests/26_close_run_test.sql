-- pgTAP for close_run (20260818000100_close_reopen_run.sql; ADR 0003).
--
-- OWNER-APPLIED: the agent never runs `npm run test:db` / `supabase test db`. Written against the
-- seeding / identity-simulation pattern of 12_save_diagnosis_test.sql and
-- 17_report_share_manage_test.sql, NOT executed by the agent.
begin;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('26262626-2626-2626-2626-262626262626','authenticated','authenticated','closeadmin@test.com','x',now(),now()),
 ('26262626-2626-2626-2626-262626262627','authenticated','authenticated','closeviewer@test.com','x',now(),now()),
 ('26262626-2626-2626-2626-262626262628','authenticated','authenticated','closestranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262626","email":"closeadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Close Run Church', '#262626', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Close Run Church'),
        '26262626-2626-2626-2626-262626262627', 'viewer',
        '26262626-2626-2626-2626-262626262626');

-- ── precondition ────────────────────────────────────────────────────────────
select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')), 'in_progress',
          'precondition: create_church_with_admin seeds an in_progress run');

-- ── admin gate (require_church_admin) ───────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262627","email":"closeviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot close the run');

set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262628","email":"closestranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  '42501', 'must be an admin of this church', 'a non-member cannot close the run');

-- anon cannot execute the function at all (revoked); assert SQLSTATE only
reset role;
set local role anon;
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  '42501');

-- ── a member can answer while the run is open (precondition for the refusal below) ──
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262627","email":"closeviewer@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Close Run Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'a member can answer while the run is open');

-- ── admin closes ────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262626","email":"closeadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  'admin closes the run');
reset role;

select is((select status from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')), 'complete',
          'close sets status = complete');
select ok((select closed_at is not null and completed_at is not null from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')),
          'close stamps closed_at and completed_at');
select is((select closed_by from assessment_runs
           where church_id = (select id from churches where name = 'Close Run Church')),
          '26262626-2626-2626-2626-262626262626'::uuid,
          'closed_by is the closing admin');

-- ── double close raises ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262626","email":"closeadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select close_run((select id from churches where name = 'Close Run Church'))$$,
  'run is already closed',
  'closing an already-closed run raises');

-- ── Close means read-only: submit_self_response (untouched) refuses ─────────
set local request.jwt.claims to '{"sub":"26262626-2626-2626-2626-262626262627","email":"closeviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Close Run Church'), 'guest',
      '[{"item_id":"G1","value":9},{"item_id":"G2","value":9},{"item_id":"G3","value":9},
        {"item_id":"G4","value":9},{"item_id":"G5","value":9}]'::jsonb)$$,
  'run is complete; answers are read-only',
  'a member cannot answer once the run is closed');

-- ── coverage RPCs are unaffected by status ──────────────────────────────────
select is((select count(*)::int from get_member_run_coverage(
            (select id from churches where name = 'Close Run Church'))), 5,
          'get_member_run_coverage still returns the member''s 5 answered items after close');

select * from finish();
rollback;
