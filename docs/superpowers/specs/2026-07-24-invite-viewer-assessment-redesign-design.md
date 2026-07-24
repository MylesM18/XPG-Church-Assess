# Invite → Viewer whole-assessment redesign — Design

**Date:** 2026-07-24
**Status:** Approved decisions; pending spec review → implementation plan.

## Context & problem

The app has **two unrelated invite systems** today:

1. **Per-category respondent invite** — the "Invite someone" control on each of the 8 area cards (`app/app/[churchId]/category-invite.tsx`). Sends an anonymous link (`/respond/<token>`) to answer **one** area; no account. Backed by the `invitations` table (`category_id`-scoped), `create_invitation`, `submit_invited_response`, `get_invitation_context`, `list_church_invitees`.
2. **Member invite** — "Manage access" (`/app/[churchId]/access`). Invites an email to create an account and join the church as **Viewer** or **Co-admin**. Backed by `member_invitations`, `create_member_invitation` → `/accept/<token>` → `accept_member_invitation` → a `church_members` row.

The owner wants invitations to **not** be per-category: an invited person takes the **whole** assessment, and **cannot see the final results — only admins can.**

**Key finding (drives real work):** today a Viewer member **can** read the diagnosis — both in the UI (`diagnosis/page.tsx` explicitly allows viewers) and in the database (`diagnoses_select` RLS allows any member of the church). So "results = admins only" is a genuine access change, not just hiding a button.

## Decisions (locked with owner)

1. **Invitee model = account-based Viewer member** (not an anonymous link).
2. **Answering = reuse the existing 8 per-area "Answer yourself" cards** (no new guided walkthrough).
3. **Viewer dashboard shows their OWN per-category progress**; admin dashboard keeps the church-wide aggregate.
4. **Remove the anonymous per-category respondent system now** (full teardown, this change).
5. **Results restricted to admins at both the UI and the DB (RLS) layers.**

## Design

### 1. Invitations — a single path
- **Remove** the per-category invite surface: the `CategoryInvite` component and its per-card render in `app/app/[churchId]/page.tsx`, the `createInvitation` server action, and the dashboard's `list_church_invitees` fetch + `inviteesUnavailable` notice.
- The **only** invite path becomes **Manage access → invite** (existing `create_member_invitation` → `/accept/<token>` → `accept_member_invitation`). Role choices unchanged: **Viewer** = assessment-taker who cannot see results; **Co-admin** = admin who can.

### 2. Viewer answers all 8 — reuse cards, personal progress
- After accepting, a Viewer lands on `/app/<churchId>` and answers each area via the existing "Answer yourself" links (`submit_self_response`, `respondent_kind='member'`, keyed by `respondent_user_id`, UPSERT so re-answering overwrites).
- **Per-user progress:** `get_run_coverage` currently aggregates across ALL respondents, so an area could show "Completed" because *someone else* answered it. Add a **per-user coverage path** so a Viewer's status dots reflect only their own answers. Approach (resolve exact mechanism in planning): either extend `get_run_coverage` with an optional `p_respondent_user_id`, or add `get_member_run_coverage`. The dashboard uses the **aggregate for admins** (needed to gate diagnosis generation on all-8-covered) and **per-user for viewers**.
- **Header/label + dots (owner-approved 2026-07-24):** viewers see a **personal** completion header — "You've completed N of 8" — **plus** the per-card status dots, both reflecting only their own answers. Admins keep the church-wide "N of 8 areas" header and aggregate dots.

### 3. Results = admins only (UI + RLS)
- **UI:** hide the "View diagnosis" link for viewers on the dashboard; block `/app/<churchId>/diagnosis` for viewers (redirect to the dashboard). Generation stays admin-only (already is).
- **DB / RLS:** tighten `diagnoses_select` so only **admins** of the run's church may read a diagnosis (today: any member). New migration adds the admin condition.
- **External share links unaffected:** the public shared report reads via `SECURITY DEFINER get_shared_report`, so RLS does not block it; admins still create/manage shares. A viewer, however, cannot see results in-app nor read the `diagnoses` row directly.

### 4. Remove the anonymous respondent system (full teardown)
Remove / drop (verify no remaining caller during implementation):
- **Routes/UI:** `app/respond/[token]/` (page + `respond-form`), `app/api/respond/[token]/route.ts`.
- **Server action:** `createInvitation` and any `/respond` link building.
- **RPCs (drop via migration):** `create_invitation`, `submit_invited_response`, `get_invitation_context`, `list_church_invitees` (+ their grants).
- **Table:** drop `invitations` (destructive). Confirm FKs first (e.g. any `responses.invitation_id` / run references) and preserve existing `responses` rows.
- **`respondent_kind`:** the `'invited'` value becomes unused going forward; **keep** the column/enum (existing rows may carry it) — do not repurpose. Confirm the scoring engine and `coverage()` don't require `'invited'` rows.

### 5. Data & migrations
Add migrations (following repo conventions/ordering):
- (a) per-user coverage RPC (extend or new);
- (b) `diagnoses_select` RLS tightened to admins;
- (c) drop `invitations` + `create_invitation` / `submit_invited_response` / `get_invitation_context` / `list_church_invitees` and their grants.

### 6. Testing
- **Vitest:** delete `tests/access/category-invite.test.ts` and `tests/access/create-invitation-revalidate.test.ts`; update dashboard tripwires (`self-assessment-wiring`, `status-indicator`) if the card layout changes; add coverage for the **per-user progress** path and a **results-admin-only** tripwire (diagnosis page + dashboard link gated). Keep gates green: `npm run typecheck`, `npm run lint`, `npm run test` (=`vitest run`).
- **pgTAP (`supabase/tests/`):** remove `06_create_invitation_test.sql`, `07_get_invitation_context_test.sql`, `08_submit_invited_response_test.sql`; update `04_rls_policies_test.sql` / `05_permission_wall_acceptance_test.sql` to assert **viewers are DENIED** diagnosis reads; update `01_schema_test.sql` for the dropped table. **NOTE:** pgTAP runs via `npm run test:db`, which the agent must NOT run — DB tests are authored here and verified owner-side.

## Risks / out of scope
- **Destructive migration** (`drop table invitations`): confirm no FK/data loss that matters (early launch) before dropping.
- **Existing `'invited'` responses**, if any, remain in `responses` and still count toward results. Default: leave them. (If the owner later wants only member responses counted, that's a follow-up.)
- **Auth-gated verification** is owner-side: accept as a Viewer, answer all 8, confirm the Viewer cannot reach results, and the admin still sees the aggregate + diagnosis.

## Open implementation questions (resolve during planning)
- Exact per-user coverage mechanism (optional param on `get_run_coverage` vs a new RPC).

## Resolved during spec review (2026-07-24)
- **Spec approved as-is** by the owner — proceed to implementation plan.
- **Viewer progress display:** personal "You've completed N of 8" header **plus** per-card status dots, scoped to the viewer's own answers.
