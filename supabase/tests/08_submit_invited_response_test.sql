begin;
select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('99999999-9999-9999-9999-999999999999','authenticated','authenticated','admin9@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","email":"admin9@test.com","role":"authenticated"}';
select create_church_with_admin('Submit Test Church', '#999999', '0.1.0');
reset role;

-- a valid pending invitation for the guest category, known token
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000001',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() + interval '30 days';

-- act as anon; submit 5 answers
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select lives_ok(
  $$select submit_invited_response(
      'd0000000-0000-0000-0000-000000000001',
      'Deacon Dana',
      '[{"item_id":"G1","value":3},{"item_id":"G2","value":5},{"item_id":"G3","value":7},
        {"item_id":"G4","value":2},{"item_id":"G5","value":9}]'::jsonb)$$,
  'anon submits 5 answers for a valid token');

reset role;
select is((select count(*)::int from responses where respondent_kind = 'invited'
           and invitation_id = 'd0000000-0000-0000-0000-000000000001'), 5,
          'five invited response rows inserted');
select is((select respondent_label from responses
           where invitation_id = 'd0000000-0000-0000-0000-000000000001' limit 1),
          'Deacon Dana', 'typed respondent label stored');
select is((select status from invitations where id = 'd0000000-0000-0000-0000-000000000001'),
          'completed', 'invitation flipped to completed');

-- double-submit is rejected (already completed)
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000001', 'X',
      '[{"item_id":"G1","value":1},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  'P0001',
  'invitation is no longer pending',
  'double-submit rejected (single-use)');

-- expired token is rejected
reset role;
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000002',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() - interval '1 day';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000002', 'X',
      '[{"item_id":"G1","value":1},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  'P0001',
  'invitation has expired',
  'expired token rejected');

-- out-of-range value is rejected by the DB CHECK
reset role;
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000003',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() + interval '30 days';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000003', 'X',
      '[{"item_id":"G1","value":11},{"item_id":"G2","value":1},{"item_id":"G3","value":1},
        {"item_id":"G4","value":1},{"item_id":"G5","value":1}]'::jsonb)$$,
  '23514',
  'new row for relation "responses" violates check constraint "responses_value_check"',
  'out-of-range value rejected by DB CHECK');

-- empty answers payload is rejected by the bounds guard (plumbing bound, not methodology
-- validation -- that stays in lib/answers/validate.ts). This must run BEFORE the status
-- flip, so a bare empty-array call cannot silently burn the token.
reset role;
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'd0000000-0000-0000-0000-000000000004',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Submit Test Church'),
       'guest', 'pending', '99999999-9999-9999-9999-999999999999', now() + interval '30 days';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select submit_invited_response('d0000000-0000-0000-0000-000000000004', 'X', '[]'::jsonb)$$,
  'P0001',
  'invalid answer payload',
  'empty answers array rejected by bounds guard');

reset role;
select is((select status from invitations where id = 'd0000000-0000-0000-0000-000000000004'),
          'pending', 'invitation NOT burned after bounds-guard rejection (token untouched)');

select * from finish();
rollback;
