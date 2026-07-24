# Resumable Assessment Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let viewers and admins sign back in and resume the church-health assessment exactly where they left off, driven by one state-aware dashboard button (Start → Continue → Take Again).

**Architecture:** Answers already persist per-item (the `submit_self_response` RPC upserts on `(run_id, item_id, respondent_user_id)`), so "resume" needs only (a) one new caller-scoped read RPC to fetch the caller's own saved answers, (b) a partial-tolerant validator + a save-on-advance server action so the form writes each answer as the user advances instead of only in one bulk submit at the end, (c) the form page prefetching saved answers and the form opening at the first unanswered question, and (d) a pure dashboard-CTA function that turns the coverage the dashboard already computes into the primary button's label + target category. No new tables; the only DB change is the read RPC.

**Tech Stack:** Next.js 16 App Router (React 19, Server Components + server actions), `@supabase/ssr`, TypeScript (strict, `noUncheckedIndexedAccess`), Postgres/Supabase (`security definer` RPCs + pgTAP), Vitest.

## Global Constraints

- **Spec (authoritative):** `docs/superpowers/specs/2026-07-24-resumable-assessment-progress-design.md`. This plan implements it; if they disagree, the spec wins.
- **No new dependencies.** Only what is already in `package.json`.
- **TypeScript:** `strict` + `noUncheckedIndexedAccess` are on — every array/record index is `T | undefined`; guard or `?? fallback`. Avoid non-null `!` assertions.
- **Answer value range is integer 1–10** (schema `value int check between 1 and 10`; the form is a 1–10 range input). Not 1–5.
- **Migration numbering:** next migration is `20260724000400`; next pgTAP file is `20_…`. Both are free (latest are `20260724000300_drop_invitations_system.sql` and `19_get_member_run_coverage_test.sql`).
- **⛔ NEVER run `npm run test:db`** (it does `supabase db reset` + pgTAP). pgTAP is authored by the agent and **run by the owner (Natalie)** only.
- **⛔ Never merge/push/force** without Natalie. This branch (`feat/resumable-assessment-progress`) is local-only.
- **Git hygiene:** stage **explicit paths only**, never `git add -A`, never stage `.claude/`. For any path under `app/app/[churchId]/…` the brackets are shell-glob magic — prefix the git command with `GIT_LITERAL_PATHSPECS=1` (used in Tasks 3, 4, 5).
- **Per-task gates:** `npm run typecheck` → 0 errors, `npm run lint` → 0 errors, `npm run test` (Vitest) → all pass. (Task 1 authors SQL only — no TS — but the Vitest suite must still be green.)
- **Security invariant (do not regress):** `public.responses` has RLS enabled with **no policy** (default-deny). All reads go through `security definer` RPCs. The new RPC returns **only the caller's own** `(item_id, value)` rows — never scores, aggregates, or another respondent's data.
- **Role idiom:** inline `m.role = 'admin'` where roles are checked (not relevant to most of this feature).

---

### Task 1: New read RPC `get_my_category_answers` + pgTAP

Adds the one DB change: a caller-scoped `security definer` function returning the caller's own saved `(item_id, value)` rows for a category in the active run. Mirrors the existing `get_member_run_coverage` guard + active-run resolution exactly, so it inherits the same member gate and default-deny posture.

**Files:**
- Create: `supabase/migrations/20260724000400_rpc_get_my_category_answers.sql`
- Create: `supabase/tests/20_get_my_category_answers_test.sql`

**Interfaces:**
- Consumes: existing tables `public.responses`, `public.assessment_runs`, `public.church_members`; existing test helper `create_church_with_admin(name, brand_color, methodology_version)` (creates church + admin membership + an in-progress run); existing `submit_self_response(uuid, text, jsonb)`.
- Produces: `public.get_my_category_answers(p_church_id uuid, p_category_id text) returns table(item_id text, value int)` — granted to `authenticated`. Consumed by Task 4's form page.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260724000400_rpc_get_my_category_answers.sql`:

```sql
-- get_my_category_answers: caller-scoped read of the CALLER's OWN saved answers for one category
-- in the active run. Mirrors get_member_run_coverage's auth gate + active-run resolution. Powers
-- form resume (prefill). Returns raw own (item_id, value) ONLY — never scores, aggregates, or any
-- other respondent's rows — so responses stays default-deny (no RLS SELECT policy).
create function public.get_my_category_answers(p_church_id uuid, p_category_id text)
returns table(item_id text, value int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.church_members where church_id = p_church_id and user_id = v_uid
  ) then
    raise exception 'not a member of this church' using errcode = 'insufficient_privilege';
  end if;

  select id into v_run_id
  from public.assessment_runs
  where church_id = p_church_id and status = 'in_progress'
  order by created_at asc
  limit 1;
  if v_run_id is null then
    return;
  end if;

  return query
  select r.item_id, r.value
  from public.responses r
  where r.run_id = v_run_id
    and r.category_id = p_category_id
    and r.respondent_kind = 'member'
    and r.respondent_user_id = v_uid;
end;
$$;

revoke all on function public.get_my_category_answers(uuid, text) from public, anon;
grant execute on function public.get_my_category_answers(uuid, text) to authenticated;
```

- [ ] **Step 2: Write the pgTAP test**

Create `supabase/tests/20_get_my_category_answers_test.sql` (mirrors `19_get_member_run_coverage_test.sql`'s fixture idiom — the `guest` category has items G1–G5):

```sql
begin;
select plan(4);

-- One church, three users: A (admin via create_church_with_admin), B (seeded viewer), C (stranger).
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','myaadmin@test.com','x',now(),now()),
 ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','myaviewer@test.com','x',now(),now()),
 ('d3333333-3333-3333-3333-333333333333','authenticated','authenticated','myastranger@test.com','x',now(),now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"myaadmin@test.com","role":"authenticated"}';
select create_church_with_admin('My Answers Test Church', '#dddddd', '0.1.0');

-- seed B as a viewer member (church_members has no write policy → seed as superuser)
reset role;
insert into public.church_members (church_id, user_id, role)
select id, 'd2222222-2222-2222-2222-222222222222', 'viewer'
from churches where name = 'My Answers Test Church';

-- A saves a PARTIAL set: 3 of the 5 guest items
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111","email":"myaadmin@test.com","role":"authenticated"}';
select submit_self_response(
  (select id from churches where name = 'My Answers Test Church'), 'guest',
  '[{"item_id":"G1","value":3},{"item_id":"G2","value":6},{"item_id":"G3","value":9}]'::jsonb);

-- A reads back own guest answers: exactly the 3 saved rows, correct value
select is(
  (select count(*)::int from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')),
  3, 'A reads back own 3 partial guest answers');
select is(
  (select value from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')
   where item_id = 'G2'),
  6, 'A own value for G2 is 6');

-- B (answered nothing) reads an EMPTY set — never A's answers (own-data isolation)
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222","email":"myaviewer@test.com","role":"authenticated"}';
select is(
  (select count(*)::int from get_my_category_answers(
     (select id from churches where name = 'My Answers Test Church'), 'guest')),
  0, 'B (no answers) reads empty, not A''s answers');

-- a non-member cannot read personal answers
set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333","email":"myastranger@test.com","role":"authenticated"}';
select throws_ok(
  $$select * from get_my_category_answers((select id from churches where name = 'My Answers Test Church'), 'guest')$$,
  '42501',
  'not a member of this church',
  'non-member cannot read personal answers');

select * from finish();
rollback;
```

- [ ] **Step 3: Verify the migration reads cleanly (do NOT run test:db)**

Do not execute `npm run test:db` (owner-only). Instead sanity-check by eye against `20260724000100_rpc_get_member_run_coverage.sql`: same auth gate, same active-run `select … status='in_progress' order by created_at asc limit 1`, same `revoke … grant execute … to authenticated`. Confirm the `returns table(item_id text, value int)` column types match `responses.item_id text` / `responses.value int`.

- [ ] **Step 4: Run the Vitest suite (must stay green — no TS changed)**

Run: `npm run test`
Expected: PASS (unchanged; this task adds SQL only).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724000400_rpc_get_my_category_answers.sql supabase/tests/20_get_my_category_answers_test.sql
git commit -m "feat(db): add get_my_category_answers RPC + pgTAP for resume"
```

---

### Task 2: Partial-tolerant validator `validateSingleAnswer`

Adds a sibling to the strict `validateCategoryAnswers` that validates ONE answer (for save-on-advance / resume) without requiring the whole category. The strict validator is left untouched.

**Files:**
- Modify: `lib/answers/validate.ts` (append a new export; do not change `validateCategoryAnswers`)
- Test: `tests/answers/validate.test.ts` (append a new `describe` block; reuse the existing `CATS` fixture)

**Interfaces:**
- Consumes: `Category` from `@/lib/methodology/schema`; existing `AnswerInput` type from this file.
- Produces: `validateSingleAnswer(categoryId: string, answer: unknown, categories: Category[]): { ok: true; answer: AnswerInput } | { ok: false; error: string }`. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `tests/answers/validate.test.ts`, and update the import on line 2 to `import { validateCategoryAnswers, validateSingleAnswer } from '@/lib/answers/validate'`:

```ts
describe('validateSingleAnswer()', () => {
  it('accepts a single in-range answer for a real item', () => {
    const r = validateSingleAnswer('guest', { item_id: 'G3', value: 7 }, CATS)
    expect(r).toEqual({ ok: true, answer: { item_id: 'G3', value: 7 } })
  })
  it('rejects an unknown category', () => {
    expect(validateSingleAnswer('nope', { item_id: 'G1', value: 5 }, CATS).ok).toBe(false)
  })
  it('rejects an item not in the category', () => {
    expect(validateSingleAnswer('guest', { item_id: 'ZZ', value: 5 }, CATS).ok).toBe(false)
  })
  it('rejects an out-of-range value', () => {
    expect(validateSingleAnswer('guest', { item_id: 'G1', value: 11 }, CATS).ok).toBe(false)
  })
  it('rejects a non-integer value', () => {
    expect(validateSingleAnswer('guest', { item_id: 'G1', value: 5.5 }, CATS).ok).toBe(false)
  })
  it('rejects a non-object payload', () => {
    expect(validateSingleAnswer('guest', 7, CATS).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -- validate`
Expected: FAIL — `validateSingleAnswer is not a function` / not exported.

- [ ] **Step 3: Implement the validator**

Append to `lib/answers/validate.ts` (after `validateCategoryAnswers`):

```ts
export type ValidateSingleResult =
  | { ok: true; answer: AnswerInput }
  | { ok: false; error: string }

/**
 * Partial-tolerant sibling of validateCategoryAnswers: validates ONE answer as the user advances
 * (save-on-advance / resume), without requiring the whole category. Checks: category exists, the
 * item_id belongs to that category, and value is an integer 1–10. The strict all-or-nothing
 * validateCategoryAnswers above is unchanged and still guards any full-submit path.
 */
export function validateSingleAnswer(
  categoryId: string,
  answer: unknown,
  categories: Category[],
): ValidateSingleResult {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { ok: false, error: `Unknown category: ${categoryId}` }

  if (typeof answer !== 'object' || answer === null) {
    return { ok: false, error: 'Answer must be an object.' }
  }
  const itemId = (answer as Record<string, unknown>).item_id
  const value = (answer as Record<string, unknown>).value
  const itemIds = category.items.map((i) => i.id)
  if (typeof itemId !== 'string' || !itemIds.includes(itemId)) {
    return { ok: false, error: `Item ${String(itemId)} does not belong to category ${categoryId}.` }
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
    return { ok: false, error: `Value for ${itemId} must be an integer 1–10.` }
  }
  return { ok: true, answer: { item_id: itemId, value } }
}
```

- [ ] **Step 4: Run tests + gates**

Run: `npm run test -- validate` → PASS (new + existing `validateCategoryAnswers` tests).
Run: `npm run typecheck` → 0 errors. Run: `npm run lint` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/answers/validate.ts tests/answers/validate.test.ts
git commit -m "feat: add partial-tolerant validateSingleAnswer"
```

---

### Task 3: Save-on-advance server action `saveSelfAnswer`

Adds a server action that validates one answer with the Task 2 validator and upserts it via the existing `submit_self_response` RPC (which accepts 1–50 answers and upserts per item — a single-element array is valid).

**Files:**
- Modify: `app/app/[churchId]/answer/[categoryId]/actions.ts` (add one export; keep `submitSelfResponse`)

**Interfaces:**
- Consumes: `validateSingleAnswer` (Task 2); existing `submit_self_response(uuid, text, jsonb)` RPC; existing `createClient` + `loadMethodology`; `AnswerInput`.
- Produces: `saveSelfAnswer(churchId: string, categoryId: string, answer: AnswerInput): Promise<{ ok: boolean; error?: string }>`. Consumed by Task 4's `self-form.tsx`.

- [ ] **Step 1: Add the import**

In `app/app/[churchId]/answer/[categoryId]/actions.ts`, change the validate import (line 5) to also pull the new function:

```ts
import { validateCategoryAnswers, validateSingleAnswer, type AnswerInput } from '@/lib/answers/validate'
```

- [ ] **Step 2: Add the action**

Append to the same file (leave `submitSelfResponse` as-is):

```ts
export async function saveSelfAnswer(
  churchId: string,
  categoryId: string,
  answer: AnswerInput,
): Promise<{ ok: boolean; error?: string }> {
  const methodology = loadMethodology()
  const validated = validateSingleAnswer(categoryId, answer, methodology.questions.categories)
  if (!validated.ok) return { ok: false, error: validated.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  // submit_self_response accepts 1..50 answers and upserts per (run_id, item_id, respondent_user_id),
  // so a single-element array saves/overwrites exactly this one answer.
  const { error } = await supabase.rpc('submit_self_response', {
    p_church_id: churchId,
    p_category_id: categoryId,
    p_answers: [validated.answer],
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 3: Gates (this action is thin glue — no unit test; its validation logic is covered by Task 2)**

Run: `npm run typecheck` → 0 errors. Run: `npm run lint` → 0 errors. Run: `npm run test` → all pass (unchanged).

- [ ] **Step 4: Commit** (bracketed path → `GIT_LITERAL_PATHSPECS=1`)

```bash
GIT_LITERAL_PATHSPECS=1 git add 'app/app/[churchId]/answer/[categoryId]/actions.ts'
git commit -m "feat: add saveSelfAnswer save-on-advance server action"
```

---

### Task 4: Form resume — prefetch on the page + open at first unanswered + save on advance

Wires resume end-to-end: the form page prefetches the caller's saved answers via the Task 1 RPC and passes them in; the form seeds those values, opens at the first unanswered question, saves each answer as the user advances (via Task 3's action), and the last question's button reads **"Finish"** and returns to the dashboard. Introduces a pure `firstUnansweredStep` helper (unit-tested; the client component itself is not unit-testable without adding a DOM test dep, which is forbidden).

**Files:**
- Create: `lib/answers/resume.ts`
- Test: `tests/answers/resume.test.ts`
- Modify: `components/answer-form.tsx` (convert bulk-submit → save-on-advance; member-only)
- Modify: `app/app/[churchId]/answer/[categoryId]/self-form.tsx` (pass `initialValues`, `onSaveAnswer`, `onComplete`)
- Modify: `app/app/[churchId]/answer/[categoryId]/page.tsx` (prefetch saved answers)

**Interfaces:**
- Consumes: `saveSelfAnswer` (Task 3); `get_my_category_answers` RPC (Task 1); existing `band`/`BANDS` (`@/lib/answers/band`), `LiveStatus` (`@/components/live-status`), `AnswerInput`.
- Produces: `firstUnansweredStep(itemIds: string[], values: Record<string, number>): number`; `AnswerForm` prop contract `{ categoryName, items, initialValues, onSaveAnswer, onComplete }` (the `requireName`/`onSubmit` props are removed).

- [ ] **Step 1: Confirm `AnswerForm`'s only caller is `self-form.tsx`**

Run: `rg -l "AnswerForm" app components`
Expected: only `components/answer-form.tsx` (definition) and `app/app/[churchId]/answer/[categoryId]/self-form.tsx` (caller). PR #19 removed the invited answer surface, so the member self-form is the sole caller — which is why this task can drop the unused `requireName` name-step and bulk `onSubmit`. **If any other caller appears, stop and reconcile before rewriting.**

- [ ] **Step 2: Write the failing test for the resume helper**

Create `tests/answers/resume.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { firstUnansweredStep } from '@/lib/answers/resume'

describe('firstUnansweredStep()', () => {
  const ids = ['G1', 'G2', 'G3', 'G4', 'G5']
  it('returns 0 when nothing is answered', () => {
    expect(firstUnansweredStep(ids, {})).toBe(0)
  })
  it('returns the first gap when partially answered', () => {
    expect(firstUnansweredStep(ids, { G1: 3, G2: 5 })).toBe(2)
  })
  it('skips leading answered items to the first gap', () => {
    expect(firstUnansweredStep(ids, { G1: 3, G3: 5 })).toBe(1)
  })
  it('returns 0 when every item is answered (review / Take-Again)', () => {
    expect(firstUnansweredStep(ids, { G1: 1, G2: 2, G3: 3, G4: 4, G5: 5 })).toBe(0)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- resume`
Expected: FAIL — cannot resolve `@/lib/answers/resume`.

- [ ] **Step 4: Implement the resume helper**

Create `lib/answers/resume.ts`:

```ts
/**
 * Resume step for the answer form. Given the category's item ids IN ORDER and the caller's saved
 * values (item_id → value), return the 0-based index of the first item with no saved value — where
 * a returning user should pick up. If every item is answered, return 0 (open at Q1 to review/edit,
 * e.g. the "Take Again" flow).
 */
export function firstUnansweredStep(itemIds: string[], values: Record<string, number>): number {
  const idx = itemIds.findIndex((id) => values[id] == null)
  return idx === -1 ? 0 : idx
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- resume`
Expected: PASS (4 tests).

- [ ] **Step 6: Rewrite `components/answer-form.tsx` (save-on-advance, member-only)**

Replace the ENTIRE file with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { band, BANDS } from '@/lib/answers/band'
import { firstUnansweredStep } from '@/lib/answers/resume'
import type { AnswerInput } from '@/lib/answers/validate'

export interface AnswerFormItem {
  id: string
  text: string
  anchors: { lo: string; mid: string; hi: string }
}

const RANGE_LABEL: Record<'lo' | 'mid' | 'hi', string> = { lo: '1–3', mid: '4–7', hi: '8–10' }

export function AnswerForm({
  categoryName,
  items,
  initialValues,
  onSaveAnswer,
  onComplete,
}: {
  categoryName: string
  items: AnswerFormItem[]
  initialValues: Record<string, number>
  onSaveAnswer: (answer: AnswerInput) => Promise<{ ok: boolean; error?: string }>
  onComplete: () => void
}) {
  const [values, setValues] = useState<Record<string, number | null>>(
    () => Object.fromEntries(items.map((i) => [i.id, initialValues[i.id] ?? null])),
  )
  // Open at the first unanswered question; if all are answered (Take Again), open at step 0.
  const [step, setStep] = useState(() => firstUnansweredStep(items.map((i) => i.id), initialValues))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headingRef = useRef<HTMLHeadingElement>(null)

  const questionCount = items.length
  const currentItem = items[step]
  const isLastStep = step === questionCount - 1
  const questionNumber = step + 1
  const currentAnswered = currentItem != null && values[currentItem.id] != null

  // Move focus to the question heading on every step change (mirrors the original focus discipline).
  // A plain :focus outline guarantees a visible ring after PROGRAMMATIC focus (focus-visible may not fire).
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // Save the current question's answer (upsert). Returns false + shows an error on failure.
  async function saveCurrent(): Promise<boolean> {
    if (currentItem == null) return false
    const v = values[currentItem.id]
    if (v == null) {
      setError('Please choose a value before continuing.')
      return false
    }
    setError(null)
    setPending(true)
    try {
      const result = await onSaveAnswer({ item_id: currentItem.id, value: v })
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong. Please try again.')
        return false
      }
      return true
    } catch {
      setError('Something went wrong. Please try again.')
      return false
    } finally {
      setPending(false)
    }
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  async function goNext() {
    if (pending) return
    if (await saveCurrent()) setStep((s) => Math.min(questionCount - 1, s + 1))
  }

  async function finish() {
    if (pending) return
    if (await saveCurrent()) onComplete()
  }

  if (currentItem == null) return null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (isLastStep) finish()
        else goNext()
      }}
      className="flex flex-col gap-6"
    >
      <h1 className="font-display text-2xl text-ink">{categoryName}</h1>

      <div className="flex flex-col gap-1">
        <p className="font-body text-sm text-ink-soft">
          Question {questionNumber} of {questionCount}
        </p>
        <div
          role="progressbar"
          aria-label="Assessment progress"
          aria-valuemin={1}
          aria-valuemax={questionCount}
          aria-valuenow={questionNumber}
          className="h-1.5 w-full overflow-hidden rounded-full bg-sand"
        >
          <div
            className="h-full bg-ink transition-[width]"
            style={{ width: `${(questionNumber / questionCount) * 100}%` }}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Question {questionNumber} of {questionCount}</legend>
        <h2
          tabIndex={-1}
          ref={headingRef}
          className="font-display text-lg text-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ink"
        >
          {currentItem.text}
        </h2>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={values[currentItem.id] ?? 5}
            onChange={(e) => setValues((v) => ({ ...v, [currentItem.id]: Number(e.target.value) }))}
            className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            aria-label={currentItem.text}
            aria-describedby={`bands-${currentItem.id}`}
          />
          <span className="w-8 text-right font-body text-sm text-ink" aria-hidden="true">
            {values[currentItem.id] ?? '—'}
          </span>
        </div>
        {values[currentItem.id] == null && (
          <p className="font-body text-xs text-ink-soft">Drag to choose 1–10.</p>
        )}

        <ul id={`bands-${currentItem.id}`} className="flex flex-col gap-2">
          {BANDS.map((b) => {
            const v = values[currentItem.id]
            const active = v != null && band(v) === b.key
            return (
              <li
                key={b.key}
                className={
                  'rounded-md border-l-4 p-3 font-body text-sm ' +
                  (active ? 'border-ink bg-sand text-ink' : 'border-line bg-paper text-ink-soft')
                }
              >
                <span className="text-ink">
                  {b.label} <span className="text-xs">({RANGE_LABEL[b.key]})</span>
                </span>
                {active && <span className="sr-only"> — where you land</span>}
                <span className="mt-1 block">{currentItem.anchors[b.key]}</span>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-disabled={step === 0}
          className="rounded-md border border-line px-4 py-2 font-body text-ink transition-opacity hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back
        </button>

        <button
          type="submit"
          aria-disabled={pending || !currentAnswered}
          onClick={(e) => { if (pending || !currentAnswered) e.preventDefault() }}
          className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {isLastStep ? (pending ? 'Finishing…' : 'Finish') : (pending ? 'Saving…' : 'Next')}
        </button>
      </div>

      <LiveStatus message={error} tone="error" className="font-body text-sm text-ink" />
    </form>
  )
}
```

- [ ] **Step 7: Rewrite `self-form.tsx` to pass the new props + navigate on complete**

Replace the ENTIRE `app/app/[churchId]/answer/[categoryId]/self-form.tsx` with:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { AnswerForm, type AnswerFormItem } from '@/components/answer-form'
import type { AnswerInput } from '@/lib/answers/validate'
import { saveSelfAnswer } from './actions'

export function SelfForm({
  churchId,
  categoryId,
  categoryName,
  items,
  initialValues,
}: {
  churchId: string
  categoryId: string
  categoryName: string
  items: AnswerFormItem[]
  initialValues: Record<string, number>
}) {
  const router = useRouter()
  async function onSaveAnswer(answer: AnswerInput) {
    return saveSelfAnswer(churchId, categoryId, answer)
  }
  function onComplete() {
    router.push(`/app/${churchId}`)
  }
  return (
    <AnswerForm
      categoryName={categoryName}
      items={items}
      initialValues={initialValues}
      onSaveAnswer={onSaveAnswer}
      onComplete={onComplete}
    />
  )
}
```

- [ ] **Step 8: Prefetch saved answers in the form page**

In `app/app/[churchId]/answer/[categoryId]/page.tsx`, after the `const items = …` line (line 31) and before the `return (`, insert the prefetch, then pass `initialValues` to `<SelfForm>`:

```tsx
  const items = category.items.map((i) => ({ id: i.id, text: i.text, anchors: i.anchors }))

  // Resume: pull the caller's OWN saved answers for this category (own-data only; responses stays
  // default-deny — the read goes through the security-definer RPC). Empty on the first visit.
  const { data: savedRows, error: savedError } = await supabase.rpc('get_my_category_answers', {
    p_church_id: churchId,
    p_category_id: categoryId,
  })
  if (savedError) throw savedError
  const initialValues: Record<string, number> = {}
  for (const row of (savedRows ?? []) as { item_id: string; value: number }[]) {
    initialValues[row.item_id] = row.value
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <SelfForm
        churchId={churchId}
        categoryId={categoryId}
        categoryName={category.name}
        items={items}
        initialValues={initialValues}
      />
    </main>
  )
```

Note: `submitSelfResponse` in `actions.ts` loses its UI caller here (self-form now uses `saveSelfAnswer`). Leave it in place — out of scope to remove; the strict `validateCategoryAnswers` it uses stays covered by `tests/answers/validate.test.ts`. A follow-up may prune it.

- [ ] **Step 9: Run gates**

Run: `npm run typecheck` → 0 errors (watch for `noUncheckedIndexedAccess` on `items[step]` / `values[…]` / `initialValues[…]` — all guarded above).
Run: `npm run lint` → 0 errors.
Run: `npm run test` → all pass.

- [ ] **Step 10: Commit** (mixed paths incl. brackets → `GIT_LITERAL_PATHSPECS=1`)

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/answers/resume.ts tests/answers/resume.test.ts components/answer-form.tsx 'app/app/[churchId]/answer/[categoryId]/self-form.tsx' 'app/app/[churchId]/answer/[categoryId]/page.tsx'
git commit -m "feat: resume the answer form at the first unanswered question, saving on advance"
```

---

### Task 5: Dashboard single-button state / label / routing

Adds a pure `assessmentCta` function (unit-tested) that turns the coverage the dashboard already computes into the primary button's state, label, and target category, then renders ONE assessment-level primary button (same-tab). The 8 per-area card links are unchanged.

**Files:**
- Create: `lib/coverage/assessment-cta.ts`
- Test: `tests/coverage/assessment-cta.test.ts`
- Modify: `app/app/[churchId]/page.tsx` (import + compute `cta` + render the button)

**Interfaces:**
- Consumes: `CoverageResult` from `@/lib/coverage/coverage`; `Category` from `@/lib/methodology/schema`.
- Produces: `assessmentCta(result: CoverageResult, categories: Category[]): { state: 'not_started' | 'in_progress' | 'complete'; label: string; targetCategoryId: string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/coverage/assessment-cta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assessmentCta } from '@/lib/coverage/assessment-cta'
import type { CoverageResult } from '@/lib/coverage/coverage'
import type { Category } from '@/lib/methodology/schema'

// Minimal 3-category stand-in; order matters for target selection.
const cats: Category[] = ['a', 'b', 'c'].map((id, i) => ({
  id, name: id.toUpperCase(), kind: 'stage', position: i + 1,
  items: [{ id: `${id}1`, text: 't', signal: 'belief', anchors: { lo: 'l', mid: 'm', hi: 'h' } }],
}))

function result(statuses: Array<'not_started' | 'partial' | 'covered'>): CoverageResult {
  const categories = cats.map((c, i) => ({ category_id: c.id, status: statuses[i] ?? 'not_started' }))
  return { categories, coveredCount: categories.filter((c) => c.status === 'covered').length }
}

describe('assessmentCta()', () => {
  it('nothing answered → Start Assessment at the first category', () => {
    expect(assessmentCta(result(['not_started', 'not_started', 'not_started']), cats))
      .toEqual({ state: 'not_started', label: 'Start Assessment', targetCategoryId: 'a' })
  })
  it('all covered → Take Again at the first category', () => {
    expect(assessmentCta(result(['covered', 'covered', 'covered']), cats))
      .toEqual({ state: 'complete', label: 'Take Again', targetCategoryId: 'a' })
  })
  it('partly done → Continue Assessment at the first non-covered category', () => {
    expect(assessmentCta(result(['covered', 'partial', 'not_started']), cats))
      .toEqual({ state: 'in_progress', label: 'Continue Assessment', targetCategoryId: 'b' })
  })
  it('first category not_started while a later one is partial → Continue at the first non-covered', () => {
    const cta = assessmentCta(result(['not_started', 'partial', 'covered']), cats)
    expect(cta.state).toBe('in_progress')
    expect(cta.targetCategoryId).toBe('a')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -- assessment-cta`
Expected: FAIL — cannot resolve `@/lib/coverage/assessment-cta`.

- [ ] **Step 3: Implement `assessmentCta`**

Create `lib/coverage/assessment-cta.ts`:

```ts
import type { Category } from '@/lib/methodology/schema'
import type { CoverageResult } from '@/lib/coverage/coverage'

export type AssessmentCtaState = 'not_started' | 'in_progress' | 'complete'

export interface AssessmentCta {
  state: AssessmentCtaState
  label: string
  targetCategoryId: string
}

/**
 * Whole-assessment primary CTA, derived from the coverage the dashboard already computes.
 * - not_started (nothing answered anywhere) → "Start Assessment" @ first category.
 * - complete (every category covered)       → "Take Again" @ first category (prefilled to review).
 * - in_progress (otherwise)                 → "Continue Assessment" @ first non-covered category.
 * The step WITHIN the category is chosen by the form page (first unanswered), not here.
 */
export function assessmentCta(result: CoverageResult, categories: Category[]): AssessmentCta {
  const firstId = categories[0]?.id ?? ''
  const allNotStarted = result.categories.every((c) => c.status === 'not_started')
  if (allNotStarted) {
    return { state: 'not_started', label: 'Start Assessment', targetCategoryId: firstId }
  }
  if (categories.length > 0 && result.coveredCount === categories.length) {
    return { state: 'complete', label: 'Take Again', targetCategoryId: firstId }
  }
  const firstNonCovered = result.categories.find((c) => c.status !== 'covered')
  return {
    state: 'in_progress',
    label: 'Continue Assessment',
    targetCategoryId: firstNonCovered?.category_id ?? firstId,
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test -- assessment-cta`
Expected: PASS (4 tests).

- [ ] **Step 5: Render the button on the dashboard**

In `app/app/[churchId]/page.tsx`:

(a) Add the import after the existing `coverage` import (line 6):

```tsx
import { assessmentCta } from '@/lib/coverage/assessment-cta'
```

(b) After `const result = coverage(rows, categories)` (line 71), compute the CTA:

```tsx
  const result = coverage(rows, categories)
  const cta = assessmentCta(result, categories)
```

(c) Insert a new section between `</header>` (line 112) and the categories `<section>` (line 114) — one same-tab primary button (no `target="_blank"`):

```tsx
      </header>

      <section>
        <Link
          href={`/app/${churchId}/answer/${cta.targetCategoryId}`}
          className="inline-block rounded-md border border-line bg-ink px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {cta.label}
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
```

- [ ] **Step 6: Run gates**

Run: `npm run typecheck` → 0 errors. Run: `npm run lint` → 0 errors. Run: `npm run test` → all pass.

- [ ] **Step 7: Commit** (bracketed dashboard path → `GIT_LITERAL_PATHSPECS=1`)

```bash
GIT_LITERAL_PATHSPECS=1 git add lib/coverage/assessment-cta.ts tests/coverage/assessment-cta.test.ts 'app/app/[churchId]/page.tsx'
git commit -m "feat: state-aware whole-assessment primary button on the dashboard"
```

---

### Task 6: Wiring-test tripwire for the new button + reword the stale message

Extends the existing dashboard source-tripwire to pin the new primary CTA (so a revert fails loudly) and clarifies the stale `"Answer yourself"` assertion **message** now that a second, same-tab whole-assessment button exists. The existing pins (`target="_blank"`, `rel="noopener noreferrer"`, `covered: 'Completed'`, `<RefreshOnFocus`) are preserved unchanged.

**Files:**
- Modify: `tests/dashboard/self-assessment-wiring.test.ts`

**Interfaces:**
- Consumes: the dashboard source at `app/app/[churchId]/page.tsx` (post-Task-5), read + comment-stripped as `CODE`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Reword the stale per-area message (message-only; assertion unchanged)**

In `tests/dashboard/self-assessment-wiring.test.ts`, in the first `it(...)` (`opens the per-area self-assessment link in a new window`), replace the assertion **message** (the 2nd arg to `expect`) so it distinguishes the per-area card link from the new whole-assessment button. Keep the assertion `.toContain('target="_blank"')` exactly as-is:

```ts
    expect(
      CODE,
      'the per-area "Answer yourself" card Link must carry target="_blank" (Bug 2) — without it, ' +
        'answering navigates away from the dashboard tab instead of opening a new window. ' +
        '(The whole-assessment primary button is a separate, same-tab control.)',
    ).toContain('target="_blank"')
```

- [ ] **Step 2: Add a tripwire for the new primary CTA**

Add this `it(...)` inside the same `describe('dashboard self-assessment wiring', …)` block:

```ts
  it('renders the whole-assessment primary CTA from assessmentCta()', () => {
    expect(
      CODE,
      'the dashboard must derive its single primary button from assessmentCta() (Start/Continue/Take Again)',
    ).toContain('assessmentCta(')
    expect(CODE).toContain('cta.label')
    expect(CODE).toContain('cta.targetCategoryId')
  })
```

- [ ] **Step 3: Run the wiring test + full suite**

Run: `npm run test -- self-assessment-wiring` → PASS (existing pins + new CTA tripwire).
Run: `npm run test` → all pass. Run: `npm run typecheck` → 0 errors. Run: `npm run lint` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add tests/dashboard/self-assessment-wiring.test.ts
git commit -m "test: pin the whole-assessment CTA + clarify the per-area link message"
```

---

## Post-build (owner-gated — do NOT do these unprompted)

- **pgTAP:** Natalie runs `npm run test:db` (or `supabase test db`) herself to execute `20_get_my_category_answers_test.sql`. The agent NEVER runs it.
- **Live E2E:** Natalie signs in as a viewer and an admin, answers partway, signs back in, and confirms resume + the Start/Continue/Take-Again button. All auth round-trips are hers.
- **Integration:** `superpowers:verification-before-completion` before any "done" claim; `superpowers:requesting-code-review`; then `superpowers:finishing-a-development-branch`. Never merge/push without Natalie.

## Spec coverage self-review

- **§A dashboard button (Start/Continue/Take Again, same-tab, per-card links unchanged):** Task 5 (`assessmentCta` + same-tab `<Link>`; per-card links untouched); Task 6 pins it.
- **§B resume (page prefetch + open at first unanswered / step 0 when all answered):** Task 4 (page prefetch via RPC; `firstUnansweredStep`; component seeds `initialValues`).
- **§C save-on-advance (partial validator + action + "Finish" returns to dashboard):** Task 2 (validator), Task 3 (action), Task 4 (form saves per advance; last button "Finish" → `router.push` dashboard).
- **§D the one DB change (caller-scoped read RPC + pgTAP; responses stays default-deny):** Task 1.
- **Security invariants (own-data only; no results/aggregates; admins included):** Task 1 RPC filters `respondent_user_id = auth.uid()` regardless of role; pgTAP asserts cross-user + non-member isolation.
- **Testing (unit: validator, dashboard logic, resume; pgTAP owner-run; preserve wiring pins; reword stale message):** Tasks 2/4/5 (unit), Task 1 (pgTAP), Task 6 (pins + reword).
- **Scope/non-goals (no new tables, no history, no per-card state labels, no new deps):** honored — only additive code + one read RPC; retake overwrites via existing upsert.
