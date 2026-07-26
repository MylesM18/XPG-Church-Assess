# Spec — `requireChurchMembership` shared guard + answer-page defense-in-depth

**Date:** 2026-07-26 · **Branch:** `feat/require-church-membership` (off `origin/master` `97a734d`)
**Type:** code-only refactor + one hardening addition. No DB / RPC / methodology / dependency changes.

## Goal

Extract the duplicated "church-by-id + explicit `church_members` membership" gate from the three
member-facing assessment routes into one shared helper, and **add** that explicit membership gate to
the `answer` route, which today relies on RLS alone.

The `answer` gap is **defense-in-depth, not a live hole**: `responses` and the coverage RPCs are
already default-deny + own-data-only, and RLS on `churches` already scopes visibility to members, so
a non-member cannot read another church's data today. This change makes the `answer` route match its
two siblings (`done`, `complete`), which already assert membership explicitly, so the guard no longer
depends on RLS being the *only* thing standing between a non-member and the page shell.

## Current state (all three routes read this session)

| Aspect | `answer/[categoryId]` | `done` | `answer/[categoryId]/complete` |
|---|---|---|---|
| church-by-id select + `if (error) throw` | ✅ | ✅ | ✅ |
| church-not-found branch | `!user → redirect(/sign-in?next=…/answer/[cat])` else `notFound()` | **`notFound()` only** | `!user → redirect(/sign-in?next=…/complete)` else `notFound()` |
| explicit `church_members` gate | ❌ **MISSING** ← add | ✅ `!membership → notFound()` | ✅ `!membership → notFound()` |
| `auth.getUser()` calls | 1 (only in not-found branch; **0 in happy path**) | 1 | **2** (not-found branch + membership) |
| route-specific work after the gate | methodology + `get_my_category_answers` | `get_member_run_coverage` + `coverage()` | categoryId validation + coverage + `sectionCompleteNav()` |
| uses `user`/`role` after the gate | no | no | no |

The only genuine variation in the *shared* gate is the church-not-found branch: sign-in redirect
(`answer`, `complete`) vs plain `notFound()` (`done`). categoryId validation and coverage are
route-specific and **stay in the routes** — folding them in would be the leaky over-parameterized
abstraction PR #29's review warned against.

## Design

### Home & shape

New file `lib/auth/require-church-membership.ts` (sits beside `parse-auth-error.ts`,
`pick-member-church.ts`, `resolve-next.ts`). It exports **two** symbols:

1. **`churchMembershipDecision(...)` — a pure function** returning a discriminated union. All
   authorization branch logic lives here so it can be exhaustively unit-tested with plain inputs,
   mirroring the `sectionCompleteNav` precedent (`lib/coverage/section-complete.ts`).
2. **`requireChurchMembership(...)` — a thin async wrapper** that does the IO (fetch church, user,
   membership), calls the pure decider, and executes the single returned side effect. The wrapper
   holds no authorization branching of its own beyond propagating a DB error.

```ts
// lib/auth/require-church-membership.ts
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

### Wrapper is branch-free by design

The wrapper fetches church, user, **and** membership unconditionally, then defers every
authorization branch to the pure decider. This means one extra `church_members` query on the
church-hidden (404 / cold) path — negligible, and it buys a genuinely branch-free wrapper so that
*all* the security logic is covered by real execution tests rather than source substrings. `redirect`
and `notFound` return `never`, so control never falls through them.

### Per-route integration

- **`answer/[categoryId]/page.tsx`** — replace the inline church-select + not-found block with
  `await requireChurchMembership(supabase, churchId, { signInNext: \`/app/${churchId}/answer/${categoryId}\` })`,
  then keep the methodology lookup + `get_my_category_answers` code verbatim. **This is where the
  explicit membership gate is added.** Happy-path `getUser()` count goes 0 → 1 (the cost of the new
  check — intended).
- **`done/page.tsx`** — replace the inline church-select + `getUser` + membership block with
  `await requireChurchMembership(supabase, churchId)` (**no `signInNext`** ⇒ preserves today's
  `notFound()`-only-on-unauth exactly), then keep the coverage code verbatim.
- **`answer/[categoryId]/complete/page.tsx`** — replace Guards 1–2 with
  `await requireChurchMembership(supabase, churchId, { signInNext: \`/app/${churchId}/answer/${categoryId}/complete\` })`,
  then keep Guard 3 (categoryId validation), Guard 4 (coverage), and the `sectionCompleteNav` branch
  verbatim. Collapses its double `getUser()` to the helper's single call.

### Behavior-preservation notes

- **`done` unauth behavior is unchanged** (decision locked): no `signInNext` → an unauthenticated /
  non-member deep-link still gets `notFound()`, never a sign-in redirect.
- **`next` value is interpolated raw** (`/sign-in?next=${signInNext}`), exactly as the current inline
  code does — no new `encodeURIComponent`, so the emitted URL is byte-identical to today. (The
  callers pass a relative same-origin path; the sign-in page's own consumer already guards
  open-redirects via `resolveNext`.)
- Membership query keeps `user?.id ?? ''` verbatim so RLS behavior is identical to the current routes.
- Return type is **`void`** (YAGNI — no route uses `role` after the gate).

## Scope

**In:** the three member-facing assessment routes (`answer`, `done`, `complete`) + the new helper +
its tests.

**Out — the dashboard (`app/app/[churchId]/page.tsx`) is deliberately excluded.** It does a similar
church + membership load but is **membership-OPTIONAL** (`role = membership?.role ?? null`, degrades
to a viewer, never `notFound()`s on a missing membership) and needs extra church columns
(`name`, `brand_color`) + the role. Different contract → forcing it through this helper would
re-introduce the leaky abstraction. It stays as-is.

## Testing strategy

Follows the codebase's two-tier convention: pure logic gets real execution tests; route files get
source-reading tripwires. Every tripwire is a **reverse-guard** (a revert must turn it red).

1. **Pure decider — `tests/auth/require-church-membership.test.ts`** (new; sits beside the other
   `tests/auth/*` pure-fn tests). Exhaustive `.toEqual` over the full branch matrix:
   - `!church`, unauth, `signInNext` set → `redirect-signin`
   - `!church`, unauth, no `signInNext` → `not-found` (the `done` path)
   - `!church`, **authed**, `signInNext` set → `not-found` (authed non-member still 404s)
   - `!church`, authed, no `signInNext` → `not-found`
   - `church`, no membership → `not-found`
   - `church`, membership → `ok`

2. **`answer` route tripwire — new file** (e.g. `tests/assessment/answer-membership-guard.test.ts`).
   The core deliverable's guard: assert the route imports `from '@/lib/auth/require-church-membership'`
   and calls `requireChurchMembership(` with a `signInNext` for `/app/${churchId}/answer/${categoryId}`.
   Deleting the guard (regressing to RLS-only) turns this red.

3. **`done` tripwire — extend `tests/assessment/completion-screen.test.ts`.** Add a block asserting
   `done` imports + calls `requireChurchMembership(`, **and** a reverse-guard that the `done` source
   does **not** contain `signInNext` / `/sign-in?next=` (locks decision #3 — no sign-in redirect on
   `done`). The existing coverage/copy assertions are unaffected (that logic stays in the route).

4. **`complete` tripwire — update `tests/assessment/section-complete-route.test.ts`.** Its
   `mirrors the /done + answer guards` block currently asserts `from('church_members')` (line 32) and
   `/sign-in?next=` (line 36); **both strings move into the helper**, so those two assertions must be
   replaced with delegation assertions (`requireChurchMembership(` + the helper import + the
   `/complete` `signInNext` arg), mirroring the existing `sectionCompleteNav` delegation block. The
   `get_member_run_coverage` / `coverage(rows, categories)` / `loadMethodology()` assertions **stay**
   (that logic remains in the route).

No existing test asserts the `answer` route's guard today, and `back-to-menu-link.test.ts` (answer)
tests only the Link → unaffected.

## Constraints / gates

- **Code-only.** No DB migrations, no RPC changes, no methodology changes, no new dependencies.
- Gates each step: `npm run typecheck` (0) · `npm run lint` (0) · vitest green (was 328/328 on the
  merged base; this adds the decider suite + route tripwires and updates one existing test).
- ⛔ Never `npm run test:db` / `supabase db push` / `supabase db reset` (owner-only).
- ⛔ Never merge / push / force without Natalie. CI Vercel "unstable" = `cornerleague` perms, not a
  code failure.
- Git: explicit paths only; `GIT_LITERAL_PATHSPECS=1` for any `app/app/[churchId]/…` / `[categoryId]`
  path; never `git add -A`; never stage `.claude/` or the untracked old plan file.

## Decisions locked (2026-07-26, with Natalie)

1. **Helper contract:** Approach A — single async `requireChurchMembership(supabase, churchId, opts?)`,
   injected client, opt-in `signInNext`.
2. **Test strategy:** pure decider + thin wrapper (real branch coverage for the security decision),
   not source-tripwires-only.
3. **`done` unauth:** preserve `notFound()`-only — zero behavior change.
4. **Return value / scope:** `void`; scope = the 3 assessment routes; dashboard excluded.
