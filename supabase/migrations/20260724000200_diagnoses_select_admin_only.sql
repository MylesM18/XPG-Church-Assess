-- Results = admins only (Decision 5, DB layer). Was: any member could SELECT a diagnosis.
-- Now: only admins of the run's church. Inlines the m.role='admin' idiom used by
-- churches_update / minv_* (there is no is_church_admin helper).
drop policy diagnoses_select on public.diagnoses;
create policy diagnoses_select on public.diagnoses for select to authenticated
  using (exists (select 1 from public.church_members m
                 join public.assessment_runs r on r.church_id = m.church_id
                 where r.id = diagnoses.run_id and m.user_id = auth.uid() and m.role = 'admin'));
