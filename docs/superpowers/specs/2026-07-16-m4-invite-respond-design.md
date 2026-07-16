# Cairn — M4 Invite & Respond (design)

**Date:** 2026-07-16 · **Status:** Approved by user 2026-07-16 (brainstorming, section-by-section). No code written yet.
**Builds on:** M3 (app shell + auth + status-only dashboard), shipped `origin/master @ 9ba8538`.
**Source of truth (technical):** `docs/XPG-Engineering-Spec.md` (§1 pages/API, §2 auth, §4 schema/RLS, §6 respondent flow, §7 engine, §13 milestones — M4 = Invite + Respond, §15 security).
**Related design:** `docs/superpowers/specs/2026-07-15-invited-leader-accounts-design.md` (Type A respondent vs Type B account-holder model; §5 respondent deltas).

This design turns the M3 status-only dashboard into the first flow where people **outside the admin** put
data into an assessment. It builds the accountless respondent flow (`/respond/[token]`) and the member
"Answer yourself" flow, plus the aggregate coverage read that lets the dashboard show progress without ever
exposing raw responses.

---

## 1. The milestone in one line

Admins invite people to answer one category of the assessment; those people answer with **no account** via a
tokenized link; admins can also answer categories themselves; and the dashboard shows per-category coverage —
all while `invitations` and `responses` remain **default-deny** and reachable only through narrow
`SECURITY DEFINER` RPCs (no service-role client).

---

## 2. Scope & non-goals (Decision 1)

**In scope for M4:**
- **Type A accountless respondent flow** — admin creates an invitation for one category → link `/respond/[token]`
  → respondent (no account) answers that category's 5 items, types their own name, submits.
- **"Answer yourself"** — a logged-in member answers a category in-app; re-answering **overwrites** their prior
  answer for that category.
- **Coverage** — a pure, unit-tested classifier fed by an aggregate-only RPC; dashboard shows per-category status
  and a dynamic "N of 8 areas" header.
- **Live Resend** email send for invitations (decoupled — see §8).
- **Folded-in deferred hardening** — M2 I1, M2 I2, base-table GRANTs, `next.config.ts` output-file-tracing (see §9).

**Non-goals (explicitly deferred):**
- Type B `/accept/[token]` co-admin onboarding and "Manage access" → **M5**.
- `revoke_invitation` RPC → **M5** ("Manage access"); not in Eng-Spec §13 M4 acceptance criteria.
- Confidence-weighting, run-completion, diagnosis rendering → **M5** (M4 only *builds* `coverage()`; M5 reuses it as the gate).
- Real rate-limiting (Upstash / Vercel KV) → **M6**. M4 documents structural mitigations only (§10).

> **"Invited leader" = accountless respondent, not a co-admin.** The invited-leader-accounts spec §8 outlier is
> superseded by the M3 dashboard stubs + Eng-Spec §13: co-admin onboarding is Type B / M5.

---

## 3. Actors & data flow

| Actor | Account? | M4 surface | Writes to |
|---|---|---|---|
| **Admin / co-admin** | Yes | Create invitation; "Answer yourself"; view coverage on dashboard | `invitations`, `responses` (member rows), reads coverage aggregates |
| **Respondent (invited leader)** | **No** | Open `/respond/[token]`, answer one category, submit | `responses` (invited rows) via anon RPC |

All writes target the church's **single existing `in_progress` run** (seeded at church creation by
`create_church_with_admin`). **M4 creates no new runs.**

**Load-bearing invariant:** `invitations` and `responses` have **no RLS policy at all** (default-deny). Every
read/write to them is via a `SECURITY DEFINER` RPC (Decision 2). There is **no** `lib/supabase/service.ts`;
the anon/authenticated client calls narrow definer functions, matching the existing RPC discipline
(`create_church_with_admin`, `accept_member_invitation`).

---

## 4. Locked decisions (carried from brainstorming)

1. **M4 = Type A accountless respondent + "Answer yourself."** Type B `/accept` + "Manage access" = M5.
2. **RLS bypass = `SECURITY DEFINER` RPCs, NO service-role client.** `lib/supabase/service.ts` is not created.
3. **"Answer yourself" = `submit_self_response` with OVERWRITE** — one self-answer per member/item/run, enforced by a partial unique index (§5.1).
4. **Resend wired live, decoupled send** — persist invitation first (DB token = source of truth), then send; on failure the invite still succeeds and the admin sees the copyable link + a "couldn't email it" notice (§8).
5. **Pure `coverage()` fn** classifying each category `not_started / partial / covered`; dashboard shows it; M5 reuses it as the diagnosis gate (§7).
6. **Rate-limiting deferred to M6** — M4 documents structural mitigations only (§10).
7. **Deferred fold-ins** — M2 I1 + I2, base-table GRANTs, `next.config.ts` tracing (§9).

---

## 5. Data model changes (migrations)

Three additive migrations. **No shipped file is edited.** The baseline (4 migrations + 6 pgTAP files,
72 assertions) stays intact; these new files extend it. Migrations slot in after `…000400`
(e.g. `…000500`/`…000600`/`…000700`; exact stamps finalized in writing-plans).

### 5.1 Partial unique index — "Answer yourself" overwrite (Decision 3)

```sql
create unique index responses_member_unique
  on public.responses (run_id, item_id, respondent_user_id)
  where respondent_kind = 'member' and respondent_user_id is not null;
```

One self-answer per member/item/run; re-submit UPSERTs onto this index. Scoped to member rows by the `where`
clause — invited/accountless rows (which legitimately have many rows per item, one per respondent) are untouched.

### 5.2 Explicit base-table GRANTs (Decision 7 / deferred #4)

A migration that issues exactly the privileges the app needs, so **cloud behaves identically to local**
regardless of Supabase's `auto_expose_new_tables` toggle:

- `SELECT` to `authenticated` on the tables the dashboard reads directly under RLS: `churches`,
  `church_members`, `assessment_runs`, `diagnoses`.
- `EXECUTE` on each M4 RPC to its intended caller (`anon` or `authenticated`) — declared per function in §6.
- `invitations` and `responses` receive **no** table-level `SELECT`/`INSERT` to `anon`/`authenticated` — they
  stay reachable only through `SECURITY DEFINER` RPCs (default-deny preserved).

### 5.3 I1 hardening — narrow `is_church_member` execute (deferred M2 I1)

New file — the shipped `…000400_rls_policies.sql` is **not** touched.

```sql
revoke all on function public.is_church_member(uuid) from public, anon;
grant execute on function public.is_church_member(uuid) to authenticated;
```

---

## 6. RPC set (the entire RLS-bypass surface)

Five `SECURITY DEFINER` functions, mirrored on the existing RPC style (`…000200`/`…000300` read before
writing). These functions **are** the only way anything touches `invitations` / `responses`.

| # | Function | Caller (`EXECUTE`) | Gate | Effect |
|---|---|---|---|---|
| 1 | `create_invitation(p_church_id uuid, p_category_id text, p_invited_name text, p_invited_contact text, p_channel text) → uuid` | `authenticated` | `is_church_member` + role `admin` | Insert pending invitation into the church's active run; return invitation id (= token) |
| 2 | `get_invitation_context(p_token uuid) → row` | `anon` | token valid/unexpired/unused | Return only safe render fields (`category_id`, `church_id`, church name, `run_id`, validity); invalid → uniform "not valid" |
| 3 | `submit_invited_response(p_token uuid, p_respondent_label text, p_answers jsonb) → void` | `anon` | token pending + unexpired | Atomic: insert 5 responses (`respondent_kind='invited'`, `invitation_id=token`, `respondent_label`=typed name); mark invitation `completed` |
| 4 | `submit_self_response(p_church_id uuid, p_category_id text, p_answers jsonb) → void` | `authenticated` | member | UPSERT caller's answers for the category in the active run (`respondent_kind='member'`, `respondent_user_id=auth.uid()`, `respondent_label` from `profiles`); overwrite via 5.1 |
| 5 | `get_run_coverage(p_church_id uuid) → rows` | `authenticated` | member | Return **aggregate-only** per-item response counts + per-category respondent counts for the active run — never raw values. Per-item granularity is **required** (the §7 classifier needs it to tell `partial` from `covered`) |

**Details & guarantees:**
- **#2 leaks zero response data** and gives a uniform invalid result for used/expired/revoked/unknown tokens
  (no oracle distinguishing "wrong token" from "expired").
- **#3 blocks double-submit** because the pending re-check happens inside the same transaction as the insert +
  status flip.
- **#5 is why the dashboard needs no RLS SELECT policy on `responses`** — only counts leave the function, so raw
  values stay confidential. It feeds the pure `coverage()` fn (§7).

**Deferred:** `revoke_invitation(token)` → M5 (not in Eng-Spec §13 M4 AC).

### 6.1 Validation split (honors the methodology-as-YAML guardrail)

- **SQL / RPC layer** does identity, authz, and state only: token valid/unexpired/unused, membership, role,
  run active — and leans on the DB `CHECK (value between 1 and 10)` and the 5.1 uniqueness index.
- **TS layer (which loads the YAML)** does all methodology-semantic checks: category exists, every `item_id`
  belongs to that category, all 5 items present. **Not** duplicated into SQL — the YAML stays the single source
  of methodology truth.

`p_answers` shape (both submit RPCs): a JSON array of exactly 5 objects `{ "item_id": text, "value": int 1..10 }`,
one per item of the invitation's / caller's category. The TS layer validates count, membership, and range against
the YAML **before** calling the RPC; the RPC re-relies on the DB `CHECK` for value range.

---

## 7. Coverage model (Decision 5)

A **pure, unit-tested** function classifies each of the 8 categories from `get_run_coverage` aggregates plus the
methodology (every category = exactly 5 items). Deterministic-engine discipline: the privileged aggregation is
the RPC (pgTAP-tested); the classification is pure TS (vitest-tested).

Per-category status:
- **`not_started`** — 0 responses for the category.
- **`partial`** — ≥1 response, but not all 5 items have ≥1 response.
- **`covered`** — all 5 items in the category have ≥1 response.

**Dashboard header** = count of `covered` → **"N of 8 areas."** The header at `app/app/[churchId]/page.tsx:56`
(currently hardcoded `"Assessment not started · 0 of 8 areas"`) becomes dynamic off this count.

Out of scope for M4 (stays M5): confidence-weighting by respondent count (`methodology/rules.yaml`
`rules.confidence`), run-completion, diagnosis rendering. M4's coverage is a **display/status** signal only; the
same function becomes M5's diagnosis gate — one implementation, two consumers.

---

## 8. UI surface + Resend seam

### 8.1 Routes / entry points

- **`app/respond/[token]/page.tsx`** — public RSC. Calls `get_invitation_context` via the **anon** server client.
  Renders one of: the 5-item form for that category (with respondent-name field), or an *invalid / expired /
  already-used* state. No auth, no session.
- **Respondent submit → `POST app/api/respond/[token]/route.ts`** (route handler, not a server action — matches
  Eng-Spec §1's explicit `/api/respond/[token]`, is a clean unauthenticated public boundary, and is trivially
  exercised by the incognito e2e). TS validates answers against the YAML (§6.1) → `submit_invited_response` →
  thank-you state.
- **Invite creation → admin-only server action** (under `app/app/[churchId]/…`, matching the M3 church-create
  pattern for session/CSRF). TS validates `category_id ∈ methodology` → `create_invitation` → hand token to the
  Resend seam → return `{ link, emailed: boolean }`.
- **"Answer yourself" → member flow** (`app/app/[churchId]/answer/[categoryId]`) reusing the **same 5-item form
  component** as the respondent page → server action → `submit_self_response`.
- **Dashboard** (`app/app/[churchId]/page.tsx`) — enable the two M4 stubs; `get_run_coverage` → `coverage()` →
  per-category status + dynamic "N of 8 areas". "View diagnosis" / "Manage access" stubs stay **disabled** (M5).

### 8.2 Resend seam (Decision 4 — decoupled send)

Thin `lib/email/*` adapter: `sendInvitationEmail({ to, link, churchName })`. Reads `RESEND_API_KEY` from env,
real send via the `resend` dep. **Persist-then-send:** the invitation is committed (DB token = source of truth)
*before* the send is attempted; on missing key or send error it **logs and returns a soft failure**, and the
caller surfaces the copyable `/respond/[token]` link + a "couldn't email it" notice — the invite is never lost.
From-address `onboarding@resend.dev` locally (no domain verification needed to send to one's own inbox).

**User action (not Claude's):** supply `RESEND_API_KEY` in `.env.local`; creating the Resend account / verifying
a production domain is the user's action. New dependency: `resend` (currently not installed).

---

## 9. Deferred fold-ins (Decision 7)

- **M2 I1** — narrow `is_church_member` execute → migration §5.3 (done early).
- **M2 I2** — negative pgTAP proving `churches_update` / `profiles_update_own` deny cross-tenant writes.
  **Test-only**, added to the existing `04_` RLS test file; raises the assertion count (exact `plan(N)` finalized
  when written — watch the recurring `plan()`-arithmetic and `throws_ok` 3-arg→4-arg bug class flagged in memory).
- **Deferred #4** — explicit base-table GRANTs → migration §5.2.
- **Deferred #3** — `next.config.ts` `outputFileTracingIncludes` so the serverless bundle traces the
  `methodology/` YAML (currently `next.config.ts` is empty). Small standalone config task + `next build` verify.

---

## 10. Security posture (Decision 6 — rate-limiting deferred to M6)

M4 relies on **structural mitigations**, documented here; real rate-limiting is M6:
- **UUID tokens** — invitation id is the token; unguessable, no enumeration.
- **Single-use** — `submit_invited_response` flips the invitation to `completed` atomically; replay is rejected.
- **30-day expiry** — `get_invitation_context` / `submit_invited_response` reject expired tokens.
- **Auth + admin-gated creation** — only an authenticated `admin` member can mint invitations.
- **Confidentiality** — `responses` default-deny; only aggregate counts leave via `get_run_coverage`; `#2` leaks
  zero results and gives a uniform invalid response.
- **M6 checklist item:** wire real rate-limiting (Upstash / Vercel KV) on the public `/respond` + submit endpoints.

---

## 11. Testing strategy

- **pgTAP** (extends the 72-assertion baseline; one file per RPC mirroring `02_`/`03_`): each RPC's authz gate,
  state transitions (pending → completed, double-submit rejected, expired rejected), aggregate-only shape of
  `get_run_coverage`, and the 5.1 overwrite behavior. Plus the M2 I2 negative RLS assertions in `04_`.
- **vitest**: the pure `coverage()` classifier (all three states, boundary cases at 0/partial/5 items); the TS
  YAML-validation layer (category exists, item ∈ category, all-5-present, out-of-range rejected before the RPC).
- **Real-browser e2e (verification-before-completion):** respond flow in a **fresh incognito session** per
  Eng-Spec §13 AC, and a **live Resend send** to the user's own inbox.
- Gates to stay green: `tsc --noEmit` 0, `eslint .` 0, `vitest` all pass, `supabase db reset && supabase test db`
  all pass, `next build` ok.

---

## 12. Acceptance criteria (Eng-Spec §13, M4 = Invite + Respond)

1. An admin can create an invitation for a category and receives a working `/respond/[token]` link (emailed live;
   link also shown copyable, with a "couldn't email it" notice on send failure).
2. A person with **no account** can open the link in a fresh incognito session, answer the category's 5 items,
   type their name, and submit; the invitation becomes single-use thereafter.
3. Invalid / expired / already-used tokens render a uniform "not valid" state and leak no church/response data.
4. A logged-in member can answer a category themselves, and re-answering overwrites their prior answer.
5. The dashboard shows per-category coverage (`not_started/partial/covered`) and a dynamic "N of 8 areas" header,
   without any RLS SELECT policy on `responses`.
6. `invitations` and `responses` remain default-deny; all access is via `SECURITY DEFINER` RPCs; no service-role
   client exists.
7. Baseline preserved: the 4 shipped migrations + 6 pgTAP files are unchanged; new tests extend the count.

---

## 13. Suggested build order (refined in writing-plans; not binding)

1. **M2 hardening first** — I1 grant migration + I2 negative pgTAP (tighten the baseline before building on it).
2. Explicit-GRANTs migration + partial-unique-index migration.
3. RPCs 1–5, TDD, one pgTAP file per RPC mirroring `02_`/`03_`.
4. Pure `coverage()` fn (vitest).
5. Resend adapter + invite-create server action.
6. `/respond/[token]` page + `POST /api/respond/[token]`.
7. "Answer yourself" member flow.
8. Dashboard wiring (coverage + enable the two stubs).
9. `next.config.ts` `outputFileTracingIncludes` + build verify.

---

## 14. Guardrails (carry all)

anon-key → RLS only; **no service-role client** (Decision 2); `--berry #8E2B3E` never a tile; deterministic
engine / additive AI; methodology-as-versioned-YAML (§6.1); do **not** `npm audit fix --force`; do **not** touch
M3 code except deliberate M4 additions; preserve the 72-assertion baseline (add to it). Consider a
`feat/m4-invite-respond` branch/worktree at implementation start.
