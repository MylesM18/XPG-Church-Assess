# M6d I-1 — Live-Region Announcements (WCAG SC 4.1.3 AA) — Design Spec

**Status:** APPROVED by Natalie via `superpowers:brainstorming` — decisions 1–3 in session 112,
decisions 4–5 and all four design sections in session 113 (2026-07-19).
**Branch:** `feat/m6d-live-regions`, cut off merged `master` `991ff96` (PR #9 merged 2026-07-20).
**Self-reviewed:** session 114 (2026-07-20). Six defects found **by running** and fixed inline —
`diagnosis/actions.ts` was **not** in PR #9's diff, so the file count in decision 1 is **ten error
sites, not eleven** (§2); three section cross-references pointed at the wrong section (§2, §3, §4);
the §1 quote was labelled "verbatim" while being condensed; and the success half holds **five**
announcements, not four, which needed reconciling against the approved headline figure of 14 (§2
arithmetic note). **That note is now CONFIRMED by Natalie (session 115, 2026-07-20): the headline
stays 14. No open questions remain.**
**Predecessor:** M6c is SHIPPED and MERGED. The **eleven pre-existing** files this spec touches are
byte-identical between M6c's head `a8507bd` and merged master — verified by
`git diff a8507bd..master` returning empty across the whole file set — so every code fact below
still holds exactly as recorded. (The twelfth file, `components/live-status.tsx`, is new.)
**Next step:** `superpowers:writing-plans`. No implementation skill runs before that.

---

## 1. Problem statement

Recorded in `docs/XPG-Engineering-Spec.md` **section 16, decision 9** (the ninth numbered item —
there is no heading literally named "16.9"). Condensed below — the ten file names are dropped here
and listed in full in §4:

> Deferred to M6d, deliberately and not by oversight: live-region announcements (WCAG SC 4.1.3 AA).
> `role="status"`, `role="alert"` and `aria-live` return **zero** hits across all of `app/` and
> `components/`. Ten form-error sites render `{error && <p …>}` with no announcement. Worst case is
> `components/answer-form.tsx`: its `if (done)` branch unmounts the whole form, and because the
> `<h1>{categoryName}</h1>` lives *inside* that form, `/respond` ends with zero `<h1>` and focus
> reset to `<body>`.

Section 16 also states the shape of the work: "The cheap half is one attribute per site; the
`answer-form.tsx` half additionally needs the heading hoisted outside the conditional plus a `ref`
and `.focus()` on the thank-you container, which is behavioural."

This is **pre-existing, not an M6c regression**. M6c was scoped to presentational polish.

---

## 2. Decisions (locked — do not reopen)

### Decision 1 — branch base: wait for PR #9 to merge ✅ SATISFIED

Rejected stacking on `feat/m6c-polish-a11y`, and rejected branching off the pre-merge
`origin/master`. **All ten error sites were in PR #9's diff** (verified:
`git diff --name-only 8a1eab5..991ff96` lists all ten), so branching off the old master would have
worked on pre-M6c versions of every one of them and conflicted in all ten. `diagnosis/actions.ts`
was *not* in that diff, but the ten alone settle the decision.

**Status:** PR #9 merged as `991ff96`. Local `master` fast-forwarded after verifying it was a strict
ancestor of `origin/master` (0 ahead / 33 behind). `feat/m6d-live-regions` cut off the merged master.
This decision is now discharged.

### Decision 2 — scope: true SC 4.1.3 AA at 14 sites, not 10

Section 16 names ten **error** sites. SC 4.1.3 is titled "Status Messages" and covers **success**
equally. Four additional silent success sites are therefore in scope:

| Extra site | Silent success condition |
|---|---|
| `app/sign-in/page.tsx` | `sent` |
| `app/app/[churchId]/invite-panel.tsx` | `state.link` |
| `app/app/[churchId]/access/invite-member-form.tsx` | `state.link` |
| `app/app/[churchId]/diagnosis/share-control.tsx` | the server-revalidated link swap |

`generate-button.tsx` and `accept-button.tsx` succeed by **redirecting**, so navigation itself
carries the announcement. Those two genuinely need error handling only.

**14 sites = the 10 error sites + these 4 extra success sites.** Two files (`invite-panel`,
`invite-member-form`) appear in both halves and therefore carry two regions each.

⚠️ **Arithmetic note — CONFIRMED by Natalie, session 115 (2026-07-20). The headline figure stays
14; this framing is ratified, not open.** §5 describes **five** success announcements, not four. The fifth is
`components/answer-form.tsx`'s `done` branch, which is **not** an extra site: eng-spec decision 9
already names it explicitly as the worst case among the ten, so it is counted inside the ten rather
than added to them. "Four extra" therefore means *four not already named by decision 9*. The
distinct (file, condition) pair count is 15; the approved headline figure of 14 counts
`answer-form` once. No scope changes either way — this is a labelling clarification only.

### Decision 3 — mechanism: one shared `components/live-status.tsx`

Two technical points that **must survive into implementation**:

1. **`{error && <p aria-live="polite">{error}</p>}` does not work.** It inserts the region and its
   content in the same tick. Screen readers register live regions on mount and announce
   *subsequent* mutations, so the first message is silently missed. **The region element must be
   permanently mounted and only its text content may change.** This is the single load-bearing claim
   of the whole design, and §8 tier 1 exists to prove it.
2. **Always-mounting an empty `<p>` would cause a flex-gap layout regression.** Every parent here is
   a flex column with a `gap` (census in §9), so an empty child would add a phantom gap row. The fix
   is **`sr-only` when empty**: `sr-only` is `position:absolute`, absolutely-positioned children are
   not flex items and so contribute no `gap`; and unlike `display:none` it remains in the
   accessibility tree, which is exactly what a live region needs.

### Decision 4 — focus policy: mixed (option A)

| Site | Policy |
|---|---|
| `components/answer-form.tsx` (`done`) | **focus-move** |
| `app/sign-in/page.tsx` (`sent`) | **focus-move** |
| `app/app/[churchId]/diagnosis/share-control.tsx` | **live region** |

`share-control` gets a live region because its swap is driven by server `revalidatePath`, not client
state, so there is no clean client edge to hang a focus-move on.

Rejected: **B** (live region everywhere) — leaves focus stranded on `<body>` at all three sites, a
real keyboard defect. **C** (focus-move everywhere) — would need a `useRef` seen-value guard for
`share-control`, more machinery and harder to verify.

### Decision 5 — invite-link announcement content: sentence only, URL excluded

The `<code>` element holding the URL stays visible but **outside** the live region, so a screen
reader does not spell out a ~60-character token. Rejected: verbatim-with-URL, and
sentence-plus-focus-move (which would have added a fourth focus-move site beyond decision 4).

---

## 3. The `LiveStatus` component

New file **`components/live-status.tsx`**. This is the repo's first shared UI component outside
`components/marketing/`.

```tsx
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

Four deliberate choices, all approved:

- **Always rendered, never conditional.** The parent renders it unconditionally; only `message`
  changes. This is decision 3 point 1 made structural — a caller physically cannot express the
  broken conditional-mount form through this API.
- **`sr-only` when empty, site classes when populated.** `className` is passed per site because the
  existing error paragraphs are **not** uniform (see the §4 table — eight are `text-sm text-berry`,
  two are `text-xs text-berry`, one is `text-sm text-ink`).
- **`role` only, no `aria-live`.** `role="alert"` implies `aria-live="assertive"`; `role="status"`
  implies `aria-live="polite"`. Both additionally imply `aria-atomic="true"`, which is what makes
  the full message read out rather than only the changed substring. Specifying both is redundant.
- **No `'use client'` directive.** The component has no hooks and no handlers, so it compiles into
  whichever boundary imports it. All ten current consumers are already `'use client'`. No
  `cn()`/clsx helper is needed or available — the repo has none anywhere in `lib/`, and a plain
  ternary covers it.

---

## 4. The error half — 10 sites, one mechanical swap each

Every one of the ten is the identical shape and becomes:

```
{error && <p className="…">{error}</p>}   →   <LiveStatus tone="error" message={error} className="…" />
```

**No logic changes. No new state. No new imports beyond `LiveStatus`.**

| File | Expression | `className` to pass |
|---|---|---|
| `components/answer-form.tsx` | `error` | `font-body text-sm text-berry` |
| `app/sign-in/page.tsx` | `error` | `font-body text-sm text-berry` |
| `app/get-started/form.tsx` | `state.error` | `font-body text-sm text-berry` |
| `app/app/[churchId]/invite-panel.tsx` | `state.error` | `font-body text-sm text-berry` |
| `app/app/[churchId]/generate-button.tsx` | `error` | `font-body text-sm text-berry` |
| `app/app/[churchId]/access/invite-member-form.tsx` | `state.error` | `font-body text-sm text-berry` |
| `app/app/[churchId]/access/remove-member-button.tsx` | `state.error` | `font-body text-xs text-berry` |
| `app/app/[churchId]/access/revoke-invite-button.tsx` | `state.error` | `font-body text-xs text-berry` |
| `app/accept/[token]/accept-button.tsx` | `error` | `font-body text-sm text-berry` |
| `app/app/[churchId]/diagnosis/share-control.tsx` | `error` | `font-body text-sm text-ink` |

Two expression forms exist — five sites use a local `error` from `useState`, five use `state.error`
from `useActionState`. This matters only for the §8 tier-2 scan: the pattern **`error && <p`** is a
substring of both forms and therefore catches all ten with one search. Verified by running
`grep -rn "error && <p" app/ components/` → exactly these ten hits and no others.

**Locate every site by exact string match, never by line number.**

---

## 5. The success half — 5 announcements, each different

### 5.1 `components/answer-form.tsx` (`done`) — focus-move

Add a `useRef` and a `useEffect` keyed on `done`. **Both must be declared above the `if (done)`
early return.** The component's `useState` block ends immediately before that early return, and
declaring hooks after it would break the rules of hooks on the success render.

Change the returned confirmation `<p>` into an `<h1 tabIndex={-1} ref={…}>`.

This single change fixes **all three** defects at once:
- focus lands on the confirmation instead of falling to `<body>` when the submit button unmounts;
- the heading text is announced as focus moves;
- `/respond` stops ending with zero `<h1>` — the form's own `<h1 className="font-display text-2xl
  text-ink">{categoryName}</h1>` lives inside the form that `if (done)` unmounts, and
  `app/respond/[token]/page.tsx` supplies a `<main id="main-content" tabIndex={-1}>` but no heading.

**Styling: `font-display text-2xl text-ink`,** matching the `<h1>` it stands in for. This IS a
visible change from today's `font-body text-ink`. Natalie was told this and approved §5 without
objection. **Fallback if she revisits it:** keep the current classes and take the semantics only —
the accessibility outcome does not depend on the type scale.

**`answer-form` is the only file with the zero-`<h1>` defect.**

### 5.2 `app/sign-in/page.tsx` (`sent`) — focus-move

Same `useRef` + `useEffect` pattern, but the target stays a `<p>` with `tabIndex={-1}`. There is no
early return in this component, so hook ordering is unconstrained.

Its `<h1 className="font-display text-3xl text-ink">Sign in to XP Gathering</h1>` already sits
**outside** the `sent` ternary, so there is no heading defect here. Verified by reading.

### 5.3 `invite-panel.tsx` and `access/invite-member-form.tsx` (`state.link`) — `tone="status"`

Add a `LiveStatus tone="status"` whose message is computed from `state.emailed`. The visible block —
the sentence plus the `<code>` holding the link — is **untouched**.

Exact announcement strings:

| `state.emailed` | Announcement |
|---|---|
| `true` | `Invitation emailed. The link is shown below.` |
| `false` | `Invitation created but not emailed. The link is shown below.` |

Both phrasings **deliberately avoid an apostrophe** so the raw U+2019 census across `app/` +
`components/` stays at **15** (eng-spec §16 decision 8). Note the adjacent existing copy does
contain a U+2019 (`we couldn’t email it`) — that string is already counted and must not be
disturbed.

The URL is excluded from the announcement per decision 5.

### 5.4 `diagnosis/share-control.tsx` — `tone="status"`, needs §6 first

Depends on the `actions.ts` change in the next section. Covered there.

---

## 6. The supporting change in `app/app/[churchId]/diagnosis/actions.ts`

**The problem, verified by reading the file:** on success `revokeShare` returns
`{ link: null, error: null }` — **byte-identical to the `EMPTY` initial state** declared in
`share-control.tsx`. From the client there is no way to distinguish "revoke succeeded" from "nothing
has happened yet". `shareReport` is distinguishable only by accident, because it returns a non-null
`link`. **Nothing can be announced for revoke without fixing this.**

### The fix — a required discriminator

```ts
export interface ShareResult {
  link: string | null
  error: string | null
  status: 'idle' | 'created' | 'revoked'
}
```

**Required, not optional, on purpose.** TypeScript then forces all six `return` sites in `actions.ts`
to state it, so an omission is a compile error rather than a silent `undefined`.

| Return site | `status` |
|---|---|
| `shareReport` — auth error | `'idle'` |
| `shareReport` — rpc error | `'idle'` |
| `shareReport` — success | `'created'` |
| `revokeShare` — auth error | `'idle'` |
| `revokeShare` — rpc error | `'idle'` |
| `revokeShare` — success | `'revoked'` |
| `EMPTY` in `share-control.tsx` | `'idle'` |

Six returns in `actions.ts` plus the one `EMPTY` constant — seven edits, all mechanical.

### The component then derives its announcement with no refs and no effects

```tsx
const announcement = link
  ? (minted.status === 'created' ? 'Share link created.' : null)
  : (revoked.status === 'revoked' ? 'Share link revoked.' : null)
```

Gating on `link` — which **is** `existingLink`, the server's source of truth, per the existing
comment in the file — resolves the one ambiguity: after a mint-then-revoke sequence `minted.status`
is still `'created'`, but `link` is null, so that branch is skipped and the region correctly reads
"revoked".

On first paint of a page that already has a share link, both statuses are `'idle'`, so **nothing is
announced on load**. The first-mount problem is solved by construction rather than by a guard.

**Why not a `useRef` previous-value guard:** it fires on any re-render where the prop changes,
including unrelated revalidations of the same path, and it still needs an explicit first-mount
guard. The discriminator is exact — it is set by the action that actually ran, held in state this
component owns, and `'idle'` until an action returns. Same reasoning that made decision 4 choose a
live region over a focus-move at this site.

### Explicitly untouched in `actions.ts`

`revalidatePath` behaviour, both RPCs, and the deliberately-vague error messages. The comment above
the `create_report_share` call explains that the RPC refuses a non-admin and a nonexistent run with
the same message **on purpose** — do not "improve" that.

---

## 7. File count: 12

The 10 existing error sites, plus new `components/live-status.tsx`, plus
`app/app/[churchId]/diagnosis/actions.ts`. All five success announcements land in files already
among the ten (`answer-form`, `sign-in`, `invite-panel`, `invite-member-form`, `share-control`), so
the success half adds **no new files**.

`invite-panel.tsx` and `access/invite-member-form.tsx` each carry **two** regions — an `alert` for
errors and a `status` for the link. That is correct: they cannot both fire from a single submit.

---

## 8. Verification plan

### The hard constraint

There is **no jsdom, no `@testing-library`, and no Playwright** in `package.json`. devDependencies
are exactly: `@tailwindcss/postcss`, `@types/js-yaml`, `@types/node`, `@types/react`,
`@types/react-dom`, `eslint`, `eslint-config-next`, `pdf-parse`, `postcss`, `supabase`, `tailwindcss`,
`typescript`, `vitest`. **`vitest.config.ts` is off-limits**, so vitest stays node-environment and
`.ts`-only.

**Component-render tests are genuinely unavailable for I-1. Do not propose adding jsdom** — it
requires touching `vitest.config.ts`.

The proof therefore splits in two.

### Tier 1 — prove the MECHANISM once, rigorously, in a hydrated DOM

The design rests on exactly one claim: **the region node is permanently mounted and only its text
mutates.** A source grep cannot see this.

This is the same trap as the M6c dangling-skip-link regression, where the server response was a
**streaming shell** and only the hydrated DOM told the truth (eng-spec §16 decision 7).

So: `npm run dev`, drive one representative site in a real browser, and assert against the **live**
DOM that

1. an element with `role="alert"` exists **before** any error occurs;
2. after triggering the error its text is non-empty; and
3. **it is the same node** — capture the node reference across the mutation and compare identity.

**Node identity is the assertion that distinguishes this design from the broken
`{error && <p aria-live>}` version.** Steps 1 and 2 alone would pass on the broken version too.

If a site cannot be reached without seeded Supabase data, an **uncommitted throwaway probe route**
proves the mechanism just as well — the mechanism is the thing under test, not the route.

### Tier 2 — prove the APPLICATION everywhere, statically

One new node-environment test in `tests/a11y/`, modelled on the existing
`tests/a11y/main-landmark.test.ts` — **read that file first**. It is the precedent for a
source-reading test in this repo: it strips comments before scanning, handles multi-line opening
tags, asserts a **floor** rather than an exact count, and carries a prose header explaining why it
exists.

Assertions:
- the raw `error && <p` pattern has **zero** occurrences across `app/` and `components/`;
- `LiveStatus` is imported in every file that renders a status message;
- a floor assertion so the scan cannot pass vacuously (the failure mode where a bad glob matches
  nothing and every "zero occurrences" check trivially succeeds).

### The gap neither tier covers

Only a real screen reader proves a human actually hears it. **One VoiceOver pass** over the
`answer-form` success case and one error case, **run by Natalie** — this is not something the agent
can do.

If she declines, the spec must state plainly that the conformance claim rests on
mechanism-plus-application evidence, **not** on observed announcement. Decision 2 was explicitly
about not overstating the conformance claim, so write the limitation down rather than skipping it.

### Gates

`tsc` 0 · `eslint` 0 · `next build` exit 0 · vitest at the M6c floor of **170 tests / 41 files**
plus whatever the new tier-2 test adds.

⛔ **Never** `npm run test:db`.

---

## 9. Code facts verified by reading (do not re-derive)

- `aria-live` / `role="status"` / `role="alert"` across `app/` + `components/` = **0 hits**.
- All ten error sites confirmed as the identical `{… && <p …>{…}</p>}` shape, five with local
  `error` and five with `state.error`. **All ten files are already `'use client'`.** Exact
  classNames in the §4 table.
- `answer-form.tsx`: the `useState` block ends immediately before `if (done)`, which returns a bare
  `<p className="font-body text-ink">` and replaces the **entire form including its `<h1>`**.
  `app/respond/[token]/page.tsx` supplies `<main id="main-content" tabIndex={-1}>` but **no
  heading**. So the success path ends with zero `<h1>`, nothing is announced, and focus drops to
  `<body>` because the submit button unmounted. **Only `answer-form` has this defect.**
- `share-control.tsx`: `const link = existingLink` — the visible swap is driven **purely by server
  `revalidatePath`**, not client state. Action results are consulted only for error messages.
- `revokeShare`'s success return is byte-identical to `EMPTY` — the §6 problem.
- Parent flex containers that would have suffered the gap regression: `answer-form`
  `flex flex-col gap-6`; `share-control` `flex flex-col gap-2`; `invite-panel` and
  `invite-member-form` `gap-3`; `get-started/form` `gap-4`; `generate-button` `gap-1`;
  `accept-button` `gap-2`; `remove-member-button` and `revoke-invite-button`
  `flex flex-col items-end gap-1`.
- `components/` is nearly flat: `answer-form.tsx` plus
  `marketing/{chain-viz,hero,how-it-works,site-footer,site-header}.tsx`.
- `sr-only` appears exactly once today, on the skip link in `app/layout.tsx`.
- `tests/a11y/` contains exactly one file, `main-landmark.test.ts`.
- No `cn()` / clsx helper anywhere in `lib/`.

---

## 10. Standing constraints

- ⛔ **NEVER** `npm run test:db`.
- Push and merge **only** on Natalie's explicit go-ahead, as MylesM18.
- Do **not** touch `next.config.ts` or `vitest.config.ts`. Migrations are append-only.
  `.superpowers/` stays untracked. **Never** merge `chore/rename-cairn-to-xpg`.
- **Never locate code by absolute line number — always by exact string match.** Verify by RUNNING.
- Do not re-run M6c gates, re-review M6c, or re-derive any M6c finding. Eng-spec section 16's ten
  decisions are the durable record.
- Baselines carried into M6d: `tsc` 0 · `eslint` 0 · vitest **170 tests / 41 files** · `next build`
  exit 0 · pgTAP justified skip. Raw U+2019 across `app/` + `components/` = **15**. Landmark census
  = **19 `<main>` elements across 12 files**.

---

## 11. Execution

When implementation starts:

- **`superpowers:subagent-driven-development`** — dispatch in parallel, but **ban git in
  implementers**; the controller commits each file by explicit path. No two tasks may share a file.
  Note the natural dependency: `components/live-status.tsx` must exist before the ten swap tasks,
  and `actions.ts` must carry the discriminator before `share-control.tsx`'s success half.
- **`superpowers:verification-before-completion`** — a fix that changes the mechanism is not proof
  it closed the harm. §8 tier 1's node-identity assertion is the crux; live regions are easy to
  *claim* and hard to *prove*.
