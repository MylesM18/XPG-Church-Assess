# Assessment deadlines — invite window + completion window

**Date:** 2026-08-01
**Branch:** `feat/assessment-deadlines` (off `origin/master` `5c8e871`)
**Status:** Design approved (brainstorming). Next step: implementation plan.

## Problem

Admins should have a bounded window to send invitations, and invited people should
have a bounded window to finish the assessment — with visible day-by-day countdowns
so nobody is surprised. Today there is no church-level invite window and no per-member
completion deadline; `member_invitations` has only a per-invite 14-day `expires_at`.

## Approved decisions (from brainstorming)

1. **Member lock is hard but extendable.** When an invited person's 3 days run out they
   can no longer submit answers; already-saved answers still count. An admin can extend /
   reopen their window.
2. **Reminders = in-app banner (every sign-in) + one daily email.** Email mechanism is
   **Vercel Cron + an API route + Resend** (chosen over Supabase `pg_cron`).
3. **Everyone invited is timed** (both `Member` and `Co-admin` roles), from the moment
   they accept. The **founder** (who created the church) is **not** timed.
4. **When the invite window closes, invites already sent stay valid** — no new or re-sent
   invites, but people already invited can still accept and take the assessment on their
   own 3-day clock.

## The two windows

| Window | Whose | Anchor (start) | Ends | Enforcement |
|---|---|---|---|---|
| **Invite window** | The church (all admins share it) | Earliest `member_invitations.created_at` for the church | anchor + 3 days | Hard: `create_member_invitation` + resend refuse after close. Sent invites unaffected. |
| **Completion window** | Each invited person | Their `church_members.created_at` (acceptance) | `church_members.assessment_deadline_at` | Hard lock in `submit_self_response`; extendable by admin. Founder untimed (deadline = null). |

Total campaign may run ~6 days (invite on day 3 → that member still gets 3 days). Intended.

`WINDOW_DAYS = 3` is a single shared constant.

## Data model (all migrations owner-applied — the agent never runs `db push`/`reset`)

### Invite window — no new column
Derived from the earliest `member_invitations.created_at` for the church. The window is
**closed** when `now() > earliest_created_at + 3 days`. If the church has zero invites,
the window has not started (open, full 3 days remain once the first is sent).

### Completion window — new column on `church_members`
```
alter table public.church_members
  add column assessment_deadline_at timestamptz;   -- null = untimed (founder + pre-existing rows)
```
- `accept_member_invitation` sets `assessment_deadline_at = now() + interval '3 days'`
  when it inserts the member row (applies to every invited person regardless of role).
- `create_church_with_admin` leaves it **null** (founder untimed).
- Pre-existing member rows keep `null` → **not retroactively locked** (safe rollout).

### Lock — guard inside `submit_self_response`
Before writing, the RPC re-reads the caller's row for this church and raises when
`assessment_deadline_at is not null and now() > assessment_deadline_at`
(message: `your assessment window has closed; ask an admin to reopen it`). Partial answers
already stored still count. This is the authoritative lock — the UI only mirrors it.

### Extend — new admin-gated RPC
```
extend_member_deadline(p_church_id uuid, p_user_id uuid) returns timestamptz
```
`SECURITY DEFINER`, admin-of-church gated (same check as `create_member_invitation`).
Sets `assessment_deadline_at = now() + interval '3 days'` for that member and returns it.
Only meaningful for already-timed members (no-op guard if target deadline is null → the
founder cannot be "extended" into being timed).

### Invite-window guard — inside `create_member_invitation`
Add, before the existing pending/duplicate checks:
```
if exists (select 1 from public.member_invitations where church_id = p_church_id)
   and (select min(created_at) from public.member_invitations
        where church_id = p_church_id) < now() - interval '3 days'
then raise exception 'your 3-day invitation window has closed';
```
The resend path (`resendInvitation` in the access action) mirrors this check server-side
before bumping `expires_at`.

## Shared countdown helper

`lib/deadlines/countdown.ts` — pure, unit-tested, no I/O:
- `daysLeft(anchorOrDeadline: Date, now: Date): number` → `ceil(remainingMs / 86_400_000)`,
  clamped at 0. Gives a clean 3 → 2 → 1 → 0(closed) progression.
- `windowState(...)` helpers returning `{ open: boolean, daysLeft: number }` for both the
  invite window (anchor = earliest invite created_at, or "not started") and the completion
  window (deadline = `assessment_deadline_at`, or "untimed").
- Copy builders, e.g. `inviteWindowMessage(state)`, `completionMessage(state)` so the two
  banners, the invite-box line, and the email job share one source of wording.

## UI

### Admin — invite window
- **Dashboard banner** (admin only, every sign-in): "You have N days left to send
  invitations." When closed: "Your 3-day invitation window has closed." When no invite
  sent yet: no banner (or "You have 3 days once you send your first invitation").
- **Invite box counter** (`invite-member-form.tsx`): short line above Send —
  "N days left to invite." When closed, disable the form with that message. Server action +
  RPC remain the real guard.

### Member — completion window
- **Dashboard banner** (timed members, every sign-in): "You have N days left to complete
  the assessment." When locked: "Your assessment window has closed — ask an admin to
  reopen it." Untimed users (founder) see no banner.
- **Admin management**: in the existing member roster / `access` surface, each **timed**
  member shows days-left and an **"Extend 3 days"** control (calls `extend_member_deadline`).
  Surfaced for members near or past their deadline.

> Implementation note: PR #43 (data-access seam, merged into `5c8e871`) routes church/role,
> roster, and creation through `lib/data/*` and `lib/auth/require-church-admin`. The
> implementer must re-read the **current-master** versions of `app/app/[churchId]/page.tsx`,
> `app/app/[churchId]/access/*`, and the accept flow before wiring banners in — they may
> differ from the pre-#43 reads captured during brainstorming.

## Daily email reminders (mechanism A — Vercel Cron)

- **`vercel.json`** `crons` entry → once daily (e.g. `0 14 * * *`) hitting
  `GET /api/cron/reminders`.
- **`app/api/cron/reminders/route.ts`**: verifies a `CRON_SECRET` (header/query), uses a
  **service-role** Supabase client to find:
  - admins of churches whose invite window is still open → "N days left to send invitations";
  - members with `assessment_deadline_at` in the future and assessment not complete →
    "N days left to complete the assessment".
  Computes days-left via the shared helper and sends through the existing Resend sender
  (extended with a reminder template alongside `send-member-invitation`).
- **Idempotency**: a lightweight per-recipient `date` guard so a same-day re-run does not
  double-send (e.g. `church_members.last_reminded_on date`, and an equivalent guard for the
  admin invite-window reminder). Best-effort; at-least-once is acceptable.
- **Graceful degradation**: if `CRON_SECRET`, `RESEND_API_KEY`, or `EMAIL_FROM` are unset,
  the route is inert (no throw). **In-app banners work regardless.**

### Dependency to flag
Daily emails only actually deliver once the Resend domain
`360churchhealthassessment.com` is verified and `RESEND_API_KEY` / `EMAIL_FROM` are set in
Vercel Prod — the same owner-TODO still open from PR #44. New env: `CRON_SECRET` in Vercel.

## Testing

- **vitest** (pure): `countdown.ts` (boundaries at 0h / 24h / 48h / 72h / past), window-state
  + copy builders, and the banner/lock decision helpers.
- **pgTAP**: invite-window guard in `create_member_invitation`; hard lock in
  `submit_self_response`; `extend_member_deadline` admin-gating + null-founder no-op;
  `accept_member_invitation` sets a deadline while `create_church_with_admin` leaves null.

## Rollout / guardrails

- Owner applies migrations (agent never runs `supabase db push|reset` or `npm run test:db`).
- Agent opens a PR; **does not merge or push to master** without Natalie.
- Existing members/churches: null deadlines → untimed; invite windows derive going forward.
  (One edge: a church whose earliest invite predates this feature would read "closed"
  immediately — acceptable given no active production campaigns; flag to Natalie.)
- No new runtime dependencies. Explicit git paths only; never stage `.claude/`.

## Out of scope (YAGNI / possible follow-ups)

- Admin extending their **own** invite window (kept hard per decision).
- Per-church configurable window length (fixed 3 days).
- Multiple reminder emails per day / timezone-aware send times.
