begin;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('17171717-1717-1717-1717-171717171717','authenticated','authenticated','admin17@test.com','x',now(),now()),
 ('17171717-1717-1717-1717-171717171718','authenticated','authenticated','viewer17@test.com','x',now(),now()),
 ('17171717-1717-1717-1717-171717171719','authenticated','authenticated','outsider17@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';
select create_church_with_admin('Share Manage Church', '#171717', '0.1.0');
reset role;

insert into church_members (church_id, user_id, role)
select (select id from churches where name = 'Share Manage Church'),
       '17171717-1717-1717-1717-171717171718', 'viewer';

create temp table t_run as
select id from assessment_runs
where church_id = (select id from churches where name = 'Share Manage Church');
grant select on t_run to authenticated, anon;

-- ── admin can mint ─────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

create temp table t_first as select create_report_share((select id from t_run)) as token;
grant select on t_first to authenticated, anon;

select isnt((select token from t_first), null, 'admin mint returns a token');

select is(create_report_share((select id from t_run)), (select token from t_first),
          'minting twice returns the same live token');

-- report_shares has RLS enabled with zero policies (only the SECURITY DEFINER RPCs bypass
-- it as table owner); a direct read as `authenticated` sees zero rows, not an error. Drop
-- to the harness role (table owner) around the direct read, then restore the admin identity.
reset role;
select ok(
  (select expires_at from report_shares where id = (select token from t_first))
    between now() + interval '29 days' and now() + interval '31 days',
  'the minted share expires ~30 days out');
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

select is((select token from get_report_share((select id from t_run))), (select token from t_first),
          'get_report_share returns the live token');

-- ── guards ─────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171718","email":"viewer17@test.com","role":"authenticated"}';

select throws_ok(
  $$select create_report_share((select id from t_run))$$,
  '42501', 'must be an admin of this church',
  'a viewer cannot mint a share');

select throws_ok(
  $$select revoke_report_share((select id from t_run))$$,
  '42501', 'must be an admin of this church',
  'a viewer cannot revoke a share');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171719","email":"outsider17@test.com","role":"authenticated"}';

select throws_ok(
  $$select create_report_share((select id from t_run))$$,
  '42501', 'must be an admin of this church',
  'a non-member cannot mint a share');

-- ── revoke ─────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

select revoke_report_share((select id from t_run));

reset role;
select is((select revoked from report_shares where id = (select token from t_first)), true,
          'revoke_report_share marks the live share revoked');
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

select is((select count(*) from get_report_share((select id from t_run))), 0::bigint,
          'get_report_share returns no rows once revoked');

select lives_ok(
  $$select revoke_report_share((select id from t_run))$$,
  'revoking when nothing is active is a no-op, not an error');

create temp table t_second as select create_report_share((select id from t_run)) as token;
grant select on t_second to authenticated, anon;

select isnt((select token from t_second), (select token from t_first),
            'minting after a revoke returns a NEW token');

-- ── expired-but-unrevoked occupies the slot; mint must replace it ──────────
reset role;
update report_shares set expires_at = now() - interval '1 day' where id = (select token from t_second);
set local role authenticated;
set local request.jwt.claims to '{"sub":"17171717-1717-1717-1717-171717171717","email":"admin17@test.com","role":"authenticated"}';

select isnt(create_report_share((select id from t_run)), (select token from t_second),
            'minting when the live share has expired revokes it and returns a new token');

select * from finish();
rollback;
