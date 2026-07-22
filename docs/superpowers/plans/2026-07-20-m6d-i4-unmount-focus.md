# M6d I-4 — Focus survives the unmount: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four controls that remove themselves from the document when their own action succeeds must hand keyboard focus somewhere useful instead of dropping it to `<body>`.

**Architecture:** Two shapes. List rows have no successor control, so the unmounting button focuses its list's `<h2>` from its own effect cleanup, resolving the target through a `headingId` string prop (a string crosses the RSC boundary, so both lists stay server components). `share-control` has a successor at the same position, so one ref is attached to both branches' buttons and an armed guard focuses it after the swap commits. Both mechanisms arm only while the control's own action is pending, and disarm when that action settles with an error.

**Tech Stack:** Next.js App Router (RSC + server actions), React `useActionState`, TypeScript, Tailwind, vitest (node environment, source-reading tests only).

**Approved spec:** `docs/superpowers/specs/2026-07-20-m6d-i4-unmount-focus-design.md` @ `0cd10c5`. The spec is authoritative; where this plan and the spec disagree, stop and ask.

## Global Constraints

- ⛔ **NEVER run `npm run test:db`.**
- ⛔ **Git is banned in implementers** — not even read-only `status` / `log` / `diff`. The controller commits every task by explicit path. Do not run any git command.
- ⛔ **No jsdom, no `@testing-library`, no Playwright.** vitest is node-environment and only picks up `tests/**/*.test.ts`. Source-reading tests plus a controller-run browser proof are the agreed substitute. Do not propose adding a DOM test runner.
- Do **not** touch `next.config.ts` or `vitest.config.ts`.
- **Raw U+2019 (`’`) across `app/` + `components/` must stay at exactly 15.** Use the ASCII apostrophe `'` in every comment and string you add to those trees. (`tests/` is not counted.)
- Locate every edit by **exact string match, never by line number**. Verify by running.
- `app/probe-i4/` is an untracked measurement probe. **Never edit, stage, or commit it.** It is not part of any task below except Task 4, which the controller runs.
- Migrations are append-only. `.superpowers/` stays untracked.

## ⚠️ Shared-tree gate hazard — read before running any gate

Tasks 1 and 2 may run in parallel against **one working tree**. Gates are tree-wide, so a gate error can come from a file you never touched.

- **Attribute every gate error by file.** Your task is done when *your* files contribute zero errors. Do not "fix" an error in a file outside your task's **Files** list — report it instead.
- **Never treat your own green run as a clean-tree signal.** The controller runs the authoritative whole-tree gates.

### ⚠️ `npm run test` has ONE known pre-existing failure right now

Measured this session. `app/probe-i4/` lives under `app/`, so the existing census in `tests/a11y/pending-controls.test.ts` scans it and counts its 6 `aria-disabled={` bindings:

```
FAIL tests/a11y/pending-controls.test.ts > pending controls > covers all ten known pending controls
  expected 16 to be 10
Test Files  1 failed | 44 passed (45)
      Tests  1 failed | 192 passed (193)
```

Attribution, measured: `app/probe-i4/row-buttons.tsx` 4 + `app/probe-i4/share-probe.tsx` 2 = **6 probe bindings**; real code contributes exactly **10**, its floor. **This failure is expected, is not yours, and must not be "fixed".** Do not edit `pending-controls.test.ts` and do not touch the probe. Task 4 deletes the probe and re-runs the authoritative gates.

**While the probe exists, a task is green when `npm run test` shows `1 failed | N passed` with that single failure and nothing else.**

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/app/[churchId]/access/members-list.tsx` | owns the Members heading id; passes it to its button | 1 |
| `app/app/[churchId]/access/pending-invites-list.tsx` | owns the Pending-invitations heading id on **both** branches; passes it to its button | 1 |
| `app/app/[churchId]/access/remove-member-button.tsx` | arms on its own pending, disarms on error, focuses the heading on unmount | 1 |
| `app/app/[churchId]/access/revoke-invite-button.tsx` | same, for invitations | 1 |
| `app/app/[churchId]/diagnosis/share-control.tsx` | holds one ref across both branches; focuses the successor after the swap | 2 |
| `tests/a11y/unmount-focus.test.ts` | source-reading census pinning all of the above | 3 |

**Why Tasks 1 groups four files rather than splitting headings from buttons.** The buttons take a **required** `headingId` prop, and the only callers are the two lists. Splitting them leaves the tree failing typecheck between two commits — either a required prop no caller passes, or a prop passed to a component that does not declare it. A reviewer cannot meaningfully approve one half without the other, so they are one task. (The session-121 handoff sketched a T1/T2 split; this is a deliberate correction, made because the split does not produce an independently green tree.)

Task 1 and Task 2 share no files and may be dispatched in parallel. Task 3 depends on both. Task 4 is controller-only.

---

## Task 1: Row focus recovery (both lists + both buttons)

**Files:**
- Modify: `app/app/[churchId]/access/members-list.tsx`
- Modify: `app/app/[churchId]/access/pending-invites-list.tsx`
- Modify: `app/app/[churchId]/access/remove-member-button.tsx`
- Modify: `app/app/[churchId]/access/revoke-invite-button.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `RemoveMemberButton({ churchId: string; userId: string; headingId: string })`
  - `RevokeInviteButton({ churchId: string; inviteId: string; headingId: string })`
  - Module-local const `MEMBERS_HEADING_ID = 'access-members-heading'` in `members-list.tsx`
  - Module-local const `PENDING_HEADING_ID = 'access-pending-invites-heading'` in `pending-invites-list.tsx`
  - Task 3 asserts on all four of these.

### ⚠️ Trap specific to this task

`pending-invites-list.tsx` contains the heading markup **twice** — once in the `invites.length === 0` early-return branch and once in the populated branch. The two lines differ **only by indentation** (8 spaces vs 6). A first-occurrence replace will silently hit the wrong one and leave the other unchanged; that is exactly the D-1 defect this task exists to prevent. Match each with its full leading indentation, and after editing, confirm **both** were changed.

- [ ] **Step 1: Add the heading id constant to `members-list.tsx`**

Replace this exact string:

```tsx
import { RemoveMemberButton } from './remove-member-button'
```

with:

```tsx
import { RemoveMemberButton } from './remove-member-button'

// The focus target when a row unmounts. RemoveMemberButton focuses this heading from its own effect
// cleanup, because removing a row leaves no control at that position to receive focus. See
// docs/superpowers/specs/2026-07-20-m6d-i4-unmount-focus-design.md section 4.
const MEMBERS_HEADING_ID = 'access-members-heading'
```

- [ ] **Step 2: Make the Members heading a focus target**

Replace this exact string (note the 6-space indent):

```tsx
      <h2 className="font-display text-lg text-ink">Members</h2>
```

with:

```tsx
      <h2 id={MEMBERS_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Members</h2>
```

Both attributes are required. Without `tabIndex={-1}` an `<h2>` is not focusable and `.focus()` is a silent no-op; without the `id` the button cannot resolve it.

- [ ] **Step 3: Pass the id to the button**

Replace this exact string:

```tsx
                <RemoveMemberButton churchId={churchId} userId={m.user_id} />
```

with:

```tsx
                <RemoveMemberButton churchId={churchId} userId={m.user_id} headingId={MEMBERS_HEADING_ID} />
```

- [ ] **Step 4: Add the heading id constant to `pending-invites-list.tsx`**

Replace this exact string:

```tsx
import { acceptLink } from '@/lib/access/accept-state'
```

with:

```tsx
import { acceptLink } from '@/lib/access/accept-state'

// The focus target when a row unmounts. BOTH branches below carry this id deliberately: revoking the
// LAST pending invite swaps the populated section for the empty-state one, so if only the populated
// heading had it, document.getElementById would return null at exactly that moment, the optional
// chain would swallow it, and focus would stay on <body>. That is the single most common revoke
// there is. See the spec section 6.1.
const PENDING_HEADING_ID = 'access-pending-invites-heading'
```

- [ ] **Step 5: Make the EMPTY-state heading a focus target**

Replace this exact string — **8 leading spaces**, inside the `invites.length === 0` early return:

```tsx
        <h2 className="font-display text-lg text-ink">Pending invitations</h2>
```

with:

```tsx
        <h2 id={PENDING_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Pending invitations</h2>
```

- [ ] **Step 6: Make the POPULATED heading a focus target**

⚠️ **The 6-space heading line is NOT unique on its own.** It occurs **twice** in this file as a
substring, because the 8-space empty-state line from Step 5 contains it. Verified by counting this
session: the bare 6-space string matches 2 occurrences, the string below matches 1. Matching on the
bare line is ambiguous and will either fail or hit the wrong branch — which is the D-1 defect this
task exists to prevent, reappearing inside its own fix.

**Include the preceding `<section>` line**, which differs between the two branches. Replace this
exact two-line string:

```tsx
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 className="font-display text-lg text-ink">Pending invitations</h2>
```

with:

```tsx
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-4">
      <h2 id={PENDING_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Pending invitations</h2>
```

(Step 5's 8-space string **is** unique on its own and needs no such disambiguation.)

- [ ] **Step 7: Verify both headings changed**

Run:

```bash
grep -c 'id={PENDING_HEADING_ID} tabIndex={-1}' "app/app/[churchId]/access/pending-invites-list.tsx"
```

Expected output: `2`

If it prints `1`, one of Steps 5/6 hit the wrong occurrence. Fix before continuing — this is the D-1 defect.

- [ ] **Step 8: Pass the id to the invite button**

Replace this exact string:

```tsx
              <RevokeInviteButton churchId={churchId} inviteId={inv.id} />
```

with:

```tsx
              <RevokeInviteButton churchId={churchId} inviteId={inv.id} headingId={PENDING_HEADING_ID} />
```

- [ ] **Step 9: Confirm the tree now fails typecheck, for the right reason**

Run: `npm run typecheck`

Expected: **FAIL**, with errors on `members-list.tsx` and `pending-invites-list.tsx` saying `headingId` does not exist on the button props. This is the half-applied state; Steps 10–11 close it. If it *passes*, Steps 3 or 8 did not apply — go back.

- [ ] **Step 10: Rewrite `remove-member-button.tsx`**

Replace the entire file contents with:

```tsx
'use client'

import { useActionState, useEffect, useRef } from 'react'
import { removeMember, type ManageResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: ManageResult = { error: null }

export function RemoveMemberButton({
  churchId,
  userId,
  headingId,
}: {
  churchId: string
  userId: string
  headingId: string
}) {
  const [state, formAction, pending] = useActionState(removeMember, initial)
  const submitted = useRef(false)

  // Arm while this control's own action is in flight, so an unrelated unmount never moves focus.
  // DISARM when the action settles with an error: removeMember returns { error } WITHOUT calling
  // revalidatePath on either of its failure paths, so the row stays mounted with the flag set, and a
  // later unmount -- most obviously navigating away from the page -- would run the cleanup below and
  // yank focus mid route transition. `pending` is a dependency as well as `state.error` so that a
  // retry returning the SAME error text still disarms: pending transitions true -> false either way.
  useEffect(() => {
    if (pending) submitted.current = true
    else if (state.error) submitted.current = false
  }, [pending, state.error])

  // Recover focus on unmount, but only if this control caused it. Removing a row leaves no control at
  // that position, so the target is the list's own heading. getElementById rather than a ref: a ref
  // cannot cross the server -> client boundary, and threading one would force members-list.tsx to
  // become a client component -- measured as byte-identical in trajectory, for that whole cost.
  useEffect(() => () => {
    if (submitted.current) document.getElementById(headingId)?.focus()
  }, [headingId])

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Removing…' : 'Remove'}
      </button>
      <LiveStatus message={state.error} tone="error" className="font-body text-xs text-berry" />
    </form>
  )
}
```

The `<form>`, `<button>` and `<LiveStatus>` markup is **unchanged** from the current file, including the I-3 `aria-disabled` + guard pair. Do not restyle it. The `…` in `'Removing…'` is U+2026 and was already there; keep it.

- [ ] **Step 11: Rewrite `revoke-invite-button.tsx`**

Replace the entire file contents with:

```tsx
'use client'

import { useActionState, useEffect, useRef } from 'react'
import { revokeInvitation, type ManageResult } from './actions'
import { LiveStatus } from '@/components/live-status'

const initial: ManageResult = { error: null }

export function RevokeInviteButton({
  churchId,
  inviteId,
  headingId,
}: {
  churchId: string
  inviteId: string
  headingId: string
}) {
  const [state, formAction, pending] = useActionState(revokeInvitation, initial)
  const submitted = useRef(false)

  // Arm while this control's own action is in flight, so an unrelated unmount never moves focus.
  // DISARM when the action settles with an error: revokeInvitation returns { error } WITHOUT calling
  // revalidatePath on either of its failure paths, so the row stays mounted with the flag set, and a
  // later unmount -- most obviously navigating away from the page -- would run the cleanup below and
  // yank focus mid route transition. `pending` is a dependency as well as `state.error` so that a
  // retry returning the SAME error text still disarms: pending transitions true -> false either way.
  useEffect(() => {
    if (pending) submitted.current = true
    else if (state.error) submitted.current = false
  }, [pending, state.error])

  // Recover focus on unmount, but only if this control caused it. Revoking a row leaves no control at
  // that position, so the target is the list's own heading. getElementById rather than a ref: a ref
  // cannot cross the server -> client boundary, and threading one would force
  // pending-invites-list.tsx to become a client component, for a measured-identical result.
  useEffect(() => () => {
    if (submitted.current) document.getElementById(headingId)?.focus()
  }, [headingId])

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="church_id" value={churchId} />
      <input type="hidden" name="invite_id" value={inviteId} />
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      <LiveStatus message={state.error} tone="error" className="font-body text-xs text-berry" />
    </form>
  )
}
```

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck`

Expected: exit 0, no output. If any error names a file outside this task's **Files** list, report it — do not fix it.

- [ ] **Step 13: Lint**

Run: `npm run lint`

Expected: **zero problems reported** for your four files. The two hook shapes above were measured clean against this repo's config this session — `react-hooks/exhaustive-deps` does not object to them. If it does object, stop and report rather than reshaping the hooks.

- [ ] **Step 14: Tests**

Run: `npm run test`

Expected: `Test Files  1 failed | 44 passed (45)` / `Tests  1 failed | 192 passed (193)`, the single failure being `pending-controls.test.ts > covers all ten known pending controls` (`expected 16 to be 10`). That failure is the untracked probe and is not yours — see the hazard note above. **Any other failure is yours.**

- [ ] **Step 15: Verify the U+2019 budget is untouched**

Run:

```bash
grep -rc $'’' app components | grep -v ':0' | awk -F: '{s+=$2} END {print s}'
```

Expected output: `15`

If it is higher, a comment you added used a curly apostrophe. Replace it with ASCII `'`.

- [ ] **Step 16: Report — do NOT commit**

Git is banned in implementers. Report the four modified paths and the outputs of Steps 12–15. The controller commits.

---

## Task 2: Share-control successor focus

**Files:**
- Modify: `app/app/[churchId]/diagnosis/share-control.tsx`

**Interfaces:**
- Consumes: nothing from other tasks. Shares no file with Task 1.
- Produces: module-local `successorRef` and `acted` refs, and `ref={successorRef}` on **both** buttons. Task 3 counts those.

**Context.** The component instance survives the swap, but the button does not: the shared branch is a Fragment (`<p>`, `<code>`, `<form>`) while the unshared branch is a bare `<form>`, so React sees different element types at that position and does a full unmount/remount. Making the branches structurally alike would remove the need for focus code entirely, and was **considered and rejected** in spec section 7.4. Do not restructure the branches.

- [ ] **Step 1: Extend the React import**

Replace this exact string:

```tsx
import { useActionState } from 'react'
```

with:

```tsx
import { useActionState, useEffect, useRef } from 'react'
```

- [ ] **Step 2: Add the ref and the two effects**

Replace this exact string (the closing of the `announcement` computation plus the blank line and `return (`):

```tsx
      : null

  return (
```

with:

```tsx
      : null

  // Focus recovery for the branch swap. Minting and revoking each unmount the button the user just
  // activated and mount a different one at the same position. The two branches are structurally
  // unlike -- a Fragment vs a bare form -- so React cannot reconcile the button in place, and focus
  // falls to <body>. Measured failing at the status quo. See the spec section 5.
  const successorRef = useRef<HTMLButtonElement | null>(null)
  const acted = useRef(false)
  const busy = minting || revoking

  // Arm only while this component's own action is pending, so the successor does not steal focus on
  // first paint or on an unrelated revalidation of the same path. DISARM on an error settle: on that
  // path `existingLink` does not change, so the consume effect below never runs and the flag would
  // otherwise stay armed indefinitely -- a later unrelated change to existingLink, from another admin
  // or another tab, would then move focus here while the user is somewhere else entirely.
  useEffect(() => {
    if (busy) acted.current = true
    else if (error) acted.current = false
  }, [busy, error])

  // Consume. By the time this runs the swap has committed and React has attached the ref to the
  // successor button. On mount `acted` is false, so this is inert on first paint with no explicit
  // first-mount guard -- the same solved-by-construction shape as `announcement` above.
  useEffect(() => {
    if (!acted.current) return
    acted.current = false
    successorRef.current?.focus()
  }, [link])

  return (
```

- [ ] **Step 3: Attach the ref to the Revoke button**

Replace this exact string (12-space indent, `revoking`):

```tsx
            <button
              type="submit"
              aria-disabled={revoking}
```

with:

```tsx
            <button
              ref={successorRef}
              type="submit"
              aria-disabled={revoking}
```

- [ ] **Step 4: Attach the ref to the Create button**

Replace this exact string (10-space indent, `minting`):

```tsx
          <button
            type="submit"
            aria-disabled={minting}
```

with:

```tsx
          <button
            ref={successorRef}
            type="submit"
            aria-disabled={minting}
```

- [ ] **Step 5: Verify both buttons carry the ref**

Run:

```bash
grep -c 'ref={successorRef}' "app/app/[churchId]/diagnosis/share-control.tsx"
```

Expected output: `2`

`1` means one of Steps 3/4 did not apply — the branch that kept its plain `<button>` will still lose focus, and only half the defect is fixed.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: exit 0, no output. Errors naming files outside this task belong to Task 1 running in parallel — report, do not fix.

- [ ] **Step 7: Lint**

Run: `npm run lint`

Expected: **zero problems** for `share-control.tsx`. The `[link]` dependency is intentionally not read inside the consume effect's body; that shape was measured clean against this repo's eslint config this session, and the `exhaustive-deps` rule was separately confirmed live by making it fire on a missing dependency. If it does report here, stop and report rather than reshaping.

- [ ] **Step 8: Tests**

Run: `npm run test`

Expected: the single known probe failure only — `1 failed | 192 passed (193)`. Any other failure is yours.

- [ ] **Step 9: Verify the U+2019 budget**

Run:

```bash
grep -rc $'’' app components | grep -v ':0' | awk -F: '{s+=$2} END {print s}'
```

Expected output: `15`

- [ ] **Step 10: Report — do NOT commit**

Report the modified path and the outputs of Steps 5–9. The controller commits.

---

## Task 3: Source-reading census

**Files:**
- Create: `tests/a11y/unmount-focus.test.ts`

**Interfaces:**
- Consumes: everything Tasks 1 and 2 produced — `MEMBERS_HEADING_ID`, `PENDING_HEADING_ID`, the `headingId` prop on both buttons, `successorRef` in `share-control.tsx`.
- Produces: nothing consumed downstream.

**Why counting and not presence.** `pending-invites-list.tsx` renders **two** `<h2>` elements, one per branch. A presence check stays green when only one carries the id — which is precisely the D-1 defect. The I-3 census had this exact gap and was defeated by it three times; read the header of `tests/a11y/pending-controls.test.ts` for that history.

- [ ] **Step 1: Write the failing test**

Create `tests/a11y/unmount-focus.test.ts` with exactly:

```ts
// Pins the focus recovery for controls that UNMOUNT when their own action succeeds (M6d I-4).
// SOURCE-READING test (node env, no DOM): it asserts on file text, not rendered output. jsdom,
// @testing-library and Playwright are unavailable in this repo by standing decision; source reading
// plus a controller-run browser proof is the agreed substitute.
//
// The defect, measured in a real visible focused Chrome before any of this was written:
//
//   remove-member, status quo   focusout BUTTON -> relatedTarget=null · ROW REMOVED -> settles BODY
//   remove-member, shipped      focusout -> null · ROW REMOVED · focusin -> H2
//   share-control, status quo   focusout BUTTON -> null · DETACHED    -> settles BODY
//   share-control, shipped      focusout -> null · DETACHED · focusin -> successor button
//
// COUNTING, not presence. pending-invites-list.tsx renders TWO <h2> elements -- one in the populated
// branch, one in the invites.length === 0 early return -- and revoking the LAST invite swaps between
// them. A presence check stays green when only one carries the id, and in that state
// document.getElementById returns null at exactly the moment focus needs to move, the optional chain
// swallows it, and focus stays on <body>. The I-3 census was defeated three times by variations of
// this same gap; see the header of pending-controls.test.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Remove block and line comments so prose describing these attributes is not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function read(rel: string): string {
  return stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))
}

const countOf = (source: string, re: RegExp) => (source.match(new RegExp(re, 'g')) ?? []).length

// file -> how many <h2> elements it renders. The count is asserted first, so that adding a branch
// forces whoever adds it to come here and think about D-1 rather than silently re-breaking it.
const LISTS: Record<string, number> = {
  'app/app/[churchId]/access/members-list.tsx': 1,
  'app/app/[churchId]/access/pending-invites-list.tsx': 2,
}

const ROW_BUTTONS = [
  'app/app/[churchId]/access/remove-member-button.tsx',
  'app/app/[churchId]/access/revoke-invite-button.tsx',
]

const SHARE_CONTROL = 'app/app/[churchId]/diagnosis/share-control.tsx'

describe('unmount focus', () => {
  it('renders the number of list headings this test was written against', () => {
    for (const [file, expected] of Object.entries(LISTS)) {
      const found = countOf(read(file), /<h2\b/)
      expect(
        found,
        `${file} renders ${found} <h2> elements, this test expects ${expected}. If a branch was ` +
          'added, its heading needs the SAME id and tabIndex={-1} as the others, or focus recovery ' +
          'silently no-ops whenever that branch is the one that mounts. Update this number only ' +
          'after checking that.',
      ).toBe(expected)
    }
  })

  it('makes every list heading a focusable focus target', () => {
    const offenders: string[] = []
    for (const file of Object.keys(LISTS)) {
      const tags = read(file).match(/<h2\b[^>]*>/g) ?? []
      tags.forEach((tag, i) => {
        const missing: string[] = []
        if (!tag.includes('id={')) missing.push('id={...}')
        if (!tag.includes('tabIndex={-1}')) missing.push('tabIndex={-1}')
        if (missing.length > 0) {
          offenders.push(`${file} <h2> #${i + 1} is missing ${missing.join(' and ')}`)
        }
      })
    }
    expect(
      offenders,
      `${offenders.join('; ')}. Both attributes are load-bearing: without tabIndex={-1} an <h2> is ` +
        'not focusable and .focus() is a silent no-op, and without the id the unmounting button ' +
        'cannot resolve it. Checked per element rather than per file on purpose.',
    ).toEqual([])
  })

  it('points every heading in a list, and its button, at one identifier', () => {
    for (const file of Object.keys(LISTS)) {
      const source = read(file)
      const ids = (source.match(/<h2\b[^>]*\sid=\{(\w+)\}/g) ?? []).map(
        (tag) => /id=\{(\w+)\}/.exec(tag)![1],
      )
      expect(
        new Set(ids).size,
        `${file} uses ${new Set(ids).size} distinct heading identifiers (${ids.join(', ')}). Every ` +
          'branch must point at the SAME one, or a branch swap moves the target out from under ' +
          'document.getElementById.',
      ).toBe(1)
      expect(
        source,
        `${file} never passes ${ids[0]} to its row button, so the button cannot resolve the heading.`,
      ).toContain(`headingId={${ids[0]}}`)
    }
  })

  it('recovers focus from the unmounting row button itself', () => {
    for (const file of ROW_BUTTONS) {
      const source = read(file)
      expect(
        source,
        `${file} does not take a headingId prop. The target is resolved by id because a ref cannot ` +
          'cross the server -> client boundary; threading one would force the parent list to become ' +
          'a client component for a measured-identical result.',
      ).toMatch(/headingId:\s*string/)
      expect(
        source,
        `${file} does not focus the heading from an unmount cleanup, so removing the row drops focus ` +
          'to <body>.',
      ).toMatch(/document\.getElementById\(headingId\)\?\.focus\(\)/)
      expect(
        source,
        `${file} arms its flag but never disarms it. The action returns { error } WITHOUT ` +
          'revalidatePath, so on failure the row stays mounted with the flag set and a later ' +
          'unrelated unmount steals focus. Needs an else-if branch clearing it on an error settle.',
      ).toMatch(/else if \(state\.error\) \w+\.current = false/)
    }
  })

  it('hands focus to the successor button at share-control', () => {
    const source = read(SHARE_CONTROL)
    const buttons = countOf(source, /<button\b/)
    const refs = countOf(source, /ref=\{successorRef\}/)
    expect(
      buttons,
      `share-control.tsx renders ${buttons} buttons, this test expects 2 (one per branch).`,
    ).toBe(2)
    expect(
      refs,
      `share-control.tsx attaches successorRef to ${refs} of its ${buttons} buttons. Counting ` +
        'rather than checking presence is deliberate: with the ref on only one branch, that ' +
        'direction of the swap still drops focus to <body> and a presence check stays green.',
    ).toBe(buttons)
    expect(
      source,
      'share-control.tsx arms `acted` but never disarms it on an error settle. On that path ' +
        'existingLink does not change, the consume effect never runs, and the flag stays armed -- so ' +
        'a later unrelated revalidation moves focus to the share button while the user is elsewhere.',
    ).toMatch(/else if \(error\) \w+\.current = false/)
  })
})
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `npm run test -- tests/a11y/unmount-focus.test.ts`

Expected: `5 passed`. If anything fails, Tasks 1 or 2 are incomplete — report which assertion failed rather than weakening it.

- [ ] **Step 3: Prove assertion 2 is not vacuous**

Temporarily delete ` tabIndex={-1}` from the **empty-state** `<h2>` in `app/app/[churchId]/access/pending-invites-list.tsx` (the 8-space-indented one).

Run: `npm run test -- tests/a11y/unmount-focus.test.ts`

Expected: **FAIL** with `pending-invites-list.tsx <h2> #1 is missing tabIndex={-1}`.

Then restore the attribute exactly and re-run — expected `5 passed`.

- [ ] **Step 4: Prove assertion 5 is not vacuous**

Temporarily delete the line `              ref={successorRef}` from the **Revoke** button in `app/app/[churchId]/diagnosis/share-control.tsx`.

Run: `npm run test -- tests/a11y/unmount-focus.test.ts`

Expected: **FAIL** with `attaches successorRef to 1 of its 2 buttons`.

Then restore the line exactly and re-run — expected `5 passed`.

- [ ] **Step 5: Prove the disarm assertions are not vacuous**

Temporarily delete the line `    else if (state.error) submitted.current = false` from `app/app/[churchId]/access/remove-member-button.tsx`.

Run: `npm run test -- tests/a11y/unmount-focus.test.ts`

Expected: **FAIL** with `arms its flag but never disarms it`.

Then restore the line exactly and re-run — expected `5 passed`.

- [ ] **Step 6: Confirm the two files you temporarily edited are byte-identical to before**

Run:

```bash
grep -c 'tabIndex={-1}' "app/app/[churchId]/access/pending-invites-list.tsx"
grep -c 'ref={successorRef}' "app/app/[churchId]/diagnosis/share-control.tsx"
grep -c 'else if (state.error) submitted.current = false' "app/app/[churchId]/access/remove-member-button.tsx"
```

Expected outputs, in order: `2`, `2`, `1`

- [ ] **Step 7: Full gates**

Run: `npm run typecheck`, then `npm run lint`, then `npm run test`

Expected: typecheck exit 0; lint zero problems; test `2 failed`? **No** — expected `1 failed | 197 passed (198)`: the 5 new tests join the suite, and the only failure remains the probe-caused `covers all ten known pending controls`.

- [ ] **Step 8: Report — do NOT commit**

Report the created path, the three non-vacuity proofs with their actual failure messages, and the Step 7 outputs.

---

## Task 4: Measurement, browser proof, probe deletion, authoritative gates

**⚠️ CONTROLLER-ONLY. Do not dispatch this to a subagent.** Crux evidence is measured directly, not taken on a subagent's report.

**Files:**
- Modify (untracked, never committed): `app/probe-i4/*`
- Delete at the end: `app/probe-i4/`, `.next/`

- [ ] **Step 1: Extend the probe for the three unmeasured defects**

The probe currently exercises only happy paths. Add, in `app/probe-i4/`:
- an empty-state branch for the V1 list whose `<h2>` carries a **different** id, so revoking the last row reproduces D-1;
- an error return in `probeRemove` and in `probeToggleShare`, reachable by a flag, so D-2 and D-3 can be driven;
- instrumentation logging which commit each of the two effects runs in, for spec section 9.2 row 7.

⛔ Do **not** "simplify" `share-probe.tsx`'s markup — a two-`<form>` replica measures no defect at all. Markup fidelity is the measurement.
⛔ Do **not** click the probe's "Reset rows" button — it throws `Cannot read properties of null (reading 'removeChild')` and kills the React tree, so nothing re-renders while server actions still fire. That reads exactly like "the mechanism did nothing". Reload the page instead.

- [ ] **Step 2: Measure each of D-1, D-2, D-3 FAILING**

Real visible focused Chrome via the chrome-devtools MCP (`new_page` → `evaluate_script`). Drive with `window.__runProbe('<data-probe>')`, then read `window.__result` in a **separate** evaluation.

**Every trajectory must BEGIN with the `focusin → BUTTON` entry.** If it does not, the instrument was measured, not the mechanism, and the run is void.

Record, for each of D-1/D-2/D-3, the broken variant settling in the wrong place. A fix is not believed until its defect has been seen to fail.

- [ ] **Step 3: Measure row 7 — the commit-ordering assumption**

Spec section 9.2 row 7. Determine whether `pending → false` and the row's unmount land in the same React commit. Record the answer either way; the spec states the mechanism should be safe both ways, and that claim is what is being tested.

- [ ] **Step 4: Browser proof of the shipped mechanism, all five cases**

Against the real app, not the probe: remove a member (not the last row); revoke an invite (not the last); **revoke the LAST invite**; mint a share link; revoke a share link. Expected in order: the Members heading; the Pending-invitations heading; the Pending-invitations heading **from the empty-state branch**; the successor Revoke button; the successor Create button.

- [ ] **Step 5: Progressive enhancement unchanged**

Read `form.action` and `form.method` off the DOM at all four sites. Expected `action=""`, `method="post"`. This is the property V2 was rejected to preserve.

- [ ] **Step 6: Delete the probe and the stale build types**

```bash
rm -rf app/probe-i4
rm -rf .next
```

Both are required. A stale `.next/dev/types/validator.ts` references the deleted route and fails typecheck on an otherwise clean tree.

- [ ] **Step 7: Authoritative whole-tree gates**

Run, in order: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and the U+2019 count.

Expected: typecheck 0 · lint 0 problems · **`198 passed (198)`, 0 failed, 46 files** (the probe-caused failure disappears with the probe; 193 + 5 new) · build exit 0 · U+2019 exactly `15`.

⛔ Never run `npm run test:db`.

- [ ] **Step 8: Record the verification outcome in the spec**

Append a "Verification outcome" section to `docs/superpowers/specs/2026-07-20-m6d-i4-unmount-focus-design.md`, matching the shape used by the I-1/I-2/I-3 specs: the measured trajectories, the three defects seen failing, the row 7 answer, the gate figures, and what remains unproven.

- [ ] **Step 9: Natalie's VoiceOver pass (tier 4)**

An agent cannot do this — no audio perception, and enabling VoiceOver is a system-settings change. Build a harness whose markup is verified byte-identical to the shipped markup and give her a short script covering: after removing a member the Members heading is announced; after revoking the last invitation the Pending-invitations heading is announced rather than silence; after minting, the Revoke button is announced.

A real failure mode exists here: a focused `<h2 tabIndex={-1}>` that is reached but announced as nothing means focus recovered while the user still learned nothing — grounds to revisit the target, not merely note it.

---

## Self-Review

**Spec coverage.** §4.1 heading targets → Task 1 Steps 1–8. §4.2 the button → Task 1 Steps 10–11. §5 share-control → Task 2. §6.1 D-1 → Task 1 Steps 4–7 (fix) + Task 4 Step 2 (measured failing). §6.2 D-2 → Task 1 Steps 10–11 + Task 4 Step 2. §6.3 D-3 → Task 2 Step 2 + Task 4 Step 2. §7 rejected alternatives → carried as prohibitions in Task 2's context note and Task 4 Step 1. §8 the I-3 correction → documentation only, no task needed. §9.1 census → Task 3. §9.2 browser proof incl. row 6 and row 7 → Task 4 Steps 2–4. §9.3 progressive enhancement → Task 4 Step 5. §9.4 VoiceOver → Task 4 Step 9. §9.5 instrument traps → Task 4 Steps 1–2. §9.6 gates → Task 4 Step 7. §10 out of scope → no tasks, correctly.

**Placeholder scan.** No TBD/TODO. Every code step carries complete code. No step says "similar to Task N".

**Type consistency.** `headingId: string` is declared identically in both button files and asserted by Task 3 as `/headingId:\s*string/`. `MEMBERS_HEADING_ID` / `PENDING_HEADING_ID` are used in Task 1 and matched generically by Task 3's `id=\{(\w+)\}` capture. `successorRef` is named identically in Task 2 Steps 2–4 and Task 3's `ref=\{successorRef\}` count. `submitted` / `acted` are matched by Task 3 as `\w+\.current = false`, so a rename does not silently defeat the assertion.

**Exact-match strings verified.** Every string this plan tells an implementer to find was counted
against the real files before the plan was committed. **One defect was found and fixed:** Task 1
Step 6's 6-space heading line occurs **twice** — the 8-space empty-state line from Step 5 contains it
as a substring — so the step was ambiguous, on the exact edit that exists to stop D-1 failing
silently in one branch. Step 6 now matches on the preceding `<section>` line, which differs between
branches. All other exact-match strings were confirmed to occur exactly once:
`members-list.tsx` heading and button call, `pending-invites-list.tsx` 8-space heading and button
call, both `share-control.tsx` button heads, and its `: null` / blank / `return (` anchor.

**Two claims measured rather than reasoned, before writing them into steps.**
(1) `react-hooks/exhaustive-deps` does **not** object to the consume effect's unread `[link]`
dependency — both real hook shapes lint clean against this repo's config. That check was then proven
non-vacuous by making the rule fire on a genuinely missing dependency, which also surfaced an active
`react-hooks/set-state-in-effect` **error** rule worth knowing about. (2) `npm run test` currently has
one pre-existing failure caused entirely by the untracked probe (16 vs 10 `aria-disabled` bindings;
6 from `app/probe-i4/`, 10 from real code). Every task's expected test output accounts for it, so no
implementer chases a phantom.

**Known deviation from the session-121 sketch.** That handoff proposed splitting headings (T1) from buttons (T2). This plan merges them, because the split leaves the tree failing typecheck between commits — a required prop with no caller, or a caller passing an undeclared prop. Recorded here so the change is visible rather than silent.
</content>
