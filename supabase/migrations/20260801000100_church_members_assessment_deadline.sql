-- Completion window: each invited person gets a 3-day clock from acceptance. null = untimed
-- (the founder, and every pre-existing member row → not retroactively locked; safe rollout).
-- Owner-applied. accept_member_invitation stamps this; submit_self_response enforces it;
-- extend_member_deadline resets it. create_church_with_admin leaves it null.
alter table public.church_members
  add column assessment_deadline_at timestamptz;
