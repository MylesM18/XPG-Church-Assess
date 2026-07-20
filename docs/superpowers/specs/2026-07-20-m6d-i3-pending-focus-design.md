# M6d I-3 — Focus survives the pending phase

**Status:** approved design, zero open questions.
**Branch:** `feat/m6d-i3-pending-focus`, cut off merged `master` `331396d`.
**Origin:** discovered while scoping the `share-control` focus deferral recorded during I-1. The
deferral named one instance; measurement showed the defect is app-wide.

## 1. The defect

Every control that disables itself during an async action drops keyboard focus to `<body>` for the
duration of that action. Measured in a browser, reproducing `share-control`'s structure:

```
0 before-click                -> BUTTON:Create share link
1 during-pending (disabled)   -> BODY      <-- focus lost here
2 after-branch-swap           -> BODY
```

The user is stranded on `<body>` for a full network round-trip. They cannot Tab from where they
were, and a screen reader reading from `<body>` has lost its place. The same probe with
`aria-disabled` in place of `disabled` retains focus through the pending phase:

```
1 during-pending (aria-disabled) -> BUTTON:Creating…
```

**This is the same root cause as I-2**, in a different guise: I-2 fixed `disabled` making a control
*unreachable*; this fixes `disabled` making a *focused* control lose focus mid-action.

## 2. Scope — ten controls across nine files

| File | Control | Pending var | Has `disabled:opacity-50` |
|---|---|---|---|
| `app/accept/[token]/accept-button.tsx` | Accept invitation | `pending` | yes |
| `app/app/[churchId]/generate-button.tsx` | Generate diagnosis | `pending` | yes |
| `app/app/[churchId]/invite-panel.tsx` | Create invitation | `pending` | yes |
| `app/app/[churchId]/access/invite-member-form.tsx` | Send invitation | `pending` | yes |
| `app/app/[churchId]/access/revoke-invite-button.tsx` | Revoke | `pending` | yes |
| `app/app/[churchId]/access/remove-member-button.tsx` | Remove | `pending` | yes |
| `app/app/[churchId]/diagnosis/share-control.tsx` | Revoke share link | `revoking` | no |
| `app/app/[churchId]/diagnosis/share-control.tsx` | Create share link | `minting` | no |
| `app/get-started/form.tsx` | Create church | `pending` | yes |
| `components/answer-form.tsx` | Submit | `pending` | yes |

Ten controls, nine files, eight of them carrying `disabled:opacity-50`.

**Two guard shapes, not one.** Eight are `type="submit"` inside a form and have no existing
`onClick`. The remaining two — `accept-button.tsx` and `generate-button.tsx` — are `type="button"`
with an `onClick` handler already attached and no form submission at all. §3 gives each its own
remedy; applying shape A to a shape-B site would overwrite its handler and break the control.

Three succeed by redirect (`accept-button`, `generate-button`, `get-started/form`), where focus is
moot once the navigation happens — but they still receive the change, so the codebase carries one
pattern rather than two.

## 3. The change

At every one of the ten controls:

1. `disabled={…}` → `aria-disabled={…}`, **preserving each site's own variable name** — that is
   `pending` at eight sites, `revoking` and `minting` at the two in `share-control.tsx`. The
   variable is never renamed.
2. Add a guard so a second activation cannot fire while the first is in flight. **The ten sites take
   two different guard shapes, and using the wrong one silently breaks the control.**

   **Shape A — eight `type="submit"` buttons with no existing `onClick`.** Add one:

   ```tsx
   onClick={(e) => { if (pending) e.preventDefault() }}
   ```

   using that site's own variable — `revoking` and `minting` at the two in `share-control.tsx`.
   Preventing default on a submit button's click prevents the form submission, which is what the
   native `disabled` was doing.

   **Shape B — two `type="button"` controls that already have an `onClick`**
   (`app/accept/[token]/accept-button.tsx`, `app/app/[churchId]/generate-button.tsx`). These do not
   submit a form, so `e.preventDefault()` guards nothing, and adding a second `onClick` would
   **overwrite the existing handler**. Instead, add an early return as the first statement inside
   the handler already there:

   ```tsx
   onClick={async () => {
     if (pending) return
     setError(null)
     …
   }}
   ```

   `generate-button.tsx`'s handler is currently a concise arrow returning `startTransition(…)`; it
   must be converted to a block body to take the guard.
3. Where present, `disabled:opacity-50` → `aria-disabled:opacity-50`. Tailwind ships `aria-disabled`
   as a built-in variant mapping to `&[aria-disabled="true"]`, so this is a direct swap; the project
   is on Tailwind 4.3.2.

Plus one unrelated fix in the same file as two of the controls: `share-control`'s error region uses
`className="… text-ink"` where its nine siblings use `text-berry`, so an assertive `role="alert"`
renders in ordinary body-text colour with no visual error signal. It becomes `text-berry`.

## 4. Why deviating from React's documented idiom is justified

`disabled={isPending}` is React's own documented pattern for `useActionState` and `useFormStatus`,
and React's docs lean on it for double-submit protection:

> React does not batch across multiple intentional events like clicks — each click is handled
> separately... if the first button click disables a form, the second click would not submit it
> again.

The obvious objection is therefore that this change gives up that protection. **Measured, it does
not.** Both forms were tested against a real `useActionState` form action counting invocations:

| | three synchronous clicks | second click after `pending` commits |
|---|---|---|
| `disabled={pending}` (status quo) | **3 invocations** | blocked |
| `aria-disabled` + onClick guard | **3 invocations** | blocked |

**Identical in both directions.** React's claim holds only once the re-render commits; there is an
unguarded window either way, and the status quo has the same hole. The deviation costs nothing in
double-submit protection.

This reasoning must survive in the code, because a future contributor who knows React's
documentation will reasonably try to restore `disabled`. §5's census test carries it.

## 5. Verification

Component-render tests remain unavailable — vitest is node-environment and `tests/**/*.test.ts`-only,
with no jsdom, no `@testing-library`, no Playwright, and `vitest.config.ts` off-limits.

**Tier 1 — census test.** A source-reading test over `app/` and `components/`, comments stripped,
asserting three things:

- **Zero occurrences of `disabled={`** anywhere. This is exact rather than approximate: measured at
  `331396d` there are exactly ten such bindings and all ten are on the buttons in §2's table, so
  after this change the correct count is zero. The test asserts on the `disabled={` *binding* form,
  not on a bare `disabled` attribute, because a static `disabled` on an input remains legitimate.
- **Exactly ten `aria-disabled={` bindings**, one per §2 site, so the swap cannot silently drop one.
- **Every file containing `aria-disabled={` also contains a guard** — either `e.preventDefault()`
  (shape A) or an early `return` inside the existing handler (shape B) — so a site cannot keep the
  accessible semantics while losing its double-activation guard. Because the two shapes differ, the
  test checks for the presence of a guard token appropriate to the file rather than one fixed
  string; the plan fixes the exact assertion.

An anti-vacuity assertion on the number of files scanned, matching the pattern in
`tests/a11y/live-regions-applied.test.ts`.

Proven non-vacuous by reintroducing `disabled={pending}` at one site and observing the failure name
that file, then restoring it byte-identical. Its comment must carry §4's measurement, so the
deviation reads as evidence-based rather than arbitrary — otherwise a future contributor restores
React's documented idiom and silently reintroduces the defect.

**Tier 2 — browser proof, both directions.** At one representative site: focus the control, trigger
the action, and confirm `document.activeElement` remains the button through the pending phase; then
confirm the same probe with `disabled` restored drops to `<body>`. Re-run the double-submit
comparison from §4 to confirm the guard still holds after the real edits.

**Tier 3 — visual check.** Confirm `aria-disabled:opacity-50` actually dims the control during
pending, by reading computed opacity in the browser. If the variant silently fails to compile, eight
controls lose their disabled appearance with no test catching it.

**Gates.** Floors from merged `master` `331396d`: `npm run typecheck` 0 · `npm run lint` 0 ·
`npm run test` **189 tests / 44 files** · `npm run build` exit 0 · raw U+2019 across `app/` +
`components/` exactly **15**. The census test adds a file.

⛔ Never run `npm run test:db`.

## 6. Out of scope — M6d I-4, the unmount focus-moves

This item fixes the *disable* focus loss. A second, independent loss happens when a control unmounts
after its action succeeds, and it needs bespoke handling per site rather than a uniform sweep:

- `share-control` ×2 — a successor control takes the old one's place (Create ↔ Revoke), so focus can
  move to it.
- `remove-member-button` and `revoke-invite-button` — rendered inside list rows
  (`members-list.tsx:31`, `pending-invites-list.tsx:32`). On success `revalidatePath` removes the
  row, so **there is no successor control**. The viable target is the list's own `<h2>` with
  `tabIndex={-1}`, which requires threading a ref from the parent list into the button component —
  an interface change, not a one-line edit.

`components/answer-form.tsx` already received its focus-move in I-1 and needs only this item's
disable fix.

Also still carried forward from earlier items: the repeated-identical-error asymmetry at the five
`useActionState` sites, and eng-spec §16.10(c)'s missing `app/error.tsx`.

---

## Verification outcome (recorded post-implementation)

All three tiers complete, measured 2026-07-20 at `f337c7b`.

**Tier 1 — census.** `tests/a11y/pending-controls.test.ts`, 4 tests. Proven non-vacuous in both
directions. ⚠️ Its guard assertion was originally **file-granular** and was found — by probing an
assertion the author had not exercised — to stay GREEN when only one of `share-control.tsx`'s **two**
controls lost its guard. It now counts guards per file and requires `guards >= aria-disabled
bindings`; the previously-slipping case fails with `share-control.tsx (2 controls, 1 guards)`.
**A presence check cannot verify a per-site invariant when one file holds several sites.**

**Tier 2 — browser proof, both directions.** Sampled from *inside* the page during the pending
phase, because an out-of-process evaluation can land after the action resolves and report a false
pass:

| | during pending |
|---|---|
| native `disabled` (status quo) | `active=BODY isButton=false` |
| `aria-disabled` + guard (shipped) | `active=BUTTON isButton=true aria=true` |

Guard verified separately: with `aria-disabled="true"` already committed, two further clicks left
`invocations=1`.

**Tier 3 — the Tailwind variant.** The generated rule is
`.aria-disabled\:opacity-50[aria-disabled="true"] { opacity: 0.5; }`, and with the transition
suppressed the computed opacity goes **1 → 0.5** when the attribute flips. ⚠️ A first reading showed
`opacity=1` during pending and looked like a failure; it was the button's own `transition-opacity`
caught mid-flight, not a compile failure. Worth knowing before someone re-measures and reaches the
wrong conclusion.

**Gates at `f337c7b`:** typecheck 0 · lint 0 · **193 tests / 45 files** · build 0 · U+2019 15.

**What remains unproven.** No screen reader was run against these controls, so how assistive
technology announces `aria-disabled` on a *submit* control mid-action is untested. Separately, the
second focus loss — when a control unmounts after success — is untouched here and is recorded as
M6d I-4 in §6.
