# Report anonymity + privacy announcement — design spec

- **Date:** 2026-07-29
- **Branch:** `feat/diagnosis-report-reform`
- **Status:** Design approved by owner (Natalie). Ready for `writing-plans`.
- **Scope:** TS/TSX only. No new migration. No new dependencies.

## Problem

Natalie's request, verbatim intent:

> "Add an anonymous aspect so the users who answered the questions stay anonymous — on the final report it doesn't show who answered who. Also make an announcement somewhere that lets it be known that their answers are private."

Discovery finding: the diagnosis report is **already anonymous on two of its three surfaces.** The report uses a deliberate 3-audience model in `lib/report/view.ts` (`ReportAudience = 'screen' | 'pdf' | 'shared'`):

- `screen` — the leader's authenticated diagnosis page (`app/app/[churchId]/diagnosis/page.tsx`)
- `pdf` — the PDF export (`app/api/report/[runId]/pdf/route.ts`)
- `shared` — the public tokenized share link (`app/r/[shareToken]/page.tsx`)

The **only** respondent-identity surface anywhere on the report is the per-person disagreement list — `respondents: Array<{ label: string; mean: number }>`, a "name → their mean score" list shown on areas where leaders disagree. It is already stripped for `pdf` and `shared`, but **kept for `screen`**, in two places in `view.ts`:

- `buildSystem(...)` → `system.disagreement.respondents` (the `?[]:flag.respondents` ternary, ~`view.ts:283-284`)
- `buildReportView(...)` → top-level `dispersion.respondents` (the `?[]:(flag?.respondents ?? [])` ternary, ~`view.ts:350-353`)

So the exported PDF and the public share link already hide who-said-what. The single remaining leak is the leader's on-screen report. There is no existing user-facing anonymity/privacy copy anywhere in the app (`grep -rin anonym app/ lib/ methodology/` finds only code comments).

## Decisions (owner-approved)

1. **Report scope — hide names everywhere.** Strip the per-person respondent list from the `screen` audience too, so every report surface shows only combined results. The aggregate disagreement narrative stays.
2. **Announcement placement — Answer page + Invite-accept landing.** The two surfaces closest to the moment a member answers.
3. **Wording — "never shown" framing.** Truthful about what the system actually guarantees. Members' answers *are* linked to their account in the database (required for progress-saving, "take again" prefill, and scoring), so "completely anonymous" (as in *nothing stored*) would overstate it. The honest, still-reassuring promise is confidentiality of display.

## Non-goals (explicitly out of scope)

- **`respondent_user_id` / PR #34** — untouched. It exists for stable engine grouping (so two people with colliding display names don't merge), not display. It stays in the DB; correct scoring, resumable progress, and the member matrix depend on user-linked answers.
- **The engine's `flag.respondents` source data** (`Diagnosis.disagreement_flags[].respondents`) — still computed by the engine; we simply stop surfacing it in the `screen` view. No engine change.
- **The dashboard member-coverage matrix** (`app/app/[churchId]/member-coverage-matrix.tsx`) — shows per-member *completion status* ("John completed Volunteers"). That is participation tracking for the admin, not answer attribution. Natalie's ask is "who answered who" (= who gave which answers), which is the disagreement list, not the matrix. Left as-is.
- **No new database migration.** The anonymity change is a view/render decision, not a storage change.

## Design

### Part A — Close the report leak

Make respondent-stripping **unconditional** in `lib/report/view.ts` so the `screen` audience behaves identically to `pdf`/`shared`.

1. **`buildSystem(...)`** — `system.disagreement.respondents`: replace the audience ternary with an unconditional `[]`. `flag` is still read here for the narrative text (`flag.category_id`, `flag.spread`), so the variable stays in use — only `flag.respondents` stops being referenced.

2. **`buildReportView(...)`** — top-level `dispersion.respondents`: replace the audience ternary with an unconditional `[]`. This makes `const flag = d.disagreement_flags[0];` (~`view.ts:323`) **unused in this function** (it was only referenced by that one ternary), so **delete that `const flag` line** to keep `npm run lint` (no-unused-vars) green. The `dispersion.text` field is sourced from `blocks.dispersion` and is unaffected.

3. **Doc comment** — update the block comment above `buildReportView` (currently "audience 'pdf' and 'shared' both empty dispersion.respondents…") so it states the per-person list is now emptied for **all** audiences. The reasoning stays the same (the list must never leave the permission wall; now it is never shown at all), so the next reader is not misled into thinking `screen` still carries names.

**`app/app/[churchId]/diagnosis/report/system.tsx`** — no functional change required. The `Disagreement` component already renders the per-person list behind a `{respondents.length > 0 && …}` guard, so an always-empty array simply renders nothing while the "Where your leaders disagree" heading + narrative text stay. The prop type is left as-is (the array is still passed, now always empty), consistent with how `shared.tsx` already passes the already-empty `shared`-audience array. We do **not** remove the `respondents` field/prop — that would churn the view type + two components + several tests for no behavioral gain (YAGNI), and it keeps the door open for the "anonymized rows" option should it ever be wanted.

### Part B — Privacy announcement

A new shared presentational component renders the approved copy once, so both surfaces read identically (no copy drift).

- **Component:** `components/anonymity-note.tsx` — a small, muted, always-visible callout styled to match the app's existing static-note convention (`font-body text-ink-soft`; the `GatingFlags` note in `app/app/[churchId]/diagnosis/report/system.tsx` is the closest precedent — `<p className="font-body text-sm text-ink-soft">`). It is a plain presentational block, **not** an interactive disclosure. Presentational only: no required props (an optional `className` for surface-specific spacing), no data flow, no async, no error handling.
- **Copy (owner-approved, single source of truth in the component):**
  > **Your answers are private.**
  > Your individual answers are never shown to anyone — the report shows only your church's combined results, never who said what.
- **Placement:**
  - **Answer page** — `app/app/[churchId]/answer/[categoryId]/page.tsx`, rendered in the `<main>` between the "← Back to menu" link and `<SelfForm />` (above the sliders). This is a server component; the note is static, so it renders server-side with no client cost.
  - **Invite-accept landing** — `app/accept/[token]/page.tsx`, rendered in the `ready` state (the branch that shows "Join {church} … Accept your invitation"), near `<AcceptButton />`. Only the `ready` state gets the note; the terminal states (not_found / revoked / accepted / expired / sign_in / wrong_email) do not.

## Data model / migration

None. No schema, RPC, or migration changes.

## Testing (TDD, RED → GREEN)

### Report (extend `tests/report/audience.test.ts`)

The existing fixture already fires a disagreement flag (`vol` rated 2 vs 9 while every other area is 8 vs 7; respondents "Pastor Dana" / "Elder Sam"). Three edits pin the new behavior with **no loss of coverage**:

1. **Flip the screen guard (primary RED).** The test at `audience.test.ts:28` — "screen keeps the labelled respondent list under Disagreement, exactly as it ships" — currently asserts `v.system.disagreement!.respondents.length` is `> 0`. Rewrite it to assert the list is now **empty** (`toEqual([])`) while **keeping** `expect(v.system.disagreement).toBeDefined()`. Keeping the presence assertion is the non-vacuity guard: it proves the disagreement *section* still renders (heading + narrative) and that only the names were removed — the assertion cannot pass by the section silently disappearing. Rename the test accordingly (e.g. "screen now empties the labelled respondent list under Disagreement"). This is RED against current `view.ts` and GREEN after Part A.
2. **Strengthen the calibration/no-names test.** The test at `audience.test.ts:38` — "calibration carries no names on ANY surface, screen included" — currently excludes `disagreement` from the screen name-scan (`{ ...v.system, disagreement: undefined }`) with a comment that the labelled list is "legitimately screen-only." That exclusion is no longer true. Remove the exclusion so the whole `system` section (disagreement included) is asserted name-free for `screen`, `pdf`, and `shared`, and update the comment.
3. **Extend the top-level dispersion strip test.** The test at `audience.test.ts:72` — "pdf and shared also strip the top-level dispersion.respondents once it is actually populated" — loops over `['pdf','shared']`. Add `'screen'` to the loop so the top-level `dispersion.respondents` strip is pinned for `screen` too, and rename/retitle to reflect all three audiences.

`tests/report/audience-parity.test.ts` should continue to pass unchanged (parity across audiences only tightens). Run the full `tests/report/` suite to confirm nothing else pinned the old screen-shows-names behavior.

### Announcement (new test)

- New `tests/**/anonymity-note.test.tsx` (co-locate with existing component tests; mirror the pattern in `tests/report/components.test.ts`): render `AnonymityNote` and assert the approved copy text is present — both the "Your answers are private." lead and the "never shown to anyone" sentence. This guards against silent copy drift.
- Add lightweight inclusion checks that the answer page and the accept `ready` state render the note (assert the copy/heading appears), following whatever page/component-render pattern the existing tests use.

## Gates & guardrails

- **Gates:** `npm run typecheck` (0 errors), `npm run lint` (0 errors), `npm test` (vitest). Current floor **460/460** — the new/edited tests raise the floor; none may be removed net-negative.
- ⛔ Agent never runs `npm run test:db`, `supabase db push|reset`; never merges/pushes to `master` or force-pushes without Natalie.
- Use explicit git paths; never stage `.claude/` or `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`. Use `GIT_LITERAL_PATHSPECS=1` for the `[churchId]` / `[categoryId]` / `[token]` bracket paths. No new dependencies.
- PR CI "Vercel unstable" / `UNSTABLE` is a `cornerleague` permissions artifact, not a code failure.

## Files touched (checklist)

- `lib/report/view.ts` — two ternaries → unconditional `[]`; delete now-unused `const flag` in `buildReportView`; update doc comment.
- `components/anonymity-note.tsx` — **new** presentational component (approved copy, single source).
- `app/app/[churchId]/answer/[categoryId]/page.tsx` — render `<AnonymityNote />` above the form.
- `app/accept/[token]/page.tsx` — render `<AnonymityNote />` in the `ready` state.
- `tests/report/audience.test.ts` — flip + strengthen + extend the three tests above.
- `tests/**/anonymity-note.test.tsx` — **new** render/copy test (+ page inclusion checks).
