-- The reassurance lines the diagnosis page reveals beside a spinner while the report model runs
-- (feat/report-wait-experience). Report generation takes ~45-60 s in the common case and up to
-- ~3.5 min at the fan-out's worst, which is long enough that a bare disabled button reads as a
-- broken page.
--
-- This is the FIRST app-wide content table: no church_id, no run_id, no respondent data — just
-- display copy, kept here rather than in code so the wording can be changed in the Supabase
-- dashboard without a deploy. (`methodology/*.yaml` remains the seam for anything the report
-- itself is composed from; that content is reviewed in a PR because it shapes findings. These
-- lines shape nothing.)
--
-- Reading is fail-open: lib/data/wait-phrases.ts falls back to WAIT_PHRASE_DEFAULTS
-- (lib/report/wait-phrases.ts) when this table is missing, unreachable, empty, or all-blank, so
-- the feature works from the moment it deploys and does not wait on this migration being applied.
create table public.report_wait_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null check (btrim(phrase) <> ''),
  -- Display order. Not unique: reordering by hand should not have to dodge a constraint.
  sort_order integer not null default 0,
  -- Soft delete, so a line can be retired without losing the wording.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- A repeated line inside one wait reads as a stuck screen.
  unique (phrase)
);

alter table public.report_wait_phrases enable row level security;

-- Any signed-in user may read them. Unlike every other table here there is nothing to scope: the
-- rows are generic app copy, identical for every church, and carry no church or respondent data.
-- They are only ever RENDERED to an admin (the diagnosis page redirects everyone else), but the
-- policy does not need to encode that — narrowing it to admins would buy no privacy and would
-- break the moment another surface wants a wait line.
create policy report_wait_phrases_select on public.report_wait_phrases for select to authenticated
  using (true);

-- Explicit base-table privilege, mirroring 20260716000200_base_table_grants.sql's idiom (and
-- 20260811000100_reports.sql, which colocated its own): "makes cloud behave identically to local
-- regardless of Supabase's auto-expose toggle... RLS is still the real wall — this grant only
-- says 'this role may attempt a SELECT, subject to policy'."
grant select on public.report_wait_phrases to authenticated;

-- No insert/update/delete grant and no write policy: these are edited in the Supabase dashboard,
-- which acts as the service role and bypasses RLS. The app never writes them.

-- Seed with the lines that ship in lib/report/wait-phrases.ts, so the table is useful the moment
-- it exists and the dashboard shows something to edit rather than an empty grid. Kept in sync by
-- tests/report/wait-phrases-seed.test.ts. `on conflict do nothing` keeps a re-run (supabase db
-- reset) idempotent, and keeps hand-edited wording from being clobbered if this ever re-runs.
insert into public.report_wait_phrases (phrase, sort_order) values
  ('Reading every answer your team gave.', 10),
  ('Listening to what your leaders wrote in their own words.', 20),
  ('Looking for where the eight areas agree, and where they differ.', 30),
  ('Finding the one constraint holding the others back.', 40),
  ('Checking every sentence against your real numbers.', 50),
  ('Your scores are already set. The model only writes them up.', 60),
  ('Putting your strengths where you will see them first.', 70),
  ('Naming the next step, not the whole mountain.', 80),
  ('This usually takes about a minute.', 90),
  ('Reading it back once more before handing it over.', 100),
  ('Thank you for your patience.', 110)
on conflict (phrase) do nothing;
