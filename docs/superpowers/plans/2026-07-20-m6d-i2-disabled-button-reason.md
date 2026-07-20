# M6d I-2 — Unreachable Disabled-Button Reason Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the explanation for why "Generate diagnosis" is unavailable reachable by sequential keyboard navigation, and legible while it is being reached.

**Architecture:** One element changes. The disabled-branch `<button>` in `app/app/[churchId]/page.tsx` drops the `disabled` attribute (which removes a button from the tab order entirely) and keeps `aria-disabled="true"`, so the control is announced as unavailable while remaining focusable. It gains the codebase's canonical focus ring, without which making it focusable would trade SC 4.1.2 for SC 2.4.7. It loses `opacity-60`, which had the reason text at roughly 2.7:1.

**Tech Stack:** Next.js App Router (React 19, Server Components), TypeScript, Tailwind v4, vitest (node environment, source-reading tests only).

**Source spec:** `docs/superpowers/specs/2026-07-20-m6d-i2-disabled-button-reason-design.md` — approved, zero open questions.

**Branch:** `feat/m6d-i2-disabled-button-reason`, cut off merged `master` `c9407c8`. Nothing is pushed.

## Global Constraints

- ⛔ **NEVER** run `npm run test:db`.
- **Never push or merge.** Natalie's explicit go-ahead only, as MylesM18.
- **Do not touch `next.config.ts` or `vitest.config.ts`.** vitest stays node-environment and `tests/**/*.test.ts`-only.
- **There is no jsdom, no `@testing-library`, no Playwright.** Component-render tests are genuinely unavailable. **Do not propose or add jsdom.** Tests in this plan are source-reading tests.
- **Locate every edit by exact string match, never by line number.**
- Migrations are append-only. `.superpowers/` stays untracked. **Never** merge `chore/rename-cairn-to-xpg`.
- **Raw U+2019 (`’`) across `app/` + `components/` must stay at exactly 15.** This plan adds no prose to those directories.
- `app/app/[churchId]/page.tsx` is a **Server Component**. It has no `'use client'` directive. Do not add one.
- **Gates**, floors carried from merged `master` `c9407c8`: `npm run typecheck` → 0 errors · `npm run lint` → 0 errors · `npm run test` → **184 tests / 43 files** before this plan, **189 tests / 44 files** after Task 1 (it adds exactly 5) · `npm run build` → exit 0.
- The canonical focus-ring string in this codebase, used verbatim by four sibling controls in the same file: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/app/[churchId]/page.tsx` | modify | the disabled-branch button: attributes and className |
| `tests/a11y/disabled-control-reason.test.ts` | **create** | pins the button's a11y attributes against regression |
| `docs/superpowers/specs/2026-07-20-m6d-i2-disabled-button-reason-design.md` | modify (Task 2) | replace computed contrast figures with measured ones |

**Why a new test file rather than extending `tests/a11y/main-landmark.test.ts`:** that file has one responsibility — the skip-link landmark invariant. Folding an unrelated button-focus assertion into it would blur that boundary and make its failures ambiguous. This matches the I-1 precedent, where component-shape and application-census assertions were kept in separate files.

---

### Task 1: The button change, pinned by a source-reading test

**Files:**
- Create: `tests/a11y/disabled-control-reason.test.ts`
- Modify: `app/app/[churchId]/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: no exported symbols. Task 2 consumes the shipped markup via the browser.

**Why the test asserts on source text:** there is no DOM in this test environment. The property being pinned — that this specific control never regains `disabled` and never loses its focus ring — is provable statically. Runtime behaviour is proven separately, once, in Task 2.

**Anti-vacuity is mandatory here.** The test locates its target by regex. If that regex ever stops matching, every assertion below it must fail loudly rather than pass against `null`. Step 1's first test exists solely to enforce that.

- [ ] **Step 1: Write the failing test**

Create `tests/a11y/disabled-control-reason.test.ts`:

```ts
// Pins the accessibility contract of the disabled "Generate diagnosis" control.
// SOURCE-READING test (node env, no DOM): it asserts on file text, not rendered output.
//
// Why it exists: `disabled` removes a <button> from the tab order in every browser. The reason the
// control is unavailable ("Answer all 8 areas first — 5 of 8" / "Admins can generate the
// diagnosis") lives INSIDE the button, so with `disabled` present a Tab-navigating user never
// reaches the explanation for why the page's primary action is unavailable.
//
// The fix keeps `aria-disabled="true"` — the control is still announced as unavailable — but drops
// `disabled` so it stays focusable, and adds a focus ring so that focus is visible once it can be
// reached. Re-adding `disabled` would silently restore the original defect with no visual change
// and no other failing test. This is the tripwire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = path.join(REPO_ROOT, 'app', 'app', '[churchId]', 'page.tsx')

/** Remove block and line comments so prose mentions of these attributes are not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const SOURCE = stripComments(fs.readFileSync(PAGE, 'utf8'))

// `cursor-not-allowed` appears on exactly one element in this file: the disabled-branch button.
// Matching the whole open tag lets every assertion below be scoped to that element rather than to
// the file as a whole — otherwise a `disabled` on some unrelated future control would pass.
const OPEN_TAG = SOURCE.match(/<button\b[^>]*cursor-not-allowed[^>]*>/)?.[0] ?? null

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

describe('disabled Generate-diagnosis control', () => {
  it('locates exactly one such control, so the assertions below cannot pass vacuously', () => {
    const occurrences = SOURCE.split('cursor-not-allowed').length - 1
    expect(
      occurrences,
      'expected exactly one `cursor-not-allowed` element in app/app/[churchId]/page.tsx — the ' +
        'disabled Generate-diagnosis button. If this count changed, the regex below is targeting ' +
        'the wrong element and every other assertion in this file is meaningless.',
    ).toBe(1)
    expect(
      OPEN_TAG,
      'could not find a <button> open tag containing `cursor-not-allowed`. Every assertion in ' +
        'this file is scoped to that tag, so they would all pass against null.',
    ).not.toBeNull()
  })

  it('is not `disabled`, so it stays in the tab order', () => {
    expect(
      OPEN_TAG,
      'the disabled Generate-diagnosis button must NOT carry the bare `disabled` attribute. ' +
        '`disabled` removes a button from the tab order, and the reason it is unavailable lives ' +
        'inside the button — so a Tab-navigating user would never reach that reason. Use ' +
        'aria-disabled="true" alone.',
    ).not.toMatch(/(?<![-\w])disabled(?![-\w])/)
  })

  it('keeps aria-disabled so it is still announced as unavailable', () => {
    expect(
      OPEN_TAG,
      'dropping `disabled` without `aria-disabled="true"` would make the control look actionable ' +
        'to assistive technology when it is not.',
    ).toContain('aria-disabled="true"')
  })

  it('carries the full canonical focus ring', () => {
    expect(
      OPEN_TAG,
      'a focusable control with no visible focus indicator fails SC 2.4.7. This must be the ' +
        `complete canonical string used by the sibling controls in this file, not a substring: ${FOCUS_RING}`,
    ).toContain(FOCUS_RING)
  })

  it('does not dim the reason text below legibility', () => {
    expect(
      OPEN_TAG,
      'opacity-60 composites text-ink-soft down to roughly 2.7:1 on paper, well under the 4.5:1 ' +
        'small text needs. The point of this change is making the reason perceivable, so the ' +
        'control keeps its muted look via text-ink-soft alone.',
    ).not.toContain('opacity-60')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/a11y/disabled-control-reason.test.ts`

Expected: **3 failures, 2 passes.** Failing: "is not `disabled`", "carries the full canonical focus ring", "does not dim the reason text below legibility". Passing: the anti-vacuity test and the `aria-disabled` test, because that attribute is already present.

If the anti-vacuity test fails at this point, stop and report — the regex is wrong and nothing else in the file means anything.

- [ ] **Step 3: Make the change**

In `app/app/[churchId]/page.tsx`, locate this exact text:

```tsx
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60"
          >
```

Replace it with:

```tsx
          <button
            type="button"
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
```

Three differences: the `disabled` line is gone, `opacity-60` is gone, and the focus-ring string is appended to the className. Nothing else in the file changes — not the button's children, not the sibling `Link` elements, not the `hasDiagnosis` ternary.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/a11y/disabled-control-reason.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Prove the tripwire is not vacuous**

Temporarily re-add `disabled` to that button, immediately after `type="button"`. Run the same command.

Expected: FAIL on "is not `disabled`", with the message naming the tab-order problem.

Then remove it again and re-run. Expected: PASS, 5 tests. Confirm the file is byte-identical to how step 3 left it.

Record both outputs verbatim in the task report. A tripwire that has not been seen to fire is not evidence.

- [ ] **Step 6: Run the gates**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: typecheck exit 0 with no output · lint exit 0 with no output · **189 tests / 44 files**, all passing.

Then confirm the apostrophe census is untouched:

Run: `grep -roP '\x{2019}' app components --include='*.tsx' --include='*.ts' | wc -l`

Expected: `15`.

- [ ] **Step 7: Commit**

```bash
git add "app/app/[churchId]/page.tsx" tests/a11y/disabled-control-reason.test.ts
git commit -m "fix(a11y): make the disabled Generate-diagnosis reason reachable"
```

---

### Task 2: Browser proof and measured contrast

**Files:**
- No source changes.
- Modify: `docs/superpowers/specs/2026-07-20-m6d-i2-disabled-button-reason-design.md` — replace the computed contrast figures with measured ones.
- If the probe fallback is used, it is created and then **deleted**; nothing from it is committed.

**Interfaces:**
- Consumes: the markup Task 1 shipped.
- Produces: the evidence the conformance claim rests on.

**Why this task cannot be skipped.** Task 1 proves the attributes are written correctly. It cannot prove that Tab actually reaches the control, that the focus ring actually renders, that activating a now-focusable button does nothing, or what the contrast actually is. A source grep sees text; only a browser sees behaviour.

- [ ] **Step 1: Start the dev server**

Use the preview tooling, not a raw shell command: start the server named `cairn-dev` from `.claude/launch.json` at the workspace root. It runs `npm --prefix /Users/newmac/Desktop/XPG-Church-Assess run dev` on port 3000.

Expected: ready on `http://localhost:3000`.

- [ ] **Step 2: Reach the control**

**Preferred, if a signed-in session is available:** navigate to a real church page `/app/<churchId>` in a state where the button is disabled — either fewer than 8 areas answered, or signed in as a non-admin. This is the strongest evidence because it exercises the shipped markup in place.

**Fallback, if sign-in is not available:** reaching that page requires an authenticated Supabase session established by magic link, which an agent cannot complete. In that case create a throwaway probe route.

⚠️ **Do not name the folder with a leading underscore.** Next.js App Router treats `_`-prefixed folders as private and excludes them from routing; a route at `app/__probe/` returns the 404 page. This cost a debugging cycle during I-1.

Create `app/probe-disabled-button/page.tsx` — uncommitted, deleted in step 6:

```tsx
export default function Probe() {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-col gap-4 p-8">
      <a href="#after">a focusable element before the button</a>

      <button
        type="button"
        aria-disabled="true"
        className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Generate diagnosis{' '}
        <span className="text-xs">(Answer all 8 areas first — 5 of 8)</span>
      </button>

      <a id="after" href="#main-content">a focusable element after the button</a>
    </main>
  )
}
```

The button's attributes and className are copied verbatim from the shipped markup, so the probe exercises the same values Task 1 pinned. The two anchors exist so tab order can be observed moving *through* the button rather than merely landing on it.

Navigate to `http://localhost:3000/probe-disabled-button`.

- [ ] **Step 3: Prove Tab reaches the control**

Evaluate in the page:

```js
(() => {
  const btn = document.querySelector('button[aria-disabled="true"]');
  btn.focus();
  return JSON.stringify({
    focusReachedButton: document.activeElement === btn,
    tagName: document.activeElement && document.activeElement.tagName,
    tabIndexProperty: btn.tabIndex,
    hasDisabledAttribute: btn.hasAttribute('disabled'),
    ariaDisabled: btn.getAttribute('aria-disabled'),
  });
})()
```

Expected: `{"focusReachedButton":true,"tagName":"BUTTON","tabIndexProperty":0,"hasDisabledAttribute":false,"ariaDisabled":"true"}`

⚠️ **Correction, measured 2026-07-20:** an earlier draft of this step claimed a `disabled` button
reports `tabIndex` of `-1`. It does **not** — it reports `0` even while disabled. `tabIndex` is
therefore not a discriminator between the two states. The load-bearing checks are
`focusReachedButton` and `hasDisabledAttribute`, plus the real Tab press in the step below. If
`focusReachedButton` is `false` or `hasDisabledAttribute` is `true`, stop and report.

- [ ] **Step 4: Prove the focus ring renders and activation is inert**

With the button still focused, evaluate:

```js
(() => {
  const btn = document.querySelector('button[aria-disabled="true"]');
  btn.focus();
  const cs = getComputedStyle(btn);
  const before = location.href;
  let threw = null;
  try { btn.click() } catch (e) { threw = String(e) }
  return JSON.stringify({
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    urlUnchanged: location.href === before,
    threw,
  });
})()
```

Expected: `outlineStyle` is not `"none"`, `outlineWidth` is non-zero, `urlUnchanged` is `true`, `threw` is `null`.

A focusable control with `outlineStyle: "none"` fails SC 2.4.7 — that would mean this change traded one failure for another, so stop and report if it appears.

- [ ] **Step 5: Measure the contrast**

Evaluate:

```js
(() => {
  const span = document.querySelector('button[aria-disabled="true"] span');
  const btn = span.closest('button');
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const fg = getComputedStyle(span).color;
  const bg = getComputedStyle(document.body).backgroundColor;
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return JSON.stringify({
    foreground: fg,
    background: bg,
    buttonOpacity: getComputedStyle(btn).opacity,
    ratio: Number(((l1 + 0.05) / (l2 + 0.05)).toFixed(2)),
  });
})()
```

Expected: `buttonOpacity` is `"1"` (the `opacity-60` is gone) and `ratio` is at or above **4.5**. The spec's computed estimate is ≈6.6:1.

If the measured ratio is below 4.5, stop and report — the contrast fix did not achieve its purpose and the design needs revisiting rather than the number quietly recorded.

- [ ] **Step 6: Delete the probe and confirm the tree is clean**

If a probe route was created:

```bash
rm -rf app/probe-disabled-button && git status --short
```

Expected: no output.

⚠️ Then clear the stale generated route types, which will still reference the deleted route and will fail typecheck:

```bash
rm -rf .next
```

This is not optional. During I-1 a deleted probe route left `.next/dev/types/validator.ts` pointing at it, and `npm run typecheck` returned exit 2 on an otherwise clean tree.

- [ ] **Step 7: Replace the spec's computed figures with the measured ones**

In `docs/superpowers/specs/2026-07-20-m6d-i2-disabled-button-reason-design.md`, §4 records both contrast figures as computed and says the spec should be corrected if measurement disagrees. Update the "After" row with the measured ratio from step 5 and change the sentence

> Both figures are **computed, not measured**; §5 tier 3 replaces them with a real in-browser measurement, and the spec should be corrected if they disagree.

to state what was actually measured, the computed estimate it replaces, and whether the two agreed.

- [ ] **Step 8: Run every gate**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: typecheck 0 · lint 0 · **189 tests / 44 files** · build exit code 0.

⛔ Do **not** run `npm run test:db`.

- [ ] **Step 9: Commit the spec correction**

```bash
git add docs/superpowers/specs/2026-07-20-m6d-i2-disabled-button-reason-design.md
git commit -m "docs(m6d): replace I-2 computed contrast figures with measured ones"
```

- [ ] **Step 10: Report, and stop**

Report the step 3 tab-reachability result verbatim, the step 4 outline values verbatim, the step 5 measured ratio verbatim, and all four gate results verbatim. State plainly whether the real church page or the probe route was used, because that determines how strong the evidence is.

**Do not push. Do not open a PR. Do not merge.** Natalie's explicit go-ahead only.

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| §1 the defect | Task 1 step 3 |
| §2 both reasons stay visible | Task 1 step 3 changes only attributes and className; the children carrying both reasons are untouched |
| §3.1 drop `disabled`, keep `aria-disabled` | Task 1 steps 1, 3 |
| §3.2 canonical focus ring | Task 1 steps 1, 3 |
| §3.3 remove `opacity-60` | Task 1 steps 1, 3 |
| §3 "why making it focusable is safe" | Task 2 step 4 proves activation is inert at runtime |
| §4 contrast | Task 1 step 6 pins `opacity-60` gone; Task 2 step 5 measures the real ratio |
| §5 tier 1 source-reading test | Task 1 |
| §5 tier 2 browser proof | Task 2 steps 3, 4 |
| §5 tier 3 measured contrast | Task 2 steps 5, 7 |
| §5 gates | Task 1 step 6, Task 2 step 8 |
| §6 out of scope | no task, by design |

**Placeholder scan:** no TBD, TODO, "similar to Task N", or prose-only code steps. Every code step contains the code.

**Type consistency:** no exported symbols are introduced, so there are no cross-task signatures to drift. The one shared literal is the focus-ring string, which appears identically in the Global Constraints, Task 1 step 1's `FOCUS_RING` constant, Task 1 step 3's replacement markup, and Task 2 step 2's probe — verified character-for-character across all four.

**Claims verified by running, not assumed** (controller, at `f4f55a1`):

- `cursor-not-allowed` occurs **exactly once** in `app/app/[churchId]/page.tsx`, so Task 1's
  anti-vacuity assertion `.toBe(1)` holds today.
- The open-tag regex `<button\b[^>]*cursor-not-allowed[^>]*>` **matches**, and returns the
  disabled-branch button.
- The bare-`disabled` regex `(?<![-\w])disabled(?![-\w])` **discriminates in both directions**:
  it fires on the current markup, and it does **not** false-positive on `aria-disabled="true"`
  alone in the post-change markup. Without this the test could never go green.
- Suite baseline confirmed at **184 tests / 43 files**.

**Known non-clean intermediate state:** none. The tree typechecks at every commit.
