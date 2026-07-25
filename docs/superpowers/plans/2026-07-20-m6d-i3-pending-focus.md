# M6d I-3 — Focus Survives the Pending Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every control that disables itself during an async action from dropping keyboard focus to `<body>` for the duration of that action.

**Architecture:** Eleven controls across ten files swap `disabled={…}` for `aria-disabled={…}`, so the control stays focusable and focus survives the pending phase. Each gains a guard replacing what native `disabled` was doing for double-activation, and the eight carrying Tailwind's `disabled:opacity-50` swap it for `aria-disabled:opacity-50`, which the native variant would otherwise stop matching. A census test pins the result, carrying the measurement that justifies deviating from React's documented idiom.

**Tech Stack:** Next.js App Router (React 19, `useActionState`, `useTransition`), TypeScript, Tailwind 4.3.2, vitest (node environment, source-reading tests only).

**Source spec:** `docs/superpowers/specs/2026-07-20-m6d-i3-pending-focus-design.md` — approved, zero open questions.

**Branch:** `feat/m6d-i3-pending-focus`, cut off merged `master` `331396d`. Nothing is pushed.

## Global Constraints

- ⛔ **NEVER** run `npm run test:db`.
- **Never push or merge.** Natalie's explicit go-ahead only, as MylesM18.
- **Do not touch `next.config.ts` or `vitest.config.ts`.** vitest stays node-environment and `tests/**/*.test.ts`-only.
- **There is no jsdom, no `@testing-library`, no Playwright.** **Do not propose or add jsdom.**
- **Locate every edit by exact string match, never by line number.**
- **Raw U+2019 (`’`) across `app/` + `components/` must stay at exactly 15.**
- **Never rename a site's pending variable.** It is `pending` at eight controls, `revoking` and `minting` at the two in `share-control.tsx`.
- **Two guard shapes exist. Using the wrong one silently breaks the control** — see the File Structure table. Shape A adds an `onClick`; shape B edits the `onClick` already there.
- Gates: `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run test` → **189 tests / 44 files** before this plan · `npm run build` → exit 0.

---

## File Structure

| File | Controls | Var | Shape | `disabled:opacity-50` | Task |
|---|---|---|---|---|---|
| `app/accept/[token]/accept-button.tsx` | 1 | `pending` | **B** | yes | 1 |
| `app/app/[churchId]/generate-button.tsx` | 1 | `pending` | **B** | yes | 1 |
| `app/app/[churchId]/access/invite-member-form.tsx` | 1 | `pending` | A | yes | 2 |
| `app/app/[churchId]/access/revoke-invite-button.tsx` | 1 | `pending` | A | yes | 2 |
| `app/app/[churchId]/access/remove-member-button.tsx` | 1 | `pending` | A | yes | 2 |
| `app/app/[churchId]/access/resend-invite-button.tsx` | 1 | `pending` | A | yes | A3 |
| `app/app/[churchId]/invite-panel.tsx` | 1 | `pending` | A | yes | 3 |
| `app/get-started/form.tsx` | 1 | `pending` | A | yes | 3 |
| `components/answer-form.tsx` | 1 | `pending` | A | yes | 3 |
| `app/app/[churchId]/diagnosis/share-control.tsx` | 2 | `revoking`, `minting` | A | **no** | 4 |
| `tests/a11y/pending-controls.test.ts` | — | — | — | — | **5 (create)** |

**No two tasks share a file.** Tasks 1–4 are mutually independent and may run in parallel. Task 5 must run after all of them, because it asserts zero remaining `disabled={` bindings. Task 6 runs last.

⚠️ **Shared-tree hazard.** Parallel implementers share one working tree, so `typecheck`/`lint`/`test` observe every sibling's in-flight work even though the file edits are disjoint. Every implementer must classify gate errors **by file**: errors in its own files are its own; errors anywhere else are a sibling mid-edit, to be attributed and never "fixed". A task is done when *its* files contribute zero errors. The controller runs the authoritative whole-tree gates after Task 4.

---

### Task 1: Shape B — the two controls that already have an `onClick`

**Files:**
- Modify: `app/accept/[token]/accept-button.tsx`
- Modify: `app/app/[churchId]/generate-button.tsx`

**Interfaces:** consumes nothing; produces no exported symbols.

**Why these two are separate.** They are `type="button"` and submit no form. `e.preventDefault()` would guard nothing, and adding a second `onClick` prop would **overwrite the handler already there**, silently breaking the control while looking right in review. Their guard is an early `return` inside the existing handler.

- [ ] **Step 1: Edit `accept-button.tsx`**

Find this exact text:

```tsx
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setError(null)
```

Replace with:

```tsx
      <button
        type="button"
        aria-disabled={pending}
        onClick={async () => {
          if (pending) return
          setError(null)
```

Then find this exact text in the same file:

```tsx
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

Replace with:

```tsx
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 2: Edit `generate-button.tsx`**

This one changes a concise arrow body into a block body. Find this exact text:

```tsx
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await generateDiagnosis(churchId)
            // On success the action redirects (throws NEXT_REDIRECT) and this never runs;
            // only the { ok:false } error path returns a value.
            if (res && !res.ok) setError(res.error ?? 'Something went wrong.')
          })
        }
```

Replace with:

```tsx
      <button
        type="button"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return
          startTransition(async () => {
            setError(null)
            const res = await generateDiagnosis(churchId)
            // On success the action redirects (throws NEXT_REDIRECT) and this never runs;
            // only the { ok:false } error path returns a value.
            if (res && !res.ok) setError(res.error ?? 'Something went wrong.')
          })
        }}
```

Note the closing changed from `}` to `}}` — the arrow now has a block body inside the JSX expression container.

Then find this exact text in the same file:

```tsx
        className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

Replace with:

```tsx
        className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 3: Verify by grep**

```bash
grep -n "aria-disabled={pending}\|if (pending) return\|aria-disabled:opacity-50" "app/accept/[token]/accept-button.tsx" "app/app/[churchId]/generate-button.tsx"
grep -c "disabled={" "app/accept/[token]/accept-button.tsx" "app/app/[churchId]/generate-button.tsx"
```

Expected: three hits per file in the first command. The second reports `1` per file — that is the `aria-disabled={` binding, since `disabled={` is a substring of it. Zero *bare* bindings is what the census test checks in Task 5.

- [ ] **Step 4: Gates**

Run `npm run typecheck`, `npm run lint`, `npm run test`. Classify every error **by file** per the shared-tree note above. Your two files must contribute zero errors. Report raw output plus attribution.

Also confirm the apostrophe census: `grep -roP '\x{2019}' app components --include='*.tsx' --include='*.ts' | wc -l` → `15`.

---

### Task 2: Shape A — the three `access/` controls

**Files:**
- Modify: `app/app/[churchId]/access/invite-member-form.tsx`
- Modify: `app/app/[churchId]/access/revoke-invite-button.tsx`
- Modify: `app/app/[churchId]/access/remove-member-button.tsx`

**Interfaces:** consumes nothing; produces no exported symbols.

⚠️ `revoke-invite-button.tsx` and `remove-member-button.tsx` contain **byte-identical** button markup. Edit each file separately and confirm both changed.

- [ ] **Step 1: `invite-member-form.tsx`**

Find:

```tsx
      <button type="submit" disabled={pending}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
```

Replace with:

```tsx
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
```

- [ ] **Step 2: `revoke-invite-button.tsx`**

Find:

```tsx
      <button type="submit" disabled={pending}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
```

Replace with:

```tsx
      <button type="submit" aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
```

- [ ] **Step 3: `remove-member-button.tsx`**

The same find-and-replace as Step 2, applied to this file. The text is byte-identical; make the edit in this file too and verify both files changed.

- [ ] **Step 4: Verify by grep**

```bash
grep -c "aria-disabled={pending}" "app/app/[churchId]/access/invite-member-form.tsx" "app/app/[churchId]/access/revoke-invite-button.tsx" "app/app/[churchId]/access/remove-member-button.tsx"
grep -c "aria-disabled:opacity-50" "app/app/[churchId]/access/invite-member-form.tsx" "app/app/[churchId]/access/revoke-invite-button.tsx" "app/app/[churchId]/access/remove-member-button.tsx"
grep -c "e.preventDefault()" "app/app/[churchId]/access/invite-member-form.tsx" "app/app/[churchId]/access/revoke-invite-button.tsx" "app/app/[churchId]/access/remove-member-button.tsx"
```

Expected: `1` for every file in all three commands.

- [ ] **Step 5: Gates** — as Task 1 Step 4, for these three files.

---

### Task 3: Shape A — invite-panel, get-started, answer-form

**Files:**
- Modify: `app/app/[churchId]/invite-panel.tsx`
- Modify: `app/get-started/form.tsx`
- Modify: `components/answer-form.tsx`

**Interfaces:** consumes nothing; produces no exported symbols.

- [ ] **Step 1: `invite-panel.tsx`**

Find:

```tsx
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
```

Replace with:

```tsx
      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
```

- [ ] **Step 2: `get-started/form.tsx`**

Find:

```tsx
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
```

Replace with:

```tsx
      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="mt-2 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
```

- [ ] **Step 3: `components/answer-form.tsx`**

Find:

```tsx
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
```

Replace with:

```tsx
      <button
        type="submit"
        aria-disabled={pending}
        onClick={(e) => { if (pending) e.preventDefault() }}
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
```

⚠️ `answer-form.tsx` submits via an `onSubmit={handleSubmit}` handler on the `<form>`, not a form action. Preventing default on the submit button's click still prevents the submission, so the guard is correct here. Do **not** modify `handleSubmit`.

- [ ] **Step 4: Verify by grep** — as Task 2 Step 4, for these three files. Expected `1` per file per command.

- [ ] **Step 5: Gates** — as Task 1 Step 4, for these three files.

---

### Task 4: `share-control.tsx` — two controls plus the error colour

**Files:**
- Modify: `app/app/[churchId]/diagnosis/share-control.tsx`

**Interfaces:** consumes nothing; produces no exported symbols.

⚠️ This file's two buttons use **different** variables (`revoking` and `minting`) and have **no** `disabled:opacity-50` to swap. Do not introduce one.

- [ ] **Step 1: The revoke button**

Find:

```tsx
            <button
              type="submit"
              disabled={revoking}
              className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
```

Replace with:

```tsx
            <button
              type="submit"
              aria-disabled={revoking}
              onClick={(e) => { if (revoking) e.preventDefault() }}
              className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
```

- [ ] **Step 2: The mint button**

Find:

```tsx
          <button
            type="submit"
            disabled={minting}
            className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
```

Replace with:

```tsx
          <button
            type="submit"
            aria-disabled={minting}
            onClick={(e) => { if (minting) e.preventDefault() }}
            className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
```

Note the indentation differs between the two buttons — the revoke button sits two spaces deeper. Match each exactly.

- [ ] **Step 3: The error colour**

This control's error region is the only one of ten that renders in body-text colour, so an assertive `role="alert"` gives sighted users no visual error signal. Find:

```tsx
      <LiveStatus message={error} tone="error" className="font-body text-sm text-ink" />
```

Replace with:

```tsx
      <LiveStatus message={error} tone="error" className="font-body text-sm text-berry" />
```

Do **not** touch the `tone="status"` region on the following line — it is `sr-only` by design.

- [ ] **Step 4: Verify by grep**

```bash
grep -c "aria-disabled={revoking}\|aria-disabled={minting}" "app/app/[churchId]/diagnosis/share-control.tsx"
grep -c "e.preventDefault()" "app/app/[churchId]/diagnosis/share-control.tsx"
grep -c "text-berry" "app/app/[churchId]/diagnosis/share-control.tsx"
grep -c "opacity-50" "app/app/[churchId]/diagnosis/share-control.tsx"
```

Expected: `2`, `2`, `1`, `0`.

- [ ] **Step 5: Gates** — as Task 1 Step 4, for this file.

---

### Task 5: The census test

**Files:**
- Create: `tests/a11y/pending-controls.test.ts`

**Interfaces:** consumes the markup Tasks 1–4 shipped.

**Runs after Tasks 1–4**, because it asserts zero remaining bare `disabled={` bindings.

- [ ] **Step 1: Write the test**

Create `tests/a11y/pending-controls.test.ts`:

```ts
// Pins that no control disables itself with the native `disabled` attribute during an async action.
// SOURCE-READING test (node env, no DOM): it asserts on file text, not rendered output.
//
// Why it exists: `disabled` on a FOCUSED control drops keyboard focus to <body> the moment it is
// applied, and the user stays stranded there for the whole network round-trip — they cannot Tab
// from where they were, and a screen reader reading from <body> has lost its place. Measured:
//
//   before-click              -> BUTTON:Create share link
//   during-pending (disabled) -> BODY          <-- lost here
//   during-pending (aria-disabled) -> BUTTON:Creating…   <-- retained
//
// This deliberately DEVIATES from React's documented `disabled={isPending}` idiom, so the reasoning
// has to live here or someone will restore it in good faith. React's docs lean on `disabled` for
// double-submit protection. Measured against a real useActionState form action counting
// invocations, it provides none that the guard does not:
//
//   three synchronous clicks:  disabled -> 3 invocations | aria-disabled + guard -> 3 invocations
//   click after pending commits: disabled -> blocked     | aria-disabled + guard -> blocked
//
// Identical in both directions. React's claim holds only once the re-render commits; the unguarded
// window exists either way. The deviation costs nothing, so this test protects a real improvement.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCAN_DIRS = [path.join(REPO_ROOT, 'app'), path.join(REPO_ROOT, 'components')]

/** Remove block and line comments so prose mentioning these attributes is not scanned. */
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

// `disabled={` is a SUBSTRING of `aria-disabled={`, so a naive match would flag every fixed site.
// The lookbehind is what makes this assertion mean "bare native disabled binding".
const BARE_DISABLED = /(?<!aria-)disabled=\{/
const ARIA_DISABLED = /aria-disabled=\{/
// Shape A guards with e.preventDefault(); shape B guards with an early return inside the handler
// it already had. Either satisfies the contract.
const GUARD = /e\.preventDefault\(\)|if \(\w+\) return\b/

describe('pending controls', () => {
  it('scans enough files that the assertions below cannot pass vacuously', () => {
    expect(
      FILES.length,
      `expected at least 25 .tsx files under app/ and components/, found ${FILES.length} — the ` +
        'scan is probably not reaching the source tree, which would make every "zero occurrences" ' +
        'assertion below pass trivially',
    ).toBeGreaterThanOrEqual(25)
  })

  it('has no control disabling itself with the native attribute', () => {
    const offenders = FILES.filter((f) => BARE_DISABLED.test(f.source)).map((f) => f.path)
    expect(
      offenders,
      `native \`disabled={…}\` binding in: ${offenders.join(', ')}. Applying \`disabled\` to a ` +
        'FOCUSED control drops focus to <body> for the whole action. Use `aria-disabled={…}` plus ' +
        'a guard — see this file’s header for the measurement showing the guard is exactly as ' +
        'strong as native disabled.',
    ).toEqual([])
  })

  it('keeps every site that guards its pending state', () => {
    const unguarded = FILES.filter((f) => ARIA_DISABLED.test(f.source) && !GUARD.test(f.source)).map(
      (f) => f.path,
    )
    expect(
      unguarded,
      `\`aria-disabled={…}\` without a guard in: ${unguarded.join(', ')}. Native \`disabled\` was ` +
        'preventing a second activation; dropping it without a guard loses that. Add ' +
        '`onClick={(e) => { if (<pending>) e.preventDefault() }}` for a submit button, or an early ' +
        '`if (<pending>) return` inside an existing onClick handler.',
    ).toEqual([])
  })

  it('covers all ten known pending controls', () => {
    const count = FILES.reduce(
      (n, f) => n + (f.source.match(new RegExp(ARIA_DISABLED, 'g'))?.length ?? 0),
      0,
    )
    expect(
      count,
      'expected exactly 10 `aria-disabled={…}` bindings across app/ and components/ — one per ' +
        'control in the spec’s scope table. A lower count means a site was missed or reverted.',
    ).toBe(10)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npm run test -- tests/a11y/pending-controls.test.ts`

Expected: PASS, 4 tests. If "covers all ten" reports fewer than 10, a site was missed in Tasks 1–4 — report which file rather than editing it here.

- [ ] **Step 3: Prove it is not vacuous, both directions**

Temporarily change `aria-disabled={pending}` back to `disabled={pending}` in `app/get-started/form.tsx`. Run the test.

Expected: FAIL on "has no control disabling itself with the native attribute", naming `app/get-started/form.tsx`, **and** FAIL on "covers all ten" with 9.

Then restore it, re-run, and confirm PASS with the file byte-identical. Record both outputs verbatim.

- [ ] **Step 4: Gates**

`npm run typecheck && npm run lint && npm run test` — expect **193 tests / 45 files** (189/44 plus this file's 4). Confirm the U+2019 census is still `15`.

---

### Task 6: Browser proof and final gates

**Files:** no source changes. Any probe route is created and **deleted**.

**Why this cannot be skipped.** Task 5 proves the attributes are written correctly. It cannot prove focus actually survives the pending phase, that the guard actually blocks a second activation, or that `aria-disabled:opacity-50` actually compiles and dims the control. If that Tailwind variant silently fails, eight controls lose their disabled appearance with no test catching it.

- [ ] **Step 1: Start the dev server**

Start the `cairn-dev` server from the workspace `.claude/launch.json` via the preview tooling, not a raw shell command. It serves on port 3000.

- [ ] **Step 2: Build a probe**

Reaching most of these controls needs an authenticated session an agent cannot complete, so create `app/probe-pending/page.tsx` — uncommitted, deleted in step 6.

⚠️ **Do not use a `_`-prefixed folder name.** Next.js excludes those from routing; `app/__probe/` returns the 404 page.

```tsx
'use client'

import { useActionState, useRef, useState } from 'react'

export default function Probe() {
  const invocations = useRef(0)
  const [, setTick] = useState(0)

  const [, action, pending] = useActionState(async () => {
    invocations.current += 1
    setTick((t) => t + 1)
    await new Promise((r) => setTimeout(r, 400))
    return invocations.current
  }, 0)

  return (
    <main id="main-content" tabIndex={-1} className="flex flex-col gap-4 p-8">
      <form action={action}>
        <button
          id="probe-btn"
          type="submit"
          aria-disabled={pending}
          onClick={(e) => { if (pending) e.preventDefault() }}
          className="mt-1 rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {pending ? 'Working…' : 'Submit'}
        </button>
      </form>
      <pre id="counts">{`invocations=${invocations.current} pending=${pending}`}</pre>
    </main>
  )
}
```

The button's attributes and className are copied verbatim from the shipped `invite-panel.tsx` shape, so the probe exercises the same values. Navigate to `http://localhost:3000/probe-pending`.

- [ ] **Step 3: Prove focus survives the pending phase**

```js
(() => {
  const b = document.getElementById('probe-btn');
  b.focus();
  const before = document.activeElement === b;
  b.click();
  return JSON.stringify({ focusedBeforeClick: before });
})()
```

Then, in a **separate** evaluation so React can commit the pending render:

```js
(() => {
  const b = document.getElementById('probe-btn');
  const a = document.activeElement;
  return JSON.stringify({
    stillFocused: a === b,
    activeTag: a === document.body ? 'BODY' : a.tagName,
    counts: document.getElementById('counts').textContent,
    opacity: getComputedStyle(b).opacity,
  });
})()
```

Expected: `stillFocused: true`, `activeTag: "BUTTON"`, `pending=true` in counts, and **`opacity` strictly less than 1** — that last value is the proof `aria-disabled:opacity-50` compiled.

⚠️ Click and read in separate evaluations. Reading in the same tick returns pre-render state and produces a false result.

- [ ] **Step 4: Prove the guard blocks a second activation**

While pending, click again, wait, then read `#counts`. Expected: `invocations=1`.

- [ ] **Step 5: Prove the failing case**

Change the probe's `aria-disabled` back to `disabled`, reload, focus, click, and read `document.activeElement` in a separate evaluation. Expected: **`BODY`**. This is what makes step 3 evidence rather than a demonstration. Restore the probe afterwards.

- [ ] **Step 6: Delete the probe and clear stale types**

```bash
rm -rf app/probe-pending && git status --short
rm -rf .next
```

Clearing `.next` is **not optional**: a deleted route leaves `.next/dev/types/validator.ts` referencing it, and `npm run typecheck` then fails on an otherwise clean tree.

- [ ] **Step 7: Run every gate**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: typecheck 0 · lint 0 · **193 tests / 45 files** · build exit 0. Plus U+2019 → `15`.

⛔ Do **not** run `npm run test:db`.

- [ ] **Step 8: Report, and stop**

Report the step 3 focus result, the step 4 invocation count, the step 5 failing-case result, the measured opacity, and all four gate results — all verbatim. State whether a real page or the probe was used.

**Do not push. Do not open a PR. Do not merge.** Natalie's explicit go-ahead only.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 ten controls, nine files | Tasks 1–4 (2 + 3 + 3 + 1 files) |
| §3.1 `disabled=` → `aria-disabled=`, variable preserved | Tasks 1–4 |
| §3.2 shape A guard | Tasks 2, 3, 4 |
| §3.2 shape B guard | Task 1 |
| §3.3 `disabled:opacity-50` → `aria-disabled:opacity-50` | Tasks 1, 2, 3 (Task 4's file has none) |
| §3 `share-control` `text-ink` → `text-berry` | Task 4 step 3 |
| §4 the measurement justifying the deviation | Task 5's test header comment |
| §5 tier 1 census | Task 5 |
| §5 tier 2 browser proof, both directions | Task 6 steps 3–5 |
| §5 tier 3 visual check | Task 6 step 3, the `opacity` reading |
| §5 gates | every task |
| §6 out of scope (I-4) | no task, by design |

**Placeholder scan:** no TBD, TODO, or "same as Task N" — Task 2 step 3 refers to step 2's replacement deliberately because the two files' text is byte-identical, and it names that fact.

**Type consistency:** no exported symbols are introduced. The shared literals are the two guard forms and the `aria-disabled:opacity-50` class, which appear identically in the Global Constraints, each task's replacement blocks, and Task 5's regexes.

**Claims verified by running before this plan was written** (controller, at `cbc564b`):
- Exactly **10** `disabled={` bindings exist, **all on buttons**; the `<input>` elements nearby carry no such binding.
- **0** existing `aria-disabled={` bindings, and **1** existing `aria-disabled="true"` (I-2's control, string form) which the count assertion correctly ignores.
- **33** `.tsx` files under `app/` + `components/`, against the anti-vacuity floor of 25.
- `(?<!aria-)disabled=\{` matches a bare binding and does **not** match `aria-disabled={` — without the lookbehind, Task 5's central assertion would fail permanently after the change.
- The `GUARD` regex matches both shape A and shape B, and does not match an unguarded button.
- `aria-disabled:` is a built-in Tailwind variant mapping to `&[aria-disabled="true"]`.

**Known non-clean intermediate state:** between Tasks 1–4 and Task 5 the census test does not yet exist, so nothing fails. Within Tasks 1–4 run in parallel, gate output is shared-tree noise — see the File Structure warning.
