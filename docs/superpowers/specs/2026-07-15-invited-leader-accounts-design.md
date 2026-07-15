# Cairn — Invited-Leader Accounts & Auth Model (design)

**Date:** 2026-07-15 · **Status:** Approved by user 2026-07-15. Blocks M2. No code written yet.
**Supersedes:** Open Decision #1 and #2 in `docs/2026-07-14-brainstorm-decisions.md`.
**Source of truth (technical):** `docs/XPG-Engineering-Spec.md` (§2 auth, §4 schema/RLS, §6 respond flow, M2/M4 milestones).

This design resolves the **invited-leader-accounts** decision that was blocking M2 (database / RLS / auth).
It reconciles the user's request — "invited people can sign up and have a profile" — with Engineering
Spec §2 ("invited leaders never authenticate") and prime directive #2 (the permission wall lives in
Postgres RLS, not the UI).

---

## 1. The decision, in one line

Two different kinds of invite exist, and they are handled completely differently:

- **Respondents** (answer one category, never see results) stay **accountless** — the tokenized
  `/respond/[token]` flow is their entire surface. It merely *presents* as a friendly, pre-filled sign-in.
- **Account-holders** (execs, co-admins, viewers who see results) get **real accounts** via magic link
  or Google — but **an account never grants church-data access; only a `church_members` row does.**

The user considered and **rejected** minting real (hidden-password) accounts for respondents: it would
add a real login + credential per one-time answerer and force RLS to explicitly deny those accounts,
for zero added capability. Accountless is safer and simpler and delivers the same experience.

---

## 2. Actors (Engineering Spec §2, made precise)

| Actor | Account? | Auth | Can do | Can NEVER do |
|---|---|---|---|---|
| **Admin** (founding exec) | Yes | Magic link / Google | Create the church, answer categories, invite leaders, invite co-admins/viewers, manage access, see the full diagnosis | — |
| **Co-admin** | Yes | Magic link / Google | Everything an Admin can (invite, manage, edit, see results) | — |
| **Viewer** | Yes | Magic link / Google | See the full diagnosis for churches they're approved on | Manage access, edit the church, invite |
| **Respondent (invited leader)** | **No — ever** | None (tokenized link) | Answer exactly one assigned category, then a thank-you | See any result, score, other category, or anything about the church beyond its name |

`church_members.role ∈ {admin, viewer}`. "Co-admin" is simply an invited member with `role='admin'`.
The founding exec is the first `admin` row, created atomically by `create_church_with_admin` (unchanged).

---

## 3. Core invariant (this is prime directive #2, stated exactly)

> **Having an account never grants access to any church's data. Only a `church_members` row does.**

- A logged-in user with **no** membership for church X can read **nothing** about X — enforced by RLS,
  default-deny, keyed on `church_members`.
- Respondents don't even have accounts, so they are categorically outside the authenticated surface.
- This is what makes "anyone can sign up" safe: signup creates a `profiles` row (identity), never a
  `church_members` row (permission).

---

## 4. Data model changes (Engineering Spec §4)

### 4.1 New: `profiles` (account-holders only)
1:1 with `auth.users`. **Auto-created by a DB trigger** on `auth.users` `AFTER INSERT` (the standard
Supabase pattern) that inserts a `profiles` row seeded from the new user's email. `full_name` is filled
in on first authenticated request / at church creation.

```
profiles
  id           uuid primary key references auth.users on delete cascade
  full_name    text
  email        text
  avatar_url   text null
  created_at   timestamptz default now()
```

- **Respondents get no `profiles` row** (they have no `auth.users` row).
- `profiles` ≠ `church_members`. Profile = "who you are." Membership = "what you may see."

### 4.2 New: `member_invitations` (account-holder invites — Type B)
Kept **separate** from the respondent `invitations` table so that widening the account-holder path never
widens the anonymous respondent path.

```
member_invitations
  id             uuid primary key default gen_random_uuid()   -- the token
  church_id      uuid references churches on delete cascade not null
  role           text not null check (role in ('admin','viewer'))
  invited_email  text not null
  status         text not null default 'pending' check (status in ('pending','accepted','revoked'))
  expires_at     timestamptz not null
  accepted_by    uuid null references auth.users
  created_by     uuid not null references auth.users            -- must be an admin of church_id
  created_at     timestamptz default now()
```

Handled **only** by the authenticated accept flow (§6). The service-role respond handlers never touch it.

### 4.3 Unchanged: `invitations` (respondent invites — Type A)
Exactly as Engineering Spec §6: `church_id, category_id, invited_name, invited_contact, status,
expires_at`. Read/written **only** by the two service-role `/api/respond/[token]` handlers. This tight
boundary is preserved.

---

## 5. Respondent flow (Engineering Spec §6, with two small deltas)

`/respond/[token]` presents as a pre-filled sign-in but creates no account and no session.

- **`GET /api/respond/[token]`** — as §6, **plus** returns the invited email (from `invited_contact`)
  so the page can pre-fill/show it. Still returns no scores, no other categories, no church internals.
- The respondent **types their own first + last name** on the form.
  **Delta 1:** `respondent_label` is set from the respondent-entered name (falls back to the admin's
  `invited_name` if they skip it). This improves the leadership-alignment / dispersion finding (§7.4),
  which surfaces each respondent's label.
  **Delta 2:** the email field is pre-filled from the invitation.
- **`POST /api/respond/[token]`** — as §6: re-validate token, validate every value ∈ 1..10 and every
  `item_id` belongs to the category, insert `responses` (`respondent_kind='invited'`), set invitation
  `status='completed'`, return the thank-you. A completed/expired link is rejected ("this link is no
  longer active"). **Redo = the exec sends a new invitation** (multiple invitations per category already
  allowed).
- **No account, no password, no session, ever.**

---

## 6. Account-holder flow (Type B — the new authenticated path)

1. **Invite:** an admin calls the (member-gated, admin-only) invite endpoint with
   `{ church_id, role ∈ {admin,viewer}, invited_email }` → inserts a `member_invitations` row →
   emails the accept link `${APP_URL}/accept/${invitation.id}` via Resend.
2. **Sign in:** the invitee opens the link and authenticates with **magic link or Google** using that email.
3. **Accept (validated, server-side):** a `SECURITY DEFINER` RPC `accept_member_invitation(token)`:
   - loads the invitation; rejects if not `pending` or `expires_at < now()`;
   - **requires `auth.email() == invited_email`** (exact match) — the invite is not a bearer token;
   - inserts `church_members(church_id, user_id = auth.uid(), role)`;
   - sets the invitation `status='accepted'`, `accepted_by = auth.uid()`.
   A user can **never** self-insert a `church_members` row; only this RPC writes it (same pattern as
   `create_church_with_admin`).
4. **Founding exec** is unchanged: `create_church_with_admin` makes them the first `admin` atomically.

Edge cases:
- Signed-in email ≠ invited email → reject with a clear message; the exec re-invites the correct address.
- Invitee already has an account → the RPC just adds the membership (no new account).
- Revoked invite (`status='revoked'`) → rejected. Admins may revoke a pending invite.

---

## 7. RLS shape (M2 acceptance target)

- Every table RLS-enabled, **default-deny**.
- `church_members`-gated selects for `churches`, `assessment_runs`, `responses`, diagnoses, and
  `member_invitations`.
- `member_invitations`: only admins of `church_id` may insert/select/revoke.
- **`church_members` is written only by the two `SECURITY DEFINER` RPCs** — `create_church_with_admin`
  (first admin at church creation) and `accept_member_invitation` (validated invite acceptance). No
  direct client insert into `church_members` is ever permitted.
- `profiles`: a user may read/write **only their own** row.
- Respondent `invitations` + invited `responses`: **no authenticated policy at all** — anonymous
  respondents never use the authenticated client; the two service-role handlers are their entire surface.

**Acceptance (extends Engineering Spec M2 AC):**
- A logged-in **non-member** can read **nothing** of a church (runs, responses, diagnoses, invitations).
- A signed-in user **cannot** insert their own `church_members` row (only the two `SECURITY DEFINER`
  RPCs can).
- **Anon** cannot select `invitations`, `member_invitations`, `responses`, or any church internals.
- The email-match check in `accept_member_invitation` is enforced (a mismatched sign-in cannot accept).

---

## 8. What this changes vs. the current Engineering Spec

- **§2 (actors):** add **Co-admin** as an invited `role='admin'`; accounts authenticate via magic link
  **+ Google** (Google was already listed optional).
- **§4 (schema):** add `profiles` and `member_invitations`; `church_members.role ∈ {admin, viewer}`;
  add the `accept_member_invitation` RPC + a `profiles` auto-create trigger.
- **§6 (respond):** respondent enters their own name; email pre-filled. Handlers otherwise unchanged.
- **Milestones:**
  - **M2** gains `profiles`, `member_invitations`, `accept_member_invitation`, the `profiles` trigger,
    and their RLS + the extended ACs above.
  - **M4** gains the account-holder **invite + accept** UI (`/accept/[token]`). Respondent invite/respond
    stays largely as-spec'd, with the two deltas in §5.

---

## 9. Explicitly out of scope (YAGNI)

- **No passwords anywhere.** Magic link + Google only. (Password auth can be added later if ever needed.)
- **No persistent respondent identity.** Respondents are not remembered across categories or years;
  their identity lives on the invitation + `responses.respondent_label`. (The user chose the plain
  accountless option over the "remember the person" variant.)
- **No respondent-facing dashboard or history.** Answer once, thank-you, done.

---

## 10. Feeds `writing-plans` (M2 build)

Concrete units the plan will need to cover, in dependency order:
1. Migration: `profiles` + trigger; `member_invitations`; `church_members.role` constraint;
   confirm `invitations`/`responses` shape from Spec §4.
2. `create_church_with_admin` (from Spec — first admin) and `accept_member_invitation` RPCs.
3. RLS policies (default-deny; membership-gated; profiles-own-row; no authed policy on respondent
   invitations/responses).
4. RLS/permission-wall tests proving every AC in §7 (the M2 acceptance gate).

Respondent-facing and account-holder-facing **UI** (invite/accept/respond pages) is **M4**, not M2.
