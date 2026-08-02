-- Best-effort, per-recipient same-day guard for the daily reminder job. last_reminded_on gates the
-- completion reminder (timed members); last_invite_reminded_on gates the invite-window reminder
-- (admins). Two columns because a co-admin (admin role + timed) can legitimately receive both kinds
-- the same day. At-least-once delivery is acceptable (a crashed run mid-loop may re-send).
alter table public.church_members
  add column if not exists last_reminded_on date,
  add column if not exists last_invite_reminded_on date;
