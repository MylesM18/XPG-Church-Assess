begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('88888888-8888-8888-8888-888888888888','authenticated','authenticated','admin8@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888","email":"admin8@test.com","role":"authenticated"}';
select create_church_with_admin('Context Test Church', '#888888', '0.1.0');
reset role;

-- seed three invitations with known ids: valid, expired, completed
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'c0000000-0000-0000-0000-000000000001',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Context Test Church'),
       'conn', 'pending', '88888888-8888-8888-8888-888888888888', now() + interval '30 days';
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'c0000000-0000-0000-0000-000000000002',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Context Test Church'),
       'conn', 'pending', '88888888-8888-8888-8888-888888888888', now() - interval '1 day';
insert into invitations (id, run_id, church_id, category_id, status, created_by, expires_at)
select 'c0000000-0000-0000-0000-000000000003',
       (select id from assessment_runs where status = 'in_progress'),
       (select id from churches where name = 'Context Test Church'),
       'conn', 'completed', '88888888-8888-8888-8888-888888888888', now() + interval '30 days';

-- act as anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000001')), true,
          'valid pending unexpired token → valid = true');
select is((select category_id from get_invitation_context('c0000000-0000-0000-0000-000000000001')), 'conn',
          'valid token exposes category_id');
select is((select church_name from get_invitation_context('c0000000-0000-0000-0000-000000000001')),
          'Context Test Church', 'valid token exposes church name');

select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000002')), false,
          'expired token → valid = false');
select is((select category_id from get_invitation_context('c0000000-0000-0000-0000-000000000002')), null,
          'expired token leaks no category_id');
select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000003')), false,
          'completed token → valid = false');
select is((select valid from get_invitation_context('c0000000-0000-0000-0000-000000000009')), false,
          'unknown token → valid = false (uniform invalid, no oracle)');
select is((select church_name from get_invitation_context('c0000000-0000-0000-0000-000000000009')), null,
          'unknown token leaks no church name');

select * from finish();
rollback;
