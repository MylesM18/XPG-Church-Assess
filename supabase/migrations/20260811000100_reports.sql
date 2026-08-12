-- The composed executive report, one row per (run, inputs_hash). Copies the `diagnoses`
-- pattern (create table + RLS + admin-only select policy + no write policy, SECURITY DEFINER
-- RPC is the only way in). church_id is DENORMALIZED here: save_report writes it directly from
-- p_church_id, so any direct query or future admin tooling can filter reports by church without
-- joining through assessment_runs. (reports_select below still reaches church via run_id,
-- matching the current diagnoses_select idiom exactly — see that policy's own comment. The
-- denormalized column is available for other callers, not required by this policy.)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.assessment_runs on delete cascade not null,
  church_id uuid references public.churches on delete cascade not null,
  inputs_hash text not null,
  methodology_version text not null,
  archetype text not null check (archetype in ('capacity','constraint','foundation')),
  tier text not null check (tier in ('healthy_ready','healthy_stretched','strained','at_risk')),
  -- `facts` is write-only provenance, NARROWED (plan 4, D-P4-1): no renderer reads derived
  -- NUMBERS from it. Model output that cannot be re-derived from responses — today only
  -- `facts.themes`, which feeds S8 — IS read back by the diagnosis page, schema-revalidated
  -- first, and only when the row's inputs_hash matches the live one.
  facts jsonb not null,
  sections jsonb not null,
  section_sources jsonb not null,
  generated_at timestamptz default now(),
  unique (run_id, inputs_hash)
);

alter table public.reports enable row level security;

-- Admins only, inlining the m.role='admin' idiom used by diagnoses_select / churches_update
-- (there is no is_church_admin helper). Reaches church via run_id, byte-for-byte the same shape
-- as the CURRENT diagnoses_select (20260724000200_diagnoses_select_admin_only.sql) — kept
-- unchanged rather than rewritten to join on reports.church_id, which would be an unproven,
-- unprecedented access path.
create policy reports_select on public.reports for select to authenticated
  using (exists (select 1 from public.church_members m
                 join public.assessment_runs r on r.church_id = m.church_id
                 where r.id = reports.run_id and m.user_id = auth.uid() and m.role = 'admin'));

-- Explicit base-table privilege, mirroring 20260716000200_base_table_grants.sql's idiom for the
-- other tables an admin reads directly under RLS (churches / church_members / assessment_runs /
-- diagnoses): "makes cloud behave identically to local regardless of Supabase's auto-expose
-- toggle... RLS is still the real wall — this grant only says 'this role may attempt a SELECT,
-- subject to policy'." reports is the first table added since that migration, so its grant is
-- colocated here rather than appended to that file.
grant select on public.reports to authenticated;

-- No insert/update/delete grant and no write policy: save_report is the only way in.
