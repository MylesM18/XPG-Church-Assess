# ADR 0003 — Admins close and reopen the assessment; generating a diagnosis no longer completes it

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Natalie (owner), design review (session 11)
- **Amends:** [ADR 0001](0001-review-only-completion-defer-multi-run.md) — completion is no longer
  terminal, and `save_diagnosis` no longer writes it. ADR 0001's review-only member view and its
  single-run model stand.
- **Related:** spec `docs/superpowers/specs/2026-08-18-close-assessment-design.md`; migration
  `20260818000100_close_reopen_run.sql`; `CONTEXT.md` (Close assessment, Reopen assessment,
  Completeness); `docs/XPG-Engineering-Spec.md` §14 (multi-run still out of scope).

## Context

A church has exactly one `assessment_runs` row. Under ADR 0001 the ONLY writer of
`status = 'complete'` was the `save_diagnosis` RPC, which the admin's **Generate diagnosis**
button calls, and completion was terminal. So the moment an admin generated a diagnosis, every
member who had not finished — including people invited *afterwards* — landed on read-only
pages ("This assessment is complete, so your answers are read-only") and `submit_self_response`
refused their writes. Not an RLS problem (`runs_select` covers members); the completion model.

## Decision

1. **Completion is an explicit, reversible admin action.** Two SECURITY DEFINER RPCs,
   `close_run(p_church_id)` and `reopen_run(p_church_id)`, gated by `require_church_admin`,
   resolve the run through `current_run()` and flip `status` (`in_progress ↔ complete`), stamping
   / clearing `completed_at` plus a new audit pair `closed_at` / `closed_by`. The `status` CHECK,
   `RunStatus`, `canAcceptAnswers`, `submit_self_response`, sharing, and
   `completion_reminder_recipients` are unchanged: `complete` still means "no more answers", so
   Close = read-only with no new gate, and reminders stop on Close / resume on Reopen.
2. **Generate no longer touches run status.** `save_diagnosis` loses its `run is already
   complete` gate and its status/`completed_at` flip. Generate and Regenerate work before and
   after Close.
3. **`get_run_responses` and `get_completed_run_responses` are status-agnostic and equivalent** —
   both now resolve through `current_run()`. The names are kept so the four call sites do not
   move; unifying them is a later slice. This closes ADR 0001's own "still pending" follow-up
   for these two (`get_shared_run_responses` remains inline, by share token, and is out of scope).
4. **No coverage gate on Close** (Q2): the confirm shows "N of M members have finished"; Generate
   keeps its own ≥ 1-fully-covered-respondent-per-area gate.
5. **No backfill** (Q5): existing `complete` runs stay closed with `closed_at` null (the member
   copy falls back to the old sentence; the dashboard line omits the date); an admin fixes them by
   clicking Reopen.

## Alternatives considered

- **A — one-way close, no Reopen.** Rejected: contradicts Q1/Q5 (Test Church must be reopened,
  and a mistaken close must be recoverable).
- **C — a new `'closed'` status value.** Rejected: churns the CHECK constraint, `RunStatus`,
  `canAcceptAnswers`, `completion_reminder_recipients`, and every pgTAP seed for no semantic gain,
  since `complete` already means "no more answers".

## Consequences

- **Positive:** invitees can answer until an admin decides otherwise; a diagnosis can be
  generated early and regenerated after closing; the two report-path read RPCs stop hiding a
  policy inside a lookup; the audit pair records who closed and when.
- **Negative / accepted:** an admin can Reopen after a report exists — the report's `stale`
  flag flips on the first changed answer and Regenerate is offered (no new machinery); reminder
  emails may resume on Reopen (the confirm says so).
- **Negative / accepted:** because Generate no longer flips status, `completion_reminder_recipients`
  (which gates on `status = 'in_progress'`) keeps sending daily completion reminders after a
  diagnosis is generated, until the admin Closes or the member's `assessment_deadline_at` passes —
  previously reminders stopped at Generate. The predicate itself is unchanged and still correct
  under the new model ("not closed").
- **Still out of scope:** multiple runs / historical re-assessment (spec §14), auto-close on
  deadline, changing the Generate coverage gate, unifying the two `get_*_run_responses` RPCs,
  any change to sharing or `/r/[shareToken]`.
