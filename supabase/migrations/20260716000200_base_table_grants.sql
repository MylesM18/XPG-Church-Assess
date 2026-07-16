-- Explicit base-table privileges (deferred M2 #4). Makes cloud behave identically to
-- local regardless of Supabase's auto-expose toggle. RLS is still the real wall — these
-- grants only say "this role may attempt a SELECT, subject to policy".
--
-- Tables the dashboard reads DIRECTLY under RLS:
grant select on public.churches        to authenticated;
grant select on public.church_members  to authenticated;
grant select on public.assessment_runs to authenticated;
grant select on public.diagnoses       to authenticated;

-- invitations and responses get NO table-level grant to anon/authenticated on purpose:
-- they stay reachable only through SECURITY DEFINER RPCs (default-deny preserved).
