-- Cairn M2 — RLS policies. Everything not granted here stays default-deny.
-- Membership helper is inlined per policy: a user is a member of a church iff a church_members
-- row matches auth.uid(). church_members itself is SELECT-only (RPCs are the sole writers);
-- invitations / responses / report_shares get NO policy (service-role / M4 / M6 own them).

-- Helper for church_members' own SELECT policy: a policy on church_members whose USING
-- clause subqueries church_members directly triggers 42P17 infinite recursion. This
-- SECURITY DEFINER function evaluates the membership check outside RLS, breaking the cycle.
-- Used ONLY by members_select — every other policy below inlines the church_members
-- exists(...) check directly (they reference church_members from a different table's
-- policy, so they do not self-recurse).
create function public.is_church_member(p_church_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.church_members
    where church_id = p_church_id and user_id = auth.uid());
$$;

-- ── churches ─────────────────────────────────────────────────────────────
create policy churches_select on public.churches for select to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid()));

create policy churches_update on public.churches for update to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid() and m.role = 'admin'))
  with check (exists (select 1 from public.church_members m
                 where m.church_id = churches.id and m.user_id = auth.uid() and m.role = 'admin'));

-- ── church_members: SELECT only. NO write policy (Eng-Spec §4 members_write is dropped) ──
create policy members_select on public.church_members for select to authenticated
  using (public.is_church_member(church_members.church_id));

-- ── assessment_runs: SELECT only (seeded by create_church_with_admin; LOCKED DELTA 1) ────
create policy runs_select on public.assessment_runs for select to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = assessment_runs.church_id and m.user_id = auth.uid()));

-- ── diagnoses: members read (this is what members read — not raw responses) ──────────────
create policy diagnoses_select on public.diagnoses for select to authenticated
  using (exists (select 1 from public.church_members m
                 join public.assessment_runs r on r.church_id = m.church_id
                 where r.id = diagnoses.run_id and m.user_id = auth.uid()));

-- ── member_invitations: only admins of the church may insert/select/revoke ───────────────
create policy minv_select on public.member_invitations for select to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin'));

create policy minv_insert on public.member_invitations for insert to authenticated
  with check (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin')
              and created_by = auth.uid());

create policy minv_update on public.member_invitations for update to authenticated
  using (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin'))
  with check (exists (select 1 from public.church_members m
                 where m.church_id = member_invitations.church_id and m.user_id = auth.uid() and m.role = 'admin'));

-- ── profiles: a user reads/writes only their own row ─────────────────────────────────────
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- invitations, responses, report_shares: intentionally NO policy — default-deny stays.
