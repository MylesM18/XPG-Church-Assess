-- 24_outreach_reflection_test.sql
--
-- OWNER-APPLIED. The agent never runs `npm run test:db`. This suite is written
-- against the structure of migrations 20260807000100–20260807000600 and 22_/23_'s
-- conventions; it has NOT been executed here. Natalie runs it after applying the
-- migrations in order.
--
-- Covers: the responses.reflection CHECK bounds; submit_self_response trimming,
-- nullifying and rejecting reflections, and clearing text on re-answer; the three
-- member-facing RPCs returning reflection; and the shared RPC returning
-- methodology_version while never exposing reflection.
begin;
select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','refladmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','reflstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select create_church_with_admin('Outreach Reflection Church', '#f2994a', '0.1.0');
reset role;

-- ── (1) responses.reflection CHECK bounds ───────────────────────────────────
-- Direct inserts as superuser (RLS has no write policy for authenticated on
-- responses; see 01_/11_/22_'s precedent). respondent_kind='invited' with no
-- respondent_user_id sidesteps the responses_member_unique partial index
-- entirely, so these throwaway rows can't collide with anything below.
select lives_ok(
  $$insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label, reflection)
    values ((select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress'),
            (select id from churches where name = 'Outreach Reflection Church'),
            'guest', 'RB1', 5, 'invited', 'x', repeat('a', 1))$$,
  'reflection at the minimum length (1 char) is accepted');

select lives_ok(
  $$insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label, reflection)
    values ((select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress'),
            (select id from churches where name = 'Outreach Reflection Church'),
            'guest', 'RB2000', 5, 'invited', 'x', repeat('a', 2000))$$,
  'reflection at the maximum length (2000 chars) is accepted');

select throws_ok(
  $$insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label, reflection)
    values ((select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress'),
            (select id from churches where name = 'Outreach Reflection Church'),
            'guest', 'RB2001', 5, 'invited', 'x', repeat('a', 2001))$$,
  '23514',
  'new row for relation "responses" violates check constraint "responses_reflection_check"',
  'reflection at 2001 chars is rejected by the CHECK');

select lives_ok(
  $$insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label, reflection)
    values ((select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress'),
            (select id from churches where name = 'Outreach Reflection Church'),
            'guest', 'RBNULL', 5, 'invited', 'x', null)$$,
  'a NULL reflection is accepted (the column stays optional)');

-- ── (2) submit_self_response trims and nullifies whitespace-only text ──────
-- The CHECK above permits '   ' outright (it does not trim) -- only the RPC's
-- btrim/nullif guards against a stored reflection that is spaces-only.
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Outreach Reflection Church'), 'guest',
  '[{"item_id":"G6","value":7,"reflection":"  spaced  "}]'::jsonb);

reset role;
select is(
  (select reflection from responses
     where run_id = (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress')
       and item_id = 'G6' and respondent_user_id = 'd1111111-1111-1111-1111-111111111111'),
  'spaced',
  'submit trims surrounding whitespace from the reflection before storing it');

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Outreach Reflection Church'), 'guest',
  '[{"item_id":"G6","value":7,"reflection":"   "}]'::jsonb);

reset role;
select is(
  (select reflection from responses
     where run_id = (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress')
       and item_id = 'G6' and respondent_user_id = 'd1111111-1111-1111-1111-111111111111'),
  null::text,
  'a whitespace-only reflection is normalised to NULL, not stored as spaces');

-- ── (3) submit_self_response rejects an over-length reflection ─────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select public.submit_self_response(
      (select id from churches where name = 'Outreach Reflection Church'), 'guest',
      jsonb_build_array(jsonb_build_object('item_id','G6','value',7,'reflection',repeat('x',2001))))$$,
  'P0001',
  'reflection too long (max 2000 characters)',
  'submit rejects reflections over 2000 characters');

-- ── (4) re-answering without a reflection key clears the old text ──────────
-- value and reflection always travel together (still role=authenticated/d1111
-- from bullet 3 -- throws_ok's internal subtransaction rollback doesn't touch
-- the outer SET LOCAL role/claims).
select submit_self_response(
  (select id from churches where name = 'Outreach Reflection Church'), 'guest',
  '[{"item_id":"G6","value":7,"reflection":"first"}]'::jsonb);

select submit_self_response(
  (select id from churches where name = 'Outreach Reflection Church'), 'guest',
  '[{"item_id":"G6","value":4}]'::jsonb);

reset role;
select is(
  (select value from responses
     where run_id = (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress')
       and item_id = 'G6' and respondent_user_id = 'd1111111-1111-1111-1111-111111111111'),
  4,
  're-answer overwrites the value (4)');

select is(
  (select reflection from responses
     where run_id = (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress')
       and item_id = 'G6' and respondent_user_id = 'd1111111-1111-1111-1111-111111111111'),
  null::text,
  're-answering without a reflection key clears the previously stored text');

-- ── (5) a fresh answer with no reflection key stores NULL ──────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Outreach Reflection Church'), 'guest',
  '[{"item_id":"G7","value":5}]'::jsonb);

reset role;
select is(
  (select reflection from responses
     where run_id = (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') and status = 'in_progress')
       and item_id = 'G7' and respondent_user_id = 'd1111111-1111-1111-1111-111111111111'),
  null::text,
  'an absent reflection key on a fresh answer stores NULL');

-- ── (6) get_my_category_answers returns the caller's own reflection ────────
-- A bare re-submit (not an assertion -- plan(N) is unaffected) gives G7 a real,
-- non-null reflection first, so this proves the RPC round-trips populated text
-- (its actual production purpose: prefilling the member's own textarea), not
-- just that it can return NULL.
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'Outreach Reflection Church'), 'guest',
  '[{"item_id":"G7","value":5,"reflection":"grateful for the warm welcome we received"}]'::jsonb);

select is(
  (select reflection from get_my_category_answers(
     (select id from churches where name = 'Outreach Reflection Church'), 'guest')
   where item_id = 'G7'),
  'grateful for the warm welcome we received',
  'get_my_category_answers surfaces the caller''s own populated reflection text');

-- ── (7) get_run_responses / get_completed_run_responses return reflection ──
reset role;
-- ADR 0003: get_run_responses / get_completed_run_responses both resolve the church's CURRENT run
-- (current_run(), earliest by created_at, status-agnostic), so the reflection row is seeded on that
-- run — no second "complete" run is needed for the read RPCs to see it.
insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_user_id, respondent_label, reflection)
values (
  (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') order by created_at asc limit 1),
  (select id from churches where name = 'Outreach Reflection Church'),
  'guest', 'G1', 5, 'member', 'd1111111-1111-1111-1111-111111111111', 'Member',
  'wonderful welcome team'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"refladmin@test.com","role":"authenticated"}';
select is(
  (select reflection from get_run_responses(
     (select id from churches where name = 'Outreach Reflection Church')) where item_id = 'G6'),
  null::text,
  'get_run_responses returns the reflection column (NULL for an item last answered without one)');

select is(
  (select reflection from get_completed_run_responses(
     (select id from churches where name = 'Outreach Reflection Church')) where item_id = 'G1'),
  'wonderful welcome team',
  'get_completed_run_responses returns the stored reflection text');

-- ── (8) get_shared_run_responses returns methodology_version ───────────────
reset role;
insert into report_shares (id, run_id, church_id, created_by, revoked, expires_at)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  (select id from assessment_runs where church_id = (select id from churches where name = 'Outreach Reflection Church') order by created_at asc limit 1),
  (select id from churches where name = 'Outreach Reflection Church'),
  'd1111111-1111-1111-1111-111111111111',
  false,
  now() + interval '7 days'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(
  (select methodology_version from get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd') limit 1),
  '0.1.0',
  'get_shared_run_responses returns the run''s methodology_version');

-- ── (9) get_shared_run_responses has no reflection column ──────────────────
-- The structural proof that reflections cannot leak to the anon share surface:
-- the column isn't in the RETURNS TABLE at all, so referencing it is a parse
-- error (42703), not a permissions error. Still anon from bullet 8 above.
-- 2-arg (sqlstate only) is deliberate, not an omitted description: pgTAP's 3-arg
-- throws_ok dispatches on the byte length of the 2nd arg, and a 5-byte value like
-- '42703' routes into the branch where the 3rd arg becomes a REQUIRED exact
-- errmsg match against SQLERRM ('column "reflection" does not exist') rather than
-- a free-text description -- adding one back would silently break this assertion.
select throws_ok(
  $$select reflection from public.get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  '42703');

-- ── (10) grants are unchanged by the reflection migrations ─────────────────
-- anon cannot execute the three member-facing RPCs that now return reflection
-- (EXECUTE still revoked); assert SQLSTATE only, matching 11_/22_'s precedent.
-- Still anon from bullet 8/9 above.
select throws_ok(
  $$select * from public.get_my_category_answers(
      (select id from churches where name = 'Outreach Reflection Church'), 'guest')$$,
  '42501');

select throws_ok(
  $$select * from public.get_run_responses(
      (select id from churches where name = 'Outreach Reflection Church'))$$,
  '42501');

select throws_ok(
  $$select * from public.get_completed_run_responses(
      (select id from churches where name = 'Outreach Reflection Church'))$$,
  '42501');

-- anon CAN still execute get_shared_run_responses with a valid token
select lives_ok(
  $$select * from public.get_shared_run_responses('dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  'anon can still execute get_shared_run_responses with a live token');

select * from finish();
rollback;
