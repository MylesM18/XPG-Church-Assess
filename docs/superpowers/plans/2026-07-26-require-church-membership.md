# requireChurchMembership Shared Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated "church-by-id + explicit `church_members` membership" gate from the three member-facing assessment routes into one shared helper, and add that explicit membership gate to the `answer` route (which today relies on RLS alone — defense-in-depth).

**Architecture:** New `lib/auth/require-church-membership.ts` exports a **pure** `churchMembershipDecision(...)` (all authorization branching, exhaustively unit-tested) and a **thin, branch-free async wrapper** `requireChurchMembership(...)` that does the IO and executes the single returned side effect. The three routes replace their inline church+membership blocks with a call to the wrapper. This mirrors the established `sectionCompleteNav` precedent (`lib/coverage/section-complete.ts` = pure fn + `tests/coverage/section-complete.test.ts` = real-execution test + route source-tripwire).

**Tech Stack:** Next.js 16 (App Router, async server components), Supabase SSR client (`@supabase/ssr`, ANON key → RLS-enforced), Vitest (node environment, source-reading tripwires + pure-fn execution tests), TypeScript.

**Source of truth:** `docs/superpowers/specs/2026-07-26-require-church-membership-design.md` (committed `f6e5aed`). This plan implements that spec's 4 test artifacts verbatim — do not add or drop test artifacts.

## Global Constraints

- **Code-only.** No DB migrations, no RPC changes, no methodology changes, **no new dependencies.**
- ⛔ NEVER `npm run test:db` / `supabase db push` / `supabase db reset` (owner-only).
- ⛔ Never merge / push / force without Natalie. CI Vercel "unstable" = `cornerleague`/`CornerLeague` perms, **not** a code failure.
- **Git:** explicit paths only, never `git add -A`, never stage `.claude/` or `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md` (a *different*, older untracked plan). Prefix **`GIT_LITERAL_PATHSPECS=1`** for ANY `app/app/[churchId]/…` / `[categoryId]` path (brackets are pathspec magic).
- **Gates every task:** `npm run typecheck` (0) · `npm run lint` (0) · focused `npx vitest run <file>` green. Full suite was **328/328** on base `97a734d`; this adds the decider suite (6) + the answer tripwire, and updates two existing test files.
- **Behavior preservation:** `/done` stays `notFound()`-only on unauth (NO `signInNext`). The `next` value is interpolated raw (no new `encodeURIComponent`) so emitted URLs are byte-identical to today. Membership query keeps `user?.id ?? ''` verbatim.
- Branch: `feat/require-church-membership` (off `origin/master` `97a734d`; HEAD is spec commit `f6e5aed`).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/auth/require-church-membership.ts` | **Create.** Pure `churchMembershipDecision` + async `requireChurchMembership` wrapper. | 1 |
| `tests/auth/require-church-membership.test.ts` | **Create.** Exhaustive 6-case `.toEqual` matrix over the pure decider. | 1 |
| `app/app/[churchId]/answer/[categoryId]/page.tsx` | **Modify.** Replace inline church block with the helper (**adds** the membership gate). | 2 |
| `tests/assessment/answer-membership-guard.test.ts` | **Create.** Source tripwire: answer route imports + calls the helper with `signInNext`. | 2 |
| `app/app/[churchId]/done/page.tsx` | **Modify.** Replace inline church+membership block with the helper (no `signInNext`). | 3 |
| `tests/assessment/completion-screen.test.ts` | **Modify.** Add a delegation + reverse-guard block (`done` has no `signInNext`). | 3 |
| `app/app/[churchId]/answer/[categoryId]/complete/page.tsx` | **Modify.** Replace Guards 1–2 with the helper; keep Guards 3–4 + `sectionCompleteNav`. | 4 |
| `tests/assessment/section-complete-route.test.ts` | **Modify.** Swap the two moved assertions for delegation assertions; keep coverage/methodology. | 4 |

Excluded (deliberately, per spec): `app/app/[churchId]/page.tsx` (dashboard) — membership-OPTIONAL, different contract.

---

### Task 1: Shared helper — pure decider + branch-free async wrapper

**Files:**
- Create: `lib/auth/require-church-membership.ts`
- Test: `tests/auth/require-church-membership.test.ts`

**Interfaces:**
- Produces:
  - `export type ChurchMembershipDecision = { action: 'redirect-signin' } | { action: 'not-found' } | { action: 'ok' }`
  - `export function churchMembershipDecision(args: { churchExists: boolean; isAuthenticated: boolean; hasMembership: boolean; signInNext: string | undefined }): ChurchMembershipDecision`
  - `export async function requireChurchMembership(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, churchId: string, opts?: { signInNext?: string }): Promise<void>`
- Consumes: nothing (foundation task).

- [ ] **Step 1: Write the failing decider test**

Create `tests/auth/require-church-membership.test.ts` (sits beside the other `tests/auth/*` pure-fn tests):

```ts
import { describe, expect, it } from 'vitest'
import { churchMembershipDecision } from '@/lib/auth/require-church-membership'

describe('churchMembershipDecision', () => {
  it('church hidden + unauthenticated + signInNext → redirect-signin', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: false,
        hasMembership: false,
        signInNext: '/app/c/answer/1',
      }),
    ).toEqual({ action: 'redirect-signin' })
  })

  it('church hidden + unauthenticated + no signInNext → not-found (the /done path)', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: false,
        hasMembership: false,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church hidden + authenticated non-member + signInNext → not-found (authed still 404s)', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: true,
        hasMembership: false,
        signInNext: '/app/c/answer/1',
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church hidden + authenticated + no signInNext → not-found', () => {
    expect(
      churchMembershipDecision({
        churchExists: false,
        isAuthenticated: true,
        hasMembership: false,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church visible + no membership → not-found', () => {
    expect(
      churchMembershipDecision({
        churchExists: true,
        isAuthenticated: true,
        hasMembership: false,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'not-found' })
  })

  it('church visible + membership → ok', () => {
    expect(
      churchMembershipDecision({
        churchExists: true,
        isAuthenticated: true,
        hasMembership: true,
        signInNext: undefined,
      }),
    ).toEqual({ action: 'ok' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth/require-church-membership.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/require-church-membership` (module does not exist yet).

- [ ] **Step 3: Write the helper (pure decider + branch-free wrapper)**

Create `lib/auth/require-church-membership.ts` (verbatim from the spec's design sketch):

```ts
import { notFound, redirect } from 'next/navigation'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ChurchMembershipDecision =
  | { action: 'redirect-signin' }
  | { action: 'not-found' }
  | { action: 'ok' }

/**
 * Pure authorization decision for a member-facing church route, given whether the church is
 * visible to the caller (RLS), whether the caller is authenticated, whether they hold a
 * `church_members` row, and whether the caller opted into a sign-in redirect for the church-hidden
 * case. No IO — the async wrapper feeds it booleans and executes the result.
 */
export function churchMembershipDecision({
  churchExists,
  isAuthenticated,
  hasMembership,
  signInNext,
}: {
  churchExists: boolean
  isAuthenticated: boolean
  hasMembership: boolean
  signInNext: string | undefined
}): ChurchMembershipDecision {
  if (!churchExists) {
    if (!isAuthenticated && signInNext) return { action: 'redirect-signin' }
    return { action: 'not-found' }
  }
  if (!hasMembership) return { action: 'not-found' }
  return { action: 'ok' }
}

/**
 * Shared church + membership permission wall for the member-facing assessment routes.
 * RLS hides churches the caller isn't a member of (→ 404); the `church_members` row is the explicit
 * second gate. Pass `signInNext` to send an *unauthenticated* deep-link to sign-in (with a `next`
 * back to the page) instead of a bare 404 — omit it to keep `notFound()`-only behavior.
 */
export async function requireChurchMembership(
  supabase: SupabaseServerClient,
  churchId: string,
  opts?: { signInNext?: string },
): Promise<void> {
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()

  const decision = churchMembershipDecision({
    churchExists: church != null,
    isAuthenticated: user != null,
    hasMembership: membership != null,
    signInNext: opts?.signInNext,
  })

  if (decision.action === 'redirect-signin') redirect(`/sign-in?next=${opts?.signInNext}`)
  if (decision.action === 'not-found') notFound()
  // 'ok' → return void
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth/require-church-membership.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Gates**

Run: `npm run typecheck` (0 errors) · `npm run lint` (0 errors).
Note: the wrapper is validated by typecheck (compiles, correct signature) here and by the route tripwires in Tasks 2–4; per the locked spec (decision #2) it has no separate execution test — all authorization *logic* lives in the pure decider, which is fully exercised above.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/require-church-membership.ts tests/auth/require-church-membership.test.ts
git commit -m "feat(auth): add requireChurchMembership shared guard (pure decider + wrapper)"
```

---

### Task 2: `answer` route — add the church + membership gate (core hardening)

**Files:**
- Modify: `app/app/[churchId]/answer/[categoryId]/page.tsx` (imports; replace lines 15–26)
- Test: `tests/assessment/answer-membership-guard.test.ts` (create)

**Interfaces:**
- Consumes: `requireChurchMembership(supabase, churchId, { signInNext })` from Task 1.

- [ ] **Step 1: Write the failing tripwire test**

Create `tests/assessment/answer-membership-guard.test.ts`:

```ts
// Source-reading tripwire (node env, no DOM): the answer page now guards itself with the shared
// church + membership helper (defense-in-depth — no longer RLS-only). Deleting the guard (regressing
// to RLS-only) removes the requireChurchMembership call → this turns red. Invisible in a static
// render → pinned here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const answer = stripComments(
  fs.readFileSync(
    path.join(ROOT, 'app', 'app', '[churchId]', 'answer', '[categoryId]', 'page.tsx'),
    'utf8',
  ),
)

describe('answer page church + membership guard', () => {
  it('delegates the church + membership gate to the shared helper', () => {
    expect(answer, 'imports the shared guard').toContain(
      "from '@/lib/auth/require-church-membership'",
    )
    expect(answer, 'calls the shared guard').toContain('requireChurchMembership(')
  })

  it('opts into a sign-in redirect with a next back to the answer page', () => {
    expect(answer, 'passes signInNext (a revert to RLS-only removes this)').toContain('signInNext')
    expect(answer, 'unauth deep-link → sign-in with next back to this page').toContain(
      '/app/${churchId}/answer/${categoryId}',
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/assessment/answer-membership-guard.test.ts`
Expected: FAIL — the route does not yet import/call `requireChurchMembership` (no `signInNext` keyword present).

- [ ] **Step 3: Edit the answer route**

In `app/app/[churchId]/answer/[categoryId]/page.tsx`:

Change the import on line 2 (drop `redirect`; `notFound` stays for the category guard):
```ts
import { notFound } from 'next/navigation'
```
Add the helper import (after line 3, with the other `@/lib` imports):
```ts
import { requireChurchMembership } from '@/lib/auth/require-church-membership'
```
Replace the inline church block (current lines 15–26):
```ts
  // Permission wall: RLS hides churches the caller isn't a member of → 404.
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/sign-in?next=/app/${churchId}/answer/${categoryId}`)
    notFound()
  }
```
with:
```ts
  // Permission wall: church must be visible (RLS) AND the caller must hold a church_members row
  // (defense-in-depth — no longer RLS-only). An unauthenticated deep link is sent to sign-in with a
  // next back to this page.
  await requireChurchMembership(supabase, churchId, {
    signInNext: `/app/${churchId}/answer/${categoryId}`,
  })
```
Leave everything else verbatim: the methodology lookup, `if (!category) notFound()`, `get_my_category_answers`, and the full render (incl. the `← Back to menu` Link).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assessment/answer-membership-guard.test.ts tests/assessment/back-to-menu-link.test.ts`
Expected: PASS — new tripwire green; the existing back-to-menu Link test still green (the Link is untouched).

- [ ] **Step 5: Gates**

Run: `npm run typecheck` (0) · `npm run lint` (0 — confirms `redirect` is no longer an unused import).

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/answer/[categoryId]/page.tsx" tests/assessment/answer-membership-guard.test.ts
git commit -m "feat(assessment): guard the answer route with requireChurchMembership (defense-in-depth)"
```

---

### Task 3: `done` route — delegate to the helper, keep notFound()-only

**Files:**
- Modify: `app/app/[churchId]/done/page.tsx` (imports; replace lines 15–32)
- Test: `tests/assessment/completion-screen.test.ts` (add one block)

**Interfaces:**
- Consumes: `requireChurchMembership(supabase, churchId)` from Task 1 (no `signInNext`).

- [ ] **Step 1: Add the failing delegation + reverse-guard block**

In `tests/assessment/completion-screen.test.ts`, add this `it(...)` block inside the existing `describe('assessment completion screen', ...)` (e.g. after the `guards itself…` block). Do NOT touch the existing blocks (they pin route-specific coverage/copy that stays):

```ts
  it('delegates the church + membership gate to the shared helper', () => {
    expect(done, 'imports the shared guard').toContain(
      "from '@/lib/auth/require-church-membership'",
    )
    expect(done, 'calls the shared guard').toContain('requireChurchMembership(')
    // Decision #3 reverse-guard: /done stays notFound()-only on unauth — it must NOT opt into a
    // sign-in redirect. Adding signInNext to the /done guard turns these red.
    expect(done, 'no sign-in redirect on /done').not.toContain('/sign-in?next=')
    expect(done, 'must not opt into signInNext').not.toContain('signInNext')
  })
```

- [ ] **Step 2: Run the test to verify the new block fails**

Run: `npx vitest run tests/assessment/completion-screen.test.ts`
Expected: FAIL on the new block — `done` does not yet import/call `requireChurchMembership`. (The two `not.toContain` assertions already hold on today's `done`; the two positive assertions are what fail.)

- [ ] **Step 3: Edit the done route**

In `app/app/[churchId]/done/page.tsx`:

Change the import on line 2 (drop `notFound`; `redirect` stays for the coverage bounce):
```ts
import { redirect } from 'next/navigation'
```
Add the helper import (after line 3):
```ts
import { requireChurchMembership } from '@/lib/auth/require-church-membership'
```
Replace the inline church + membership block (current lines 15–32):
```ts
  // Same church + user + membership load as the dashboard: RLS hides churches the caller isn't a
  // member of (→ 404), and the membership row is the second gate so only members reach this screen.
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  if (!membership) notFound()
```
with:
```ts
  // Church + membership permission wall. No signInNext ⇒ an unauthenticated / non-member deep link
  // gets notFound() (never a sign-in redirect) — /done's behavior is unchanged.
  await requireChurchMembership(supabase, churchId)
```
Leave the completion guard (coverage RPC, `coverage(rows, categories)`, `redirect(\`/app/${churchId}\`)`) and the render verbatim.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/assessment/completion-screen.test.ts`
Expected: PASS (all blocks, incl. the new delegation block).

- [ ] **Step 5: Gates**

Run: `npm run typecheck` (0) · `npm run lint` (0 — confirms `notFound` is no longer an unused import).

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/done/page.tsx" tests/assessment/completion-screen.test.ts
git commit -m "refactor(assessment): delegate the /done church+membership gate to requireChurchMembership"
```

---

### Task 4: `complete` route — delegate, update the route tripwire

**Files:**
- Modify: `app/app/[churchId]/answer/[categoryId]/complete/page.tsx` (add import; replace Guards 1–2, current lines 16–38)
- Test: `tests/assessment/section-complete-route.test.ts` (replace the `mirrors the /done + answer guards` block)

**Interfaces:**
- Consumes: `requireChurchMembership(supabase, churchId, { signInNext })` from Task 1.

- [ ] **Step 1: Update the route tripwire (make it fail)**

In `tests/assessment/section-complete-route.test.ts`, **replace** the `it('mirrors the /done + answer guards', …)` block (current lines 31–37) with the two blocks below. The `from('church_members')` and `/sign-in?next=` strings move into the helper, so those two assertions become delegation assertions; the coverage/methodology assertions stay. Do NOT touch the other blocks (`adds the interstitial…`, `delegates branch logic…`, `acts on each redirecting helper branch`, `renders the two approved buttons…`) — they pin logic that remains in the route.

```ts
  it('delegates the church + membership gate to the shared helper', () => {
    expect(route, 'imports the shared guard').toContain(
      "from '@/lib/auth/require-church-membership'",
    )
    expect(route, 'calls the shared guard').toContain('requireChurchMembership(')
    expect(route, 'unauth deep-link → sign-in with next back to this page').toContain(
      '/app/${churchId}/answer/${categoryId}/complete',
    )
  })

  it('keeps the route-specific coverage + methodology loads', () => {
    expect(route, 'own coverage via the security-definer RPC').toContain('get_member_run_coverage')
    expect(route, 'classifies coverage via the shared helper').toContain('coverage(rows, categories)')
    expect(route, 'validates categoryId against the methodology').toContain('loadMethodology()')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/assessment/section-complete-route.test.ts`
Expected: FAIL on the new `delegates…` block — the route does not yet import/call `requireChurchMembership`. (The `keeps the route-specific…` block already passes on today's route.)

- [ ] **Step 3: Edit the complete route**

In `app/app/[churchId]/answer/[categoryId]/complete/page.tsx`:

Keep the `import { notFound, redirect } from 'next/navigation'` line unchanged (Guard 3 uses `notFound`; the `sectionCompleteNav` branches use `redirect`).
Add the helper import (after line 6, with the other `@/lib` imports):
```ts
import { requireChurchMembership } from '@/lib/auth/require-church-membership'
```
Replace Guards 1–2 (current lines 16–38):
```ts
  // Guard 1 — church by id: RLS hides churches the caller isn't a member of → 404;
  // an unauthenticated deep link is sent to sign-in with a next back to this page.
  const { data: church, error } = await supabase
    .from('churches')
    .select('id')
    .eq('id', churchId)
    .maybeSingle()
  if (error) throw error
  if (!church) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/sign-in?next=/app/${churchId}/answer/${categoryId}/complete`)
    notFound()
  }

  // Guard 2 — membership (matches /done): only members reach this screen.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()
  if (!membership) notFound()
```
with:
```ts
  // Guards 1–2 — church + membership permission wall (shared with /answer and /done). An
  // unauthenticated deep link is sent to sign-in with a next back to this page.
  await requireChurchMembership(supabase, churchId, {
    signInNext: `/app/${churchId}/answer/${categoryId}/complete`,
  })
```
Leave Guard 3 (`if (!categories.some((c) => c.id === categoryId)) notFound()`), Guard 4 (coverage RPC + `coverage(rows, categories)`), the `sectionCompleteNav` branches, and the render verbatim.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/assessment/section-complete-route.test.ts`
Expected: PASS (all blocks).

- [ ] **Step 5: Gates**

Run: `npm run typecheck` (0) · `npm run lint` (0).

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/answer/[categoryId]/complete/page.tsx" tests/assessment/section-complete-route.test.ts
git commit -m "refactor(assessment): delegate the /complete church+membership gate to requireChurchMembership"
```

---

## Final verification (after Task 4)

- [ ] Full gates: `npm run typecheck` (0) · `npm run lint` (0) · `npx vitest run` (expect **328 + 6 = 334** passing: +6 decider cases, +2 answer-tripwire cases, and the two updated files net-neutral or slightly higher on case count; confirm no regressions and note the exact final number).
- [ ] Confirm the three routes no longer contain inline `from('church_members')`; confirm `/done` contains neither `signInNext` nor `/sign-in?next=`.
- [ ] `superpowers:requesting-code-review` → **Opus final whole-branch review** (base `97a734d` → branch HEAD). Optional: `vibe-security` sanity pass (touches auth/membership guards).
- [ ] `superpowers:finishing-a-development-branch`. **Natalie merges** (push + PR is her pattern) — do NOT merge/push.

---

## Self-review

**1. Spec coverage.** Every spec section maps to a task:
- Helper shape (pure decider + branch-free wrapper) → Task 1 (verbatim sketch).
- `answer` adds the membership gate → Task 2 (core hardening; `getUser()` 0→1 is intended).
- `done` delegation, `notFound()`-only preserved → Task 3 (no `signInNext`; reverse-guard added).
- `complete` delegation, Guards 3–4 kept → Task 4.
- Testing strategy (4 artifacts: decider matrix, answer tripwire, done extension, complete update) → Tasks 1–4 one-for-one. Dashboard exclusion honored (no task touches it).
- Behavior preservation (raw `next` interpolation, `user?.id ?? ''`, `void` return) → helper is the spec's verbatim code.

**2. Placeholder scan.** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code + test block is complete and copy-ready. Every route edit shows the exact before→after and the exact import-line change.

**3. Type consistency.** `churchMembershipDecision` / `requireChurchMembership` / `ChurchMembershipDecision` names and the `{ signInNext }` opts shape are identical across Task 1's definition and Tasks 2–4's call sites. `signInNext` values: `/app/${churchId}/answer/${categoryId}` (answer), none (done), `/app/${churchId}/answer/${categoryId}/complete` (complete) — matching each route's original `next` string byte-for-byte. Import bookkeeping verified per route: answer drops `redirect`/keeps `notFound`; done drops `notFound`/keeps `redirect`; complete keeps both; `user` is unused after the gate in all three (safe to remove).
