begin;
select plan(7);

-- a fake authenticated user
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','founder@test.com','x', now(), now());

-- act AS that user (SECURITY DEFINER function still reads auth.uid() from the GUC)
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","email":"founder@test.com","role":"authenticated"}';

select lives_ok(
  $$select create_church_with_admin('Cornerstone Community Church', '#2E5D5B', '0.1.0')$$,
  'create_church_with_admin runs for an authenticated user');

-- reset to superuser to inspect the rows the SECURITY DEFINER function wrote
reset role;

select is((select count(*)::int from churches where name = 'Cornerstone Community Church'), 1, 'one church row created');
select is((select count(*)::int from church_members
           where user_id = '11111111-1111-1111-1111-111111111111' and role = 'admin'), 1,
          'creator is the admin member');
select is((select count(*)::int from assessment_runs
           where status = 'in_progress' and methodology_version = '0.1.0'), 1,
          'first in_progress run seeded with the passed methodology_version');
select is((select brand_color from churches where name = 'Cornerstone Community Church'), '#2E5D5B',
          'brand_color stored on the church');
select is((select created_by from churches where name = 'Cornerstone Community Church'),
          '11111111-1111-1111-1111-111111111111'::uuid, 'created_by = auth.uid()');

-- anonymous / unauthenticated caller is rejected
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';   -- no sub → auth.uid() is null
select throws_ok(
  $$select create_church_with_admin('No Auth Church', '#000000', '0.1.0')$$,
  '42501',
  'not authenticated',
  'unauthenticated create is rejected (auth.uid() null)');

select * from finish();
rollback;
