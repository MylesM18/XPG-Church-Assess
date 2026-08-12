-- 25_reports_test.sql
--
-- OWNER-APPLIED. The agent never runs `npm run test:db`. This suite is written against the
-- structure of migrations 20260811000100_reports.sql and 20260811000200_rpc_save_report.sql; it
-- has NOT been executed here. Natalie runs it after applying the migrations in order.
--
-- Covers: the reports table (11 columns, jsonb column types, the (run_id,inputs_hash) unique
-- constraint proven behaviorally, the archetype and tier CHECK constraints), RLS enabled +
-- exactly one admin-only select policy, save_report's existence/security-definer status, its
-- execute grant (anon denied), that authenticated cannot insert into reports directly, and that
-- a non-admin member calling save_report is rejected.
begin;
select plan(28);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('e1111111-1111-1111-1111-111111111111','authenticated','authenticated','reportadmin@test.com','x',now(),now()),
 ('e2222222-2222-2222-2222-222222222222','authenticated','authenticated','reportviewer@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"reportadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Report Test Church', '#dddddd', '0.1.0');
reset role;

-- seed a viewer member directly (superuser) — church_members has no write policy
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Report Test Church'),
        'e2222222-2222-2222-2222-222222222222', 'viewer',
        'e1111111-1111-1111-1111-111111111111');

-- ── (1) has_table + has_column for all 11 columns ───────────────────────────────────────────
select has_table('public', 'reports', 'reports table exists');
select has_column('public', 'reports', 'id', 'reports.id exists');
select has_column('public', 'reports', 'run_id', 'reports.run_id exists');
select has_column('public', 'reports', 'church_id', 'reports.church_id exists');
select has_column('public', 'reports', 'inputs_hash', 'reports.inputs_hash exists');
select has_column('public', 'reports', 'methodology_version', 'reports.methodology_version exists');
select has_column('public', 'reports', 'archetype', 'reports.archetype exists');
select has_column('public', 'reports', 'tier', 'reports.tier exists');
select has_column('public', 'reports', 'facts', 'reports.facts exists');
select has_column('public', 'reports', 'sections', 'reports.sections exists');
select has_column('public', 'reports', 'section_sources', 'reports.section_sources exists');
select has_column('public', 'reports', 'generated_at', 'reports.generated_at exists');

-- ── (2) col_type_is on the three jsonb columns ──────────────────────────────────────────────
select col_type_is('public', 'reports', 'facts', 'jsonb', 'reports.facts is jsonb');
select col_type_is('public', 'reports', 'sections', 'jsonb', 'reports.sections is jsonb');
select col_type_is('public', 'reports', 'section_sources', 'jsonb', 'reports.section_sources is jsonb');

-- ── (3) unique (run_id, inputs_hash), proven behaviorally via double-save idempotence ───────
-- (precedent: 12_save_diagnosis_test.sql — save twice with the same hash, row count stays 1)
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"reportadmin@test.com","role":"authenticated"}';
select save_report(
  (select id from churches where name = 'Report Test Church'),
  'hash-report-1', '0.1.0',
  '{"archetype":"capacity","tier":"healthy_ready","facts":{"a":1},"sections":{"s2":"x"},"section_sources":{"s2":"ai"}}'::jsonb);
reset role;

select is((select count(*)::int from reports r
           join assessment_runs ar on ar.id = r.run_id
           where ar.church_id = (select id from churches where name = 'Report Test Church')), 1,
          'admin save inserts exactly one reports row');

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"reportadmin@test.com","role":"authenticated"}';
select save_report(
  (select id from churches where name = 'Report Test Church'),
  'hash-report-1', '0.1.0',
  '{"archetype":"capacity","tier":"healthy_ready","facts":{"a":1},"sections":{"s2":"x"},"section_sources":{"s2":"ai"}}'::jsonb);
reset role;

select is((select count(*)::int from reports r
           join assessment_runs ar on ar.id = r.run_id
           where ar.church_id = (select id from churches where name = 'Report Test Church')), 1,
          'a second identical save is idempotent — no duplicate row');

-- ── (4) archetype and tier CHECK constraints, proven by direct insert (bypassing the RPC) ───
-- Fake run_id/church_id via gen_random_uuid() — the CHECK fires before the FK is validated
-- (precedent: 01_schema_test.sql's responses.value CHECK test uses the same technique).
select throws_ok(
  $$insert into reports (run_id, church_id, inputs_hash, methodology_version, archetype, tier, facts, sections, section_sources)
    values (gen_random_uuid(), gen_random_uuid(), 'hash-bad-archetype', '0.1.0', 'nope', 'healthy_ready', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '23514', 'new row for relation "reports" violates check constraint "reports_archetype_check"',
  'reports.archetype = ''nope'' is rejected by the CHECK');

select throws_ok(
  $$insert into reports (run_id, church_id, inputs_hash, methodology_version, archetype, tier, facts, sections, section_sources)
    values (gen_random_uuid(), gen_random_uuid(), 'hash-bad-tier', '0.1.0', 'capacity', 'nope', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '23514', 'new row for relation "reports" violates check constraint "reports_tier_check"',
  'reports.tier = ''nope'' is rejected by the CHECK');

-- ── (5) RLS enabled (catalog fact, not row_security_active — session/role-dependent) ────────
select is(relrowsecurity, true, 'reports RLS enabled') from pg_class where oid = 'public.reports'::regclass;

-- ── (6) exactly one policy on reports, named reports_select, for select ─────────────────────
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'reports'), 1,
          'exactly one policy on reports');
select is((select policyname from pg_policies where schemaname = 'public' and tablename = 'reports'), 'reports_select',
          'the policy is named reports_select');
select is((select cmd from pg_policies where schemaname = 'public' and tablename = 'reports'), 'SELECT',
          'reports_select is a SELECT policy');

-- ── (7) has_function + security definer ──────────────────────────────────────────────────────
select has_function('public', 'save_report', ARRAY['uuid','text','text','jsonb'],
  'save_report(uuid,text,text,jsonb) exists');
select is((select prosecdef from pg_proc where oid = 'public.save_report(uuid,text,text,jsonb)'::regprocedure), true,
          'save_report is security definer');

-- ── (8) authenticated has execute; anon does not (proven behaviorally, precedent: ────────────
-- 24_outreach_reflection_test.sql item 10 — anon calling three RPCs, SQLSTATE-only throws_ok).
-- anon has no grant of its own; it only ever inherited execute via PUBLIC, so anon failing here
-- is proof the `revoke all ... from public, anon` line took effect for both.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.save_report(gen_random_uuid(), 'hash-anon', '0.1.0', '{}'::jsonb)$$,
  '42501');
reset role;

-- ── (9) authenticated has no insert privilege on reports (proven behaviorally: RLS default- ──
-- deny, no INSERT policy exists — precedent: 04_rls_policies_test.sql's church_members /
-- assessment_runs "no write policy" assertions, same exact SQLSTATE + message shape).
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"reportadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$insert into reports (run_id, church_id, inputs_hash, methodology_version, archetype, tier, facts, sections, section_sources)
    values ((select id from assessment_runs where church_id = (select id from churches where name = 'Report Test Church')),
            (select id from churches where name = 'Report Test Church'),
            'hash-direct-insert', '0.1.0', 'capacity', 'healthy_ready', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '42501', 'new row violates row-level security policy for table "reports"',
  'authenticated cannot insert into reports directly (save_report is the only way in)');
reset role;

-- ── (10) a non-admin member calling save_report raises insufficient_privilege ───────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"e2222222-2222-2222-2222-222222222222","email":"reportviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_report((select id from churches where name = 'Report Test Church'), 'hash-viewer', '0.1.0',
      '{"archetype":"capacity","tier":"healthy_ready"}'::jsonb)$$,
  '42501', 'must be an admin of this church', 'a non-admin member cannot save a report');
reset role;

select * from finish();
rollback;
