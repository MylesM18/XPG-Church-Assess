begin;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('e1111111-1111-1111-1111-111111111111','authenticated','authenticated','proseadmin@test.com','x',now(),now()),
 ('e2222222-2222-2222-2222-222222222222','authenticated','authenticated','proseviewer@test.com','x',now(),now()),
 ('e3333333-3333-3333-3333-333333333333','authenticated','authenticated','prosestranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"proseadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Prose Test Church', '#cccccc', '0.1.0');
reset role;

-- seed a viewer member directly (superuser)
insert into church_members (church_id, user_id, role, granted_by)
values ((select id from churches where name = 'Prose Test Church'),
        'e2222222-2222-2222-2222-222222222222', 'viewer',
        'e1111111-1111-1111-1111-111111111111');

-- admin saves a diagnosis first: this creates the diagnoses row save_prose will UPDATE
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"proseadmin@test.com","role":"authenticated"}';
select save_diagnosis(
  (select id from churches where name = 'Prose Test Church'),
  'hash-prose', '0.1.0', '{"overall_score":50}'::jsonb);
reset role;

-- age the row so the generated_at bump is observable (now() is frozen within a txn)
update diagnoses set generated_at = '2000-01-01T00:00:00Z'
where response_hash = 'hash-prose';

-- 1. admin attaches prose
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"proseadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select save_prose((select id from churches where name = 'Prose Test Church'),
    'hash-prose', '{"verdict":"AI verdict","next_step":"AI next","benchmark_note":"AI bm"}'::jsonb, 'ai')$$,
  'admin can attach prose to an existing diagnosis');
reset role;

-- 2 & 3. the prose + source landed on the right row
select is((select prose->>'verdict' from diagnoses where response_hash = 'hash-prose'),
          'AI verdict', 'prose jsonb is stored');
select is((select prose_source from diagnoses where response_hash = 'hash-prose'),
          'ai', 'prose_source is recorded as ai');

-- 4. generated_at was bumped to now()
select ok((select generated_at from diagnoses where response_hash = 'hash-prose') > '2001-01-01T00:00:00Z',
          'generated_at is bumped to now()');

-- 5 & 6. idempotent: a second identical call still lives and leaves exactly one row
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"proseadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select save_prose((select id from churches where name = 'Prose Test Church'),
    'hash-prose', '{"verdict":"AI verdict","next_step":"AI next","benchmark_note":"AI bm"}'::jsonb, 'ai')$$,
  'a second identical save_prose is idempotent (no error)');
reset role;
select is((select count(*)::int from diagnoses where response_hash = 'hash-prose'), 1,
          'idempotent save_prose leaves exactly one row');

-- 7. a viewer cannot attach prose
set local role authenticated;
set local request.jwt.claims to '{"sub":"e2222222-2222-2222-2222-222222222222","email":"proseviewer@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_prose((select id from churches where name = 'Prose Test Church'),
    'hash-prose', '{}'::jsonb, 'ai')$$,
  '42501', 'must be an admin of this church', 'a viewer cannot attach prose');

-- 8. a non-member cannot attach prose
set local request.jwt.claims to '{"sub":"e3333333-3333-3333-3333-333333333333","email":"prosestranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_prose((select id from churches where name = 'Prose Test Church'),
    'hash-prose', '{}'::jsonb, 'ai')$$,
  '42501', 'must be an admin of this church', 'a non-member cannot attach prose');

-- 9. admin + bogus hash → 0-row guard raises
set local request.jwt.claims to '{"sub":"e1111111-1111-1111-1111-111111111111","email":"proseadmin@test.com","role":"authenticated"}';
select throws_ok(
  $$select save_prose((select id from churches where name = 'Prose Test Church'),
    'nonexistent-hash', '{}'::jsonb, 'ai')$$,
  'no diagnosis found to attach prose to',
  'a bogus response_hash is rejected by the 0-row guard');
reset role;

-- 10. anon cannot execute the function at all (revoked; assert SQLSTATE only)
set local role anon;
select throws_ok(
  $$select save_prose('00000000-0000-0000-0000-000000000000'::uuid,
    'hash-prose', '{}'::jsonb, 'ai')$$,
  '42501');
reset role;

select * from finish();
rollback;
