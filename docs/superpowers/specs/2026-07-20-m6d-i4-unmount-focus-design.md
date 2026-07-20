# M6d I-4 — Focus survives the unmount

**Status:** design, awaiting approval · **Date:** 2026-07-20 · **Milestone:** M6d, item 4 (last)
**Supersedes:** `2026-07-20-m6d-i3-pending-focus-design.md` §6, in part — see §8.

WCAG 2.2 SC 2.4.3 Focus Order / SC 3.2.2 On Input. I-3 fixed focus being lost when a control
*disables* itself. This fixes the second, independent loss: focus is dropped to `<body>` when a
control **unmounts** because its own action succeeded.

---

## 1. The defect

Four controls remove themselves from the document as the direct result of the user activating them.
React unmounts the focused element, and focus falls to `<body>`. A keyboard user's next Tab restarts
from the top of the document; a screen-reader user loses their place entirely and hears nothing
about what happened.

This was **measured failing**, not inferred, at both shapes (sessions 119 and 120, in a real visible
focused Chrome via the chrome-devtools MCP):

| Probe variant | Site shape | Trajectory | Settles on |
|---|---|---|---|
| **V0** | list row, status quo | `focusout BUTTON → relatedTarget=null` · ROW REMOVED | **BODY** |
| **V4** | share-control, status quo | `focusout BUTTON → relatedTarget=null` · DETACHED | **BODY** |

Every trajectory recorded for this item begins with the `focusin → BUTTON` entry, so the instrument
is verified live rather than dead. A coarse or event-blind instrument reports the *better* of two
results and silently fakes a pass — see §9.5.

---

## 2. Scope — four sites, two shapes

| Site | On success | Successor at that position? | Shape |
|---|---|---|---|
| `app/app/[churchId]/diagnosis/share-control.tsx` (mint) | Create form → Revoke form | yes, the Revoke button | **B** |
| `app/app/[churchId]/diagnosis/share-control.tsx` (revoke) | Revoke form → Create form | yes, the Create button | **B** |
| `app/app/[churchId]/access/remove-member-button.tsx` | its list row is removed by `revalidatePath` | **no** | **A** |
| `app/app/[churchId]/access/revoke-invite-button.tsx` | same | **no** | **A** |

Each button has exactly one consumer, and each list has exactly one consumer
(`app/app/[churchId]/access/page.tsx`). There are no other call sites to keep in step.

`components/answer-form.tsx` already received its focus-move in I-1 and is untouched here.

---

## 3. What the measurement settled (carried in — do not re-derive)

Full trajectories are in the session 119 and 120 records. Four results govern this design:

1. **Shape A: the child's own effect cleanup recovers focus as well as any parent-owned mechanism
   can.** V1 (unmounting button focuses the parent `<h2 id>` from its own cleanup) and V3
   (parent-owned client list, heading ref, effect on props) produced **byte-identical** trajectories.
   A parent effect runs after commit — i.e. after React has already dropped focus — so it recovers
   exactly as late as the child's cleanup does.
2. **The one variant with a perfect handoff costs progressive enhancement.** V2 (client wrapper
   `await`s the action, then focuses) moves focus *before* removal and never touches `<body>` — but
   React then emits `action="javascript:throw new Error('React form unexpectedly submitted.')"` on
   the form, destroying the no-JS POST fallback on two **destructive** controls.
3. **Shape B: a successor ref plus a guard fixes it, and costs nothing.** V5 (`useEffect`) settles on
   the successor button. The native form action stays `action="" method=POST` across V4/V5/V6 — the
   progressive-enhancement trade-off that killed V2 on shape A **does not exist here**.
4. **Neither shipped mechanism removes the transient body flash.** V1 and V5 both show a
   `focusout → relatedTarget=null` before recovering. Accepted, deliberately (§7.1).

⚠️ V6 (`useLayoutEffect`) logged its `focusin → successor` before the detach observer fired and V5
after. **That ordering is not evidence.** The detach log comes from a `MutationObserver`, which is
asynchronous; only the synchronous `focusin`/`focusout` entries order reliably. No claim of earlier
recovery is made for V6, and none should be made from that data.

---

## 4. The change — shape A (list rows)

### 4.1 Heading targets

All **three** `<h2>` elements in the two list files gain a stable `id` and `tabIndex={-1}`.
Attribute-only edits; both files stay server components.

```tsx
// members-list.tsx
const MEMBERS_HEADING_ID = 'access-members-heading'
<h2 id={MEMBERS_HEADING_ID} tabIndex={-1} className="font-display text-lg text-ink">Members</h2>
```

```tsx
// pending-invites-list.tsx
const PENDING_HEADING_ID = 'access-pending-invites-heading'
```

Both are required. Without `tabIndex={-1}` an `<h2>` is not focusable and `.focus()` is a silent
no-op; without the `id` the button cannot resolve it.

**`pending-invites-list.tsx` has TWO `<h2>`s** — the populated branch and the `invites.length === 0`
early-return branch. Both carry the same `PENDING_HEADING_ID` and `tabIndex={-1}`. This is D-1; see
§6.1 for why it is load-bearing rather than defensive.

### 4.2 The button

Each row button takes a `headingId: string` prop and resolves the target by id at cleanup time.

```tsx
export function RemoveMemberButton({
  churchId, userId, headingId,
}: { churchId: string; userId: string; headingId: string }) {
  const [state, formAction, pending] = useActionState(removeMember, initial)
  const submitted = useRef(false)

  // Arm while this control's own action is in flight; DISARM when it settles with an error.
  // `removeMember` returns { error } WITHOUT revalidatePath on failure, so the row stays mounted
  // with the flag set. Without the disarm, a later unrelated unmount — most obviously navigating
  // away from the page — runs the cleanup below and yanks focus mid route transition. (D-2, §6.2)
  useEffect(() => {
    if (pending) submitted.current = true
    else if (state.error) submitted.current = false
  }, [pending, state.error])

  // Recover focus on unmount, but only if this control caused it.
  useEffect(() => () => {
    if (submitted.current) document.getElementById(headingId)?.focus()
  }, [headingId])
```

`revoke-invite-button.tsx` takes the identical change with `revokeInvitation` / `state.error`.

**A string prop, not a ref.** This is *not* the ref-threading Natalie ruled out. Refs cannot cross
the server→client boundary, so V3 additionally required converting both lists to `'use client'`;
a string crosses it fine and **both lists stay server components**. The spec says this plainly
because "no interface change" is the wrong summary — an implementer who believes it will hard-code
the id inside the button and silently couple the two files.

`pending` and `state.error` are both in the dependency array, so the disarm fires even when a retry
returns the *same* error text: `pending` still transitions true → false.

---

## 5. The change — shape B (share-control)

One ref, shared by both branches' buttons, plus an `acted` guard. `useEffect`, not
`useLayoutEffect` (§7.2).

```tsx
const successorRef = useRef<HTMLButtonElement | null>(null)
const acted = useRef(false)
const busy = minting || revoking

// Arm only while this component's own action is pending, so the successor does not steal focus on
// first paint or on an unrelated revalidation of the same path. DISARM on an error settle: on that
// path `existingLink` does not change, the consume effect below never runs, and the flag would
// otherwise stay armed indefinitely. (D-3, §6.3)
useEffect(() => {
  if (busy) acted.current = true
  else if (error) acted.current = false
}, [busy, error])

// Consume: the swap has committed and React has already attached the ref to the successor button.
useEffect(() => {
  if (!acted.current) return
  acted.current = false
  successorRef.current?.focus()
}, [link])
```

Both `<button>` elements carry `ref={successorRef}`. On mount `acted.current` is `false`, so the
consume effect is inert on first paint with no explicit first-mount guard — the same
solved-by-construction shape the existing `announcement` logic uses in this file.

Effect declaration order matters and is deliberate: on a successful settle the arm/disarm effect
runs first and leaves the flag set (no error), then the consume effect sees the changed `link` and
moves focus. On an error settle the first effect clears the flag and the second never runs, because
`link` did not change.

---

## 6. The three error-path defects

All three are defects **of the mechanism being shipped**, not new scope. Both probes were exercised
only on the happy path. Each must be **measured failing before its fix is believed** — a passing
assertion proves nothing until the broken variant has been seen to fail.

### 6.1 D-1 — the last invite revokes into a different `<section>`

`pending-invites-list.tsx` early-returns an empty-state branch with **its own `<h2>`** when
`invites.length === 0`. Revoking the **last** pending invite unmounts the populated branch and
mounts the empty one. If only the populated branch's heading carried the `id`, then
`document.getElementById(...)` returns `null` at exactly that moment, `?.` silently no-ops, and
focus stays on `<body>` — **the fix fails silently on the single most common revoke case.**

Fix: both branches carry the same `id` and `tabIndex={-1}` (§4.1). `MembersList` renders one
`<section>` unconditionally and has no empty branch, so it is unaffected.

**Measured failing first:** extend the probe with an empty-state branch whose `<h2>` lacks the id,
revoke the last row, and record the trajectory settling on `<body>` with the fix nominally in place.

### 6.2 D-2 — `submitted` arms but never disarms

Verified in the shipped source: `removeMember` and `revokeInvitation` each have two early returns
(`authErr`, then the query error) that `return { error }` **without** calling `revalidatePath`. On
failure the row therefore stays mounted with `submitted.current === true`, and nothing resets it.
Any later unmount of that row runs the cleanup and calls `.focus()` on the heading.

Concretely: click Remove → "A church must keep at least one admin." → the user navigates elsewhere →
focus is yanked during the route transition. Low blast radius; a real latent bug in the exact code
this spec is blessing.

Fix: the `else if (state.error)` disarm branch in §4.2.

**Measured failing first:** drive the probe's action down its error return, then unmount the row by
other means, and record the unwanted `focusin → H2`.

**Named residual — do not mistake this fix for total.** The flag is disarmed on an *error* settle,
not on every settle, and it cannot be otherwise: on a successful settle the row unmounts in the same
commit, so no post-settle effect ever runs and a disarm-on-any-settle would clear the flag before
the cleanup could read it. The uncovered case is therefore "the action succeeded and the row did
*not* unmount" — which for these two controls means the target was already gone, in which case the
row is already absent from the re-rendered list and the button does not exist to arm. Accepted as
unreachable by construction rather than as handled. If a future edit makes either action succeed
while leaving its row mounted, this becomes live again.

### 6.3 D-3 — `acted` has the same asymmetry at share-control

The probe arms `acted.current` while pending and clears it only when *consumed* by a `link` change.
On the error path `existingLink` does not change, the consume effect never runs, and `acted` stays
armed indefinitely. A later **unrelated** revalidation of the same path that flips `existingLink` —
another admin, or the same user in another tab, minting or revoking — then steals focus to the share
button while the user is doing something else.

⚠️ The probe's own comment claims that arming-while-pending is precisely what "stops the successor
stealing focus on an unrelated revalidation". **That claim holds only on the happy path**, where the
flag is consumed immediately. It does not survive an error. Do not carry the comment across.

Fix: the `else if (error)` disarm branch in §5.

**Measured failing first:** drive `shareReport` or `revokeShare` to an error, then trigger an
unrelated change of `existingLink`, and record focus jumping to the share button.

---

## 7. Alternatives considered and rejected

### 7.1 V2 — move focus before the unmount (shape A)

The only variant measured with a perfect handoff: `focusout → relatedTarget=H2` with no body flash
at all. **Rejected** because React emits a `javascript:`-scheme form action once a client wrapper
awaits the server action, which destroys the no-JS POST fallback on two destructive controls
(Remove member, Revoke invitation). Progressive enhancement outweighs a sub-frame flash.

### 7.2 V6 — `useLayoutEffect` at share-control

**Rejected** for consistency: shape A necessarily recovers in an effect cleanup, and using a
different scheduling primitive at shape B would give the codebase two focus-recovery vocabularies
for one milestone item. The only argument for V6 was an apparently earlier recovery, and §3 explains
why that reading is not supportable.

### 7.3 V3 — parent-owned focus / ref threading

**Rejected on measurement**, and already ruled out by Natalie. Byte-identical trajectory to V1,
while requiring both list files to become client components. All of the cost, none of the gain.

### 7.4 Making both share-control branches structurally alike

The shape-B defect exists **only** because the shared branch is a Fragment (`<p>`, `<code>`,
`<form>`) while the unshared branch is a bare `<form>`; different element types at that position
force a full unmount/remount. Making the branches structurally alike would let React reconcile the
`<button>` in place and would need **no focus code at all** — a simplified two-`<form>` replica
measured no defect whatsoever.

**Rejected on the record.** It trades an explicit, testable focus mechanism for an implicit
dependency on React's reconciliation that any future markup edit would silently break, with no test
that could catch the break. It was also never measured as a shipping candidate — only observed
incidentally while building the probe, which is a different claim. Shape A needs an explicit
mechanism regardless, so adopting this would leave two mechanisms in the codebase rather than one.

---

## 8. Correction to the I-3 spec

`2026-07-20-m6d-i3-pending-focus-design.md` §6 states that the row fix "requires threading a ref from
the parent list into the button component — an interface change, not a one-line edit."

**That is wrong, and this spec supersedes it.** The measurement (§3.1) showed a ref-threaded,
parent-owned implementation to be byte-identical to the child's own cleanup while costing two
server→client conversions. The interface change that *is* required is a `headingId` **string** prop,
which crosses the RSC boundary and leaves both lists as server components. The I-3 spec is left
unedited as a historical record; this section is the correction.

---

## 9. Verification

### 9.1 Tier 1 — source-reading census

A new test under `tests/a11y/`, extending the `pending-controls.test.ts` pattern (node environment,
comment-stripped source scan). **No jsdom, no `@testing-library`, no Playwright** — component-render
tests are unavailable in this repo by standing decision, and source-reading plus a browser proof is
the agreed substitute.

Assertions:

1. Every `<h2` in `members-list.tsx` and `pending-invites-list.tsx` carries **both** `id={` and
   `tabIndex={-1}`. Counted per occurrence, not per file — this is what defends D-1 against a future
   third branch.
2. Both row buttons declare a `headingId` prop, call `document.getElementById(headingId)?.focus()`
   inside an effect cleanup, and contain a disarm branch keyed on the error state.
3. `share-control.tsx` attaches the same ref to **both** buttons (count `ref={` occurrences against
   `<button` occurrences), and contains a disarm branch keyed on `error`.
4. Each `<h2>` id literal used by a list is the one passed to that list's button.

Each assertion must be **proven non-vacuous** by breaking the source it reads and watching the test
go red. Per §9.5, a presence check cannot verify a per-site invariant when one file holds several
sites — assertions 1 and 3 are therefore counting assertions, not presence checks.

### 9.2 Tier 2 — browser proof, run by the controller

Real visible focused Chrome via the chrome-devtools MCP. Not delegated to a subagent: this is the
crux evidence. Six recordings, each beginning with the `focusin → BUTTON` entry:

| # | Case | Expected |
|---|---|---|
| 1 | remove a member, not the last row | `focusin → H2#access-members-heading` |
| 2 | revoke an invite, not the last | `focusin → H2#access-pending-invites-heading` |
| 3 | **revoke the LAST invite** (D-1) | same heading id, from the empty-state branch |
| 4 | mint a share link | `focusin →` successor Revoke button |
| 5 | revoke a share link | `focusin →` successor Create button |
| 6 | each of D-1/D-2/D-3 with its fix removed | **seen to fail** |

Row 6 is not optional. Rows 1–5 prove the mechanism; row 6 is what makes rows 1–5 mean anything.

### 9.3 Tier 3 — progressive enhancement unchanged

Read `form.action` and `form.method` directly off the DOM at all four sites and confirm
`action="" method="post"`. This is the property V2 was rejected to preserve; a future edit that
introduces an awaiting client wrapper would break it silently.

### 9.4 Tier 4 — observed announcement

Natalie runs a VoiceOver pass against a harness whose markup is verified byte-identical to the
shipped markup. An agent cannot do this. The checks: after removing a member, the "Members" heading
is announced; after revoking the last invitation, the "Pending invitations" heading is announced
(and not silence); after minting, the Revoke button is announced.

A real failure mode exists here: a focused `<h2 tabIndex={-1}>` that is *reached* but announced as
nothing would mean focus technically recovered while the user still learned nothing — grounds to
revisit the target rather than merely note it.

### 9.5 Instrument traps that have already produced false passes

- ⛔ **The Browser-pane preview tab is `visibilityState: "hidden"` / `hasFocus: false`.** It throttles
  `setInterval` to ~1 Hz **and** suppresses focus/blur events entirely. Under that sampler V1 read as
  "BUTTON → H2, no body flash", which is wrong. Use the chrome-devtools MCP.
- ⛔ **Click and read in separate evaluations**, sampling from inside the page. A same-tick read
  returns pre-render state; an out-of-process read can land after the action resolved.
- ⛔ **Probe markup fidelity IS the measurement.** A simplified two-`<form>` replica of
  `share-control` measures no defect at all (§7.4). Do not "simplify" it.
- ⚠️ The `MutationObserver` detach log is asynchronous and does not order against `focusin`/
  `focusout`.
- ⚠️ First invocation of a server action in dev can exceed a 2.5 s settle window (compilation).
  "The click did nothing" may just be slow.

### 9.6 Gates

`npm run typecheck` 0 · `npm run lint` 0 · `npm run test` ≥ **193 tests / 45 files** (the new census
raises both) · `npm run build` 0 · raw U+2019 across `app/` + `components/` **exactly 15**.
⛔ Never run `npm run test:db`. The untracked probe under `app/probe-i4/` must be deleted, followed
by `rm -rf .next`, before any gate run that is treated as authoritative — a stale
`.next/dev/types/validator.ts` references the deleted route and fails typecheck on a clean tree.

---

## 10. Out of scope

Recorded, deliberately not folded in:

- The repeated-identical-error asymmetry at the five `useActionState` sites — a documented
  limitation from I-1, not an SC 4.1.3 failure.
- Engineering spec §16 decision 10(c): no `app/error.tsx`. A branding gap, not an a11y regression.
- `app/sign-in/page.tsx` — a submit button with **no** pending state at all, freely
  double-submittable. Pre-existing and the only such control in the app; it is neither a disable
  loss (I-3) nor an unmount loss (this item).
- `share-control` gives no `cursor-not-allowed` during pending, unlike I-2's static unavailable
  control. Two vocabularies for "inert" coexist.
- `stripComments` / `tsxFilesUnder` exist in four copies across `tests/a11y/`. A shared
  `tests/a11y/_source-scan.ts` is a cheap follow-up; this item's census would be the fifth copy.
</content>
</invoke>
