-- Recipient queries for the daily reminder cron. SECURITY DEFINER + service_role-only EXECUTE:
-- called solely by the CRON_SECRET-gated route's service-role client, never by an authenticated
-- user (they expose cross-church emails). The route applies the shared day-math + same-day dedup;
-- these functions only select the candidate set.

-- Timed members with a still-future deadline whose church's run is still in progress. Once a
-- diagnosis is generated the run flips to 'complete' (submit becomes read-only), so gating on
-- in_progress is a cheap, correct "not complete" proxy at the church level.
create function public.completion_reminder_recipients()
returns table(church_id uuid, user_id uuid, email text, deadline_at timestamptz, last_reminded_on date)
language sql
security definer set search_path = public
stable
as $$
  select cm.church_id,
         cm.user_id,
         coalesce(p.email, u.email) as email,
         cm.assessment_deadline_at,
         cm.last_reminded_on
  from public.church_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.assessment_deadline_at is not null
    and cm.assessment_deadline_at > now()
    and exists (
      select 1 from public.assessment_runs r
      where r.church_id = cm.church_id and r.status = 'in_progress'
    );
$$;

revoke all on function public.completion_reminder_recipients() from public, anon, authenticated;
grant execute on function public.completion_reminder_recipients() to service_role;

-- Admins of churches whose invite window is still open (earliest invitation within the last 3 days).
create function public.invite_reminder_recipients()
returns table(church_id uuid, user_id uuid, email text, earliest_invite_at timestamptz, last_invite_reminded_on date)
language sql
security definer set search_path = public
stable
as $$
  with windows as (
    select church_id, min(created_at) as earliest
    from public.member_invitations
    group by church_id
    having min(created_at) > now() - interval '3 days'
  )
  select cm.church_id,
         cm.user_id,
         coalesce(p.email, u.email) as email,
         w.earliest as earliest_invite_at,
         cm.last_invite_reminded_on
  from windows w
  join public.church_members cm on cm.church_id = w.church_id and cm.role = 'admin'
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id;
$$;

revoke all on function public.invite_reminder_recipients() from public, anon, authenticated;
grant execute on function public.invite_reminder_recipients() to service_role;
