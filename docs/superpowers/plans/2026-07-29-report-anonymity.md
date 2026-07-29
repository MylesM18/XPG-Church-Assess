# Report Anonymity + Privacy Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The diagnosis report never shows who answered what on any surface, and members are told their answers are private where they answer and where they accept an invite.

**Architecture:** Two independent changes. (A) Make respondent-list stripping in `lib/report/view.ts` unconditional so the `screen` audience matches the already-anonymous `pdf`/`shared` audiences. (B) A new static presentational component `components/anonymity-note.tsx` renders the approved copy once, shown on the answer page and the invite-accept `ready` state.

**Tech Stack:** Next.js (App Router, server components), React, TypeScript/TSX, Tailwind, Vitest 2.0.5 (node env). No new dependencies, no database migration.

**Source spec:** `docs/superpowers/specs/2026-07-29-report-anonymity-design.md` (commit `23a2753`, owner-approved).

## Global Constraints

- TS/TSX only. **No new database migration. No new dependencies.**
- Gates, all must pass: `npm run typecheck` (0 errors), `npm run lint` (0 errors), `npm test` (vitest). Current floor **460/460**; the new tests raise it (see each task). No test removed net-negative.
- **Vitest picks up `tests/**/*.test.ts` ONLY** (`vitest.config` `include: ['tests/**/*.test.ts']`, `environment: 'node'`). A `.test.tsx` file is NOT collected — every test file here ends in `.test.ts`. No DOM by default; component tests call the component as a function (the `tests/report/components.test.ts` pattern) and page tests read source via `fs` (the `tests/assessment/back-to-menu-link.test.ts` pattern).
- ⛔ Agent NEVER runs `npm run test:db`, `supabase db push|reset`; NEVER merges/pushes to `master` or force-pushes without Natalie. **No push and no PR without Natalie's go** — before the FIRST push, confirm whether this rides PR #34 or gets its own branch/PR (spec commit is local-only, so `origin/feat/diagnosis-report-reform` is still at `a315b26`).
- Git: explicit paths only. **NEVER `git add` `.claude/` or `docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md`** (the two permanent strays). Use `GIT_LITERAL_PATHSPECS=1` for any `[churchId]`/`[categoryId]`/`[token]` bracket path.
- Curly typography matches the codebase in JSX prose: em dash `—` (U+2014), curly apostrophe `’` (U+2019). A straight `'` in JSX text trips `react/no-unescaped-entities`; the approved copy's only apostrophe is `church’s` (curly).

## File Structure

- `components/anonymity-note.tsx` — **new**. Single source of the privacy copy. Presentational only: optional `className`, no data, no async, no interactivity. Muted styling mirrors `GatingFlags` (`system.tsx`): `font-body text-sm text-ink-soft`.
- `lib/report/view.ts` — **modify**. Unconditional `[]` for both respondent lists; drop `buildSystem`'s now-unused `opts` param + update its call site; delete the now-unused `const flag` in `buildReportView`; update the `buildReportView` doc comment.
- `app/app/[churchId]/answer/[categoryId]/page.tsx` — **modify**. Import + render `<AnonymityNote />` above `<SelfForm />`.
- `app/accept/[token]/page.tsx` — **modify**. Import + render `<AnonymityNote />` in the `ready` state.
- `tests/report/anonymity-note.test.ts` — **new**. Component copy test (function-call + text walk).
- `tests/assessment/answer-anonymity-note.test.ts` — **new**. Source tripwire: answer page imports + renders the note above the form.
- `tests/access/accept-anonymity-note.test.ts` — **new**. Source tripwire: accept page imports + renders the note in the ready state.
- `tests/report/audience.test.ts` — **modify**. Flip + strengthen + extend the three existing audience tests.

`app/app/[churchId]/diagnosis/report/system.tsx` — **no change**. `Disagreement` already guards `{respondents.length > 0 && …}`, so an always-empty array renders nothing while the heading + narrative stay.

---

### Task 1: `AnonymityNote` component

**Files:**
- Create: `components/anonymity-note.tsx`
- Test: `tests/report/anonymity-note.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function AnonymityNote(props: { className?: string }): JSX.Element` — a single `<p>` carrying the approved copy. Imported by Tasks 2 and 3 as `import { AnonymityNote } from '@/components/anonymity-note'`.

- [ ] **Step 1: Write the failing test**

Create `tests/report/anonymity-note.test.ts` (mirrors the function-call + `textOf` walk in `tests/report/components.test.ts` — no DOM, node env):

```ts
import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { AnonymityNote } from '../../components/anonymity-note';

/** Every string the tree would render, concatenated. Mirrors components.test.ts's textOf. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return '';
}

describe('AnonymityNote', () => {
  it('renders the approved privacy copy — the lead and the "never shown" promise', () => {
    const text = textOf(AnonymityNote({}));
    expect(text).toContain('Your answers are private.');
    expect(text).toContain('never shown to anyone');
    expect(text).toContain('combined results');
    expect(text).toContain('never who said what.');
  });

  it('appends a caller-supplied className without dropping the base muted styling', () => {
    const el = AnonymityNote({ className: 'mt-2' });
    const cls = (el.props as { className?: string }).className ?? '';
    expect(cls).toContain('font-body');
    expect(cls).toContain('text-ink-soft');
    expect(cls).toContain('mt-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/report/anonymity-note.test.ts`
Expected: FAIL — cannot resolve `../../components/anonymity-note` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `components/anonymity-note.tsx`:

```tsx
// A small, static, always-visible privacy callout. Single source of the approved copy so the two
// surfaces that show it (the answer page and the invite-accept 'ready' state) can never drift.
// Presentational only — no data, no async, no interactivity. Muted secondary styling mirrors the
// GatingFlags note in app/app/[churchId]/diagnosis/report/system.tsx: font-body text-sm text-ink-soft.
export function AnonymityNote({ className }: { className?: string }) {
  return (
    <p className={`font-body text-sm text-ink-soft${className ? ` ${className}` : ''}`}>
      <strong className="text-ink">Your answers are private.</strong>{' '}
      Your individual answers are never shown to anyone — the report shows only your church’s
      combined results, never who said what.
    </p>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/report/anonymity-note.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + lint the new files**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors. (Confirms no `react/no-unescaped-entities` issue — the only apostrophe is the curly `church’s`.)

- [ ] **Step 6: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add components/anonymity-note.tsx tests/report/anonymity-note.test.ts
git commit -m "feat(privacy): add AnonymityNote privacy callout component"
```

---

### Task 2: Render the note on the answer page

**Files:**
- Modify: `app/app/[churchId]/answer/[categoryId]/page.tsx`
- Test: `tests/assessment/answer-anonymity-note.test.ts`

**Interfaces:**
- Consumes: `AnonymityNote` from Task 1 (`@/components/anonymity-note`).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing test**

Create `tests/assessment/answer-anonymity-note.test.ts` (mirrors `tests/assessment/back-to-menu-link.test.ts` — source-reading tripwire, node env, no DOM. The page is an async server component that calls Supabase/auth, so it cannot be unit-rendered here; the source scan is the established pattern for pinning a static element on it):

```ts
// Source-reading tripwire (node env, no DOM): the answer page now shows the AnonymityNote privacy
// callout above the form. Mirrors tests/assessment/back-to-menu-link.test.ts.
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

describe('answer page privacy note', () => {
  it('imports the AnonymityNote component', () => {
    expect(answer, 'the answer page must import AnonymityNote').toContain(
      "import { AnonymityNote } from '@/components/anonymity-note'",
    )
  })

  it('renders <AnonymityNote /> above the form', () => {
    expect(answer, 'the note must be rendered').toContain('<AnonymityNote')
    // above the sliders: the note must appear before <SelfForm in source order.
    expect(
      answer.indexOf('<AnonymityNote'),
      'the note must sit above <SelfForm />',
    ).toBeLessThan(answer.indexOf('<SelfForm'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assessment/answer-anonymity-note.test.ts`
Expected: FAIL — the import assertion fails (page does not yet import/render `AnonymityNote`).

- [ ] **Step 3: Add the import**

In `app/app/[churchId]/answer/[categoryId]/page.tsx`, add the import after the existing `SelfForm` import (currently line 6 `import { SelfForm } from './self-form'`):

```tsx
import { AnonymityNote } from '@/components/anonymity-note'
```

- [ ] **Step 4: Render the note above the form**

In the same file, between the closing `</Link>` of the "← Back to menu" link and `<SelfForm`, insert the note. The current block is:

```tsx
        ← Back to menu
      </Link>
      <SelfForm
```

Change it to:

```tsx
        ← Back to menu
      </Link>
      <AnonymityNote />
      <SelfForm
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/assessment/answer-anonymity-note.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/app/[churchId]/answer/[categoryId]/page.tsx" tests/assessment/answer-anonymity-note.test.ts
git commit -m "feat(privacy): show AnonymityNote on the answer page"
```

---

### Task 3: Render the note on the invite-accept `ready` state

**Files:**
- Modify: `app/accept/[token]/page.tsx`
- Test: `tests/access/accept-anonymity-note.test.ts`

**Interfaces:**
- Consumes: `AnonymityNote` from Task 1 (`@/components/anonymity-note`).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing test**

Create `tests/access/accept-anonymity-note.test.ts` (source-reading tripwire; same pattern as Task 2):

```ts
// Source-reading tripwire (node env, no DOM): the invite-accept page shows the AnonymityNote
// privacy callout in its 'ready' state, next to the Accept button. Mirrors
// tests/assessment/back-to-menu-link.test.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const accept = stripComments(
  fs.readFileSync(path.join(ROOT, 'app', 'accept', '[token]', 'page.tsx'), 'utf8'),
)

describe('accept page privacy note (ready state)', () => {
  it('imports the AnonymityNote component', () => {
    expect(accept, 'the accept page must import AnonymityNote').toContain(
      "import { AnonymityNote } from '@/components/anonymity-note'",
    )
  })

  it('renders <AnonymityNote /> in the ready state, before the accept button', () => {
    expect(accept, 'the note must be rendered').toContain('<AnonymityNote')
    // <AcceptButton lives only in the ready branch; pin that the note precedes it in source order,
    // placing the note inside the ready state next to the button.
    expect(
      accept.indexOf('<AnonymityNote'),
      'the note must sit just before <AcceptButton />',
    ).toBeLessThan(accept.indexOf('<AcceptButton'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/access/accept-anonymity-note.test.ts`
Expected: FAIL — the import assertion fails.

- [ ] **Step 3: Add the import**

In `app/accept/[token]/page.tsx`, add the import after the existing `AcceptButton` import (currently line 4 `import { AcceptButton } from './accept-button'`):

```tsx
import { AnonymityNote } from '@/components/anonymity-note'
```

- [ ] **Step 4: Render the note in the `ready` state**

In the same file, the final `state === 'ready'` return currently reads:

```tsx
  // state === 'ready'
  return (
    <main id="main-content" tabIndex={-1} className={shell}>
      <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
      <p className="font-body text-ink-soft">Accept your invitation to help lead {p.church_name} as a {label}.</p>
      <AcceptButton token={token} />
    </main>
  )
```

Insert the note between the `<p>` and `<AcceptButton>`:

```tsx
  // state === 'ready'
  return (
    <main id="main-content" tabIndex={-1} className={shell}>
      <h1 className="font-display text-2xl text-ink">Join {p.church_name}</h1>
      <p className="font-body text-ink-soft">Accept your invitation to help lead {p.church_name} as a {label}.</p>
      <AnonymityNote />
      <AcceptButton token={token} />
    </main>
  )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/access/accept-anonymity-note.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
GIT_LITERAL_PATHSPECS=1 git add "app/accept/[token]/page.tsx" tests/access/accept-anonymity-note.test.ts
git commit -m "feat(privacy): show AnonymityNote on the invite-accept ready state"
```

---

### Task 4: Close the report leak — strip respondent names for `screen` too

**Files:**
- Modify: `lib/report/view.ts`
- Test: `tests/report/audience.test.ts` (flip + strengthen + extend three existing tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildSystem`'s signature loses its `opts` parameter (`buildSystem(d, blocks, methodology)` — it is module-private, sole caller is `buildReportView`). `SystemView.disagreement.respondents` and `ReportView.dispersion.respondents` are now always `[]`. The `respondents` field is kept (present-but-empty) — do NOT remove it.

This task edits three existing tests **in place** (net-zero test count) to be RED against current `view.ts`, then makes them GREEN. Write the test edits first, watch them fail, then change `view.ts`.

- [ ] **Step 1: Flip the screen test to expect an empty list (RED)**

In `tests/report/audience.test.ts`, replace the whole `it('screen keeps the labelled respondent list under Disagreement, exactly as it ships', …)` block (currently lines 28–36) with:

```ts
  it('screen now empties the labelled respondent list under Disagreement', () => {
    const v = buildReportView(d, blocks, methodology, { audience: 'screen' });
    // The fixture is built to fire (vol 2 vs 9 while every other area is 8 vs 7), so the
    // disagreement SECTION still renders — heading + narrative text. Keeping this presence
    // assertion is the non-vacuity guard: the test cannot pass by the section silently
    // disappearing. Only the per-person name list is now stripped (respondent anonymity),
    // on screen exactly as it already was on pdf/shared.
    expect(v.system.disagreement).toBeDefined();
    expect(v.system.disagreement!.respondents).toEqual([]);
  });
```

- [ ] **Step 2: Strengthen the calibration/no-names test (RED)**

In the same file, replace the whole `it('calibration carries no names on ANY surface, screen included', …)` block (currently lines 38–49) with:

```ts
  it('no respondent names anywhere in the system section on ANY surface, screen included', () => {
    for (const audience of ['screen', 'pdf', 'shared'] as const) {
      const v = buildReportView(d, blocks, methodology, { audience });
      // Stringify the WHOLE system section, disagreement INCLUDED. Previously the labelled
      // respondent list was screen-only, so `disagreement` was excluded here; now that names are
      // stripped on every surface, the entire section — calibration prose AND the disagreement
      // block — must be name-free for screen, pdf, and shared alike.
      const json = JSON.stringify(v.system);
      for (const name of NAMES) expect(json).not.toContain(name);
    }
  });
```

- [ ] **Step 3: Extend the top-level dispersion strip test to include `screen` (RED)**

In the same file, in the last test (currently titled `'pdf and shared also strip the top-level dispersion.respondents once it is actually populated'`, the `it(...)` at line 72), change the title and the loop array to add `'screen'`:

- Title → `'screen, pdf, and shared all strip the top-level dispersion.respondents once it is actually populated'`
- Loop → `for (const audience of ['screen', 'pdf', 'shared'] as const) {`

The loop body (`expect(v.dispersion).toBeDefined()` + the `JSON.stringify(v)` name scan) is unchanged. Leave the long explanatory comment block above the test as-is (it explains why the second fixture exists to populate the field — still accurate).

- [ ] **Step 4: Run the audience suite to confirm all three fail against current code (RED)**

Run: `npx vitest run tests/report/audience.test.ts`
Expected: FAIL — the three edited tests fail because current `view.ts` keeps names for `screen` (`respondents` non-empty; names present in the `screen` JSON). The two untouched tests (`pdf and shared carry no respondent names…`, `shared still drops nextStep`) still pass.

- [ ] **Step 5: Make `buildSystem`'s respondent list unconditional and drop its `opts` param**

In `lib/report/view.ts`, in `buildSystem`:

(a) Change the signature (currently lines 247–252) — remove the `opts` parameter:

```ts
function buildSystem(
  d: Diagnosis,
  blocks: ReportBlocks,
  methodology: Methodology,
): SystemView {
```

(b) Change the `respondents` ternary inside the `disagreement` object (currently lines 283–284) to an unconditional empty list:

```ts
          respondents: [],
```

(`flag` is still used just above for `flag.category_id` / `flag.spread`, so it stays; only `flag.respondents` stops being referenced. After removing the ternary, `opts` has no remaining use in `buildSystem` — which is why the parameter is dropped in (a).)

- [ ] **Step 6: Update `buildSystem`'s call site**

In the same file, the `buildReportView` return builds `system` (currently line 369):

```ts
    system: buildSystem(d, blocks, methodology, opts),
```

Change it to drop `opts`:

```ts
    system: buildSystem(d, blocks, methodology),
```

- [ ] **Step 7: Make `buildReportView`'s top-level dispersion list unconditional and delete the now-unused `flag`**

In `buildReportView`:

(a) Change the `dispersion.respondents` ternary (currently lines 350–353) to an unconditional empty list. The block currently reads:

```ts
    dispersion: blocks.dispersion
      ? {
          text: blocks.dispersion,
          respondents:
            opts.audience === 'pdf' || opts.audience === 'shared'
              ? []
              : (flag?.respondents ?? []),
        }
      : undefined,
```

Change it to:

```ts
    dispersion: blocks.dispersion
      ? {
          text: blocks.dispersion,
          respondents: [],
        }
      : undefined,
```

(b) Delete the now-unused `const flag = d.disagreement_flags[0];` line (currently line 323 — it was referenced ONLY by the ternary just changed; deleting it keeps `npm run lint` no-unused-vars green). Leave `const names = …` and `opts` intact — `opts` is still used by the `nextStep` ternary below.

- [ ] **Step 8: Update the `buildReportView` doc comment**

In the same file, the block comment above `buildReportView` currently contains (lines ~298–301):

```
 * audience 'pdf' and 'shared' both empty dispersion.respondents (and, identically,
 * system.disagreement.respondents). Each leaves the permission wall, so the
 * per-person name-to-score list must not travel with them. The field stays
 * present-but-empty so the narrative still renders.
```

Replace that paragraph with:

```
 * dispersion.respondents and system.disagreement.respondents are now emptied for EVERY
 * audience, screen included: the per-person name-to-score list is never shown on any surface
 * (respondent anonymity — spec 2026-07-29-report-anonymity-design). The fields stay
 * present-but-empty so the disagreement narrative still renders; buildSystem no longer varies
 * by audience and takes no `opts`.
```

- [ ] **Step 9: Run the audience suite to confirm GREEN**

Run: `npx vitest run tests/report/audience.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 10: Run the full report suite (regression) + typecheck + lint**

Run: `npx vitest run tests/report/ && npm run typecheck && npm run lint`
Expected: all report tests PASS (in particular `tests/report/audience-parity.test.ts` and `tests/report/components.test.ts` still pass — nothing else pinned the old screen-shows-names behavior), typecheck 0, lint 0.

- [ ] **Step 11: Commit**

```bash
git add lib/report/view.ts tests/report/audience.test.ts
git commit -m "fix(report): strip respondent names on the screen audience too"
```

---

## Final verification (before any "done" claim)

Run the full gate and read the actual output (superpowers:verification-before-completion):

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck 0 errors, lint 0 errors, vitest all green with the floor raised from 460 to **466** (+6 net: Task 1 adds 2, Task 2 adds 2, Task 3 adds 2; Task 4 edits 3 tests in place, net 0). Confirm the number from the real run — do not assert it from this plan.

Then verify the working tree is clean except the two permanent strays:

```bash
git status --short
```

Expected: only `?? .claude/` and `?? docs/superpowers/plans/2026-07-25-continuous-assessment-flow.md` remain untracked; nothing else unstaged.

Optional browser smoke (owner-gated — both surfaces are behind auth, so the agent cannot log in): the answer page and the accept `ready` state show the callout; the leader's on-screen diagnosis report shows the "Where your leaders disagree" heading + narrative with no per-person name list. Natalie performs any authed smoke.

## ⚠️ Push / PR decision (NOT part of the build — do before the first push)

The build is entirely local. Before pushing, confirm with Natalie whether the anonymity work (a) rides along in the in-flight **PR #34** (same branch `feat/diagnosis-report-reform`, whose remote is still at `a315b26`), or (b) gets its own branch/PR. Do NOT push or open a PR without her go.

## Self-review (against the spec)

- **Spec Part A (close report leak):** Task 4 — both ternaries → `[]`, `const flag` deleted, doc comment updated. Plan additionally drops `buildSystem`'s `opts` param (spec gap: emptying the ternary orphaned that param). `system.tsx` untouched (guard already handles empty). ✔
- **Spec Part B (announcement):** Task 1 (component, single copy source) + Task 2 (answer page) + Task 3 (accept ready state). Copy verbatim from spec. ✔
- **Spec Testing — report:** Task 4 Steps 1–3 flip `:28` (keeping the `toBeDefined()` non-vacuity guard), strengthen `:38` (drop the `disagreement: undefined` exclusion), extend `:72` (add `screen`). ✔
- **Spec Testing — announcement:** Task 1 component copy test + Task 2/3 page inclusion tripwires. **Deviation from spec (justified):** filename `.test.ts` not `.test.tsx` (vitest include glob excludes `.test.tsx`); page checks are source-scans not renders (async server components can't be unit-rendered in node env — matches `back-to-menu-link.test.ts` precedent). ✔
- **Non-goals:** no migration, no dep, `respondent_user_id`/PR #34/engine/coverage-matrix untouched. ✔
- **Type consistency:** `AnonymityNote({ className?: string })` used identically in Tasks 1–3; `buildSystem(d, blocks, methodology)` signature + call site changed together in Task 4 Steps 5–6. ✔
