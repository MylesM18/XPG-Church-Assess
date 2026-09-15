-- Merge duplicate churches into one canonical church.
--
-- WHEN TO USE: several people each created "their own" copy of the same church (the failure the
-- 2026-09-14 invite-account-binding change closes), and you want one church with all of them as
-- members and all of their answers on one assessment run.
--
-- WHAT IT DOES, per duplicate church D whose founder is U:
--   1. inserts U as a member of the canonical church C (role below; skipped if already a member);
--   2. moves U's own answers from D's run onto C's run (responses.run_id + church_id);
--   3. deletes D — which cascades to its run, its membership row, its diagnoses, reports, shares.
-- Nothing touches auth.users: every person keeps their account and signs in as before, and
-- /get-started now routes them to C. Answers from a duplicate's OTHER members (if a duplicate
-- somehow had more than its founder) are moved the same way, one person at a time.
--
-- HOW TO RUN (Supabase → SQL editor, as the postgres role):
--   0. Take a backup first (Supabase → Database → Backups).
--   1. Fill in the two parameters in the `params` CTE below:
--        canonical_id   — the church that survives (the pastor's / the admin's).
--        duplicate_ids  — the churches to fold into it.
--      Find them with:  select id, name, created_at from public.churches order by created_at;
--   2. Run the DRY RUN block on its own and read the rows it prints.
--   3. Run the MERGE block. It is wrapped in begin … rollback: inspect the "after" query, and only
--      when it looks right change the final `rollback;` to `commit;` and run it once more.
--
-- Safety properties: the unique index responses_member_unique (run_id, item_id, respondent_user_id)
-- cannot be violated — a person's answers exist on exactly one run before the move, and the move
-- is skipped for anyone who already has answers on the canonical run (their duplicate answers are
-- then dropped with the duplicate church; flag those rows in the dry run and decide by hand).

-- ═══════════════════════════════════════ DRY RUN ═══════════════════════════════════════════════
with params as (
  select '00000000-0000-0000-0000-000000000000'::uuid as canonical_id,
         array['11111111-1111-1111-1111-111111111111'::uuid]::uuid[] as duplicate_ids
),
canonical_run as (
  select r.id as run_id from public.assessment_runs r, params p
  where r.church_id = p.canonical_id order by r.created_at asc limit 1
)
select d.id as duplicate_church, d.name, u.email as person, m.role as role_on_duplicate,
       (select count(*) from public.responses x where x.church_id = d.id and x.respondent_user_id = m.user_id) as answers_to_move,
       exists (select 1 from public.church_members cm, params p
               where cm.church_id = p.canonical_id and cm.user_id = m.user_id) as already_member,
       exists (select 1 from public.responses x, canonical_run cr
               where x.run_id = cr.run_id and x.respondent_user_id = m.user_id) as already_answered_canonical
from params p
join public.churches d on d.id = any(p.duplicate_ids)
join public.church_members m on m.church_id = d.id
left join auth.users u on u.id = m.user_id
order by d.created_at, m.created_at;

-- ═══════════════════════════════════════ MERGE ═════════════════════════════════════════════════
begin;

create temp table merge_params on commit drop as
  select '00000000-0000-0000-0000-000000000000'::uuid as canonical_id,
         array['11111111-1111-1111-1111-111111111111'::uuid]::uuid[] as duplicate_ids,
         'viewer'::text as merged_role;          -- role for the folded-in people: 'viewer' (member) or 'admin'

create temp table merge_run on commit drop as
  select r.id as run_id from public.assessment_runs r, merge_params p
  where r.church_id = p.canonical_id order by r.created_at asc limit 1;

-- 1. membership on the canonical church (granted by the canonical church's creator)
insert into public.church_members (church_id, user_id, role, granted_by)
select p.canonical_id, m.user_id, p.merged_role, c.created_by
from merge_params p
join public.churches c on c.id = p.canonical_id
join public.church_members m on m.church_id = any(p.duplicate_ids)
on conflict (church_id, user_id) do nothing;

-- 2. move each person's answers onto the canonical run, unless they already answered there
update public.responses x
   set run_id = mr.run_id, church_id = p.canonical_id
  from merge_params p, merge_run mr
 where x.church_id = any(p.duplicate_ids)
   and x.respondent_user_id is not null
   and not exists (select 1 from public.responses y
                    where y.run_id = mr.run_id and y.respondent_user_id = x.respondent_user_id);

-- 3. delete the duplicates (cascades: runs, memberships, diagnoses, reports, shares, leftover responses)
delete from public.churches c using merge_params p where c.id = any(p.duplicate_ids);

-- after: one church, everyone a member, answers per person on the canonical run
select (select count(*) from public.church_members cm, merge_params p where cm.church_id = p.canonical_id) as members_now,
       (select count(distinct respondent_user_id) from public.responses x, merge_run mr where x.run_id = mr.run_id) as people_with_answers,
       (select count(*) from public.responses x, merge_run mr where x.run_id = mr.run_id) as answers_on_canonical_run,
       (select count(*) from public.churches c, merge_params p where c.id = any(p.duplicate_ids)) as duplicates_left;

rollback;   -- change to `commit;` once the numbers above are what you expect
