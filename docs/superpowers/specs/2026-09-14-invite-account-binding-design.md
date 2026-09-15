# Invite = account creation, bound to the inviting church

**Date:** 2026-09-14 · **Status:** approved by the owner's report (this is the fix she asked for) · **Branch:** `feat/invite-account-binding`

## The failure this closes

On 2026-09-11, fifteen leaders of one church each signed in and were walked through
"Add your church". The database now holds twelve near-identical churches (one member
each, fifty answers each) instead of one church with fifteen members. Evidence
(read-only `supabase db query --linked`, 2026-09-14):

- `member_invitations` holds **zero** rows for that church. No app invitation was ever
  created for any of the fifteen addresses.
- Every one of their accounts carries `raw_user_meta_data.invited = false` (or was
  created by Google OAuth). The flag is only `true` when sign-up starts from an
  `/accept/<token>` link (PR #87), so each of them entered through **BEGIN THE
  ASSESSMENT → /sign-up**, never through an invitation.
- `/get-started` treats "signed in, no `church_members` row" as "a new admin" and shows
  the church-creation form. That is correct for a founder and wrong for an invitee, and
  the app had no way to tell them apart until the invitee reached the accept page while
  signed in as the invited address.

Root cause, stated once: **membership was created only at the end of the invite path**
(`accept_member_invitation`, called from `/accept/<token>` with a matching session).
Every other way into the app (the homepage CTA, `/sign-in`, Google, an expired or
unopened invitation) arrived with no membership and was handed a church to create.

## The new model (locked)

1. **Only an admin creates a church profile.** Unchanged (`create_church_with_admin`).
2. **Sending an invitation creates the invitee's account and binds it to the church at
   that moment.** The server action provisions the auth user through the admin API
   (`auth.admin.generateLink({ type: 'invite' })` — creates a new user or reuses an
   unconfirmed one; a confirmed user already exists and is simply reused) and then calls
   `bind_invited_member(invitation_id)`, a service-role-only RPC that inserts the
   `church_members` row (role from the invitation, `granted_by` = the inviting admin,
   deadline unset) and records `member_invitations.invited_user_id`.
3. **The invitee only signs in.** The branded invitation email's button is a one-click
   sign-in: `/accept/<token>` renders an inert interstitial (same prefetch defence as
   `/auth/confirm`) that POSTs to `/accept/<token>/continue`, which validates the
   invitation, mints a magic-link token for the invited address server-side
   (`generateLink({ type: 'magiclink' })`), spends it in the invitee's own browser
   session (`verifyOtp({ token_hash })`), marks the invitation accepted, stamps the
   3-day completion clock, and lands on `/app/<churchId>`.
4. **Every other entry converges on the same church.** Because the membership already
   exists, `/get-started` routes the invitee to `/app/<churchId>` whether they arrive by
   magic link, Google, or the homepage button. After any successful sign-in the app calls
   `settle_my_invitations()` so a pending invitation is marked accepted (and, for
   invitations created before this change, bound by e-mail match) without a token.
5. **An invitee never sees "Add your church".** Not as a UI rule — as a consequence of 2.

## Decisions and their reasons

- **Bind at invite time via an RPC, not a direct service-role insert.** `church_members`
  keeps its invariant that only SECURITY DEFINER RPCs write it (now three writers:
  `create_church_with_admin`, `accept_member_invitation`, `bind_invited_member`).
- **`bind_invited_member` resolves the user by e-mail inside Postgres.** The app never
  needs the user id back from the admin API, and an already-registered address (422
  `email_exists` from the invite link) binds exactly the same way.
- **One-click sign-in mints the token at click time, not at invite time.** Supabase's
  OTP expiry (default one hour) would kill an emailed token before most volunteers open
  the message; the cohort above signed up over sixteen hours. Minting on click means the
  only long-lived secret is the invitation id the app already emails (14-day expiry,
  admin-revocable, single acceptance).
- **The accept link works for its whole 14-day life** (owner decision, 2026-09-14, replacing an
  earlier single-acceptance draft). `accepted` is a roster/reminder fact, not the end of the
  link: the continue route admits `pending` and `accepted` invitations while unexpired, never
  `revoked`, and for an accepted one only while the person is still a member (an admin who
  removed them has closed this door). A caller already signed in as the invited address skips
  the minting and is simply routed to the church. Past expiry the page hands over to the
  ordinary sign-in with the address prefilled; the membership already exists, so that lands on
  the church too. The trade: the invitation id is a bearer sign-in for up to 14 days, which is
  the same trust the emailed magic link carries for one hour, extended to how long volunteers
  actually take — revocable (pending) or closable by removal (accepted) at any time.
- **Completion clock starts at first sign-in, not at invite.** `bind_invited_member`
  leaves `assessment_deadline_at` null; `settle_my_invitations` /
  `accept_member_invitation` stamp `now() + 3 days` only where it is still null. A member
  who opens the email on day four is not locked out on arrival.
- **Revoking a pending invitation now also removes the bound membership** (via the
  existing last-admin-guarded `remove_member`). Otherwise "revoked" would be a label on a
  person who can still sign in.
- **Degradation is loud.** If `SUPABASE_SERVICE_ROLE_KEY` is unset in the deployment,
  the invitation is still created and emailed, but the admin's result says the account
  could not be prepared, and `/accept/<token>` falls back to the pre-existing
  "Sign in to accept" path. Silent degradation is exactly the bug this closes.
- **Manage access roster.** A bound-but-not-yet-signed-in member is listed under
  "Invited, waiting for first sign-in" (with Resend / Revoke), not under "Members";
  the split is by e-mail against the pending invitations, so no RPC shape changes.

## Owner actions after merge

1. Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel **Production** (Project → Settings → Env).
2. `supabase db push` (migration `20260914000100`), then `npm run test:db` (pgTAP 28).
3. Re-check the Confirm-signup template note in the owner doc (the `invited` flag is now
   set at invite time, so the "clicked BEGIN before opening the invitation" limitation is
   gone for accounts created through the new path).
4. Repair the existing duplicate churches with `docs/owner/merge-duplicate-churches.sql`
   (parameters and a dry-run are in the file) — never run by the agent.

## Not in scope

A members-list "last signed in" column (would change `get_church_members`' return shape and
pgTAP); deleting orphaned auth users of the duplicate churches.
