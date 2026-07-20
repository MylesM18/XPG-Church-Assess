# M6d I-2 — The unreachable disabled-button reason

**Status:** approved design, zero open questions.
**Branch:** `feat/m6d-i2-disabled-button-reason`, cut off merged `master` `c9407c8`.
**Origin:** `docs/XPG-Engineering-Spec.md` §16 decision 10(b), recorded during M6c and carried forward
deliberately rather than rediscovered.

## 1. The defect

`app/app/[churchId]/page.tsx` renders a permanently-disabled "Generate diagnosis" control whenever
the real action is unavailable. The explanation for *why* it is unavailable sits **inside** the
button:

```tsx
<button type="button" disabled aria-disabled="true" className="cursor-not-allowed … opacity-60">
  Generate diagnosis{' '}
  <span className="text-xs">
    ({result.coveredCount < categories.length
        ? `Answer all 8 areas first — ${result.coveredCount} of ${categories.length}`
        : 'Admins can generate the diagnosis'})
  </span>
</button>
```

`disabled` removes a `<button>` from the tab order in every browser. The reason is therefore
unreachable by sequential keyboard navigation: a Tab-navigating user never lands on the control and
never learns why the page's primary action is unavailable.

**Precision about who is affected.** A screen-reader user exploring in browse mode *can* still read
the text — the defect is not total invisibility. It affects anyone navigating by Tab, which includes
many motor-impaired users, many low-vision users, and screen-reader users in forms mode. The
milestone claim is about sequential-navigation reachability, not about the text being absent from
the accessibility tree.

This is pre-existing and was out of scope for M6c, which was scoped to presentational polish.

## 2. Two reasons, not one

The control covers two distinct situations, and both stay visible (decided 2026-07-20):

| Condition | Reason shown |
|---|---|
| `result.coveredCount < categories.length` | `Answer all 8 areas first — N of 8` |
| otherwise (covered, but `role !== 'admin'`) | `Admins can generate the diagnosis` |

Hiding the control from non-admins was considered and rejected. A non-admin learning that a
diagnosis exists and that an admin can generate it is useful information; silently removing the
control would withhold it. This keeps the change purely accessibility-shaped rather than a product
change.

## 3. The change

Three edits, all on the disabled-branch button only. Nothing else in the file changes.

1. **Remove `disabled`; keep `aria-disabled="true"`.** The control re-enters the tab order and is
   announced as unavailable, so the reason — already part of its accessible name — is read on focus.
2. **Add the codebase's canonical focus ring**, byte-identical to the string its four siblings in
   the same file already use:
   `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`
3. **Remove `opacity-60`**, keeping `text-ink-soft` (see §4).

`cursor-not-allowed` stays: it still communicates unavailability to pointer users.

**Why making it focusable is safe.** The control is provably inert, verified by reading the file:
`app/app/[churchId]/page.tsx` is a Server Component (no `'use client'`), the element is
`type="button"`, it carries **no** `onClick` or any other handler, and it is **not** inside a
`<form>`. Activating it by Enter or Space therefore does nothing and cannot submit anything. This is
why the eng-spec's own analysis called the remedy attribute-level rather than a client-component
rewrite.

**Why not `aria-describedby`.** The textbook ARIA shape would move the reason to a sibling
`<p id>` and reference it, giving the button a short accessible name and a separate description.
That was considered and rejected for this pass: it moves text out of the button chrome and so
changes the rendered layout, whereas keeping the reason in place makes the accessible name longer
but leaves the visual output untouched apart from the deliberate contrast fix in §4. The cost is a
long accessible name; the benefit is that this stays an accessibility change rather than a
redesign.

## 4. The contrast problem the fix exposes

The reason renders in `text-ink-soft` inside a button carrying `opacity-60`. Composited over paper:

| | Colour | Contrast on `#FBF9F5` |
|---|---|---|
| Today (`text-ink-soft` + `opacity-60`) | ≈ `#98999D` | **≈ 2.7:1** |
| After (`text-ink-soft`, no opacity) | `#565962` | **≈ 6.6:1** |

Both figures are **computed, not measured**; §5 tier 3 replaces them with a real in-browser
measurement, and the spec should be corrected if they disagree.

Today this is exempt: SC 1.4.3 does not apply to inactive user interface components, and `disabled`
makes the control unambiguously inactive. After the change the control is still semantically
disabled via `aria-disabled`, so the exemption still plausibly applies — but the stated purpose of
this work is making the reason *perceivable*, and 2.7:1 delivers that to screen-reader users while
leaving low-vision sighted users exactly where they started. Relying on an exemption to ship an
illegible explanation would be answering the letter of the criterion and not its point.

Dropping `opacity-60` and letting `text-ink-soft` carry the muted look preserves the disabled
appearance without crushing legibility. Border, padding, radius, and layout are unchanged; the
control renders slightly darker.

## 5. Verification

Component-render tests remain genuinely unavailable — vitest is node-environment and
`tests/**/*.test.ts`-only, there is no jsdom, no `@testing-library`, no Playwright, and
`vitest.config.ts` is off-limits. The same three-tier strategy proven in I-1 applies.

**Tier 1 — source-reading test**, modelled on `tests/a11y/main-landmark.test.ts`. Reading
`app/app/[churchId]/page.tsx` with comments stripped, it pins three things about the
disabled-branch button: that it never regains the `disabled` attribute; that it keeps
`aria-disabled="true"`; and that it carries the full canonical focus-ring string
`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`,
not merely some substring of it. Must be proven non-vacuous in both directions: reintroducing
`disabled` turns it red naming the file, and removing it restores green with the file byte-identical.

**Tier 2 — browser proof.** With the dev server running, on a church page in the disabled state:
Tab actually reaches the control (`document.activeElement` is the button, not a sibling); the focus
ring renders with a non-`none` computed outline; and activating it changes nothing — no navigation,
no network request, no console error.

**Tier 3 — measured contrast.** Read the reason span's computed colour and its background in the
browser and compute the real ratio, replacing the estimates in §4.

**Gates.** Floors carried from merged `master` `c9407c8`: `npm run typecheck` 0 · `npm run lint` 0 ·
`npm run test` **184 tests / 43 files** · `npm run build` exit 0 · raw U+2019 across `app/` +
`components/` exactly **15**. The tier-1 test adds one new file, so the target after this work lands
is **more than 184 tests across 44 files**; the exact test count depends on how the assertions are
grouped and is fixed by the implementation plan, not by this spec.

⛔ Never run `npm run test:db`.

## 6. Out of scope

Carried forward, not addressed here:

- `share-control` drops focus to `<body>` on its success transition (recorded in
  `components/live-status.tsx` as a deferred M6d follow-up).
- `share-control`'s error region uses `text-ink` where nine others use `text-berry`.
- The repeated-identical-error asymmetry at the five `useActionState` sites.
- eng-spec §16 decision 10(c): no `app/error.tsx`. A branding gap, explicitly not an accessibility
  regression.
