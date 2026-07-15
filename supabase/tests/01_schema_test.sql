begin;
select plan(25);

-- all nine tables exist
select has_table('public','churches','churches exists');
select has_table('public','church_members','church_members exists');
select has_table('public','assessment_runs','assessment_runs exists');
select has_table('public','invitations','invitations exists');
select has_table('public','responses','responses exists');
select has_table('public','diagnoses','diagnoses exists');
select has_table('public','report_shares','report_shares exists');
select has_table('public','profiles','profiles exists');
select has_table('public','member_invitations','member_invitations exists');

-- key columns / not-null the RPCs and policies depend on
select col_not_null('public','churches','brand_color','churches.brand_color NOT NULL');
select col_not_null('public','assessment_runs','methodology_version','runs.methodology_version NOT NULL');
select col_not_null('public','responses','respondent_label','responses.respondent_label NOT NULL');

-- the constraints that ship in M2
select col_has_check('public','responses','value','responses.value has a CHECK (1..10)');
select col_has_check('public','church_members','role','church_members.role has a CHECK');
select col_has_check('public','member_invitations','role','member_invitations.role has a CHECK');

-- responses.value 1..10 actually enforced (the value-range half of the M2-boundary finding)
select throws_ok(
  $$insert into responses (run_id, church_id, category_id, item_id, value, respondent_kind, respondent_label)
    values (gen_random_uuid(), gen_random_uuid(), 'guest', 'G1', 11, 'invited', 'x')$$,
  '23514', 'new row for relation "responses" violates check constraint "responses_value_check"',
  'responses.value = 11 is rejected by the CHECK');

-- RLS enabled on every table (default-deny)
select is(relrowsecurity, true, 'churches RLS enabled')  from pg_class where oid = 'public.churches'::regclass;
select is(relrowsecurity, true, 'church_members RLS enabled') from pg_class where oid = 'public.church_members'::regclass;
select is(relrowsecurity, true, 'assessment_runs RLS enabled') from pg_class where oid = 'public.assessment_runs'::regclass;
select is(relrowsecurity, true, 'invitations RLS enabled') from pg_class where oid = 'public.invitations'::regclass;
select is(relrowsecurity, true, 'responses RLS enabled') from pg_class where oid = 'public.responses'::regclass;
select is(relrowsecurity, true, 'diagnoses RLS enabled') from pg_class where oid = 'public.diagnoses'::regclass;
select is(relrowsecurity, true, 'report_shares RLS enabled') from pg_class where oid = 'public.report_shares'::regclass;
select is(relrowsecurity, true, 'profiles RLS enabled') from pg_class where oid = 'public.profiles'::regclass;
select is(relrowsecurity, true, 'member_invitations RLS enabled') from pg_class where oid = 'public.member_invitations'::regclass;

select * from finish();
rollback;
