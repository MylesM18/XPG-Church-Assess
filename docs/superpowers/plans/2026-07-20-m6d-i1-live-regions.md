# M6d I-1 — Live-Region Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every silent status message in the app a screen-reader announcement, satisfying WCAG SC 4.1.3 "Status Messages" at AA.

**Architecture:** One shared `LiveStatus` component renders a **permanently mounted** `<p role="alert">` or `<p role="status">` whose text content is the only thing that changes — the conditional-mount form `{error && <p aria-live>}` is silently missed by screen readers and is what this work removes. Ten mechanical error-site swaps adopt it. Five success announcements are added on top, three via the same component and two via a focus-move (`answer-form`, `sign-in`) where the submit control unmounts and would otherwise strand focus on `<body>`. `diagnosis/actions.ts` gains a required `status` discriminator because `revokeShare`'s success return is byte-identical to its initial state and is otherwise unannounceable.

**Tech Stack:** Next.js App Router (React 19, `useActionState`), TypeScript, Tailwind, vitest (node environment, source-reading tests only).

**Source spec:** `docs/superpowers/specs/2026-07-19-m6d-live-regions-design.md` — approved, zero open questions. Decisions 1–5 are locked; do not reopen them.

**Branch:** `feat/m6d-live-regions`, cut off merged `master` `991ff96`. Nothing is pushed.

## Global Constraints

- ⛔ **NEVER** run `npm run test:db`.
- **Never push or merge.** Natalie's explicit go-ahead only, as MylesM18.
- **Do not touch `next.config.ts` or `vitest.config.ts`.** vitest therefore stays node-environment and `tests/**/*.test.ts`-only.
- **There is no jsdom, no `@testing-library`, no Playwright.** Component-render tests are genuinely unavailable. **Do not propose or add jsdom.** Tests in this plan are source-reading tests.
- **Locate every edit by exact string match, never by line number.**
- Migrations are append-only. `.superpowers/` stays untracked. **Never** merge `chore/rename-cairn-to-xpg`.
- **Raw U+2019 (`’`) across `app/` + `components/` must stay at exactly 15.** New copy in this plan deliberately avoids apostrophes. The existing `we couldn’t email it` strings are already counted — **do not disturb them**.
- Gates, all of which must pass before any task is considered done: `npm run typecheck` → 0 errors · `npm run lint` → 0 errors · `npm run test` → **at least 170 tests / 41 files** plus this plan's additions · `npm run build` → exit 0.
- Import alias is `@/*` → repo root. Import the new component as `@/components/live-status`.
- Every consumer file is already `'use client'`. Do not add or remove that directive.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `components/live-status.tsx` | **create** | The only live-region primitive. Always-mounted `<p>`, role by tone, `sr-only` when empty. |
| `app/get-started/form.tsx` | modify | error swap only |
| `app/app/[churchId]/generate-button.tsx` | modify | error swap only (succeeds by redirect) |
| `app/app/[churchId]/access/remove-member-button.tsx` | modify | error swap only |
| `app/app/[churchId]/access/revoke-invite-button.tsx` | modify | error swap only |
| `app/accept/[token]/accept-button.tsx` | modify | error swap only (succeeds by redirect) |
| `components/answer-form.tsx` | modify | error swap **+** focus-move success, fixes the zero-`<h1>` defect |
| `app/sign-in/page.tsx` | modify | error swap **+** focus-move success |
| `app/app/[churchId]/invite-panel.tsx` | modify | error swap **+** `status` announcement |
| `app/app/[churchId]/access/invite-member-form.tsx` | modify | error swap **+** `status` announcement |
| `app/app/[churchId]/diagnosis/actions.ts` | modify | required `ShareResult.status` discriminator |
| `app/app/[churchId]/diagnosis/share-control.tsx` | modify | error swap **+** `status` announcement (depends on `actions.ts`) |
| `tests/a11y/live-status-component.test.ts` | **create** | pins the component's shape (Task 1) |
| `tests/a11y/live-regions-applied.test.ts` | **create** | pins application across the codebase (Task 8) |

**No two tasks share a file.** Two separate test files exist precisely so that Task 1 and Task 8 do not collide.

**Dependency order — must be respected:**
1. Task 1 (`live-status.tsx`) before Tasks 2–6 and 8.
2. Task 6 (`actions.ts`) before Task 7 (`share-control.tsx`).
3. Task 8 (application census) after Tasks 2–7, because it asserts zero remaining old-form sites.
4. Task 9 (tier-1 browser proof + gates) last.

Tasks 2, 3, 4, 5 are mutually independent and may run in parallel. Task 6 may run in parallel with 2–5.

---

### Task 1: The `LiveStatus` component

**Files:**
- Create: `components/live-status.tsx`
- Test: `tests/a11y/live-status-component.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function LiveStatus(props: { message: string | null; tone: 'error' | 'status'; className: string }): JSX.Element` — imported by every later task as `import { LiveStatus } from '@/components/live-status'`. All three props are **required**; `className` is passed per site because the existing error paragraphs are not uniform.

**Why the test asserts on source text:** there is no DOM in this test environment. The load-bearing property — "the region is permanently mounted, only its text changes" — is provable statically by asserting the component contains no `{message && …}` conditional around its `<p>`. Runtime node identity is proven separately, once, in Task 9.

- [ ] **Step 1: Write the failing test**

Create `tests/a11y/live-status-component.test.ts`:

```ts
// Pins the shape of the LiveStatus live-region primitive. SOURCE-READING test (node env, no DOM):
// it asserts on file text, not rendered output.
//
// Why it exists: `{message && <p aria-live="polite">{message}</p>}` inserts the region and its
// content in the same tick. Screen readers register live regions on mount and announce only
// SUBSEQUENT mutations, so the first message is silently missed. The whole M6d I-1 design rests on
// the region being permanently mounted with only its text content changing. If someone later
// "tidies" this component into a conditional render, every announcement in the app goes silent
// with no visual change and no other test failing. This test is the tripwire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'components', 'live-status.tsx'), 'utf8')

describe('LiveStatus component shape', () => {
  it('never conditionally mounts the region', () => {
    expect(
      SOURCE,
      'live-status.tsx must not gate its <p> behind `message &&` — a conditionally mounted live ' +
        'region misses its first announcement. Render always; vary only the text content.',
    ).not.toMatch(/\{\s*message\s*&&/)
  })

  it('maps tone to an implicit-live role', () => {
    expect(SOURCE).toContain("role={tone === 'error' ? 'alert' : 'status'}")
  })

  it('does not also set aria-live', () => {
    expect(
      SOURCE,
      'role="alert" already implies aria-live="assertive" and role="status" implies polite; both ' +
        'imply aria-atomic="true". Specifying aria-live as well is redundant.',
    ).not.toContain('aria-live')
  })

  it('falls back to sr-only when there is no message', () => {
    expect(
      SOURCE,
      'An always-mounted empty <p> would add a phantom flex-gap row in every parent (they are all ' +
        'flex columns with a gap). sr-only is position:absolute so it is not a flex item, and ' +
        'unlike display:none it stays in the accessibility tree.',
    ).toContain("'sr-only'")
  })

  it('requires all three props', () => {
    expect(SOURCE).toContain('message: string | null')
    expect(SOURCE).toContain("tone: 'error' | 'status'")
    expect(SOURCE).toContain('className: string')
    expect(SOURCE, 'no prop may be optional — a missing className would render unstyled text').not.toMatch(
      /(message|tone|className)\?:/,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/a11y/live-status-component.test.ts`

Expected: FAIL — `ENOENT: no such file or directory` for `components/live-status.tsx`.

- [ ] **Step 3: Write the component**

Create `components/live-status.tsx`:

```tsx
// The app's only live-region primitive (WCAG SC 4.1.3 "Status Messages").
//
// The <p> is ALWAYS rendered and only its text content changes. Screen readers register live
// regions on mount and announce subsequent mutations, so a region inserted at the same moment as
// its first message is silently missed — `{error && <p aria-live>}` does not work. This API makes
// the broken form inexpressible: a caller cannot conditionally mount the region.
//
// When there is no message the <p> collapses to sr-only rather than rendering empty: every parent
// here is a flex column with a gap, and an always-present empty child would add a phantom gap row.
// sr-only is position:absolute (so not a flex item, no gap contribution) and, unlike display:none,
// stays in the accessibility tree — which is exactly what a live region needs.
//
// role="alert" implies aria-live="assertive"; role="status" implies aria-live="polite". Both imply
// aria-atomic="true", which makes the whole message read out rather than just the changed run.
// Setting aria-live as well would be redundant.
//
// No 'use client' directive: no hooks, no handlers, so it compiles into whichever boundary imports
// it. All current consumers are already client components.
export function LiveStatus({
  message,
  tone,
  className,
}: {
  message: string | null
  tone: 'error' | 'status'
  className: string
}) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={message ? className : 'sr-only'}>
      {message}
    </p>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/a11y/live-status-component.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: both exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add components/live-status.tsx tests/a11y/live-status-component.test.ts
git commit -m "feat(a11y): add LiveStatus live-region primitive"
```

---

### Task 2: The five error-only swaps

**Files:**
- Modify: `app/get-started/form.tsx`
- Modify: `app/app/[churchId]/generate-button.tsx`
- Modify: `app/app/[churchId]/access/remove-member-button.tsx`
- Modify: `app/app/[churchId]/access/revoke-invite-button.tsx`
- Modify: `app/accept/[token]/accept-button.tsx`

**Interfaces:**
- Consumes: `LiveStatus` from Task 1.
- Produces: nothing later tasks depend on.

These five files have **no success announcement**. `generate-button` and `accept-button` succeed by redirecting, so navigation itself carries the announcement; the other three have no success state to report. **No logic changes, no new state, no new imports beyond `LiveStatus`.**

- [ ] **Step 1: Add the import to each of the five files**

In each file, add this line immediately after the last existing `import` line:

```tsx
import { LiveStatus } from '@/components/live-status'
```

- [ ] **Step 2: Swap the five error paragraphs**

Each swap is a single-line exact-string replacement. **Match by these exact strings, not by line number.**

`app/get-started/form.tsx` — replace:

```tsx
      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={state.error} className="font-body text-sm text-berry" />
```

`app/app/[churchId]/generate-button.tsx` — replace:

```tsx
      {error && <p className="font-body text-sm text-berry">{error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={error} className="font-body text-sm text-berry" />
```

`app/app/[churchId]/access/remove-member-button.tsx` — replace:

```tsx
      {state.error && <p className="font-body text-xs text-berry">{state.error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={state.error} className="font-body text-xs text-berry" />
```

`app/app/[churchId]/access/revoke-invite-button.tsx` — replace:

```tsx
      {state.error && <p className="font-body text-xs text-berry">{state.error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={state.error} className="font-body text-xs text-berry" />
```

`app/accept/[token]/accept-button.tsx` — replace:

```tsx
      {error && <p className="font-body text-sm text-berry">{error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={error} className="font-body text-sm text-berry" />
```

Note the two `text-xs` sites — those classNames differ from the other three and must be preserved exactly.

- [ ] **Step 3: Verify no old-form sites remain in these five files**

Run:

```bash
grep -n "error && <p" app/get-started/form.tsx "app/app/[churchId]/generate-button.tsx" "app/app/[churchId]/access/remove-member-button.tsx" "app/app/[churchId]/access/revoke-invite-button.tsx" "app/accept/[token]/accept-button.tsx"
```

Expected: **no output**, exit code 1.

- [ ] **Step 4: Verify each file imports and renders LiveStatus**

Run:

```bash
grep -c "LiveStatus" app/get-started/form.tsx "app/app/[churchId]/generate-button.tsx" "app/app/[churchId]/access/remove-member-button.tsx" "app/app/[churchId]/access/revoke-invite-button.tsx" "app/accept/[token]/accept-button.tsx"
```

Expected: `2` for every file (one import, one render).

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: typecheck 0, lint 0, tests at or above the 170/41 floor.

- [ ] **Step 6: Commit**

```bash
git add app/get-started/form.tsx "app/app/[churchId]/generate-button.tsx" "app/app/[churchId]/access/remove-member-button.tsx" "app/app/[churchId]/access/revoke-invite-button.tsx" "app/accept/[token]/accept-button.tsx"
git commit -m "feat(a11y): announce form errors at the five error-only sites"
```

---

### Task 3: `answer-form.tsx` — error swap plus the focus-move success

**Files:**
- Modify: `components/answer-form.tsx`

**Interfaces:**
- Consumes: `LiveStatus` from Task 1.
- Produces: nothing later tasks depend on.

**This is the highest-value file in the plan.** Its `if (done)` branch unmounts the entire form, and the form contains the page's only `<h1>`. So today the success path ends with **zero `<h1>` on `/respond`**, nothing announced, and focus dropped to `<body>` because the submit button unmounted. One change fixes all three.

**Hook placement is load-bearing.** The `useState` block ends immediately before `if (done)`. The new `useRef` and `useEffect` **must be declared above that early return** — declaring them after it breaks the rules of hooks on the success render.

- [ ] **Step 1: Add the imports**

Replace:

```tsx
import { useState } from 'react'
import type { AnswerInput } from '@/lib/answers/validate'
```

with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import type { AnswerInput } from '@/lib/answers/validate'
```

- [ ] **Step 2: Add the ref and effect above the early return, and rewrite the confirmation**

Replace:

```tsx
  const [done, setDone] = useState(false)

  if (done) {
    return <p className="font-body text-ink">Thank you — your answers have been recorded.</p>
  }
```

with:

```tsx
  const [done, setDone] = useState(false)
  const doneRef = useRef<HTMLHeadingElement>(null)

  // Declared ABOVE the `if (done)` early return on purpose — hooks after it would not run on the
  // success render and would break the rules of hooks.
  //
  // The submit button unmounts with the form, so without this focus falls to <body>. Moving focus
  // to the confirmation both announces it and leaves the keyboard somewhere sensible. It is an
  // <h1> because the form's own <h1>{categoryName}</h1> unmounts with it and the route
  // (app/respond/[token]/page.tsx) supplies a <main> but no heading — so the success page would
  // otherwise have no <h1> at all.
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  if (done) {
    return (
      <h1 tabIndex={-1} ref={doneRef} className="font-display text-2xl text-ink">
        Thank you — your answers have been recorded.
      </h1>
    )
  }
```

The `font-display text-2xl text-ink` classes match the `<h1>` this stands in for. This IS a visible change from today's `font-body text-ink`; it was flagged to Natalie and approved.

- [ ] **Step 3: Swap the error paragraph**

Replace:

```tsx
      {error && <p className="font-body text-sm text-berry">{error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={error} className="font-body text-sm text-berry" />
```

- [ ] **Step 4: Verify the hook order and the swap by reading, not by line number**

Run:

```bash
grep -n "useRef\|useEffect\|if (done)\|LiveStatus\|error && <p" components/answer-form.tsx
```

Expected: the `useRef` and `useEffect` line numbers are both **smaller** than the `if (done)` line number; `LiveStatus` appears twice; `error && <p` does not appear at all.

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: typecheck 0, lint 0 (in particular no `react-hooks/rules-of-hooks` error), tests at or above floor.

- [ ] **Step 6: Commit**

```bash
git add components/answer-form.tsx
git commit -m "feat(a11y): announce answer-form errors and move focus to the confirmation heading"
```

---

### Task 4: `sign-in/page.tsx` — error swap plus the focus-move success

**Files:**
- Modify: `app/sign-in/page.tsx`

**Interfaces:**
- Consumes: `LiveStatus` from Task 1.
- Produces: nothing later tasks depend on.

Same focus-move pattern as Task 3, but the target stays a `<p>` — this page's `<h1>Sign in to XP Gathering</h1>` already sits **outside** the `sent` ternary, so there is no heading defect here. There is no early return in this component, so hook ordering is unconstrained.

- [ ] **Step 1: Add the imports**

Replace:

```tsx
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
```

with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { createClient } from '@/lib/supabase/client'
```

- [ ] **Step 2: Add the ref and the focus effect**

Replace:

```tsx
  const [error, setError] = useState<string | null>(null)
```

with:

```tsx
  const [error, setError] = useState<string | null>(null)
  const sentRef = useRef<HTMLParagraphElement>(null)

  // The whole sign-in form unmounts when `sent` flips, taking the focused submit button with it,
  // so focus would otherwise fall to <body>. Moving it to the confirmation announces the text and
  // leaves the keyboard in a sensible place. No heading change needed here — the <h1> already sits
  // outside the `sent` ternary.
  useEffect(() => {
    if (sent) sentRef.current?.focus()
  }, [sent])
```

- [ ] **Step 3: Make the confirmation focusable**

Replace:

```tsx
        <p className="font-body text-ink-soft">
          Check your email for a magic link. You can close this tab.
        </p>
```

with:

```tsx
        <p ref={sentRef} tabIndex={-1} className="font-body text-ink-soft">
          Check your email for a magic link. You can close this tab.
        </p>
```

- [ ] **Step 4: Swap the error paragraph**

Replace:

```tsx
      {error && <p className="font-body text-sm text-berry">{error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={error} className="font-body text-sm text-berry" />
```

- [ ] **Step 5: Verify**

Run:

```bash
grep -n "sentRef\|tabIndex={-1}\|LiveStatus\|error && <p" app/sign-in/page.tsx
```

Expected: `sentRef` appears three times (declaration, effect, `ref=`); `tabIndex={-1}` appears twice (the existing `<main>` and the new `<p>`); `LiveStatus` twice; `error && <p` absent.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: typecheck 0, lint 0, tests at or above floor.

- [ ] **Step 7: Commit**

```bash
git add app/sign-in/page.tsx
git commit -m "feat(a11y): announce sign-in errors and move focus to the magic-link confirmation"
```

---

### Task 5: `invite-panel.tsx` and `invite-member-form.tsx` — error swap plus link announcement

**Files:**
- Modify: `app/app/[churchId]/invite-panel.tsx`
- Modify: `app/app/[churchId]/access/invite-member-form.tsx`

**Interfaces:**
- Consumes: `LiveStatus` from Task 1.
- Produces: nothing later tasks depend on.

These two files each carry **two** regions — an `alert` for errors and a `status` for the created link. That is correct: they cannot both fire from a single submit.

**The announcement excludes the URL** (decision 5) so a screen reader does not spell out a ~60-character token. The visible block — the sentence plus the `<code>` holding the link — is **untouched**.

**Both announcement strings deliberately contain no apostrophe** so the raw U+2019 census stays at 15. The adjacent existing copy `we couldn’t email it` does contain one; it is already counted and **must not be edited**.

- [ ] **Step 1: Add the import to both files**

In each file, add immediately after the last existing `import` line:

```tsx
import { LiveStatus } from '@/components/live-status'
```

- [ ] **Step 2: Swap the error paragraph in both files**

Both files contain this identical line — replace it in each:

```tsx
      {state.error && <p className="font-body text-sm text-berry">{state.error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={state.error} className="font-body text-sm text-berry" />
```

- [ ] **Step 3: Add the link announcement to `invite-panel.tsx`**

Insert this block immediately **after** the `LiveStatus tone="error"` line you just wrote and immediately **before** the existing `{state.link && (` line:

```tsx
      {/* Announcement only — the visible sentence and the <code> below are unchanged. The URL is
          deliberately excluded so a screen reader does not spell out a ~60-character token. */}
      <LiveStatus
        tone="status"
        className="sr-only"
        message={
          state.link
            ? state.emailed
              ? 'Invitation emailed. The link is shown below.'
              : 'Invitation created but not emailed. The link is shown below.'
            : null
        }
      />
```

`className="sr-only"` in both states keeps this announcement invisible — the visible block already conveys it sighted.

- [ ] **Step 4: Add the same block to `invite-member-form.tsx`**

Insert the identical block in the same position — after the `LiveStatus tone="error"` line, before `{state.link && (`:

```tsx
      {/* Announcement only — the visible sentence and the <code> below are unchanged. The URL is
          deliberately excluded so a screen reader does not spell out a ~60-character token. */}
      <LiveStatus
        tone="status"
        className="sr-only"
        message={
          state.link
            ? state.emailed
              ? 'Invitation emailed. The link is shown below.'
              : 'Invitation created but not emailed. The link is shown below.'
            : null
        }
      />
```

- [ ] **Step 5: Verify both files and re-check the apostrophe census**

Run:

```bash
grep -c "LiveStatus" "app/app/[churchId]/invite-panel.tsx" "app/app/[churchId]/access/invite-member-form.tsx"
grep -rn "error && <p" "app/app/[churchId]/invite-panel.tsx" "app/app/[churchId]/access/invite-member-form.tsx"
grep -roh "’" app/ components/ | wc -l
```

Expected: `3` for each file (one import, two renders); no output from the second command; **exactly `15`** from the third.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: typecheck 0, lint 0, tests at or above floor.

- [ ] **Step 7: Commit**

```bash
git add "app/app/[churchId]/invite-panel.tsx" "app/app/[churchId]/access/invite-member-form.tsx"
git commit -m "feat(a11y): announce invitation errors and created links"
```

---

### Task 6: `diagnosis/actions.ts` — the required `status` discriminator

**Files:**
- Modify: `app/app/[churchId]/diagnosis/actions.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ShareResult` gains a **required** third field `status: 'idle' | 'created' | 'revoked'`. Task 7 consumes it as `minted.status === 'created'` and `revoked.status === 'revoked'`, and must update the `EMPTY` constant in `share-control.tsx` to `{ link: null, error: null, status: 'idle' }`.

**The problem:** on success `revokeShare` returns `{ link: null, error: null }` — **byte-identical to the `EMPTY` initial state** in `share-control.tsx`. From the client there is no way to distinguish "revoke succeeded" from "nothing has happened yet". Nothing can be announced for revoke without fixing this.

**Required, not optional, on purpose:** TypeScript then forces all six `return` sites to state it, so an omission is a compile error rather than a silent `undefined`.

**Explicitly untouched:** `revalidatePath` behaviour, both RPCs, and the deliberately-vague error messages. The comment above the `create_report_share` call explains that the RPC refuses a non-admin and a nonexistent run with the same message **on purpose** — do not "improve" that.

- [ ] **Step 1: Widen the interface**

Replace:

```ts
export interface ShareResult {
  link: string | null
  error: string | null
}
```

with:

```ts
export interface ShareResult {
  link: string | null
  error: string | null
  // Required, not optional, on purpose: revokeShare's success return is otherwise byte-identical
  // to the client's EMPTY initial state, so "revoke succeeded" and "nothing has happened yet" are
  // indistinguishable and unannounceable. Making it required turns an omitted status into a
  // compile error rather than a silent undefined.
  status: 'idle' | 'created' | 'revoked'
}
```

- [ ] **Step 2: Run typecheck to see it fail, listing every return site**

Run: `npm run typecheck`

Expected: FAIL — six errors, one per `return` in this file, each of the form `Property 'status' is missing in type '{ link: ...; error: ...; }' but required in type 'ShareResult'`.

This failing-first step is the point of making the field required: the compiler enumerates the work.

- [ ] **Step 3: Add `status` to all six returns**

In `shareReport`, replace:

```ts
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr }

  const { data: token, error } = await supabase.rpc('create_report_share', { p_run_id: runId })
  // The RPC refuses a non-admin and a nonexistent run with the same message on purpose —
  // surface it verbatim rather than saying whether the run exists.
  if (error) return { link: null, error: error.message }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: shareLink(APP_URL, token as string), error: null }
```

with:

```ts
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr, status: 'idle' }

  const { data: token, error } = await supabase.rpc('create_report_share', { p_run_id: runId })
  // The RPC refuses a non-admin and a nonexistent run with the same message on purpose —
  // surface it verbatim rather than saying whether the run exists.
  if (error) return { link: null, error: error.message, status: 'idle' }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: shareLink(APP_URL, token as string), error: null, status: 'created' }
```

In `revokeShare`, replace:

```ts
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr }

  const { error } = await supabase.rpc('revoke_report_share', { p_run_id: runId })
  if (error) return { link: null, error: error.message }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: null, error: null }
```

with:

```ts
  const { supabase, error: authErr } = await requireAdmin(churchId)
  if (authErr) return { link: null, error: authErr, status: 'idle' }

  const { error } = await supabase.rpc('revoke_report_share', { p_run_id: runId })
  if (error) return { link: null, error: error.message, status: 'idle' }

  revalidatePath(`/app/${churchId}/diagnosis`)
  return { link: null, error: null, status: 'revoked' }
```

Error returns are `'idle'`, not a failure status: nothing succeeded, so there is no state change to announce — the error itself is announced by the `alert` region.

- [ ] **Step 4: Verify all six**

Run: `grep -c "status: '" "app/app/[churchId]/diagnosis/actions.ts"`

Expected: `7` — six returns plus the union in the interface declaration.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: **one remaining error**, in `share-control.tsx`, because its `EMPTY` constant does not yet have `status`. That is Task 7's job. Do not fix it here — `share-control.tsx` belongs to another task.

- [ ] **Step 6: Commit**

```bash
git add "app/app/[churchId]/diagnosis/actions.ts"
git commit -m "feat(share): add required status discriminator to ShareResult"
```

Note: the tree does not typecheck cleanly between this commit and Task 7's. That is expected and is why Task 7 must follow immediately.

---

### Task 7: `share-control.tsx` — error swap plus the derived success announcement

**Files:**
- Modify: `app/app/[churchId]/diagnosis/share-control.tsx`

**Interfaces:**
- Consumes: `LiveStatus` from Task 1; `ShareResult.status` from Task 6.
- Produces: nothing later tasks depend on.

**Depends on Task 6 being committed first.**

This site gets a live region rather than a focus-move (decision 4) because the visible swap is driven by server `revalidatePath`, not client state — there is no clean client edge to hang a focus-move on.

- [ ] **Step 1: Add the import**

Replace:

```tsx
import { useActionState } from 'react'
import { shareReport, revokeShare, type ShareResult } from './actions'
```

with:

```tsx
import { useActionState } from 'react'
import { LiveStatus } from '@/components/live-status'
import { shareReport, revokeShare, type ShareResult } from './actions'
```

- [ ] **Step 2: Give `EMPTY` its status**

Replace:

```tsx
const EMPTY: ShareResult = { link: null, error: null }
```

with:

```tsx
const EMPTY: ShareResult = { link: null, error: null, status: 'idle' }
```

- [ ] **Step 3: Derive the announcement**

Replace:

```tsx
  const link = existingLink
  const error = minted.error ?? revoked.error
```

with:

```tsx
  const link = existingLink
  const error = minted.error ?? revoked.error

  // Gate on `link` — the server's source of truth — so a mint-then-revoke sequence reads correctly:
  // `minted.status` is still 'created' at that point, but `link` is null, so that branch is skipped
  // and the region says "revoked".
  //
  // On first paint of a page that already has a share link both statuses are 'idle', so nothing is
  // announced on load. The first-mount problem is solved by construction, with no guard.
  //
  // Why not a useRef previous-value guard: it fires on any re-render where the prop changes,
  // including unrelated revalidations of the same path, and it would still need an explicit
  // first-mount guard. The discriminator is exact — set by the action that actually ran.
  const announcement = link
    ? minted.status === 'created'
      ? 'Share link created.'
      : null
    : revoked.status === 'revoked'
      ? 'Share link revoked.'
      : null
```

- [ ] **Step 4: Swap the error paragraph and add the status region**

Replace:

```tsx
      {error && <p className="font-body text-sm text-ink">{error}</p>}
```

with:

```tsx
      <LiveStatus tone="error" message={error} className="font-body text-sm text-ink" />
      <LiveStatus tone="status" message={announcement} className="sr-only" />
```

Note this file's error className is `text-ink`, not `text-berry` like the others — preserve it exactly.

- [ ] **Step 5: Verify**

Run:

```bash
grep -n "LiveStatus\|announcement\|status: 'idle'\|error && <p" "app/app/[churchId]/diagnosis/share-control.tsx"
```

Expected: `LiveStatus` three times (import + two renders); `announcement` twice (declaration + use); `status: 'idle'` once in `EMPTY`; `error && <p` absent.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: typecheck now **0 errors** — this closes the error Task 6 left open. Lint 0. Tests at or above floor.

- [ ] **Step 7: Commit**

```bash
git add "app/app/[churchId]/diagnosis/share-control.tsx"
git commit -m "feat(a11y): announce share-link creation and revocation"
```

---

### Task 8: The application census test

**Files:**
- Create: `tests/a11y/live-regions-applied.test.ts`

**Interfaces:**
- Consumes: the completed state of Tasks 1–7.
- Produces: nothing.

**Runs after Tasks 2–7**, because it asserts that zero old-form sites remain anywhere. Modelled on the existing `tests/a11y/main-landmark.test.ts` — **read that file first**; it is the precedent for a source-reading test in this repo (strips comments before scanning, asserts a floor rather than an exact count, carries a prose header explaining why it exists).

- [ ] **Step 1: Read the precedent**

Run: `cat tests/a11y/main-landmark.test.ts`

Note its three habits you are about to reuse: `stripComments` before scanning, a recursive `.tsx` walker, and a vacuity floor so a bad glob cannot make every "zero occurrences" assertion trivially pass.

- [ ] **Step 2: Write the test**

Create `tests/a11y/live-regions-applied.test.ts`:

```ts
// Pins that every status message in the app goes through LiveStatus. SOURCE-READING test
// (node env, no DOM): it asserts on file structure, not rendered output.
//
// Why it exists: the old `{error && <p className="…">{error}</p>}` form renders identically to the
// LiveStatus form on screen. If someone reintroduces it, nothing looks wrong, no other test fails,
// and the announcement is silently lost for screen-reader users. This test is the tripwire for
// regressions across all ten sites at once.
//
// The companion tests/a11y/live-status-component.test.ts pins the component's own shape; this file
// pins its APPLICATION. Runtime node-identity — that the region element is never remounted — is
// proven separately in a real browser and cannot be checked here (no jsdom, and vitest.config.ts
// is off-limits).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCAN_DIRS = [path.join(REPO_ROOT, 'app'), path.join(REPO_ROOT, 'components')]

/** Remove block and line comments so prose mentions of the old pattern are not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function tsxFilesUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...tsxFilesUnder(full))
    else if (entry.isFile() && entry.name.endsWith('.tsx')) found.push(full)
  }
  return found
}

const FILES = SCAN_DIRS.flatMap(tsxFilesUnder).map((file) => ({
  path: path.relative(REPO_ROOT, file),
  source: stripComments(fs.readFileSync(file, 'utf8')),
}))

// The ten files that render a status message. All five success announcements land in files already
// on this list, so it is also the complete set of LiveStatus consumers.
const EXPECTED_CONSUMERS = [
  'components/answer-form.tsx',
  path.join('app', 'sign-in', 'page.tsx'),
  path.join('app', 'get-started', 'form.tsx'),
  path.join('app', 'app', '[churchId]', 'invite-panel.tsx'),
  path.join('app', 'app', '[churchId]', 'generate-button.tsx'),
  path.join('app', 'app', '[churchId]', 'access', 'invite-member-form.tsx'),
  path.join('app', 'app', '[churchId]', 'access', 'remove-member-button.tsx'),
  path.join('app', 'app', '[churchId]', 'access', 'revoke-invite-button.tsx'),
  path.join('app', 'accept', '[token]', 'accept-button.tsx'),
  path.join('app', 'app', '[churchId]', 'diagnosis', 'share-control.tsx'),
]

describe('live-region application', () => {
  it('finds enough files that the scan cannot pass vacuously', () => {
    expect(
      FILES.length,
      `expected at least 25 .tsx files under app/ and components/, found ${FILES.length} — the ` +
        'scan is probably not reaching the source tree, which would make every "zero occurrences" ' +
        'assertion below pass trivially',
    ).toBeGreaterThanOrEqual(25)
  })

  it('has no conditionally mounted status paragraphs left', () => {
    const offenders = FILES.filter((f) => /error\s*&&\s*<p/.test(f.source)).map((f) => f.path)
    expect(
      offenders,
      `conditionally mounted error paragraph in: ${offenders.join(', ')}. A live region inserted ` +
        'at the same moment as its first message is silently missed by screen readers. Use ' +
        '<LiveStatus tone="error" message={…} className="…" /> instead.',
    ).toEqual([])
  })

  it('routes every status message through LiveStatus', () => {
    const renderers = FILES.filter((f) => f.source.includes('<LiveStatus')).map((f) => f.path)
    const missing = EXPECTED_CONSUMERS.filter((c) => !renderers.includes(c))
    expect(
      missing,
      `expected these files to render <LiveStatus>: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('imports LiveStatus wherever it is rendered', () => {
    const missingImport = FILES.filter(
      (f) => f.source.includes('<LiveStatus') && !f.source.includes("from '@/components/live-status'"),
    ).map((f) => f.path)
    expect(missingImport, `renders <LiveStatus> without importing it: ${missingImport.join(', ')}`).toEqual([])
  })

  it('keeps the two focus-move sites focusable', () => {
    const answerForm = FILES.find((f) => f.path === 'components/answer-form.tsx')!
    expect(
      answerForm.source,
      'answer-form must render its confirmation as a focusable <h1> — the form it replaces owns ' +
        'the page’s only <h1>, and the submit button unmounts with it',
    ).toMatch(/<h1 tabIndex=\{-1\}/)

    const signIn = FILES.find((f) => f.path === path.join('app', 'sign-in', 'page.tsx'))!
    expect(signIn.source, 'sign-in must keep a ref on the sent confirmation').toContain('ref={sentRef}')
  })
})
```

- [ ] **Step 3: Run the test**

Run: `npm run test -- tests/a11y/live-regions-applied.test.ts`

Expected: PASS, 5 tests. If "routes every status message through LiveStatus" fails, a swap from Tasks 2–7 was missed — fix that file in its own task, not here.

- [ ] **Step 4: Run the full suite and confirm the floor**

Run: `npm run test`

Expected: **at least 180 tests across 43 files** — the M6c floor of 170/41 plus Task 1's 5 tests and this task's 5 tests, in two new files.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/a11y/live-regions-applied.test.ts
git commit -m "test(a11y): pin live-region application across app and components"
```

---

### Task 9: Tier-1 browser proof and final gates

**Files:**
- No source changes. If the probe route fallback is used, it is created and then **deleted** — nothing from this task is committed except, optionally, a note in the spec.

**Interfaces:**
- Consumes: everything above.
- Produces: the evidence that the conformance claim rests on.

**Why this task cannot be skipped.** Tasks 1 and 8 prove the region is written correctly and applied everywhere. Neither can see the one property the entire design rests on: **that the region node is permanently mounted and only its text mutates.** A source grep cannot observe a remount. This is the same trap as the M6c dangling-skip-link regression, where the server response was a streaming shell and only the hydrated DOM told the truth.

**Steps 1 and 2 below would also pass on the broken `{error && <p aria-live>}` version. Step 3 — node identity — is the assertion that distinguishes this design from that one.** Do not report success without it.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Expected: ready on `http://localhost:3000`.

- [ ] **Step 2: Open the sign-in page and capture the region node BEFORE any error**

Navigate to `http://localhost:3000/sign-in`, then evaluate in the page:

```js
window.__probe = document.querySelector('[role="alert"]')
window.__probe === null ? 'FAIL: no region before error' : `OK: region present, text=${JSON.stringify(window.__probe.textContent)}`
```

Expected: `OK: region present, text=""` — the region exists **before** anything went wrong, which is the whole point. If this returns `FAIL`, the component is being conditionally mounted and the design is broken.

- [ ] **Step 3: Trigger an error, then assert node identity**

Submit the form with an address that Supabase will reject, then evaluate:

```js
const now = document.querySelector('[role="alert"]')
JSON.stringify({
  sameNode: now === window.__probe,
  text: now && now.textContent,
  role: now && now.getAttribute('role'),
})
```

Expected: `{"sameNode":true,"text":"<some error message>","role":"alert"}`.

**`sameNode` must be `true`.** If it is `false`, React replaced the element rather than mutating its text, and screen readers will miss the announcement — stop and report it rather than proceeding.

- [ ] **Step 4: If sign-in cannot produce an error without seeded data, use a throwaway probe route**

The mechanism is the thing under test, not the route. Create `app/__probe/page.tsx` — **uncommitted, deleted after use**:

```tsx
'use client'

import { useState } from 'react'
import { LiveStatus } from '@/components/live-status'

export default function Probe() {
  const [error, setError] = useState<string | null>(null)
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-col gap-2 p-8">
      <button type="button" onClick={() => setError('Probe error message.')}>
        Trigger
      </button>
      <LiveStatus tone="error" message={error} className="font-body text-sm text-berry" />
    </main>
  )
}
```

Visit `http://localhost:3000/__probe` and repeat Steps 2 and 3 against it, clicking Trigger in place of submitting the form.

Then delete it and confirm the tree is clean:

```bash
rm -rf app/__probe && git status --short
```

Expected: no output from `git status --short` beyond whatever is legitimately staged.

- [ ] **Step 5: Verify the flex-gap decision held**

While the dev server is up, on any page with a `LiveStatus` in its empty state, evaluate:

```js
const p = document.querySelector('[role="alert"]')
JSON.stringify({ className: p.className, position: getComputedStyle(p).position })
```

Expected: `{"className":"sr-only","position":"absolute"}`. Absolutely-positioned children are not flex items, which is what stops the empty region adding a phantom gap row.

- [ ] **Step 6: Run every gate**

Run:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: typecheck 0 · lint 0 · **at least 180 tests / 43 files** · build exit code 0.

⛔ Do **not** run `npm run test:db`.

- [ ] **Step 7: Hand the VoiceOver pass to Natalie**

Neither tier proves a human actually hears the announcement. Ask Natalie to run **one VoiceOver pass**: the `answer-form` success case and one error case. This is not something an agent can do.

**If she declines, state plainly in the final report that the SC 4.1.3 conformance claim rests on mechanism-plus-application evidence, not on observed announcement.** Decision 2 was explicitly about not overstating the conformance claim — write the limitation down rather than skipping it.

- [ ] **Step 8: Report, and stop**

Report: the tier-1 `sameNode` result verbatim, the four gate results verbatim, and the VoiceOver status.

**Do not push. Do not open a PR. Do not merge.** Natalie's explicit go-ahead only.

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| §3 `LiveStatus` component | Task 1 |
| §4 ten error swaps | Tasks 2 (five), 3, 4, 5 (two), 7 |
| §5.1 `answer-form` focus-move | Task 3 |
| §5.2 `sign-in` focus-move | Task 4 |
| §5.3 invite link announcements | Task 5 |
| §5.4 + §6 `actions.ts` discriminator | Tasks 6, 7 |
| §7 file count of 12 | all ten error files + `live-status.tsx` + `actions.ts` = 12 ✓ |
| §8 tier 1 node identity | Task 9 steps 2–4 |
| §8 tier 2 static scan | Task 8 |
| §8 VoiceOver gap | Task 9 step 7 |
| §8 gates | Task 9 step 6 |

All ten §4 classNames are reproduced verbatim in the tasks, including the two `text-xs` sites and `share-control`'s `text-ink`.

**Type consistency:** `LiveStatus` takes `{ message, tone, className }` in Task 1 and is called with exactly those three props in Tasks 2, 3, 4, 5, 7 and in the Task 9 probe. `ShareResult.status` is declared `'idle' | 'created' | 'revoked'` in Task 6 and read as `minted.status === 'created'` / `revoked.status === 'revoked'` in Task 7; `EMPTY` is updated in the same task that reads it.

**File disjointness:** no file appears in two tasks. The two test files exist separately so Tasks 1 and 8 do not collide.

**Known non-clean intermediate state:** the tree does not typecheck between Task 6's commit and Task 7's, because the required field lands before its consumer is updated. This is called out in Task 6 step 5 and is the intended consequence of making `status` required.
