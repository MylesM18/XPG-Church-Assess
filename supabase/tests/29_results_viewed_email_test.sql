-- pgTAP for the results-viewed email claim / mark (20260915000100_results_viewed_email.sql; spec
-- docs/superpowers/specs/2026-09-15-results-viewed-email-design.md).
--
-- OWNER-APPLIED: the agent never runs `npm run test:db` / `supabase test db`. Written against the
-- seeding / identity-simulation pattern of 26_close_run_test.sql and the temp-table id pattern of
-- 17_report_share_manage_test.sql, NOT executed by the agent.
--
-- now() is the transaction start time for every statement in this file, so the 5-minute hold is
-- exercised by moving results_viewed_email_claimed_at back as the harness role, never by waiting.
begin;
select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('29292929-2929-2929-2929-292929292929','authenticated','authenticated','rvadmin@test.com','x',now(),now()),
 ('29292929-2929-2929-2929-29292929292a','authenticated','authenticated','rvviewer@test.com','x',now(),now()),
 ('29292929-2929-2929-2929-29292929292b','authenticated','authenticated','rvstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-292929292929","email":"rvadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Results Viewed Church', '#292929', '0.1.0');
reset role;

-- seed a viewer member directly (harness role)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Results Viewed Church'),
        '29292929-2929-2929-2929-29292929292a', 'viewer',
        '29292929-2929-2929-2929-292929292929');

-- The church id in a readable temp table: churches RLS hides the row from a non-member, so an inline
-- `(select id from churches ...)` argument would be NULL for the stranger and test "no run for this
-- church" instead of the admin gate.
create temp table t_rv_church as
select id from churches where name = 'Results Viewed Church';
grant select on t_rv_church to authenticated, anon;

-- ── precondition ────────────────────────────────────────────────────────────
select is((select status from assessment_runs where church_id = (select id from t_rv_church)),
          'in_progress', 'precondition: create_church_with_admin seeds an in_progress run');

-- ── an open run is never claimed ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-292929292929","email":"rvadmin@test.com","role":"authenticated"}';
select is(claim_results_viewed_email((select id from t_rv_church)), false,
          'an admin cannot claim while the run is open');
reset role;
select ok((select results_viewed_email_claimed_at is null from assessment_runs
           where church_id = (select id from t_rv_church)),
          'a refused claim stamps nothing');

-- ── admin gate (require_church_admin) ───────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-29292929292a","email":"rvviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select claim_results_viewed_email((select id from t_rv_church))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot claim');
select throws_ok(
  $$select mark_results_viewed_emailed((select id from t_rv_church))$$,
  '42501', 'must be an admin of this church', 'a viewer cannot mark');

set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-29292929292b","email":"rvstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select claim_results_viewed_email((select id from t_rv_church))$$,
  '42501', 'must be an admin of this church', 'a non-member cannot claim');

-- anon cannot execute either function (revoked); assert SQLSTATE only
reset role;
set local role anon;
select throws_ok($$select claim_results_viewed_email((select id from t_rv_church))$$, '42501');
select throws_ok($$select mark_results_viewed_emailed((select id from t_rv_church))$$, '42501');

-- ── close, then exactly one claim wins ──────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-292929292929","email":"rvadmin@test.com","role":"authenticated"}';
select lives_ok($$select close_run((select id from t_rv_church))$$, 'admin closes the run');
select is(claim_results_viewed_email((select id from t_rv_church)), true,
          'the first admin claim on a closed run wins');
select is(claim_results_viewed_email((select id from t_rv_church)), false,
          'a second claim inside the 5-minute hold loses');
reset role;
select ok((select results_viewed_email_claimed_at is not null and results_viewed_emailed_at is null
           from assessment_runs where church_id = (select id from t_rv_church)),
          'the claim is stamped and nothing is marked emailed yet');

-- ── a failed send leaves the run unmarked: after the hold it is claimable again ──
update assessment_runs set results_viewed_email_claimed_at = now() - interval '6 minutes'
where church_id = (select id from t_rv_church);
set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-292929292929","email":"rvadmin@test.com","role":"authenticated"}';
select is(claim_results_viewed_email((select id from t_rv_church)), true,
          'an unmarked claim older than 5 minutes is reclaimable');

-- ── mark ────────────────────────────────────────────────────────────────────
select lives_ok($$select mark_results_viewed_emailed((select id from t_rv_church))$$,
                'admin marks the email sent');
reset role;
select ok((select results_viewed_emailed_at is not null from assessment_runs
           where church_id = (select id from t_rv_church)),
          'mark stamps results_viewed_emailed_at');

-- a marked run is never claimed again, even with an old claim; a second mark changes nothing
update assessment_runs
set results_viewed_email_claimed_at = now() - interval '1 day',
    results_viewed_emailed_at = '2026-01-01T00:00:00Z'
where church_id = (select id from t_rv_church);
set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-292929292929","email":"rvadmin@test.com","role":"authenticated"}';
select is(claim_results_viewed_email((select id from t_rv_church)), false,
          'a run already emailed is never claimed again');
select lives_ok($$select mark_results_viewed_emailed((select id from t_rv_church))$$,
                'marking again is harmless');
reset role;
select is((select results_viewed_emailed_at from assessment_runs
           where church_id = (select id from t_rv_church)),
          '2026-01-01T00:00:00Z'::timestamptz,
          'mark never overwrites an existing emailed time');

-- ── reopen then close does not re-arm the email ─────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"29292929-2929-2929-2929-292929292929","email":"rvadmin@test.com","role":"authenticated"}';
select lives_ok($$select reopen_run((select id from t_rv_church))$$, 'admin reopens the run');
select lives_ok($$select close_run((select id from t_rv_church))$$, 'admin closes it again');
select is(claim_results_viewed_email((select id from t_rv_church)), false,
          'reopening and closing again never re-arms the email');
reset role;

select * from finish();
rollback;
