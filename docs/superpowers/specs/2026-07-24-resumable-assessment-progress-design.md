# Resumable Assessment Progress — Design

- **Date:** 2026-07-24
- **Branch:** `feat/resumable-assessment-progress` (off `master` @ `6bedf6c`, which includes merged PR #19)
- **Status:** Approved by owner (Natalie) 2026-07-24 via `superpowers:brainstorming`. Ready for `superpowers:writing-plans` after owner reviews this spec.

## Problem / Goal

On the assessment dashboard, the per-area "Answer yourself" control should become a state-aware guide — and, more importantly, people (viewers **and** admins) must be able to sign back in and resume the assessment exactly where they left off. Progress must be recorded so a returning user is never forced to restart.

## Owner decisions (locked)

1. **Button scope:** ONE assessment-level primary button on the dashboard (not per-card state labels). Its label cycles **Start Assessment → Continue Assessment → Take Again**. The 8 per-area card links keep their current label and behavior.
2. **Save cadence:** Save on advancing past each question, so resume lands on the exact question. (Not debounced autosave.)
3. **"Take Again":** Prefill previous answers for review/edit (retake overwrites in place; no history kept). The completed-state button keeps the literal label **"Take Again"**.
4. **UI details:** the primary button navigates **same-tab**; the 8 card links keep `target="_blank"` / `rel="noopener noreferrer"`; the **last question's button reads "Finish"** and returns to the dashboard.
5. **Sequencing:** PR #19 is merged into master; this feature builds on a fresh branch off the updated master. (Resolved — no gating, no rebase.)

## Key facts from exploration (established — do not re-derive)

**Already satisfied — NO work needed:**
- Invited viewers already get a real stored account: the accept flow forces sign-in as the invited email, and `accept_member_invitation` creates the `church_members` row. Files: `app/accept/[token]/page.tsx`, `app/accept/[token]/actions.ts`.
- Profiles auto-created by the `handle_new_user()` trigger on `auth.users` → `public.profiles (id, full_name, email, avatar_url, created_at)` (`supabase/migrations/20260715000100_schema.sql`).
- ⇒ Natalie's "viewer account + profile (name/email) stored so they can return" requirement is **already true**. No new tables, no new profile storage.

**Already supported for WRITES — NO schema change:**
- Unique index on `public.responses (run_id, item_id, respondent_user_id)` — `supabase/migrations/20260716000300_responses_member_unique.sql`.
- `submit_self_response` accepts **1..50** answers and **upserts per item** (`on conflict (run_id, item_id, respondent_user_id) do update set value = excluded.value`) — `supabase/migrations/20260716000900_submit_rpcs_bounds_guard.sql`. ⇒ Partial and single-item writes already work; retake **overwrites**, no double-count.
- `lib/coverage/coverage.ts` already computes per-category `not_started | partial | covered` plus `coveredCount`.

**The gaps this feature closes:**
1. **Cannot save partial from the UI.** `lib/answers/validate.ts` → `validateCategoryAnswers` requires **exactly N** answers; `components/answer-form.tsx` (~line 81) refuses to submit unless every item is answered and submits all items in one RPC at the end.
2. **Cannot read answers back to resume.** `public.responses` has RLS enabled with **intentionally NO policy** (default-deny) — see `20260715000400_rls_policies.sql:67`. All reads go through `security definer` RPCs; none returns the caller's own raw answers.
3. **Form cannot resume.** `app/app/[churchId]/answer/[categoryId]/page.tsx` never fetches existing answers; `components/answer-form.tsx` always starts blank at step 0.
4. **Button labels.** Today a static per-area "Answer yourself" link (`app/app/[churchId]/page.tsx:136-143`); the whole-assessment status is text-only (`page.tsx:73-77`).

## Design

### A. Dashboard button (behavior)

Derive whole-assessment state from the coverage the dashboard already computes (across all 8 categories):

| State | Condition | Label | Routes to |
|---|---|---|---|
| Not started | 0 items answered anywhere | **Start Assessment** | first category, Q1 (blank) |
| In progress | some answered, fewer than 8 covered | **Continue Assessment** | first non-covered category, at its first unanswered question |
| Complete | all 8 categories covered | **Take Again** | first category, Q1 (prefilled to review/edit) |

- The dashboard chooses the **target category id** (it already has per-category coverage). The **step within** the category is chosen by the form page (§B), not the dashboard.
- Primary button navigates **same-tab**. The 8 per-area card links are unchanged (keep `target="_blank"` / `rel="noopener noreferrer"`) and gain resume automatically because the shared form page is upgraded.

### B. Resume (form page + form)

- `app/app/[churchId]/answer/[categoryId]/page.tsx` pre-fetches the caller's saved answers for the category via the new RPC (§D) and passes them to the form as `initialValues`.
- `components/answer-form.tsx` opens at the **first unanswered question** (or step 0 if all are answered) and pre-fills the rest.

### C. Save-on-advance (server action + form)

- A server action saves each answer as the user advances, **reusing `submit_self_response`** (single-item upsert). No new migration.
- A **partial-tolerant validator** — a new function alongside the existing strict `validateCategoryAnswers` — validates a single/subset answer (value in range; `item_id` belongs to the category). Keep the strict validator for any existing full-submit callers (verify callers during the build).
- The last question's button reads **"Finish"**, saves the last answer, and returns to the dashboard. No separate bulk-submit; "covered" is derived from coverage once all N items exist.

### D. The one DB change (read RPC + pgTAP)

New `security definer` function (suggested migration `supabase/migrations/20260724000400_rpc_get_my_category_answers.sql`; pgTAP in `supabase/tests/`):

```
get_my_category_answers(p_church_id <uuid>, p_category_id <match schema>)
  returns table(item_id <match schema>, value <match schema>)
```

- Resolves the church's **active run** internally; returns ONLY the **caller's own** `(item_id, value)` rows for that run + category.
- Exact column types match the existing `responses` / items schema — pin them by reading the schema during the build, do not guess.
- Preserves the **"viewers never see results"** invariant: returns raw own-answers only — never scores, aggregates, or anyone else's data. `responses` stays default-deny. Same pattern as the existing `get_run_coverage` / `get_member_run_coverage` RPCs.

## Security & invariants

- New RPC is caller-scoped, own-data only; no results/aggregate exposure.
- Admins are included (the RPC returns whoever-is-asking's own answers regardless of role), matching Natalie's "same for an admin taking the assessment."

## Scope / non-goals (YAGNI)

- **No** new tables; **no** profile changes (already stored); **no** answer history/versioning (retake overwrites in place, exactly as today).
- Per-card links: label/behavior unchanged (they gain resume via the upgraded form page).
- One assessment-level button only — no per-card state labels.
- **No** new dependencies.

## Testing

- **Unit (vitest):** partial-tolerant validator; dashboard state→label→target-category logic; form resume/prefill (opens at first unanswered; all-answered → step 0).
- **pgTAP (owner-run):** new RPC returns caller-own rows only; cross-user / non-member isolation. ⛔ NEVER `npm run test:db` — authored by agent, run by owner.
- Preserve existing pins in `tests/dashboard/self-assessment-wiring.test.ts` (`target="_blank"`, `rel="noopener noreferrer"`, `covered: 'Completed'`, `<RefreshOnFocus`). Reword the stale "Answer yourself" **assertion-message string** (comment/message-only edit; not an assertion).

## Build shape (for writing-plans)

~4–6 task subagent-driven SDD build. Suggested decomposition:
1. New read RPC + pgTAP.
2. Partial-tolerant validator (+ unit tests).
3. Save-on-advance server action wired into `answer-form.tsx`.
4. Form page prefetch + form resume/prefill (open at first unanswered).
5. Dashboard single-button state/label/routing.
6. Wiring tests + stale message-string reword.

Gates per task: typecheck + lint + vitest. pgTAP authored-by-agent, run-by-owner.

## Guardrails

- ⛔ NEVER `npm run test:db`. ⛔ Never merge/push/force without Natalie.
- Git: explicit paths only; never `git add -A`; never stage `.claude/`. Prefix `GIT_LITERAL_PATHSPECS=1` for any path under `app/app/[churchId]/…` (brackets are glob-magic) — this feature touches `app/app/[churchId]/page.tsx` and `app/app/[churchId]/answer/[categoryId]/*`.
- Role idiom: inline `m.role = 'admin'`.
