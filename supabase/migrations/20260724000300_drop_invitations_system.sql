-- Remove the anonymous per-category respondent system (Decision 4). Keep responses rows AND
-- the responses.invitation_id column: get_run_coverage reads it (coalesce respondent count),
-- and existing 'invited' rows keep their data. respondent_kind CHECK ('invited','member') stays.
alter table public.responses drop constraint if exists responses_invitation_id_fkey;
drop function if exists public.list_church_invitees(uuid);
drop function if exists public.get_invitation_context(uuid);
drop function if exists public.submit_invited_response(uuid, text, jsonb);
drop function if exists public.create_invitation(uuid, text, text, text, text);
drop table if exists public.invitations;  -- FK dropped above; responses.invitation_id column stays
