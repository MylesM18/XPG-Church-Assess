# ADR 0001 — Completed runs are review-only; multi-run re-assessment is deferred

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Natalie (owner), architecture review
- **Related:** `docs/XPG-Engineering-Spec.md` §14 (out-of-scope for v1); `CONTEXT.md`
  (Current run, canAcceptAnswers); migrations `20260716000900`, `20260727000100`,
  `20260727000200`.

## Context

An assessment run is created exactly once, at church creation, with
`status = 'in_progress'`. `save_diagnosis` flips it to `complete`. No code path
creates a second run or resets the status.

Two rules about "the run" were expressed inline at ~13 call sites and had drifted:

1. **Which run** — `select … from assessment_runs where church_id = ? [and
   status='in_progress'] order by created_at limit 1`. The read RPCs
   (`20260727000100/200`) deliberately dropped the `status` clause so coverage and the
   report survive completion; the write RPC `submit_self_response`
   (`20260716000900`) deliberately keeps it (the one-shot submit/diagnosis gate).
2. **What counts as complete** — "answered every item", expressed independently in
   `lib/coverage/coverage.ts`, `lib/engine/fit.ts`, and two diagnosis gates.

This asymmetry surfaced a live defect: after completion, the dashboard's primary CTA
returned **"Take Again"** and linked to the answer form; the form prefilled via the
(unfiltered) read RPC, but the first save hit `submit_self_response`, which found no
`in_progress` run and raised `no active run for this church`. The label promised
re-assessment the write layer forbids.

We had to decide what "Take Again" should *mean* before we could give the run-
resolution rule a single home, because the choice determines whether the model stays
single-run and whether completion is terminal.

## Decision

**For v1, a completed run is review-only. Completion is terminal. The product stays
single-run.**

- The complete-state CTA is relabelled **"Review answers"** and opens the answer form
  **read-only**.
- The run-resolution rule is split into two named concepts (see `CONTEXT.md`):
  **Current run** (`currentRun` / `current_run`, status-agnostic — reads, dashboard,
  report, review view) and **canAcceptAnswers** (`run.status === 'in_progress'` —
  writes and form editability). The `status` clause stops being a per-call-site choice.
- Completeness is defined once (`isCategoryComplete` / `isRunComplete`) and shared by
  the coverage code and both diagnosis gates.
- `submit_self_response` keeps rejecting writes to a completed run, now via
  `canAcceptAnswers`, with the accurate message `run is complete; answers are
  read-only`.

## Alternatives considered

- **Re-assess (start a new run).** "Take Again" inserts a fresh `in_progress` run.
  Rejected for v1: it introduces the multi-run / historical re-assessment model that
  spec §14 explicitly defers. It changes Current run to *latest* run (`created_at`
  DESC), needs a new start-run RPC (owner-gated migration), and requires every read
  and coverage path to become run-scoped. Revisit when historical re-assessment is
  actually on the roadmap — at which point the `currentRun` seam is the single place
  the change lands.
- **Allow edits to a completed run.** Drop the write-side `in_progress` filter.
  Rejected: migration `20260727000100` documents that filter as load-bearing (the
  one-shot diagnosis gate), and it would let a cached diagnosis go stale against later
  edits without a re-derive.

## Consequences

- **Positive:** closes the `no active run` dead-end (a read-only form makes no write
  attempt); the run rule and the completeness rule each live in one place; a future
  policy change stops needing multiple migrations; the completeness definition becomes
  testable through one interface. The TS half closes the bug with no migration.
- **Negative / accepted:** users cannot re-take the assessment in v1; "Review answers"
  is a genuine product limitation, recorded here so it is not re-flagged as a bug or
  re-proposed as multi-run without reopening this ADR.
- **Follow-up:** re-point the tripwire test
  `tests/coverage/member-category-coverage-rpc.test.ts` (it asserts a superseded
  migration). Reconcile whether the two diagnosis gates currently agree on
  "complete" — extracting the shared predicate makes that checkable.

## Implementation status (2026-07-30)

- **Wave 1 (TS, closes the bug — no migration): shipped** on `feat/review-only-completion`.
  `currentRun`/`canAcceptAnswers` (`lib/runs/current-run.ts`); the completed-run answer page
  renders a read-only review; CTA relabelled to "Review answers". Confirmed the two diagnosis
  gates DO agree ("at least one fully-covered respondent"); `classify`'s aggregate coverage is a
  distinct notion, left as-is.
- **Wave 2 (SQL locality): shipped** on the same branch — migration
  `20260730000100_fn_current_run_dedup_resolution.sql` adds `current_run(church_id)` and routes six
  RPCs through it (`submit_self_response`, `save_diagnosis` — now gating on status with
  `run is complete; answers are read-only`; `get_run_coverage`, `get_member_run_coverage`,
  `get_member_category_coverage`, `get_my_category_answers`). Re-pointed the stale tripwire onto the
  live definition. ⚠️ **Owner-gated:** apply with `supabase db push` and verify with
  `npm run test:db` (pgTAP) — the agent runs neither.
- **Still pending (pgTAP-gated follow-up):** route the three report-path RPCs
  (`get_run_responses`, `get_completed_run_responses`, `get_shared_run_responses`) through
  `current_run` too.
