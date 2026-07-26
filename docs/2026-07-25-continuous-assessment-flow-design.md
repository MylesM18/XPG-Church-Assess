# Continuous assessment flow + dashboard intro statement — design

- **Date:** 2026-07-25
- **Status:** Proposed (awaiting owner review)
- **Branch:** `feat/continuous-assessment-flow` (off `origin/master` @ `3c7b450`)
- **DB migrations:** none — reuses existing RPCs
- **New dependencies:** none

## Context / current behavior

The assessment is a per-section, question-by-question stepper (`components/answer-form.tsx`).
A member enters a section from the dashboard's single primary CTA
(`Start / Continue Assessment / Take Again`, derived by `lib/coverage/assessment-cta.ts`),
answers each question on a 1–10 slider, and hits **Finish** on the last question.

Today `SelfForm.onComplete` (`app/app/[churchId]/answer/[categoryId]/self-form.tsx`)
pushes to `/app/[churchId]/done`. The `/done` page (`app/app/[churchId]/done/page.tsx`)
redirects back to the dashboard unless *every* section is covered. Net effect: finishing any
non-final section **bounces the member back to the dashboard**, where they must click
"Continue Assessment" again to start the next section. That re-entry friction is what this
change removes.

The assessment has **8 sections**, in this fixed methodology order
(`methodology/questions.yaml` → `methodology.questions.categories`):
`guest` (Guest Experience) → `conn` (Community / Connection) → `disc` (Discipleship / Leadership)
→ `vol` (Volunteer) → `gen` (Generosity) → `gov` (Governance / Accountability)
→ `comm` (Communication) → `sys` (Org Structure / Systems). Each has 5 questions.

## Goals

1. **Dashboard intro statement** — a brief instruction paragraph directly under the primary
   assessment button.
2. **Continuous flow** — after finishing a section, show a "section complete" interstitial with
   **Go back** and **Continue** buttons instead of bouncing to the dashboard, so a member moves
   through the whole assessment in one flow.

## Non-goals / out of scope

- No change to how questions are answered (slider, per-question save, resume-to-first-unanswered).
- No change to the completion/thank-you screen copy (`/done`).
- No DB/RPC/methodology changes.
- No change to the dashboard CTA logic itself (it remains the fallback re-entry point).

---

## Part 1 — Dashboard intro statement

**Placement:** inside the primary-CTA `<section>` in `app/app/[churchId]/page.tsx`,
**directly below** the CTA button. Reading order becomes: church header → CTA button →
intro statement → the 8 section cards.

**Copy (owner-supplied, used essentially verbatim):**

> Please complete the assessment for each category. We encourage you to provide honest and
> thoughtful feedback, as your responses will help us gain an accurate understanding of the
> church's overall health and well-being.

**Style:** existing body treatment (`font-body text-sm text-ink-soft`), constrained width for
readability, small top margin. Rendered as a `<p>`.

**Visibility:** shown to everyone (admins are also respondents), on every visit, regardless of
progress state (`not_started` / `in_progress` / `complete`). General guidance, so no gating.

---

## Part 2 — Continuous flow ("section complete" interstitial)

### Approach (chosen)

A new **server route** at `app/app/[churchId]/answer/[categoryId]/complete/page.tsx`, consistent
with how `/done` and the answer page are built. The only change to the assessment form is where
**Finish** navigates. `components/answer-form.tsx` is untouched.

*Alternative considered:* handle the interstitial as in-page client state inside `AnswerForm`.
Rejected — it would entangle the form component with cross-section navigation and coverage lookups;
a dedicated server route matches the codebase, guards against deep-linking, and computes section
names + "next" authoritatively on the server.

### The one form change

`app/app/[churchId]/answer/[categoryId]/self-form.tsx`:

```
// before
function onComplete() { router.push(`/app/${churchId}/done`) }
// after
function onComplete() { router.push(`/app/${churchId}/answer/${categoryId}/complete`) }
```

### Navigation semantics (locked with owner)

Interstitial shown after completing section **N**:

- **Heading:** "You've completed *{N's name}*."
- **Sub-line:** "Continue to complete *{next section's name}*."
- **`[Go back]`** → `/app/[churchId]/answer/[N]` — reopens the just-completed section (answers
  pre-filled via the existing resume path) so the member can review/change them; hitting Finish
  there returns them to this same interstitial.
- **`[Continue]`** → the **next unfinished** section (first non-covered in canonical order — the
  same selection `assessmentCta` already makes). When every section is covered, the member is
  sent to the thank-you/completion screen `/done` instead of an interstitial.

Only these two buttons, per owner spec. (An escape to the dashboard still exists implicitly: Go
back lands on the answer page, which has its "← Back to menu" link.)

### Guard + branch logic (server route)

Mirror the `/done` and answer-page guards, then branch. All branch logic lives in **one pure,
unit-tested helper** so the page stays a thin data-loader:

`lib/coverage/section-complete.ts`

```
sectionCompleteNav({ completedId, result, categories }) →
  | { action: 'finish-section'; targetId }      // caller hasn't actually covered completedId
  | { action: 'done' }                          // every section covered
  | { action: 'interstitial'; completedName; nextId; nextName }
```

- `finish-section` — reached if someone deep-links `.../[N]/complete` without having covered `N`.
  Route redirects into `/app/[churchId]/answer/[N]` so they actually finish it (truthful, keeps
  them in flow).
- `done` — route redirects to `/app/[churchId]/done` (whose own guard re-confirms full coverage).
- `interstitial` — route renders the screen. `nextId`/`nextName` come from
  `assessmentCta(result, categories)` (state `in_progress` → `targetCategoryId`); since `N` is
  covered, `next` is always a different, still-incomplete section.

Page guard order (before calling the helper):
1. Load church by id (RLS) → not a member ⇒ 404; unauthenticated ⇒ redirect to sign-in with `next`.
2. Load user + membership → non-member ⇒ 404 (matches `/done`).
3. Validate `categoryId` is a real methodology category ⇒ else 404.
4. Load caller's own coverage via `get_member_run_coverage` → `coverage(rows, categories)`.
5. Call `sectionCompleteNav(...)` and act on the result.

### Data / DB

None. Reuses existing RPCs already used by the dashboard/answer/done pages:
`get_member_run_coverage`, `get_my_category_answers`, `submit_self_response`. No migration, no pgTAP.

---

## Testing plan (vitest — no `test:db`)

1. **`lib/coverage/section-complete.ts`** unit tests (pure): completed-not-covered ⇒ `finish-section`;
   all covered ⇒ `done`; mid-completion ⇒ `interstitial` with the correct `nextId`/`nextName`
   (skips already-covered sections; picks first non-covered in order).
2. **SelfForm wiring tripwire** (source-reading, node env — matches
   `tests/dashboard/self-assessment-wiring.test.ts` style): `self-form.tsx` `onComplete` targets
   `answer/${categoryId}/complete` and **no longer** pushes straight to `/done` (reverse guard).
3. **Interstitial route tripwire** (source-reading): renders the completed + next section names,
   the two `[Go back]`/`[Continue]` links to the right hrefs, and redirects to `/done` on the
   `done` action.
4. **Part 1 presence test** (source-reading on `page.tsx`): the intro statement text is present and
   sits after the CTA button. (Also acts as a reverse tripwire against accidental removal.)

Non-vacuity: prefer occurrence-count / presence-and-absence assertions over single `toContain`.

Gates (all must pass): `typecheck` 0, `lint` 0, `vitest` all green (current baseline established
after checkout; new tests add to it).

## Files

**New**
- `app/app/[churchId]/answer/[categoryId]/complete/page.tsx` — interstitial server route
- `lib/coverage/section-complete.ts` — pure nav helper
- `tests/coverage/section-complete.test.ts`
- `tests/assessment/section-complete-route.test.ts` (route tripwire)
- `tests/assessment/self-form-complete-wiring.test.ts` (form wiring tripwire)
- `tests/dashboard/dashboard-intro-statement.test.ts` (Part 1 presence)

**Modified**
- `app/app/[churchId]/page.tsx` — Part 1 intro `<p>` under the CTA
- `app/app/[churchId]/answer/[categoryId]/self-form.tsx` — Part 2 `onComplete` target

## Workflow guardrails (project conventions)

- Branch off `origin/master` (done: `feat/continuous-assessment-flow`); **owner merges** — never
  merge/push/force without Natalie.
- Stage explicit paths only; **never** stage `.claude/`; never `git add -A`.
- Use `GIT_LITERAL_PATHSPECS=1` for any git command touching `[churchId]` / `[categoryId]` paths.
- **Never** run `npm run test:db` / `supabase db push|reset` (owner-only).
- No new dependencies.
- TDD per task (test → implement); commit each file by explicit path.
