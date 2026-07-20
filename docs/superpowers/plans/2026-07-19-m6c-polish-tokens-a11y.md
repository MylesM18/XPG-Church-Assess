# M6c — Polish, Tokens & Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source spec:** `docs/superpowers/specs/2026-07-19-m6c-polish-tokens-a11y-design.md` — APPROVED AS-IS by Natalie, session 93. Every number in it was produced by RUNNING. Do not re-derive, do not re-open.

**Goal:** Close the app's remaining accessibility, tap-target, token, and typography debt in one branch — the last milestone of the project.

**Architecture:** Three dependency-ordered layers inside ONE branch, ONE review, ONE merge. Layer 1 adds the single new theme token and the reduced-motion backstop to `app/globals.css`, serialized and alone, because `--radius-card` must exist before any file references `rounded-card`. Layer 2 is a per-file sweep across 18 files that fans out — **the unit of work is a FILE, not a concern** (ruling S3-0), so no two tasks ever share a file. Layer 3 records what actually shipped in the engineering spec and the ledger, and runs last.

**Tech Stack:** Next.js App Router (RSC + client components), React 19, Tailwind CSS v4 (`@theme` block, no config file), TypeScript, vitest, pgTAP, Supabase.

---

## ⛔ PREREQUISITE — NOT PART OF THIS PLAN

**M6c does not start until the prose cache-check hotfix has merged into `origin/master`.**

- Bug: `app/app/[churchId]/actions.ts:118-121` — the cache-check SELECT is scoped by `response_hash` only, not `church_id`.
- Fix: add `.eq('church_id', churchId)` + **one regression test**.
- Severity: the SELECT runs through the **RLS-scoped** client. This is a **missing-generation bug, NOT a cross-tenant leak** — no prose is ever copied between churches; `save_prose` is merely skipped.
- Shape: **its own branch off `origin/master`, its own review, its own merge.** Suggested skill: `superpowers:systematic-debugging`.

**Task 0 of this plan is blocked until that merge lands.** Do not begin.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Branch from `origin/master` AFTER the hotfix merges — NEVER from local `master` (`77f0b36`),** which predates every M6b commit and is a deliberate stale fallback.
- **The focus-visible pattern is the repo pattern VERBATIM, no bespoke variants:**
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`
- **`--radius-card` is the ONLY new token M6c may add.** No other theme token, for any reason.
- **`--ink-faint` (`#8A8B90`) is NOT adopted** — CLOSED WON'T-FIX. Measured **3.23:1** on paper `#FBF9F5` vs `ink-soft`'s **6.65:1**; adopting it would CREATE a WCAG 1.4.3 AA failure. Do not add it back.
- **`--color-berry` is RESERVED to exactly FIVE sites** — 1 in `hero.tsx` (headline `<em>`), 1 in `site-header.tsx` (glyph middle `<circle>`), 3 in `chain-viz.tsx` (filled node, active label, "the break" tag). **Identify them BY CONTENT, never by line number — four of the five shift during M6c (§6.7).** `#8E2B3E` is never hardcoded. `--berry-tint` is never added.
- **In `components/marketing/`, 860px is `min-[861px]:`, never `sm:`.** This does NOT extend to app routes; app routes use the standard Tailwind scale (`sm:`/`md:`/`lg:`).
- **Leave `app/app/[churchId]/page.tsx:97` (`sm:grid-cols-2`) exactly as-is.** No churn on already-reviewed code.
- **Line numbers in this plan are PRE-EDIT anchors.** `chain-viz.tsx` and `site-header.tsx` shift their OWN line numbers during M6c. **Locate every edit site BY CONTENT (exact string match), never by seeking an absolute line.**
- **Do not add a page-level `metadata` export** — `app/layout.tsx` already sets it.
- **Do not touch `next.config.ts` or `vitest.config.ts`.** Migrations are append-only.
- **No service-role client in app code.** **`.superpowers/` stays UNTRACKED.**
- **NEVER run `npm run test:db`** — it wipes the local e2e fixtures. The safe pgTAP gate, if ever needed, is `supabase migration up --local && supabase test db`.
- **Verify by RUNNING, not reading.**
- **Push as MylesM18 on EXPLICIT go-ahead ONLY.** Never merge `chore/rename-cairn-to-xpg`.
- **Do NOT re-plan, re-review, or re-open M6a or M6b.** Both are SHIPPED, MERGED, CLOSED.

### ⭐ Testing position — copy VERBATIM into every reviewer's constraints block

> **ZERO new vitest tests. This is a position, not an oversight.**
> Every M6c change is presentational: CSS utility classes, ARIA attributes, one theme token, and text bytes. vitest does not render or measure computed styles, so a unit test here would assert on `className` strings — a change-detector, not a safety net. The real verification is the 375px browser probe, which measures the actual property SC 2.5.8 and the overflow checks are about.

Without this note a reviewer will raise missing coverage as an Important finding.

### Gates (every task ends green)

| Gate | Floor |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint .` | **0 problems** |
| `npx vitest run` | **captured at branch time in Task 0 — NOT 166** |
| `npx next build` | **exit 0** |
| pgTAP | **JUSTIFIED SKIP** — zero SQL, zero migrations. Floor stays Files=19 / Tests=195 |

⚠️ **The vitest trap.** M6c branches off `origin/master` *after* the prose hotfix merges, and that hotfix adds one regression test. **The floor is therefore NOT 166.** Task 0 captures it by running. Never hardcode the M6b number.

---

## File Structure

**Layer 1 — 1 file, serialized, runs FIRST AND ALONE:**

| File | Responsibility |
|---|---|
| `app/globals.css` | The `@theme` token table + global element defaults. Gains `--radius-card: 14px` and the reduced-motion backstop. |

**Layer 2 — 18 files, fans out, NO TWO TASKS SHARE A FILE:**

| # | Task | File | Concerns |
|---|---|---|---|
| 1 | 2 | `app/layout.tsx` | skip link + `#main-content` wrapper |
| 2 | 3 | `app/accept/[token]/accept-button.tsx` | focus-visible |
| 3 | 4 | `app/app/[churchId]/access/remove-member-button.tsx` | focus-visible + tap target ("Remove", 43×16) |
| 4 | 5 | `app/app/[churchId]/access/revoke-invite-button.tsx` | focus-visible + tap target ("Revoke", twin of "Remove" — ruling (A)) |
| 5 | 6 | `app/app/[churchId]/access/page.tsx` | focus-visible (`<Link>`) + tap target ("← Back to…", h=20) |
| 6 | 7 | `app/app/[churchId]/diagnosis/page.tsx` | focus-visible (`<a>`) + tap target ("Download PDF", h=20) |
| 7 | 8 | `app/app/[churchId]/diagnosis/share-control.tsx` | focus-visible + tap target ("Create share link", 106×20 **and** "Revoke share link", twin — ruling (A)) |
| 8 | 9 | `app/app/[churchId]/generate-button.tsx` | focus-visible |
| 9 | 10 | `app/app/[churchId]/page.tsx` | focus-visible + **8×** tap target ("Answer yourself", h=20) |
| 10 | 11 | `components/answer-form.tsx` | focus-visible |
| 11 | 12 | `components/marketing/site-header.tsx` | **ADD** `aria-hidden="true"` + `focusable="false"` |
| 12 | 13 | `components/marketing/chain-viz.tsx` | **DELETE** `aria-hidden` + `rounded-xl`→`rounded-card` — **one content-matched pass** |
| 13 | 14 | `components/marketing/how-it-works.tsx` | `rounded-xl`→`rounded-card` |
| 14 | 15 | `components/marketing/hero.tsx` | apostrophes ×2 |
| 15 | 16 | `app/app/[churchId]/invite-panel.tsx` | apostrophe ×1 |
| 16 | 17 | `app/app/[churchId]/diagnosis/report.tsx` | focus-visible (`<Link>`) + apostrophes ×3 |
| 17 | 18 | `app/respond/[token]/page.tsx` | apostrophe ×1 |
| 18 | 19 | `app/accept/[token]/page.tsx` | focus-visible (`<Link>` ×3) |

**Layer 3 — docs, runs LAST, touches NO source files:**

| File | Responsibility |
|---|---|
| `docs/XPG-Engineering-Spec.md` | Facts about the product: path corrections + the five narrative corrections |
| `.superpowers/sdd/progress.md` | The live SDD ledger — closes the inherited items (UNTRACKED, never committed) |

---

## Task 0: Branch, capture floors, commit the spec and this plan

**Blocked until the prose cache hotfix has merged into `origin/master`.**

**Files:**
- Commit (untracked → tracked): `docs/superpowers/specs/2026-07-19-m6c-polish-tokens-a11y-design.md`
- Commit (untracked → tracked): `docs/superpowers/plans/2026-07-19-m6c-polish-tokens-a11y.md`

**Interfaces:**
- Consumes: nothing.
- Produces: branch `feat/m6c-polish-a11y`; the recorded **vitest floor** (`M6C_VITEST_FLOOR`) that every later task's gate is measured against.

- [ ] **Step 1: Confirm the hotfix has merged**

```bash
cd /Users/newmac/Desktop/XPG-Church-Assess
git fetch origin
git log origin/master --oneline -5
git show origin/master:app/app/\[churchId\]/actions.ts | sed -n '115,125p'
```

Expected: the `.eq('church_id', churchId)` line is present in `origin/master`'s copy of the cache-check SELECT. **If it is absent, STOP — the prerequisite has not landed.**

- [ ] **Step 2: Cut the branch off `origin/master`, never local `master`**

```bash
git checkout -b feat/m6c-polish-a11y origin/master
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
git rev-parse --short origin/master
```

Expected: HEAD is `feat/m6c-polish-a11y`, and its SHA equals `origin/master`'s SHA. **It must NOT equal `77f0b36`** (local `master`).

- [ ] **Step 3: Capture the vitest floor BY RUNNING**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all green. **Record the exact "Tests N passed" and "Test Files N passed" numbers as `M6C_VITEST_FLOOR`.** It is **NOT 166** — the hotfix added a regression test. Write both numbers into the commit message in Step 5 so they survive context loss.

- [ ] **Step 4: Capture the other three gate baselines**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx eslint . 2>&1 | tail -5; echo "eslint exit=$?"
npx next build 2>&1 | tail -15; echo "build exit=$?"
```

Expected: `tsc exit=0`, `eslint exit=0` with 0 problems, `build exit=0`.

- [ ] **Step 5: Commit the spec and this plan as the branch's first commit**

```bash
git add docs/superpowers/specs/2026-07-19-m6c-polish-tokens-a11y-design.md \
        docs/superpowers/plans/2026-07-19-m6c-polish-tokens-a11y.md
git status --porcelain
git commit -m "docs(m6c): add approved M6c spec and implementation plan

Spec approved as-is by Natalie (brainstorming item 8, session 93).
Branch cut off origin/master after the prose cache hotfix merged.

Gate floors captured by running at branch time:
  vitest: <N> tests / <M> files passed
  tsc 0 · eslint 0 · next build exit 0
  pgTAP: justified skip (zero SQL) — floor stays Files=19/Tests=195

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: `git status --porcelain` before the commit shows exactly those two files staged and **nothing from `.superpowers/`** — that directory must stay untracked.

---

# LAYER 1 — SERIALIZED, RUNS FIRST AND ALONE

**No Layer 2 task may start until Task 1 is committed.** `--radius-card` must exist in `@theme` before `chain-viz.tsx` (Task 13) and `how-it-works.tsx` (Task 14) reference `rounded-card`.

## Task 1: `app/globals.css` — the one new token + the reduced-motion backstop

**Files:**
- Modify: `app/globals.css` (currently 25 lines)

**Interfaces:**
- Consumes: nothing.
- Produces: the utility class **`rounded-card`** (Tailwind v4 auto-generates it from the `--radius-*` namespace), consumed by Task 13 and Task 14. **No other task may add a token.**

- [ ] **Step 1: Add `--radius-card: 14px` to the `@theme` block**

Locate by content — the `--font-body` line is the last entry in `@theme`. Insert a blank line and the token after it, so `@theme` ends:

```css
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-body: var(--font-hanken), system-ui, sans-serif;

  --radius-card: 14px;
}
```

Evidence for the value (do not re-derive): the prototype uses `var(--r)` = 14px at 15 sites; the app uses `rounded-xl` (12px) at exactly 2, both marketing.

⚠️ **Do NOT add `--ink-faint`.** It is CLOSED WON'T-FIX — 3.23:1 on paper vs `ink-soft`'s 6.65:1; adding it would create a WCAG 1.4.3 AA failure.

- [ ] **Step 2: Append the reduced-motion block at the end of the file**

Append after the existing `body { font-family: var(--font-body); }` rule, verbatim:

```css

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The `!important` is **deliberate** — it is what makes the block a genuine backstop that no utility class can outrank. Do not remove it, and do not narrow the selector.

- [ ] **Step 3: Verify the token generates the utility class BY RUNNING**

```bash
npx next build 2>&1 | tail -5; echo "build exit=$?"
grep -rn "radius-card" app/globals.css
```

Expected: `build exit=0`; the grep returns exactly one line, the `@theme` entry.

- [ ] **Step 4: Run the full gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
npx vitest run 2>&1 | tail -5
```

Expected: tsc 0, eslint 0, vitest at `M6C_VITEST_FLOOR` (unchanged — this task adds no tests, per the testing position).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(m6c): add --radius-card token and reduced-motion backstop

--radius-card: 14px is the ONLY new token in M6c (ruling S2-b).
--ink-faint deliberately NOT adopted: measured 3.23:1 on paper vs
ink-soft 6.65:1 — adopting it would create a WCAG 1.4.3 AA failure (S2-a).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# LAYER 2 — 18 FILES, FANS OUT, NO TWO TASKS SHARE A FILE

Tasks 2–19 are mutually independent and may run in parallel. Every one of them ends with the same four gates green and its own commit.

**The focus-visible pattern, used verbatim in every task that applies it:**

```
focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink
```

**The tap-target mechanism:** vertical padding only, targeting **≥28px** (not the bare 24px WCAG floor), plus `inline-flex`/`inline-block` **only** where the element is genuinely inline and padding would otherwise not apply. **No layout rewrites.** Elements that are already flex children are blockified by the flex container, so padding already applies to them — the measured widths of 327px prove this for "Download PDF" and "← Back to…".

---

## Task 2: `app/layout.tsx` — skip link + `#main-content`

**Files:**
- Modify: `app/layout.tsx` (19 lines)

**Interfaces:**
- Consumes: nothing.
- Produces: the DOM id **`main-content`** and a first-tabbable skip anchor, asserted by acceptance check 10 in Task 20.

**Why one file and not 18:** `<main>` appears 18× (once per page), so a naive skip link would need 18 edits. Putting the link **and** its target in the root layout covers all ~16 routes in ~5 lines with zero per-page edits (ruling S1-c).

- [ ] **Step 1: Add the skip link and the wrapper**

Locate by content — the `<body …>{children}</body>` line. Replace it with:

```tsx
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-paper focus:px-4 focus:py-2 focus:font-body focus:text-sm focus:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Skip to content
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
```

The anchor must be the **first element inside `<body>`** so it is the first tabbable element. `tabIndex={-1}` on the wrapper makes it a valid programmatic focus target without adding it to the tab order.

- [ ] **Step 2: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
npx next build 2>&1 | tail -5; echo "build exit=$?"
```

Expected: tsc 0, eslint 0, build exit 0.

- [ ] **Step 3: Verify the markup BY RUNNING**

```bash
grep -n 'id="main-content"' app/layout.tsx
grep -n 'href="#main-content"' app/layout.tsx
```

Expected: one hit each, with the anchor's line number **lower** than the wrapper's.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(m6c): add skip link and #main-content wrapper (WCAG 2.4.1)

Ruling S1-c: one file, ~5 lines, zero per-page edits, covers all ~16 routes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `app/accept/[token]/accept-button.tsx` — focus-visible

**Files:**
- Modify: `app/accept/[token]/accept-button.tsx` (27 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** nothing consumed by other tasks.

- [ ] **Step 1: Add the focus-visible pattern to the one `<button>`**

Locate by content — the className string `rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50`. Append the pattern verbatim:

```tsx
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 2: Verify no interactive element is left uncovered**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/accept/[token]/accept-button.tsx"
grep -c "focus-visible:outline-ink" "app/accept/[token]/accept-button.tsx"
```

Expected: `1` and `1` — one interactive element, one pattern application.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 4: Commit**

```bash
git add "app/accept/[token]/accept-button.tsx"
git commit -m "feat(m6c): add focus-visible to accept-button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `app/app/[churchId]/access/remove-member-button.tsx` — focus-visible + tap target

**Files:**
- Modify: `app/app/[churchId]/access/remove-member-button.tsx` (21 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** the "Remove" control at **≥28px**, asserted by acceptance check 3 in Task 20.

**Measured pre-fix:** 43×16 — the smallest control in the app. `text-xs` gives a 16px line box, so `py-2` (8px top + 8px bottom) lands it at **32px**. `py-1.5` would land at exactly 28px, on the target rather than above it — use `py-2`.

- [ ] **Step 1: Add the focus-visible pattern and the vertical padding**

Locate by content — the className string `font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50`. Replace the whole `<button>` element with:

```tsx
      <button type="submit" disabled={pending}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Removing…' : 'Remove'}
      </button>
```

The button is a flex child of `<form className="flex flex-col items-end gap-1">`, so it is blockified and the vertical padding applies without any display class.

- [ ] **Step 2: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 3: Commit**

```bash
git add "app/app/[churchId]/access/remove-member-button.tsx"
git commit -m "feat(m6c): focus-visible + >=28px tap target on Remove (WCAG 2.2 SC 2.5.8)

Was 43x16 — the smallest control in the app. py-2 on a text-xs line box = 32px.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `app/app/[churchId]/access/revoke-invite-button.tsx` — focus-visible + tap target

**Files:**
- Modify: `app/app/[churchId]/access/revoke-invite-button.tsx` (21 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** the "Revoke" control at **≥28px** — a twin site, **NOT** assertable by acceptance check 3 (see below).

✅ **TWIN-CONTROL RULING — Natalie approved option (A), session 95.** "Revoke" has byte-identical styling to "Remove" (measured 43×16, Task 4), but the fixtures hold no pending member invitation, so acceptance check 3 **structurally cannot reach it**. It gets the same `py-2` fix anyway. **Do not expect check 3 to prove this one** — its evidence is the identical class string and Task 4's measured twin.

- [ ] **Step 1: Add the focus-visible pattern and the vertical padding to the one `<button>`**

Locate by content — the className string `font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50`. Replace the whole `<button>` element with:

```tsx
      <button type="submit" disabled={pending}
        className="py-2 font-body text-xs text-berry-deep underline underline-offset-2 hover:opacity-80 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
```

`py-2` matches Task 4's "Remove" exactly: `text-xs` gives a 16px line box, so 8px + 8px lands it at **32px**. The button is a flex child of its `<form>`, so it is blockified and the vertical padding applies without a display class.

- [ ] **Step 2: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 3: Commit**

```bash
git add "app/app/[churchId]/access/revoke-invite-button.tsx"
git commit -m "feat(m6c): focus-visible + >=28px tap target on Revoke (twin of Remove)

Twin-control ruling (A), Natalie session 95: byte-identical styling to
'Remove' (43x16) but unreachable by acceptance check 3 — no pending member
invitation exists in the fixtures. py-2 on a text-xs line box = 32px.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `app/app/[churchId]/access/page.tsx` — focus-visible + tap target

**Files:**
- Modify: `app/app/[churchId]/access/page.tsx` (49 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** the "← Back to {church}" control at **≥28px**, asserted by acceptance check 3.

**Measured pre-fix:** h=20, w=327. This file is one of the three the old `<Link>`-blind scan missed — the `<Link>` renders a real focusable `<a>`.

- [ ] **Step 1: Add the focus-visible pattern and the vertical padding to the `<Link>`**

Locate by content — the line containing `← Back to {church.name}`. Replace that whole `<Link>` element with:

```tsx
        <Link href={`/app/${churchId}`} className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">← Back to {church.name}</Link>
```

`text-sm` gives a 20px line box, so `py-1.5` (6px + 6px) lands it at **32px**. No display class is needed: the `<Link>` is a flex child of `<header className="flex flex-col gap-1">` and is therefore already blockified — the measured w=327 confirms it stretches to the container.

- [ ] **Step 2: Verify no interactive element is left uncovered**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/app/[churchId]/access/page.tsx"
grep -c "focus-visible:outline-ink" "app/app/[churchId]/access/page.tsx"
```

Expected: `1` and `1`.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 4: Commit**

```bash
git add "app/app/[churchId]/access/page.tsx"
git commit -m "feat(m6c): focus-visible + >=28px tap target on the access back-link

The <Link> renders a real focusable <a>; the s88 scan was blind to it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `app/app/[churchId]/diagnosis/page.tsx` — focus-visible + tap target

**Files:**
- Modify: `app/app/[churchId]/diagnosis/page.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** the "Download PDF" control at **≥28px**, asserted by acceptance check 3.

**File ownership is settled:** "Download PDF" lives HERE, inside the `<a>` at `:105`. `diagnosis/report.tsx` (Task 17) does **not** render it and must not touch it.

- [ ] **Step 1: Add the focus-visible pattern and the vertical padding to the `<a>`**

Locate by content — the `<a>` whose child text is `Download PDF` and whose className is `font-body text-sm text-ink-soft underline underline-offset-4`. Replace that className with:

```tsx
          className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

`text-sm` = 20px line box; `py-1.5` lands it at **32px**. No display class needed — the `<a>` is a flex child of `<div className="flex flex-col gap-4">` and is already blockified (measured w=327).

- [ ] **Step 2: Verify no interactive element is left uncovered**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/app/[churchId]/diagnosis/page.tsx"
grep -c "focus-visible:outline-ink" "app/app/[churchId]/diagnosis/page.tsx"
```

Expected: `1` and `1`.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 4: Commit**

```bash
git add "app/app/[churchId]/diagnosis/page.tsx"
git commit -m "feat(m6c): focus-visible + >=28px tap target on Download PDF

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `app/app/[churchId]/diagnosis/share-control.tsx` — focus-visible + tap target

**Files:**
- Modify: `app/app/[churchId]/diagnosis/share-control.tsx` (64 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** the "Create share link" control at **≥28px**, asserted by acceptance check 3.

**This file has TWO buttons** — "Revoke share link" (rendered only when a share exists) and "Create share link" (rendered otherwise). The 375px probe could only reach the second, because the fixtures hold `report_shares = 0`. **focus-visible goes on BOTH** — spec §6.2 requires every interactive element in the file.

✅ **TWIN-CONTROL RULING — Natalie approved option (A), session 95.** "Revoke share link" has byte-identical styling to "Create share link" (measured 106×20), so it **also gets `py-1.5`**, even though acceptance check 3 **structurally cannot reach it** (`report_shares = 0`). **Both buttons therefore get focus-visible AND `py-1.5`.**

- [ ] **Step 1: Add focus-visible AND the vertical padding to the "Revoke share link" button**

Locate by content — the `<button>` whose child expression is `{revoking ? 'Revoking…' : 'Revoke share link'}`. Replace its className with:

```tsx
              className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

`py-1.5` matches "Create share link" exactly: `text-sm` = 20px line box, 6px + 6px lands it at **32px**. Evidence for this one is the identical class string, not a probe measurement.

- [ ] **Step 2: Add focus-visible AND the vertical padding to the "Create share link" button**

Locate by content — the `<button>` whose child expression is `{minting ? 'Creating…' : 'Create share link'}`. Replace its className with:

```tsx
            className="py-1.5 font-body text-sm text-ink-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

Measured pre-fix 106×20; `text-sm` = 20px line box, `py-1.5` lands it at **32px**. Buttons apply vertical padding natively — no display class needed.

- [ ] **Step 3: Verify both buttons are covered**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/app/[churchId]/diagnosis/share-control.tsx"
grep -c "focus-visible:outline-ink" "app/app/[churchId]/diagnosis/share-control.tsx"
```

Expected: `6` interactive elements (2 buttons + 4 `<input type="hidden">`) and `2` pattern applications. **Hidden inputs are not focusable and must NOT be given the pattern** — that would be a bespoke variant of the rule, and hidden inputs cannot receive focus.

- [ ] **Step 4: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 5: Commit**

```bash
git add "app/app/[churchId]/diagnosis/share-control.tsx"
git commit -m "feat(m6c): focus-visible + >=28px on BOTH share-control buttons

Twin-control ruling (A), Natalie session 95: 'Revoke share link' is byte-identical
to 'Create share link' (106x20) but unreachable by acceptance check 3
(report_shares = 0), so it gets the same py-1.5 anyway.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `app/app/[churchId]/generate-button.tsx` — focus-visible

**Files:**
- Modify: `app/app/[churchId]/generate-button.tsx` (31 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** nothing consumed by other tasks.

- [ ] **Step 1: Add the focus-visible pattern to the one `<button>`**

Locate by content — the className string `rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50`. Append the pattern verbatim:

```tsx
        className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 2: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 3: Commit**

```bash
git add "app/app/[churchId]/generate-button.tsx"
git commit -m "feat(m6c): add focus-visible to generate-button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `app/app/[churchId]/page.tsx` — focus-visible ×4 + tap target ×8

**Files:**
- Modify: `app/app/[churchId]/page.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** the 8× "Answer yourself" controls at **≥28px**, asserted by acceptance check 3.

⚠️ **Leave `app/app/[churchId]/page.tsx:97` (`sm:grid-cols-2`) EXACTLY as-is.** It is already-reviewed code and ruling Q5 forbids churning it. This task touches only the four interactive elements below.

**Four interactive elements, pre-edit anchors `:113`, `:128`, `:137`, `:155`.** The "Answer yourself" `<Link>` at `:113` is rendered once per category — 8 categories, hence 8 rendered controls from one source site.

- [ ] **Step 1: "Answer yourself" — focus-visible + vertical padding**

Locate by content — the `<Link>` whose child text is `Answer yourself` and whose className is `mt-2 inline-block font-body text-sm text-ink underline underline-offset-2 hover:opacity-80`. Replace that className with:

```tsx
                className="mt-2 inline-block py-1.5 font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

It is already `inline-block`, so the vertical padding applies. `text-sm` = 20px line box; `py-1.5` lands it at **32px**.

- [ ] **Step 2: "View diagnosis" — focus-visible**

Locate by content — the `<Link>` whose child text is `View diagnosis`. Replace its className with:

```tsx
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 3: The disabled "Generate diagnosis" button — focus-visible**

Locate by content — the `<button>` carrying `aria-disabled="true"` and the className `cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60`. Replace that className with:

```tsx
            className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 font-body text-sm text-ink-soft opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

It uses `disabled` **and** `aria-disabled="true"`, so it is removed from the tab order — the pattern is applied anyway for uniformity with the repo rule and costs nothing.

- [ ] **Step 4: "Manage access" — focus-visible**

Locate by content — the `<Link>` whose child text is `Manage access`. Replace its className with:

```tsx
            className="rounded-md border border-line bg-ink px-3 py-1.5 font-body text-sm text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 5: Verify all four are covered and `sm:grid-cols-2` is untouched**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/app/[churchId]/page.tsx"
grep -c "focus-visible:outline-ink" "app/app/[churchId]/page.tsx"
grep -n "sm:grid-cols-2" "app/app/[churchId]/page.tsx"
git diff -- "app/app/[churchId]/page.tsx" | grep -c "grid-cols"
```

Expected: `4`, `4`, one `sm:grid-cols-2` hit, and **`0`** changed grid lines in the diff.

- [ ] **Step 6: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 7: Commit**

```bash
git add "app/app/[churchId]/page.tsx"
git commit -m "feat(m6c): focus-visible x4 + >=28px tap target on Answer yourself (8 rendered)

sm:grid-cols-2 left exactly as-is per ruling Q5.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `components/answer-form.tsx` — focus-visible ×3

**Files:**
- Modify: `components/answer-form.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** nothing consumed by other tasks.

⚠️ **The 5 `<input type="range">` sliders are EXCLUDED from the tap-target sweep** under SC 2.5.8's explicit UA-default exception (ruling S1-a) — overriding it would change the feel of the survey's primary interaction. **They are NOT excluded from focus-visible**, which is a keyboard-affordance win with no effect on pointer feel. Add the pattern; add no padding, no height, no size override.

- [ ] **Step 1: The name text input — focus-visible**

Locate by content — the `<input type="text">` whose className is `rounded-md border border-line bg-paper px-3 py-2 font-body text-ink`. Replace that className with:

```tsx
            className="rounded-md border border-line bg-paper px-3 py-2 font-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 2: The range slider — focus-visible only, no sizing**

Locate by content — the `<input type="range">` whose className is `w-full`. Replace that className with:

```tsx
              className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

**Do not add padding, `min-h`, `h-`, or any size utility here.**

- [ ] **Step 3: The submit button — focus-visible**

Locate by content — the `<button type="submit">` whose className is `rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50`. Replace that className with:

```tsx
        className="rounded-md border border-line bg-ink px-4 py-2 font-body text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 4: Verify all three are covered and the slider gained no sizing**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" components/answer-form.tsx
grep -c "focus-visible:outline-ink" components/answer-form.tsx
git diff -- components/answer-form.tsx | grep -E '^\+' | grep -cE '(min-h-|h-\[|py-[0-9])' 
```

Expected: `3`, `3`, and **`0`** added sizing utilities beyond the pre-existing `py-2` on the two non-slider controls — inspect the third command's output manually if it is non-zero and confirm no slider sizing was introduced.

- [ ] **Step 5: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
npx vitest run 2>&1 | tail -5
```

Expected: 0, 0, and vitest at `M6C_VITEST_FLOOR`. This file has the most test surface of the Layer 2 set — confirm the floor did not drop.

- [ ] **Step 6: Commit**

```bash
git add components/answer-form.tsx
git commit -m "feat(m6c): add focus-visible to answer-form inputs, slider and submit

Sliders get focus-visible but NO sizing: excluded from the tap-target sweep
under SC 2.5.8's UA-default exception (ruling S1-a).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `components/marketing/site-header.tsx` — ADD `aria-hidden`

**Files:**
- Modify: `components/marketing/site-header.tsx` (33 lines)

**Interfaces:**
- Consumes: nothing. **Produces:** `aria-hidden="true"` present on the header glyph, asserted by acceptance check 9.

⚠️ **This file holds ONE of the five blessed `--color-berry` sites** — the middle `<circle>` of the glyph, `className="text-berry"`, pre-edit anchor `:11`. **This task's own edit shifts it to `:12` or `:13`.** Do not touch it, and never assert it by line number.

⚠️ **Do NOT change the `<a href="/sign-in">` element.** It already carries the focus-visible pattern.

- [ ] **Step 1: Add both attributes to the glyph `<svg>`**

Locate by content — the `<svg` opening tag containing `viewBox="0 0 32 32"`. Add the two attributes one per line, matching the file's existing one-attribute-per-line format, so the opening tag reads:

```tsx
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="h-[26px] w-[26px] shrink-0 text-ink"
        >
```

Rationale (ruling S3-4, ruled after reading the code): the glyph sits immediately beside the literal text "XP Gathering". It carries no information the wordmark does not already give — decorative by construction, so hiding it is correct and **no accessible name is needed**. `focusable="false"` suppresses the legacy IE/Edge SVG tab stop.

- [ ] **Step 2: Verify the berry site survived, BY CONTENT**

```bash
grep -n "text-berry" components/marketing/site-header.tsx
grep -c "berry" components/marketing/site-header.tsx
grep -c "#8E2B3E\|berry-tint" components/marketing/site-header.tsx
```

Expected: exactly **one** `text-berry` hit (its line number will have shifted — that is correct and expected), `1` total berry hit, and `0` hardcoded hex or tint.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
npx next build 2>&1 | tail -5; echo "build exit=$?"
```

Expected: 0, 0, exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/marketing/site-header.tsx
git commit -m "feat(m6c): mark the header glyph decorative (aria-hidden + focusable=false)

Ruling S3-4: the glyph sits beside the literal wordmark 'XP Gathering' and
carries nothing it doesn't. Decorative by construction — no accessible name needed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: `components/marketing/chain-viz.tsx` — DELETE `aria-hidden` + `rounded-card` ⚠️ ONE PASS

**Files:**
- Modify: `components/marketing/chain-viz.tsx` (77 lines)

**Interfaces:**
- **Consumes: `rounded-card`, produced by Task 1.** This task MUST NOT run before Task 1 is committed.
- Produces: `aria-hidden` absent from the ChainViz wrapper (check 9) and one of the two `rounded-card` sites (check 11).

### ⚠️⚠️ THE LINE-SHIFT HAZARD — READ BEFORE EDITING

The two edits are on **adjacent lines**: `aria-hidden="true"` at `:14` and `className="rounded-xl …"` at `:15`, both inside the same multi-line `<div`. **Deleting `:14` shifts `:15` up to `:14`.** An implementer who deletes `:14` and then seeks `:15` edits the wrong line.

**Do both edits in ONE pass by matching the strings.** Never seek an absolute line number in this file.

**This file also holds THREE of the five blessed `--color-berry` sites** — the filled node, the active label, and the "the break" tag, pre-edit anchors `:27/:37/:45`. **This task's own edit shifts all three to `:26/:36/:44`.** Do not touch them, and never assert them by line number.

- [ ] **Step 1: Replace the whole opening `<div` element in one content-matched edit**

Locate by content — this exact four-line block:

```tsx
    <div
      aria-hidden="true"
      className="rounded-xl border border-line bg-white px-[26px] py-7 shadow-sm"
    >
```

Replace it with:

```tsx
    <div className="rounded-card border border-line bg-white px-[26px] py-7 shadow-sm">
```

That is a single edit: the attribute is deleted and `rounded-xl` becomes `rounded-card` in the same operation. **Do not perform two sequential line-targeted edits.**

Rationale (ruling S3-4): the attribute currently hides a real `<h2>` ("How your church is read") and a real `<ol>` of five named stages including the berry "the break" tag — the panel's entire point. Hiding an `<h2>` also drops it from the document outline. This is exactly the one-attribute change M6b's semantic markup was written to enable.

⚠️ **There is a SECOND `aria-hidden="true"` in this file** — on the decorative connector `<span>` between stages (pre-edit `:52`, className contains `absolute left-[12.5px]`). **That one is correct and must be LEFT IN PLACE.** It hides a purely visual connector line.

- [ ] **Step 2: Verify exactly the right `aria-hidden` was removed**

```bash
grep -n "aria-hidden" components/marketing/chain-viz.tsx
grep -n "rounded-xl\|rounded-card" components/marketing/chain-viz.tsx
```

Expected: exactly **one** `aria-hidden` hit, and it is on the connector `<span>` (the line whose className contains `absolute left-[12.5px]`), **not** on the wrapper `<div>`. Exactly **one** radius hit, and it is `rounded-card`. **`rounded-xl` must return zero hits.**

- [ ] **Step 3: Verify the three berry sites survived, BY CONTENT**

```bash
grep -c "berry" components/marketing/chain-viz.tsx
grep -n "bg-berry" components/marketing/chain-viz.tsx
grep -c "#8E2B3E\|berry-tint" components/marketing/chain-viz.tsx
```

Expected: **`3`** berry hits total, exactly **one** `bg-berry`, and `0` hardcoded hex or tint. Their line numbers will have shifted by −3 — that is correct and expected.

- [ ] **Step 4: Verify `rounded-card` actually resolves BY RUNNING**

```bash
npx next build 2>&1 | tail -5; echo "build exit=$?"
```

Expected: exit 0. If `--radius-card` were missing from `@theme`, Tailwind would emit no rule for `rounded-card` and the card would render square — confirm Task 1 is committed before trusting this step.

- [ ] **Step 5: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 6: Commit**

```bash
git add components/marketing/chain-viz.tsx
git commit -m "feat(m6c): unhide ChainViz from a11y tree; adopt rounded-card

Ruling S3-4: the attribute hid a real <h2> + <ol> of five named stages —
the panel's whole point — and dropped the h2 from the document outline.
The decorative connector span keeps its own aria-hidden.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: `components/marketing/how-it-works.tsx` — `rounded-card`

**Files:**
- Modify: `components/marketing/how-it-works.tsx` (47 lines)

**Interfaces:**
- **Consumes: `rounded-card`, produced by Task 1.** This task MUST NOT run before Task 1 is committed.
- Produces: the second of the two `rounded-card` sites (check 11).

⚠️ **This file already contains a raw U+2019** at `:5` (`so you’re compared to churches like yours`). It is one of the six pre-existing raw sites and **must be left exactly as-is** — do not convert, do not escape, do not touch.

⚠️ **`min-[861px]:grid-cols-3` at `:31` is the marketing-only breakpoint exception. Do not change it to `sm:`/`md:`/`lg:`.**

- [ ] **Step 1: Swap `rounded-xl` for `rounded-card`**

Locate by content — the `<li>` whose className is `rounded-xl border border-line bg-white px-6 py-[26px]`. Replace that className with:

```tsx
          <li key={step.n} className="rounded-card border border-line bg-white px-6 py-[26px]">
```

⚠️ **Do NOT touch the `aria-hidden="true"` on the step-number `<span>`** — it hides a purely decorative numeral that duplicates the `<ol>`'s own ordinal. It is correct.

- [ ] **Step 2: Verify the swap and the untouched neighbours**

```bash
grep -n "rounded-xl\|rounded-card" components/marketing/how-it-works.tsx
grep -n "min-\[861px\]" components/marketing/how-it-works.tsx
grep -cP "\x{2019}" components/marketing/how-it-works.tsx
grep -c "aria-hidden" components/marketing/how-it-works.tsx
```

Expected: one `rounded-card` and **zero** `rounded-xl`; the `min-[861px]:grid-cols-3` still present; `1` raw U+2019 line; `1` `aria-hidden`.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
npx next build 2>&1 | tail -5; echo "build exit=$?"
```

Expected: 0, 0, exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/marketing/how-it-works.tsx
git commit -m "feat(m6c): adopt rounded-card on the how-it-works cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: `components/marketing/hero.tsx` — apostrophes ×2

**Files:**
- Modify: `components/marketing/hero.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** 2 of the 7 converted apostrophes, counted by acceptance check 8.

⚠️ **This file holds ONE of the five blessed `--color-berry` sites** — the headline `<em className="italic text-berry">one thing</em>`, pre-edit anchor `:12`. It is **unaffected** by this task: both apostrophe edits are *below* it, so its line number does not shift. Do not touch it regardless.

**Why curly and why raw:** eslint `react/no-unescaped-entities` forbids a raw `'` in JSX text but **permits** raw `’`. Curly is the only convention writable without escaping — which is exactly why the straight sites are entity-escaped today.

- [ ] **Step 1: Convert `that&rsquo;s` in the headline**

Locate by content — the line `          that&rsquo;s actually stuck.` Replace it with:

```tsx
          that’s actually stuck.
```

- [ ] **Step 2: Convert `church&rsquo;s` in the privacy line**

Locate by content — the line containing `Results are private to your church&rsquo;s leadership.` Replace it with:

```tsx
          Results are private to your church’s leadership. You control who sees them.
```

- [ ] **Step 3: Verify the conversions BY RUNNING**

```bash
grep -c "&rsquo;\|&apos;" components/marketing/hero.tsx
grep -cP "\x{2019}" components/marketing/hero.tsx
grep -c "text-berry" components/marketing/hero.tsx
```

Expected: **`0`** entities, **`2`** raw U+2019 lines, and **`1`** berry site still present.

- [ ] **Step 4: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0. eslint passing is the live proof that raw `’` is permitted.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/hero.tsx
git commit -m "style(m6c): convert hero &rsquo; entities to raw U+2019

Ruling Q4: one apostrophe convention app-wide, raw curly. Note this is a
deliberate typographic IMPROVEMENT over the prototype (which has straight
0x27), not a fidelity restoration — see the eng spec correction in Task 22.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: `app/app/[churchId]/invite-panel.tsx` — apostrophe ×1

**Files:**
- Modify: `app/app/[churchId]/invite-panel.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** 1 of the 7 converted apostrophes, counted by acceptance check 8.

- [ ] **Step 1: Convert `we&apos;ll`**

Locate by content — the line `        Their email (optional — we&apos;ll email the link)`. Replace it with:

```tsx
        Their email (optional — we’ll email the link)
```

- [ ] **Step 2: Verify**

```bash
grep -c "&rsquo;\|&apos;" "app/app/[churchId]/invite-panel.tsx"
grep -cP "\x{2019}" "app/app/[churchId]/invite-panel.tsx"
```

Expected: `0` and `1`.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 4: Commit**

```bash
git add "app/app/[churchId]/invite-panel.tsx"
git commit -m "style(m6c): convert invite-panel &apos; to raw U+2019

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17: `app/app/[churchId]/diagnosis/report.tsx` — focus-visible + apostrophes ×3

**Files:**
- Modify: `app/app/[churchId]/diagnosis/report.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** 3 of the 7 converted apostrophes, counted by acceptance check 8.

⚠️ **This file does NOT own "Download PDF"** — that lives in `app/app/[churchId]/diagnosis/page.tsx` and belongs to Task 7. Confirmed by running `grep -rn "Download PDF"`. **Do not add, move, or edit it here.**

This file is one of the three the old `<Link>`-blind scan missed.

- [ ] **Step 1: Add focus-visible to the one `<Link>`**

Locate by content — the `<Link>` whose className is `font-body text-sm text-ink underline underline-offset-2 hover:opacity-80` (inside the "No diagnosis yet" branch). Replace that className with:

```tsx
        className="font-body text-sm text-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
```

- [ ] **Step 2: Convert `hasn&apos;t`**

Locate by content — the line containing `This assessment hasn&apos;t been diagnosed yet.` Replace it with:

```tsx
      <p className="font-body text-ink-soft">This assessment hasn’t been diagnosed yet.</p>
```

- [ ] **Step 3: Convert `Don&apos;t`**

Locate by content — the line containing `Don&apos;t work on the faded stages yet.` Replace it with:

```tsx
        <p className="font-body text-sm text-ink-soft">Don’t work on the faded stages yet.</p>
```

- [ ] **Step 4: Convert `it&apos;s`**

Locate by content — the line containing `What it&apos;s costing you`. Replace it with:

```tsx
      <h2 className="font-display text-xl text-ink">What it’s costing you</h2>
```

- [ ] **Step 5: Verify all four edits BY RUNNING**

```bash
grep -c "&rsquo;\|&apos;" "app/app/[churchId]/diagnosis/report.tsx"
grep -cP "\x{2019}" "app/app/[churchId]/diagnosis/report.tsx"
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/app/[churchId]/diagnosis/report.tsx"
grep -c "focus-visible:outline-ink" "app/app/[churchId]/diagnosis/report.tsx"
grep -c "Download PDF" "app/app/[churchId]/diagnosis/report.tsx"
```

Expected: `0` entities, `3` raw U+2019 lines, `1` interactive element, `1` pattern application, **`0`** "Download PDF".

- [ ] **Step 6: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
npx vitest run 2>&1 | tail -5
```

Expected: 0, 0, and vitest at `M6C_VITEST_FLOOR`. If any test asserts on report copy, a changed apostrophe byte will surface here — that is the one place in M6c where a text edit can legitimately move a test. If a test fails on the apostrophe byte, update the **assertion's** expected string to the curly form; do not revert the source.

- [ ] **Step 7: Commit**

```bash
git add "app/app/[churchId]/diagnosis/report.tsx"
git commit -m "feat(m6c): focus-visible on the report back-link; 3 apostrophes to raw U+2019

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: `app/respond/[token]/page.tsx` — apostrophe ×1

**Files:**
- Modify: `app/respond/[token]/page.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** the last of the 7 converted apostrophes, counted by acceptance check 8.

**This is the route probed in Task 21** — the respondent-facing survey, the most phone-used surface in the product.

- [ ] **Step 1: Convert `isn&apos;t`**

Locate by content — the line containing `This link isn&apos;t valid`. Replace it with:

```tsx
      <h1 className="font-display text-2xl text-ink">This link isn’t valid</h1>
```

- [ ] **Step 2: Verify**

```bash
grep -c "&rsquo;\|&apos;" "app/respond/[token]/page.tsx"
grep -cP "\x{2019}" "app/respond/[token]/page.tsx"
```

Expected: `0` and `1`.

- [ ] **Step 3: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 4: Commit**

```bash
git add "app/respond/[token]/page.tsx"
git commit -m "style(m6c): convert respond-page &apos; to raw U+2019

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 19: `app/accept/[token]/page.tsx` — focus-visible ×3

**Files:**
- Modify: `app/accept/[token]/page.tsx`

**Interfaces:**
- Consumes: nothing. **Produces:** nothing consumed by other tasks.

**This file is the one the Layer 2 map grew by** at spec self-review — the old `<Link>`-blind scan reported the focus-visible gap as 8 files instead of 11, and this file was invisible to it.

⚠️ **This file already contains four raw U+2019 sites** (`You’ve`, `You’re`, …). They are pre-existing and correct — **leave every one exactly as-is.**

⚠️ **The seven `<h1>` elements in this file are SEVEN MUTUALLY EXCLUSIVE early-return branches** — exactly one renders per request. The `<h1>` audit is **CLOSED CLEAN**. Do not "fix" them, do not consolidate them.

- [ ] **Step 1: "Go to your churches" (already-accepted branch) — focus-visible**

Locate by content — the `<Link href="/app" …>Go to your churches</Link>` line. Replace that element with:

```tsx
      <Link href="/app" className="font-body text-sm text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Go to your churches</Link></main>
```

- [ ] **Step 2: "Sign in to accept" — focus-visible**

Locate by content — the `<Link>` whose className is `rounded-md border border-line bg-ink px-4 py-2 text-center font-body text-paper transition-opacity hover:opacity-90`. Replace that className with:

```tsx
          className="rounded-md border border-line bg-ink px-4 py-2 text-center font-body text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
```

- [ ] **Step 3: "Go to sign in" (wrong-account branch) — focus-visible**

Locate by content — the `<Link href="/sign-in" …>Go to sign in</Link>` line. Replace that element with:

```tsx
        <Link href="/sign-in" className="font-body text-sm text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Go to sign in</Link>
```

- [ ] **Step 4: Verify all three and the untouched apostrophes**

```bash
grep -cE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" "app/accept/[token]/page.tsx"
grep -c "focus-visible:outline-ink" "app/accept/[token]/page.tsx"
grep -cP "\x{2019}" "app/accept/[token]/page.tsx"
grep -c "&rsquo;\|&apos;" "app/accept/[token]/page.tsx"
```

Expected: `3`, `3`, **`4`** raw U+2019 lines (unchanged), `0` entities.

- [ ] **Step 5: Run the gates**

```bash
npx tsc --noEmit && echo "tsc OK"
npx eslint . && echo "eslint OK"
```

Expected: 0 and 0.

- [ ] **Step 6: Commit**

```bash
git add "app/accept/[token]/page.tsx"
git commit -m "feat(m6c): add focus-visible to the three accept-page links

This file was invisible to the s88 scan, which matched raw tags only and
missed <Link>. It is why the focus-visible gap is 11 files, not 8.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# VERIFICATION — runs after ALL of Layer 2, before Layer 3

## Task 20: Acceptance checks 2, 3, 4, 6, 7, 8, 9, 10, 11 — static greps + the 375px probe

**Files:**
- Create: `.superpowers/sdd/m6c-acceptance.md` (UNTRACKED — evidence record, never committed)
- Modify: none

**Interfaces:**
- Consumes: every Layer 1 and Layer 2 commit.
- Produces: the pass/fail evidence the whole-branch review reads.

⚠️ **NEVER run `npm run test:db`.** It wipes the local e2e fixtures.

- [ ] **Step 1: Check 2 — focus-visible gap is zero, using the EOL-safe sweep VERBATIM**

The old `<Link>`-blind command under-reports by 3. Run this exact command and no other:

```bash
for f in $(grep -rlE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" app/ components/ --include="*.tsx"); do
  grep -q "focus-visible" "$f" || echo "$f"
done
```

Expected: **no output at all** (was 11 files).

- [ ] **Step 2: Check 7 — the berry guardrail, asserted by COUNT and CONTENT, never by line**

```bash
grep -rn "berry" app/ components/ | grep -vc "berry-deep"
grep -rn "berry" app/ components/
grep -rc "bg-berry" app/ components/ --include="*.tsx" | grep -v ":0"
grep -rc "#8E2B3E" app/ components/ | grep -v ":0"
grep -rc "berry-tint" app/ components/ | grep -v ":0"
```

Expected: exactly **five** `--color-berry` hits in exactly **two** marketing files — **one** in `hero.tsx` (the headline `<em>`), **one** in `site-header.tsx` (the glyph middle `<circle>`), **three** in `chain-viz.tsx` (filled node, active label, "the break" tag). Exactly **one** `bg-berry`, in `chain-viz.tsx`. **Zero** `#8E2B3E`. **Zero** `berry-tint`.

⚠️ Pre-edit anchors were `hero.tsx:12`, `site-header.tsx:11`, `chain-viz.tsx:27/37/45`. **Four of the five legitimately shifted** during M6c (§6.7) — `site-header.tsx:11`→`:12`/`:13` and `chain-viz.tsx` by −3. **A line-pinned assertion here would fail a CORRECT implementation.** Assert count and content only.

(`text-berry` / `border-berry` on error text elsewhere uses `berry-deep` or is inside the five — inspect the full listing manually against the five described sites rather than trusting the count alone.)

- [ ] **Step 3: Check 8 — apostrophes**

```bash
grep -rc "&apos;" app/ components/ | grep -v ":0"
grep -rc "&rsquo;" app/ components/ | grep -v ":0"
grep -rnP "\x{2019}" app/ components/ | wc -l
```

Expected: **no output** from the first two (both = 0 everywhere), and **`13`** from the third.

⚠️ **13, not 12.** The count includes the pre-existing `app/app/[churchId]/actions.ts:87` (`your church’s weekend attendance band`) — a **`.ts`** file. **Restrict nothing to `.tsx`.** 6 pre-existing + 7 converted = 13.

- [ ] **Step 4: Checks 9 and 11 — aria-hidden and rounded-card**

```bash
grep -n "aria-hidden" components/marketing/site-header.tsx
grep -n "aria-hidden" components/marketing/chain-viz.tsx
grep -rn "rounded-card" app/ components/
grep -rc "rounded-xl" app/ components/ | grep -v ":0"
```

Expected: `aria-hidden` **present** on the header glyph `<svg>`; in `chain-viz.tsx` present **only** on the decorative connector `<span>` and **absent** from the wrapper `<div>`; `rounded-card` at exactly **2** sites (`chain-viz.tsx`, `how-it-works.tsx`); **no output** for `rounded-xl` (= 0).

- [ ] **Step 5: Build and serve the production bundle for the browser checks**

```bash
npx next build 2>&1 | tail -5; echo "build exit=$?"
npx next start -p 3100
```

Expected: exit 0, server listening on 3100. This is the same method the session-90 probe used — do not substitute `next dev`, whose styles and hydration differ.

- [ ] **Step 6: Check 4 — zero horizontal overflow at 375px on all 8 previously-probed routes**

Set the viewport to **375×812**. Mint auth in-page by replicating `scripts/forge-auth-cookie.mjs` (source `.env.local` first). For each of `/`, `/sign-in`, `/get-started`, `/app/[churchId]`, `/app/[churchId]/answer/guest`, `/app/[churchId]/diagnosis`, `/app/[churchId]/access`, `/respond/<id>` (invalid state), evaluate:

```js
({
  scrollWidth: document.documentElement.scrollWidth,
  overflowers: [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > 375).length,
  h1: document.querySelectorAll('h1').length,
})
```

Expected on all 8, matching the session-90 baseline exactly: `scrollWidth === 375`, `overflowers === 0`, `h1 === 1`.

- [ ] **Step 7: Check 3 — the 12 fixed tap-target sites measure ≥28px**

On `/app/[churchId]`, `/app/[churchId]/diagnosis`, `/app/[churchId]/access`, evaluate:

```js
[...document.querySelectorAll('a, button, input, select, textarea')]
  .filter(el => el.type !== 'range' && el.type !== 'hidden')
  .map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 28),
                h: +el.getBoundingClientRect().height.toFixed(1),
                w: +el.getBoundingClientRect().width.toFixed(1) }))
  .filter(m => m.h < 28 || m.w < 24)
```

Expected: **`[]`** on all three routes — 0 sub-24px controls, and each of the 12 fixed sites at **≥28px** (the plan's padding choices land them at 32px), not sitting on the 24px WCAG floor.

**The 5 `<input type="range">` on `/app/[churchId]/answer/guest` are EXCLUDED** (SC 2.5.8 UA-default exception) — the filter above drops them by design. Do not "fix" them.

- [ ] **Step 8: Check 10 — the skip link**

On `/`, press `Tab` once from a fresh load and evaluate:

```js
({ active: document.activeElement.textContent.trim(),
   href: document.activeElement.getAttribute('href'),
   visible: document.activeElement.getBoundingClientRect().height > 0,
   targetExists: !!document.getElementById('main-content') })
```

Expected: `active: "Skip to content"`, `href: "#main-content"`, `visible: true` (it leaves `sr-only` on focus), `targetExists: true`.

- [ ] **Step 9: Check 6 — reduced motion**

Emulate `prefers-reduced-motion: reduce`, then on `/` evaluate:

```js
getComputedStyle(document.querySelector('a[href="/sign-in"]')).transitionDuration
```

Expected: `"0.0001s"` (0.01ms) — proving the backstop wins over the element's `transition-colors`.

- [ ] **Step 10: Record the evidence and stop the server**

Write every command and its actual output into `.superpowers/sdd/m6c-acceptance.md`. **Do not `git add` it** — `.superpowers/` stays untracked. Then stop the `next start` process.

- [ ] **Step 11: No commit**

This task produces no tracked change. If any check fails, fix it in the owning Layer 2 task's file and re-run this task from Step 1.

---

## Task 21: Acceptance check 5 — the `/respond` valid-survey probe, additively

**⛔ REQUIRES EXPLICIT GO-AHEAD FROM NATALIE BEFORE RUNNING. It writes to the local database.**

**Files:**
- Modify: none. Touches local DB rows only, additively.

**Interfaces:**
- Consumes: Task 18's committed change to `app/respond/[token]/page.tsx`.
- Produces: the one coverage gap closed — the respondent-facing survey's mobile layout, the most phone-used surface in the product and the only route whose 375px behaviour was unproven.

**Why this is needed:** all 24 fixture invitations are `status=completed`, so every existing token renders the invalid-link state. The valid survey could not be probed in session 90.

⚠️ **NEVER run `npm run test:db`.** ⚠️ **No existing fixture row may be mutated** — the rejected alternative (flipping a row to `pending`) could strand a real fixture row in the wrong state if the session were interrupted.

**Schema fact you need (verified by reading `supabase/migrations/20260715000100_schema.sql:43`):**
`public.invitations` has **no token column — the `id` IS the token.** `/respond/[token]` resolves it via
`supabase.rpc('get_invitation_context', { p_token: token })`. So the `id` returned by the INSERT *is* the URL segment.

Required non-null columns: `run_id`, `church_id`, `category_id`, `created_by`. `status` defaults to
`'pending'` and `expires_at` defaults to `now() + interval '30 days'` — both already correct for this probe.

- [ ] **Step 1: Start the local stack and record the exact pre-state**

```bash
supabase start
export PGURL="$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
psql "$PGURL" -c "
SELECT (SELECT count(*) FROM public.churches)         AS churches,
       (SELECT count(*) FROM public.assessment_runs)  AS runs,
       (SELECT count(*) FROM public.invitations)      AS invitations,
       (SELECT count(*) FROM public.diagnoses)        AS diagnoses,
       (SELECT count(*) FROM public.report_shares)    AS report_shares,
       (SELECT count(*) FROM public.churches WHERE name ILIKE '%Redwood%') AS redwood;"
```

Expected: `1 church / 1 run / 24 invitations / 1 diagnosis / 0 report_shares`, `redwood = 1`. **If it differs, STOP** — the fixtures have already drifted and this probe would compound it.

⚠️ **`supabase start` only. NEVER `npm run test:db`** — that wipes these exact fixtures.

- [ ] **Step 2: INSERT one throwaway invitation against the existing run**

This is a plain DML INSERT — **not a migration.** Migrations stay append-only and none is added here. It reuses the existing run, church, and creator; **it mutates no existing row.**

```bash
psql "$PGURL" -v ON_ERROR_STOP=1 -t -A -c "
INSERT INTO public.invitations (run_id, church_id, category_id, invited_name, created_by)
SELECT r.id, r.church_id, 'guest_experience', 'M6C PROBE — DELETE ME', r.created_by
  FROM public.assessment_runs r
 ORDER BY r.created_at
 LIMIT 1
RETURNING id;"
```

**Record the returned uuid as `PROBE_TOKEN`** — it is both the row id and the URL token.

Verify it is the only probe row and the count moved by exactly one:

```bash
psql "$PGURL" -c "SELECT count(*) FROM public.invitations;"
psql "$PGURL" -c "SELECT id, status, invited_name FROM public.invitations WHERE invited_name = 'M6C PROBE — DELETE ME';"
```

Expected: **25** invitations (was 24), and exactly **one** probe row with `status = 'pending'`.

⚠️ If `category_id = 'guest_experience'` is rejected or renders no items, read the seeded category ids with
`psql "$PGURL" -c "SELECT DISTINCT category_id FROM public.invitations;"` and reuse one of those verbatim.

- [ ] **Step 3: Probe `/respond/$PROBE_TOKEN` at 375px**

With `npx next build && npx next start -p 3100` and the viewport at 375×812, load `http://127.0.0.1:3100/respond/$PROBE_TOKEN` (no auth needed — the route is anon-callable) and evaluate the same expression as Task 20 Step 6:

```js
({
  scrollWidth: document.documentElement.scrollWidth,
  overflowers: [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > 375).length,
  h1: document.querySelectorAll('h1').length,
})
```

Expected: `scrollWidth === 375`, `overflowers === 0`, `h1 === 1`. Also confirm the survey itself renders (the sliders and the submit button are present) rather than the invalid-link state.

- [ ] **Step 4: DELETE the throwaway row BY ID**

Delete **by the uuid captured in Step 2** — never by a predicate that could match a real fixture row.

```bash
psql "$PGURL" -v ON_ERROR_STOP=1 -c "DELETE FROM public.invitations WHERE id = '<PROBE_TOKEN>';"
```

Expected: `DELETE 1`. **If it reports anything other than 1, STOP and investigate before doing anything else.**

- [ ] **Step 5: Re-assert the fixture counts and the positive control**

```bash
psql "$PGURL" -c "
SELECT (SELECT count(*) FROM public.churches)        AS churches,
       (SELECT count(*) FROM public.assessment_runs) AS runs,
       (SELECT count(*) FROM public.invitations)     AS invitations,
       (SELECT count(*) FROM public.diagnoses)       AS diagnoses,
       (SELECT count(*) FROM public.report_shares)   AS report_shares,
       (SELECT count(*) FROM public.churches WHERE name ILIKE '%Redwood%') AS redwood,
       (SELECT count(*) FROM public.invitations WHERE invited_name = 'M6C PROBE — DELETE ME') AS leftovers;"
```

Expected: back to `1 / 1 / 24 / 1 / 0`, `redwood = 1` (the positive control present), and **`leftovers = 0`**.

- [ ] **Step 6: Record the evidence, no commit**

Append the pre-state, the probe output, and the post-state to `.superpowers/sdd/m6c-acceptance.md`. **Untracked — do not `git add`.**

**Still unreachable and accepted as-is:** `/accept/[token]` valid invite (no pending membership invite in fixtures) and `/r/[shareToken]` valid share (`report_shares = 0`).

---

# LAYER 3 — DOCS, RUNS LAST

Layer 3 records **what actually shipped**. It must not start until Tasks 20 and 21 have passed, so it describes reality rather than intent. It touches **no source files**.

**Rule:** facts about the product live in `docs/XPG-Engineering-Spec.md`; decisions about M6c live in the spec.

## Task 22: `docs/XPG-Engineering-Spec.md` — path corrections + the five narrative corrections

**Files:**
- Modify: `docs/XPG-Engineering-Spec.md`

**Interfaces:**
- Consumes: the shipped state proven by Tasks 20 and 21.
- Produces: acceptance check 12.

- [ ] **Step 1: Fix the five stale `report` → `diagnosis` path references**

Lines **32, 62, 452, 464, 537** say `/app/[churchId]/report`. The directory is `diagnosis`. Change each to `/app/[churchId]/diagnosis`.

- [ ] **Step 2: Fix line 454 — the self-contradiction**

Line 454 says `POST /api/report-share`. **No such route exists** — sharing is server actions in `diagnosis/actions.ts`, and **line 78 of the same document already says so**. Correct line 454 to describe the server actions, matching line 78.

- [ ] **Step 3: Fix line 452 — the component path**

Line 452 places the component at `/lib/report/render.tsx`. Verify by running, then fix:

```bash
ls "app/app/[churchId]/diagnosis/report.tsx"
ls lib/report/render.tsx 2>&1 | tail -1
```

Expected: the first exists, the second does not. Change the reference to `app/app/[churchId]/diagnosis/report.tsx`.

- [ ] **Step 4: ⚠️ LEAVE lines 38 and 453 ALONE**

Lines **38 and 453** reference `/api/report/[runId]/pdf`. **That route genuinely EXISTS** (`app/api/report/[runId]/pdf/route.ts`). **They are NOT stale.** Confirm and move on:

```bash
ls "app/api/report/[runId]/pdf/route.ts"
find app/api -name route.ts
```

Expected: the file exists, and `find` returns exactly two routes — that one and `app/api/respond/[token]/route.ts`.

- [ ] **Step 5: Add the five narrative corrections**

A future "restore prototype fidelity" pass would otherwise undo M6c's work, so each is written down with its reason:

1. **Marketing content carries THREE sanctioned edits from the prototype, not two:** `Cairn` → `XP Gathering`; the ghost CTA relabelled `See a completed assessment` → `See how it works`; and **curly apostrophes throughout**. Commit `53e364b`'s message and the M6b ledger's Task-5 note claim the change "restored the prototype's typographic `’`" — the prototype has **straight `0x27`** at all three sites, so the record is backwards. The third edit is a deliberate typographic **improvement**, not a fidelity restoration. ⚠️ **`53e364b` is merged into `origin/master`; this correction is DOCUMENTATION, never history rewriting.**
2. **`--ink-faint` is deliberately NOT adopted** — measured **3.23:1** on paper `#FBF9F5` vs `ink-soft`'s **6.65:1**, and all prototype uses are 8.5–13px small text, so the 3:1 large-text allowance never applies. Adopting it would have introduced a WCAG 1.4.3 AA failure.
3. **`--radius-card: 14px` is adopted**, at the two marketing card sites only.
4. **`min-[861px]:` is a marketing-only typographic exception**, explicitly NOT a codebase convention; app routes use the standard Tailwind scale.
5. **Range sliders are excluded** from the tap-target sweep under SC 2.5.8's UA-default exception.

- [ ] **Step 6: Check 12 — verify**

```bash
grep -c "/app/\[churchId\]/report" docs/XPG-Engineering-Spec.md
grep -c "report-share" docs/XPG-Engineering-Spec.md
grep -c "lib/report/render" docs/XPG-Engineering-Spec.md
grep -c "api/report/\[runId\]/pdf" docs/XPG-Engineering-Spec.md
```

Expected: **`0`**, `0`, `0`, and **`2`** (lines 38 and 453 — still there, correctly).

- [ ] **Step 7: Commit**

```bash
git add docs/XPG-Engineering-Spec.md
git commit -m "docs(m6c): correct stale report paths and record five narrative decisions

Fixes /app/[churchId]/report -> diagnosis (5 sites), the POST /api/report-share
self-contradiction against line 78, and the /lib/report/render.tsx component path.
Leaves /api/report/[runId]/pdf alone — that route exists.

Records: three sanctioned prototype content edits (not two); --ink-faint
won't-fix with the measurement; --radius-card adopted; min-[861px] as a
marketing-only exception; slider exclusion under SC 2.5.8.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 23: `.superpowers/sdd/progress.md` — close the inherited items

**Files:**
- Modify: `.superpowers/sdd/progress.md` — **UNTRACKED, NEVER COMMITTED**

**Interfaces:**
- Consumes: everything above.
- Produces: the ledger state a fresh session reads.

- [ ] **Step 1: Close the six inherited "Deferred — do NOT fold into M6b" rows**

Mark each with what actually shipped: ChainViz `aria-hidden` (deleted), header glyph `aria-hidden` (added), `--ink-faint` (**closed WON'T-FIX with the 3.23:1 vs 6.65:1 measurement**), 14px radius (**adopted as `--radius-card`**), stale eng-spec `report` path (fixed), responsive + a11y sweep (shipped). Mark the prose cache-check row as **fixed by the standalone hotfix that merged before M6c**.

- [ ] **Step 2: Close the two M6b Minors**

Both apostrophe Minors are superseded together by ruling Q4 — one convention app-wide, raw curly, 7 edits across 4 files, with the inverted narrative corrected in the eng spec (Task 22) rather than by rewriting history.

- [ ] **Step 3: Record the gate results and the acceptance evidence pointer**

Record the captured `M6C_VITEST_FLOOR`, the tsc/eslint/build results, the pgTAP justified skip, and a pointer to `.superpowers/sdd/m6c-acceptance.md`.

- [ ] **Step 4: Verify `.superpowers/` is still untracked**

```bash
git status --porcelain
```

Expected: **no line beginning `.superpowers/`.** If one appears, it has been accidentally staged — unstage it. `.superpowers/` must never enter a commit.

- [ ] **Step 5: No commit**

This task deliberately produces no tracked change.

---

## Task 24: Final gates and review handoff

**Files:** none.

**Interfaces:**
- Consumes: every task above.
- Produces: acceptance check 1 and the diff package the whole-branch review reads.

- [ ] **Step 1: Check 1 — run all four gates at the branch-time floors**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx eslint . 2>&1 | tail -5; echo "eslint exit=$?"
npx vitest run 2>&1 | tail -5
npx next build 2>&1 | tail -5; echo "build exit=$?"
```

Expected: `tsc exit=0` with 0 errors; `eslint exit=0` with 0 problems; vitest at **`M6C_VITEST_FLOOR` captured in Task 0 — NOT 166**; `build exit=0`.

**pgTAP: JUSTIFIED SKIP** — M6c adds zero SQL and zero migrations; the `/respond` probe row is DML, not a migration. Floor stays Files=19 / Tests=195. ⚠️ **NEVER run `npm run test:db`.**

- [ ] **Step 2: Generate the diff package for the review**

```bash
git log --oneline origin/master..HEAD
git diff origin/master...HEAD --stat
git diff origin/master...HEAD > /private/tmp/m6c-diff-package.txt
wc -l /private/tmp/m6c-diff-package.txt
```

Expected: the Task 0 docs commit, Task 1, Tasks 2–19, and Task 22 — **no commit touching `.superpowers/`**, `next.config.ts`, `vitest.config.ts`, or any migration.

- [ ] **Step 3: Confirm all 12 acceptance checks have recorded evidence**

Re-read `.superpowers/sdd/m6c-acceptance.md` and confirm every one of checks 1–12 has a command and its actual output. Any check without run output is **not passed**.

- [ ] **Step 4: Request the review**

Use `superpowers:requesting-code-review`, then ONE whole-branch review at the **most-capable tier** against the pre-generated diff package.

⚠️ **Copy the §9 testing position VERBATIM into the reviewer's constraints block**, together with the Global Constraints section of this plan. Without it, zero-new-tests returns as an Important finding — exactly as it would have on M6b.

- [ ] **Step 5: STOP — do not push**

**Push as MylesM18 on EXPLICIT go-ahead from Natalie ONLY.** Do not push, do not open a PR, do not merge without it. Never merge `chore/rename-cairn-to-xpg`.

---

## ✅ RESOLVED — "twin controls" — Natalie ruled **(A) INCLUDE BOTH TWINS**, session 95

**This is a decision, not a proposal. Do not re-ask.** Tasks 5 and 8 have already been rewritten to carry it: `py-2` on "Revoke", `py-1.5` on "Revoke share link". The spec's tap-target count becomes **12 probe-measured + 2 twins = 14 fixed sites**, of which acceptance check 3 can prove only the 12 — the two twins are evidenced by their byte-identical class strings and their measured twins. **This does not amend the approved spec's §6.3 list**; it extends it, and Task 22 Step 5 should record it as a sixth narrative note.

The record of why, below, is kept for the reviewer.

The spec's tap-target list is **12 sites**, taken from the session-90 375px probe. The probe could only measure what the fixtures render. Two controls have **byte-identical styling to controls that ARE in the list**, but were unreachable:

| Unreachable twin | File | Identical to | Why unreachable |
|---|---|---|---|
| "Revoke" | `access/revoke-invite-button.tsx` | "Remove" (43×16, in the list) | no pending member invitation in fixtures |
| "Revoke share link" | `diagnosis/share-control.tsx` | "Create share link" (106×20, in the list) | `report_shares = 0` in fixtures |

Both will render at the same sub-24px height as their twins in production. **Neither is catchable by acceptance check 3**, because the probe cannot reach either state.

**Options as presented (A was chosen):**

- **(A) Include both twins** ⬅ **CHOSEN** — add `py-2` to "Revoke" and `py-1.5` to "Revoke share link". Both files are **already owned** by Tasks 5 and 8, so there is **no file-ownership conflict and no new task**. Cost: 2 utility classes. *This is my recommendation* — M6c is the last milestone, and shipping a known sub-24px control that the acceptance check structurally cannot see is the kind of thing that never gets fixed.
- **(B) Hold the spec's 12 exactly** — ship the twins un-padded and record them in the ledger as known-deferred.

~~The plan as written implements (B).~~ **Superseded: the plan now implements (A).** Tasks 5 and 8 carry the ruling inline.

---

## Execution order summary

```
[PREREQUISITE: prose cache hotfix merges to origin/master — separate branch, separate review]
        ↓
Task 0   Branch off origin/master · capture M6C_VITEST_FLOOR by running · commit spec + plan
        ↓
Task 1   LAYER 1 — app/globals.css — SERIALIZED, ALONE   (produces `rounded-card`)
        ↓
Tasks 2–19  LAYER 2 — 18 files — FAN OUT, no two tasks share a file
            (Tasks 13 and 14 consume `rounded-card` — hard dependency on Task 1)
        ↓
Task 20  Acceptance checks 2,3,4,6,7,8,9,10,11 — static greps + 375px probe
Task 21  Acceptance check 5 — /respond additive probe  ⛔ EXPLICIT GO-AHEAD REQUIRED
        ↓
Task 22  LAYER 3 — docs/XPG-Engineering-Spec.md  (check 12)
Task 23  LAYER 3 — .superpowers/sdd/progress.md  (UNTRACKED, no commit)
        ↓
Task 24  Check 1 — final gates · diff package · whole-branch review  ⛔ NO PUSH WITHOUT GO-AHEAD
```
