# Results-viewed email to XP Gathering: design

Date: 2026-09-15. Branch: `feat/results-viewed-email` (off master `58ddec9`).
Status: design approved in session; this spec awaits owner review.

## Goal

When a church admin opens their church's assessment report after that church's assessment is
complete, email kevin@xpgathering.com once, with a short summary of the results. A failed send never
affects the report.

## Owner decisions (2026-09-15)

1. **How often: first time only.** One email per completed assessment (run), sent the first time any
   of that church's admins opens the report. If the send fails, a later admin open retries.
2. **Summary:** overall score, health stage, and each area's score.
3. **Approach:** claim in the database, send, then mark as emailed (chosen over check-then-send, which
   can double-send, and over a cron sweep, which delays Kevin by up to a day).
4. **No backfill.** A church whose assessment was already closed before this ships sends one email on
   its next admin view (test churches included).
5. **Server-only claim and mark** (added after the PR #91 review). Both RPCs are granted to
   `service_role` only, so a church admin cannot suppress or postpone the email by calling them with
   their own session; the report page's admin check is what authorizes the call.

## Facts from the code this rests on

- `app/app/[churchId]/diagnosis/page.tsx` is the report. It redirects every non-admin to the
  dashboard (`const isAdmin = role === 'admin'; if (!isAdmin) redirect(...)`) before loading anything.
- "Complete" is `assessment_runs.status = 'complete'`, written only by the admin's Close
  (`close_run`, ADR 0003) and cleared by `reopen_run`. Admins can also view the report of an open run
  (it carries the "N of M finished" note).
- The report renders only when a `diagnoses` row exists (otherwise `EmptyState`) and the run is
  scoreable (otherwise a notice). The cover (`CoverModel.score`, `CoverModel.tierName`) and the area
  scores (`Diagnosis.categories[].score`, names from the effective methodology) exist only on that path.
- Health stage is the tier name (`methodology/rules.yaml`: Healthy & Ready, Healthy but Stretched,
  Growth Constrained, Strategic Priority), shown on the cover as `${tierName} · ${score} of 100`.
- Email is Resend through `lib/email/*`. Senders never throw: a missing key, a Resend error, or a throw
  returns `{ ok: false }`. Content goes through `renderBrandedEmail` (html plus a plaintext mirror).
- Privileged writes are `SECURITY DEFINER` RPCs that resolve the run with `current_run(church_id)`. A
  member-callable one gates with `require_church_admin(run_id)` (`close_run`, `20260818000100`); a
  server-trusted one is granted to `service_role` only and trusts its caller to authorize
  (`bind_invited_member`, `20260914000100`). `lib/data/*` is the anon-key + RLS seam (ADR 0002), so
  service-role calls live outside it, as `lib/auth/invited-account.ts` does.
- The route has no `loading.tsx` and the app does not enable `cacheComponents`, so a `<Link>` prefetch
  of the report never executes the page component. Only a real navigation renders it.

## Trigger

The notification step runs on the report page, inside the scoreable branch, after
`resolveReportSections`. It sends only when all of these hold:

- the viewer is an admin of the church;
- the run's status is `complete`;
- the full report renders (a diagnosis exists and the run is scoreable).

It never runs for an open run's report, the "can't be scored yet" notice, the empty state, the PDF
route (`/api/report/[runId]/pdf`), or the public share page (`/r/[shareToken]`).

## Once per completed assessment

Migration `supabase/migrations/20260915000100_results_viewed_email.sql`:

- `assessment_runs` gains `results_viewed_email_claimed_at timestamptz null` and
  `results_viewed_emailed_at timestamptz null`. No backfill.
- `claim_results_viewed_email(p_church_id uuid) returns boolean`: `security definer set search_path =
  public`; resolve through `current_run`; raise `no run for this church` when there is none; then one
  conditional `update` that sets
  `results_viewed_email_claimed_at = now()` where `status = 'complete'` and
  `results_viewed_emailed_at is null` and the claim is null or older than 5 minutes. Returns whether a
  row was updated. Concurrent claims serialize on the row lock, so within the hold at most one caller
  gets `true`.
- `mark_results_viewed_emailed(p_church_id uuid) returns void`: same resolution; sets
  `results_viewed_emailed_at = now()` where it is null.
- Both: `revoke all ... from public, anon, authenticated; grant execute ... to service_role`. No
  `require_church_admin`: `service_role` has no `auth.uid()`, and the caller (the admin-only report page)
  authorizes instead. Members have no update policy on `assessment_runs`, so these two functions are the
  only writers of the timestamps.
- `close_run` and `reopen_run` are untouched, so reopening and closing again never re-sends.

Delivery is at-least-once, biased toward Kevin hearing about it:

- A failed send leaves the run unmarked; the next admin view after the 5-minute hold retries.
- A process that dies mid-send also retries after the hold.
- A successful send whose mark fails can repeat once after the hold (logged).
- No retry delivers twice inside Resend's 24-hour idempotency window: the send carries an idempotency
  key built from the run id and a digest of the exact message, so an identical retry returns Resend's
  original result instead of sending again.

## Units

1. **`lib/notify/results-viewed-store.ts`** (server-trusted store, deliberately not under `lib/data/`).
   `claimResultsViewedEmail(churchId, admin = createServiceRoleClient()): Promise<boolean>` and
   `markResultsViewedEmailed(churchId, admin = createServiceRoleClient()): Promise<boolean>`. A missing
   service-role key (null client) or any RPC error, including "function does not exist" before the
   migration is applied, logs one reason-only warning and returns `false`.
2. **`lib/notify/results-viewed.ts`** (pure builder plus orchestrator).
   - `resultsViewedSummary({ churchName, cover, areaScores, areaNames })` returns
     `{ churchName, overallScore, healthStage, areas: { name, score }[] }`. Areas follow the report's
     order (score high to low, ties by area id); a missing name falls back to the area id, as
     `lib/report/facts.ts` does. Total: never throws.
   - `notifyResultsViewed(input, deps)` with
     `input = { viewerIsAdmin, runStatus, buildSummary: () => ResultsViewedSummary }` and
     `deps = { claim, send, mark }`. Order: gate (admin and complete) → build summary → claim → send →
     mark only on `ok` (building first means a claim is only taken when there is something to send). Returns an outcome: `skipped`, `not_claimed`, `sent`, `send_failed`, or `error`.
     Never rejects: a builder or claim that throws becomes `error`; a send that throws counts as
     `send_failed`; a mark that fails or throws still returns `sent`, because the email went out. Each
     failure logs one reason-only warning.
3. **`lib/email/send-results-viewed.ts`**.
   `resultsViewedEmailContent(summary)` (pure: subject plus branded-email args),
   `resultsViewedIdempotencyKey(runId, message)` (pure: `results-viewed-email/<run id>/<digest of the
   message>`), and `sendResultsViewedEmail(summary, runId): Promise<{ ok: boolean }>`. Recipient constant
   `RESULTS_VIEWED_TO = 'kevin@xpgathering.com'`. From comes from a new `notificationFrom()` in
   `lib/email/layout.ts` (`EMAIL_FROM`, then the same Resend test-address fallback the other senders
   use). Soft-fails on no key, a Resend error, a throw, or no response within 5 seconds. The digest in
   the key gives a corrected message (say after `EMAIL_FROM` is fixed) a new key, instead of Resend's 409
   for a key reused with a different payload.
4. **Page wiring** in `app/app/[churchId]/diagnosis/page.tsx`. One
   `await notifyResultsViewed(...)` at the end of the scoreable branch, with `viewerIsAdmin: isAdmin`,
   `runStatus: run!.status`, `buildSummary` over `resolved.cover`, `resolution.diagnosis.categories`, and
   `reportMethodology.questions.categories`, and deps bound to `churchId` (claim and mark, through the
   service-role store) and `run!.id` (the send's idempotency key). The outcome is ignored; rendering
   continues either way.
5. **`CONTEXT.md`**: one glossary line under "Report and delivery".

Why inline and not `after()`: inline keeps the claim, send, and mark inside the request, where tests
pin them, and the cost is bounded: one small RPC per view of a closed report, and the first view also
waits for the send, capped at 5 seconds. Now that the store uses the service-role client, no step needs
this request's cookies, so `after()` is a candidate if that first-view wait ever matters; prove it in a
preview before switching.

## Email

- To: kevin@xpgathering.com. From: `EMAIL_FROM`.
- Subject: `<church name> viewed their assessment results`
- Branded shell, no call-to-action button, default sign-off.
- Heading: `<church name> viewed their assessment results.`
- Paragraphs (each is one line in the plaintext mirror):
  - `Overall score: 69 of 100`
  - `Health stage: Growth Constrained`
  - `Area scores:`
  - one per area, report order, for example `Governance / Accountability: 76`
- Church-level numbers only: no respondent names, labels, per-person counts, or reflections.

## Failure handling

| Failure | Result |
|---|---|
| Migration not applied yet (RPC missing) | claim returns false; no email |
| No `SUPABASE_SERVICE_ROLE_KEY` (null client) | claim returns false; no email; one warning per view |
| Viewer not an admin, run open, or report not rendered | skipped before any database call |
| Claim RPC error | no email; logged |
| No `RESEND_API_KEY`, Resend error, throw, or 5-second timeout | `send_failed`; not marked; retried by an admin view after the hold, and the idempotency key keeps a late-accepted send from arriving twice |
| Mark RPC error after a sent email | logged; a repeat after the hold is deduplicated by the idempotency key for 24 hours |

In every row the report renders normally.

## Tests

Vitest (agent-run):

- `notifyResultsViewed` with fake deps:
  - sends and marks when the viewer is an admin, the run is complete, and the claim wins;
  - skips a non-admin and an open run without calling claim;
  - `not_claimed` sends nothing;
  - `send_failed` does not mark;
  - a failed mark still reports `sent`;
  - a throwing claim, builder, send, or mark resolves instead of rejecting.
- `resultsViewedSummary`: overall score, stage, every area named and scored, report order, tie order,
  missing-name fallback.
- `resultsViewedEmailContent`, `resultsViewedIdempotencyKey`, and `sendResultsViewedEmail` (Resend mocked
  as in `tests/email/send-reminder.test.ts`): recipient, subject, the one line, overall score, stage, each
  area, church name escaped in html, soft-fail on no key, error, throw, and timeout; `notificationFrom()`;
  the key names the run, is stable for an identical retry, changes with any message field, and stays
  under 256 characters.
- Store against a PostgREST-shaped fake: `true` passes through; an error returns `false`; a null
  service-role client returns `false` without any call.
- Page wiring tripwire (source read): the call sits after the admin redirect and inside the scoreable
  branch, passes `isAdmin` and `run!.status`, reaches the database only through the store (never a
  service-role client built in the page) and Resend only through the sender with `run!.id`.
- Migration tripwire (source read): both columns; both functions security definer through `current_run`
  with no session-based admin gate; the status, emailed, and 5-minute predicate; service-role-only grants.

pgTAP `supabase/tests/29_results_viewed_email_test.sql` (owner-run): neither function is executable by
the church's own admin session or by anon; as `service_role`, a claim on a closed run is true then false,
an open run returns false, a stale claim is reclaimable, mark blocks further claims and never overwrites
an existing emailed time, and reopen then close does not reset.

Gates before the PR: `npm test`, `npm run typecheck`, `npm run lint`.

## Owner tail (goes in the PR)

1. `supabase db push`, then `npm run test:db`.
2. Vercel production has `SUPABASE_SERVICE_ROLE_KEY` (the invitation flow needs it too), plus
   `RESEND_API_KEY` and `EMAIL_FROM` on the verified domain (invitations already need both). Without the
   service-role key nothing is sent and each closed-report view logs one warning.
3. Expect one email per already-closed church on its next admin view, test churches included.
4. Any environment with a real `RESEND_API_KEY`, local dev included, sends real email when an admin
   opens a closed church's report for the first time.

## Out of scope

PDF downloads and share-link views as triggers; re-sending after a reopen; a configurable recipient;
showing admins that Kevin was notified; backfill.
