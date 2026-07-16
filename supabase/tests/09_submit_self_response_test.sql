begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('a1111111-1111-1111-1111-111111111111','authenticated','authenticated','selfadmin@test.com','x',now(),now()),
 ('a2222222-2222-2222-2222-222222222222','authenticated','authenticated','selfstranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1111111-1111-1111-1111-111111111111","email":"selfadmin@test.com","role":"authenticated"}';
select create_church_with_admin('Self Test Church', '#aaaaaa', '0.1.0');

-- member answers the guest category
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Self Test Church'), 'guest',
      '[{"item_id":"G1","value":2},{"item_id":"G2","value":2},{"item_id":"G3","value":2},
        {"item_id":"G4","value":2},{"item_id":"G5","value":2}]'::jsonb)$$,
  'member submits self answers');

reset role;
select is((select count(*)::int from responses where respondent_kind = 'member'
           and respondent_user_id = 'a1111111-1111-1111-1111-111111111111'), 5,
          'five member response rows inserted');

-- re-answer overwrites (still 5 rows, new values)
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1111111-1111-1111-1111-111111111111","email":"selfadmin@test.com","role":"authenticated"}';
select lives_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Self Test Church'), 'guest',
      '[{"item_id":"G1","value":8},{"item_id":"G2","value":8},{"item_id":"G3","value":8},
        {"item_id":"G4","value":8},{"item_id":"G5","value":8}]'::jsonb)$$,
  're-answer runs (overwrite)');

reset role;
select is((select count(*)::int from responses where respondent_kind = 'member'
           and respondent_user_id = 'a1111111-1111-1111-1111-111111111111'), 5,
          'still exactly 5 rows after re-answer (overwrite, not append)');
select is((select value from responses where respondent_kind = 'member'
           and respondent_user_id = 'a1111111-1111-1111-1111-111111111111' and item_id = 'G1'), 8,
          'overwritten value is the latest (8)');

-- a non-member cannot self-answer that church
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2222222-2222-2222-2222-222222222222","email":"selfstranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select submit_self_response(
      (select id from churches where name = 'Self Test Church'), 'guest',
      '[{"item_id":"G1","value":1},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  '42501',
  'not a member of this church',
  'non-member cannot self-answer');

select * from finish();
rollback;
