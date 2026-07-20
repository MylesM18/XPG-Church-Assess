# M6c — Polish, Tokens & Accessibility — Design Spec

**Status:** APPROVED by Natalie (session 91, 2026-07-19) via `superpowers:brainstorming` items 1–5.
**Self-reviewed:** session 92 (item 7). Four defects found **by running** and fixed inline — the
focus-visible gap was **11 files, not 8** (§6.2); the post-sweep raw-U+2019 count is **13, not 12**
(§6.6); M6c's own edits **shift four of the five berry line anchors** (§6.7); and the "Download PDF"
file-ownership footnote is **resolved** (§6.1). Layer 2 is now **18 files**, not 17.
**Milestone:** M6c — the **last** milestone. Anything cut here most likely never gets done.
**Predecessors:** M6a (share links) and M6b (marketing landing) are SHIPPED, MERGED, CLOSED.
**Next step:** `superpowers:writing-plans`. No implementation skill runs before that.

---

## 1. Prerequisite — the prose cache-check hotfix merges FIRST

M6c does **not** start until a standalone hotfix has merged.

- **Bug:** `app/app/[churchId]/actions.ts:118-121` — the cache-check SELECT is scoped by
  `response_hash` only, not `church_id`.
- **Fix:** add `.eq('church_id', churchId)` + **one regression test**.
- **Severity (corrected by reading the code, session 89):** the SELECT runs through the
  **RLS-scoped** client, so it can only see diagnoses the current user is a member of. This is
  **NOT a cross-tenant leak** and no prose is ever copied between churches — `save_prose` is merely
  *skipped*. Real failure mode: a user belonging to **two** churches whose answer sets hash
  identically sees church A's `ai` row, suppressing generation for church B, which silently falls
  back to deterministic prose. **A missing-generation bug, not data exposure.**
- **Shape:** own branch off `origin/master`, own review, own merge. **Not part of this spec.**
  Suggested skill: `superpowers:systematic-debugging`.

⚠️ **Branch point:** M6c branches from `origin/master` **after the hotfix merges** — never from
local `master` (`77f0b36`), which predates every M6b commit and is a deliberate stale fallback.

---

## 2. Milestone shape

**One milestone. One branch. One review. One merge.**

The session-90 375px probe resolved the open decomposition question to **NO SPLIT**: the responsive
leg is ~0 structural tasks (see §8), so there is nothing large enough to justify an M6c/M6d split.

Internal layering (dependency-ordered, not separate milestones):

| Layer | Content | Parallelism |
|---|---|---|
| **1** | `app/globals.css` — one `@theme` token + reduced-motion block | **serialized, runs first and alone** |
| **2** | Per-file sweep — **18 files** | **fans out; no two tasks share a file** |
| **3** | Docs — eng spec + this spec's record | runs **last**, records what actually shipped |

Layer 1 runs first because `--radius-card` must exist in `@theme` before `chain-viz.tsx` and
`how-it-works.tsx` reference `rounded-card`.

**Execution mode:** `superpowers:subagent-driven-development` (the mode used for M6b).

---

## 3. Scope

### In scope

| Item | Size |
|---|---|
| `focus-visible` sweep | **11 files** (corrected at spec self-review — see §6.2) |
| Tap targets (WCAG 2.2 SC 2.5.8) | 12 sites / 5 files |
| Skip link (WCAG 2.4.1) | 1 file, ~5 lines |
| Reduced-motion defensive block | 8 lines, `app/globals.css` |
| `--radius-card: 14px` token + application | 1 token + 2 sites |
| The two inherited `aria-hidden` rulings | 2 attributes |
| Apostrophes → raw U+2019 | 7 edits / 4 files |
| Eng-spec path + narrative corrections | 1 doc |
| Responsive | **confirmation only** — no structural work |

### Out of scope / explicitly won't-fix

- **`--ink-faint` (`#8A8B90`) is NOT adopted.** See §5.1 — adopting it would introduce a WCAG 1.4.3
  AA contrast failure. The inherited ledger item is **closed won't-fix, with the measurement
  recorded**.
- **Range sliders are excluded from the tap-target sweep** — SC 2.5.8 has an explicit UA-default
  exception, and overriding it would change the feel of the survey's primary interaction.
- **`app/app/[churchId]/page.tsx:97` (`sm:grid-cols-2`) is left exactly as-is** — no churn on
  already-reviewed code (ruling Q5).
- **The prose cache-check hotfix** — separate branch, merges first (§1).
- **No git history rewriting.** `53e364b` is merged into `origin/master`; its inaccurate commit
  message is corrected by *documentation*, not by rewriting history (§7.3).
- **No new routes, no SQL, no migrations, no new API surface.**

---

## 4. Rulings this spec encodes

Prior rulings (session 89, `m6c-decisions.md` Q1–Q5) — **decisions, not proposals; do not re-ask**:

- **Q1 Scope = WHOLE APP SURFACE** — marketing + all ~30 `.tsx` under `app/` and `components/`.
  All 8 focus-visible-missing files are app routes; a marketing-only M6c would fix almost none of
  the real defects.
- **Q2 Reduced-motion = one defensive global block** in `app/globals.css`. A written motion policy
  was declined; the CSS is the deliverable.
- **Q3 Prose cache bug = standalone hotfix before M6c** (§1).
- **Q4 Apostrophes = curly raw U+2019 everywhere**, 7 edits, plus correcting the inverted narrative.
- **Q5 Breakpoints = standard `sm:`/`md:`/`lg:` for app routes**; `min-[861px]:` stays a
  marketing-only typographic exception.

New rulings (session 91, this spec):

- **S1-a Tap targets: IN, minus the sliders.**
- **S1-b `/respond` valid survey: prove it, additively** (§8.2).
- **S1-c Skip link: IN, one file.**
- **S2-a `--ink-faint`: closed won't-fix, measurement recorded** (§5.1).
- **S2-b 14px radius: adopted as `--radius-card`** (§5.2).
- **S3-0 The unit of work is a FILE, not a concern** (§6).
- **S3-4 `aria-hidden`: ADD on the header glyph, DELETE on ChainViz** (§6.4).

Resolved non-defects — **do not re-derive**:

- The **"19 inputs / 1 `htmlFor`"** scare is a FALSE ALARM. 9 of 19 inputs are `type="hidden"`; all
  10 visible inputs are correctly labelled (implicit `<label>` wrap ×8, explicit `htmlFor` ×1,
  `aria-label` ×1). No WCAG 1.3.1/4.1.2 failure exists.
- The **`<h1>` audit** closes clean — see §7.2.

---

## 5. Layer 1 — `app/globals.css`

The file is 25 lines: 8 colors + 2 font vars, then `html`/`body`. Layer 1 adds exactly two things.

### 5.1 `--ink-faint` — measured, rejected, recorded

Contrast measured by **running** the WCAG sRGB relative-luminance formula against the actual paper
background `#FBF9F5`:

| Token | Hex | Contrast on paper | AA normal text (4.5:1) |
|---|---|---|---|
| `--color-ink` | `#1A1C22` | **16.20** | pass |
| `--color-ink-soft` (current mapping) | `#565962` | **6.65** | pass |
| `--ink-faint` (prototype) | `#8A8B90` | **3.23** | ❌ **fail** |

Every prototype site using `--ink-faint` is small text — 8.5px ×1, 10.5px ×4, 11px ×5, 11.5px ×2,
12px ×4, 12.5px ×4, 13px ×2. None reaches the 18.66px-bold / 24px "large text" threshold where 3:1
would suffice.

➡️ The ledger's inherited framing — *"`--ink-faint` mapped to `ink-soft`, tonal loss"* — is
**backwards**. The current mapping is an accessibility **gain** (3.23:1 → 6.65:1). Adopting the
prototype token would inject a WCAG 1.4.3 AA failure into the milestone whose purpose is removing
them. **Token not added. Inherited item CLOSED.**

### 5.2 `--radius-card: 14px` — adopted

Evidence: the prototype uses `var(--r)` (14px) at **15** sites; the app uses `rounded-xl` (12px) at
exactly **2**, both marketing — `components/marketing/chain-viz.tsx:15` and
`components/marketing/how-it-works.tsx:33`. The app's other radii are `rounded-md` ×22,
`rounded-lg` ×7, `rounded-full` ×10.

Add to `@theme` (Tailwind v4 `--radius-*` namespace generates `rounded-card`):

```css
--radius-card: 14px;
```

Apply `rounded-card` at both sites, removing both `rounded-xl` uses.

⚠️ **This is the ONLY new token in M6c.**

### 5.3 Reduced-motion block

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

Defensive and global, per Q2. It neutralizes the 14 hover colour/opacity fades (harmless and
intended) and pre-empts any future motion. The `!important` is deliberate — it is what makes the
block a genuine backstop that no utility class can outrank.

**Layer 1 total: one `@theme` line + one 8-line block.** The "serialize the same file" constraint is
therefore a trivial scheduling note, not a real risk.

---

## 6. Layer 2 — the per-file sweep

**Organising principle (S3-0): the unit of work is a FILE, not a concern.** Concerns overlap
heavily — `app/app/[churchId]/page.tsx` needs focus-visible *and* 8 tap-target fixes;
`chain-viz.tsx` needs an `aria-hidden` change *and* `rounded-card`. Cutting tasks by concern would
put two agents in the same file. Cutting by file means every file is touched exactly once and the
layer parallelises cleanly.

### 6.1 File → concern map (18 files)

| # | File | Concerns |
|---|---|---|
| 1 | `app/layout.tsx` | skip link + `#main-content` wrapper |
| 2 | `app/accept/[token]/accept-button.tsx` | focus-visible |
| 3 | `app/app/[churchId]/access/remove-member-button.tsx` | focus-visible + tap target ("Remove", 43×16) |
| 4 | `app/app/[churchId]/access/revoke-invite-button.tsx` | focus-visible |
| 5 | `app/app/[churchId]/access/page.tsx` | **focus-visible (`<Link>` `:40`)** + tap target ("← Back to…", h=20) |
| 6 | `app/app/[churchId]/diagnosis/page.tsx` | focus-visible (`<a>` `:105`) + tap target ("Download PDF", `:109`, h=20) |
| 7 | `app/app/[churchId]/diagnosis/share-control.tsx` | focus-visible + tap target ("Create share link", 106×20) |
| 8 | `app/app/[churchId]/generate-button.tsx` | focus-visible |
| 9 | `app/app/[churchId]/page.tsx` | focus-visible + **8×** tap target ("Answer yourself", h=20) |
| 10 | `components/answer-form.tsx` | focus-visible |
| 11 | `components/marketing/site-header.tsx` | **ADD** `aria-hidden="true"` + `focusable="false"` |
| 12 | `components/marketing/chain-viz.tsx` | **DELETE** `aria-hidden` (`:14`) + `rounded-xl`→`rounded-card` (`:15`) |
| 13 | `components/marketing/how-it-works.tsx` | `rounded-xl`→`rounded-card` (`:33`) |
| 14 | `components/marketing/hero.tsx` | apostrophes `:14`, `:53` |
| 15 | `app/app/[churchId]/invite-panel.tsx` | apostrophe `:41` |
| 16 | `app/app/[churchId]/diagnosis/report.tsx` | **focus-visible (`<Link>` `:20`)** + apostrophes `:19`, `:112`, `:148` |
| 17 | `app/respond/[token]/page.tsx` | apostrophe `:18` |
| 18 | `app/accept/[token]/page.tsx` | **focus-visible (`<Link>` `:31`, `:49`, `:62`)** |

**File ownership is fully resolved — no residual uncertainty.** "Download PDF" was confirmed by
running `grep -rn "Download PDF"`: it lives at `app/app/[churchId]/diagnosis/page.tsx:109`, inside
the `<a>` opening at `:105`. `diagnosis/report.tsx` does **not** render it. Row 6 owns that
tap-target fix; row 16 owns only its own `<Link>` and apostrophes.

⚠️ **Line anchors in this table are PRE-EDIT.** Two files shift their own line numbers during M6c —
see §6.7. Tasks must locate edit sites by content, not by absolute line number.

### 6.2 `focus-visible` — 11 files ⭐ CORRECTED AT SPEC SELF-REVIEW

Every interactive element in these files gets the repo pattern **verbatim**, with no bespoke
variants:

```
focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink
```

**Baseline re-measured by running at spec self-review — the inherited figure of 8 was wrong.**

The session-88 scan matched only raw HTML tags, so it missed **`<Link>`** (the Next.js component,
which renders a real focusable `<a>`) and any tag whose name ends the line (`<a`⏎, `<button`⏎). The
EOL-safe sweep is:

```
for f in $(grep -rlE "<(a|button|Link|input|select|textarea)([[:space:]>]|$)" app/ components/ --include="*.tsx"); do
  grep -q "focus-visible" "$f" || echo "$f"
done
```

➡️ **11 files**, not 8 — rows 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 18. The three the old figure missed
are all `<Link>`-only files: `access/page.tsx` (`:40`), `diagnosis/report.tsx` (`:20`), and
`accept/[token]/page.tsx` (`:31`, `:49`, `:62`). Two of them were already in the sweep map for other
concerns, so the map grows by exactly **one** file (row 18); the other two simply gain a concern.

Current coverage for contrast: `focus-visible` appears on **8 elements** repo-wide (8 source lines ×
4 utility classes = the "32 occurrences" the old scan reported — it was counting class tokens, not
elements). Both numbers are now stated unambiguously so a reviewer cannot read them as contradictory.

### 6.3 Tap targets — 12 sites / 5 files

WCAG 2.2 SC 2.5.8 (AA) requires ≥24×24 CSS px. **Target ≥28px** so the fix does not sit exactly on
the threshold. Mechanism: vertical padding, plus `inline-flex`/`inline-block` where the element is
currently inline so the padding actually applies. No layout rewrites.

The 12 sites, from the session-90 probe:

| Route | Element | Measured |
|---|---|---|
| `/app/[churchId]` | 8× `<a>` "Answer yourself" | h=20 |
| `/app/[churchId]/diagnosis` | `<a>` "Download PDF" | h=20 (w=327) |
| `/app/[churchId]/diagnosis` | `<button>` "Create share link" | 106×20 |
| `/app/[churchId]/access` | `<a>` "← Back to Redwood …" | h=20 (w=327) |
| `/app/[churchId]/access` | `<button>` "Remove" | 43×16 (smallest) |

**Excluded:** the 5 `<input type="range">` (h=16) on `/app/[churchId]/answer/guest`, under SC 2.5.8's
UA-default exception (S1-a).

### 6.4 The two `aria-hidden` rulings — ruled after reading the code

- **`components/marketing/site-header.tsx:5-15` → ADD `aria-hidden="true"` and `focusable="false"`.**
  The glyph SVG sits immediately beside the literal text "XP Gathering" (`:18`). It carries no
  information the wordmark does not already give — decorative by construction, so hiding it is
  correct and **no accessible name is needed**.
- **`components/marketing/chain-viz.tsx:14` → DELETE the attribute.** It currently hides a real
  `<h2>` ("How your church is read") and a real `<ol>` of five named stages including the berry
  "the break" tag — the panel's entire point. Hiding an `<h2>` also drops it from the document
  outline. This is exactly the one-attribute change M6b's semantic markup was written to enable.

### 6.5 Skip link — `app/layout.tsx` only

`<main>` appears 18× (per-page), so a naive skip link would need 18 edits. Instead the link **and**
its target both live in the root layout:

- an `sr-only focus:not-sr-only` anchor `href="#main-content"` as the first element in `<body>`;
- a `<div id="main-content" tabIndex={-1}>{children}</div>` wrapper.

~5 lines, **zero per-page edits**, covers all ~16 routes at once.

### 6.6 Apostrophes — 7 edits / 4 files

Convert to raw U+2019 (`’`):

| Current | Count | Sites |
|---|---|---|
| `&rsquo;` | 2 | `components/marketing/hero.tsx:14,53` |
| `&apos;` | 5 | `app/app/[churchId]/invite-panel.tsx:41`; `app/app/[churchId]/diagnosis/report.tsx:19,112,148`; `app/respond/[token]/page.tsx:18` |

⭐ **CORRECTED AT SPEC SELF-REVIEW: there are SIX already-raw sites, not five.** `grep -rnP "\x{2019}"`
over `app/` + `components/` returns `app/accept/[token]/page.tsx:22,30,48,61`,
`components/marketing/how-it-works.tsx:5`, **and `app/app/[churchId]/actions.ts:87`**
(`your church’s weekend attendance band`) — a `.ts` file, which the original `.tsx`-shaped survey
never saw. All six are **untouched**.

➡️ After the sweep: raw U+2019 = **13** (6 existing + 7 converted), `&rsquo;` = **0**, `&apos;` = **0**.
The old figure of 12 would have failed acceptance check 8 on a correct implementation.

**Lint note:** eslint `react/no-unescaped-entities` forbids a raw `'` in JSX text but **permits**
raw `’`. Curly is the only convention writable without escaping — which is why the straight sites
are entity-escaped today.

---

### 6.7 ⚠️ M6c's own edits shift the berry guardrail's line anchors

Verified by reading the two files at spec self-review:

- **`chain-viz.tsx:14`** — `aria-hidden="true"` sits on **its own line** inside a multi-line `<div`.
  Deleting it shifts everything below by **−1**: `rounded-xl` `:15`→`:14`, and the three berry sites
  `:27/:37/:45`→**`:26/:36/:44`**.
- **`site-header.tsx`** — the `<svg` opening tag spans `:5-9`. Adding `aria-hidden="true"` and
  `focusable="false"` (one attribute per line, per the file's existing format) shifts the berry
  `<circle>` at `:11`→**`:12` or `:13`**.

Consequences, both fixed in this spec:

1. **The berry guardrail must not be asserted by line number.** Acceptance check 7 and §12 now state
   it as file + count + content. Absolute line numbers are recorded only as pre-edit anchors.
2. **Within `chain-viz.tsx`, do the two edits in one pass on the located content** — delete the
   `aria-hidden` attribute line and change `rounded-xl`→`rounded-card` on the `className` line by
   matching the strings, never by seeking `:14` then `:15`. Seeking by line number after the first
   edit lands one line off.

`hero.tsx:12` (berry) is unaffected — hero's only M6c edits are apostrophes at `:14` and `:53`, both
*below* it.

---

## 7. Layer 3 — docs

**Rule: facts about the product live in `docs/XPG-Engineering-Spec.md`; decisions about M6c live in
this spec.**

### 7.1 Eng-spec path corrections — enumerated, verified against the real route tree

| Line(s) | Says | Reality | Action |
|---|---|---|---|
| 32, 62, 452, 464, 537 | `/app/[churchId]/report` | the directory is `diagnosis` | **fix → `/app/[churchId]/diagnosis`** |
| 454 | `POST /api/report-share` | no such route; it is server actions in `diagnosis/actions.ts` — and **line 78 already says so** | **fix — self-contradiction within one doc** |
| 452 | component at `/lib/report/render.tsx` | the component is `app/app/[churchId]/diagnosis/report.tsx` | verify, then fix |
| 38, 453 | `/api/report/[runId]/pdf` | `app/api/report/[runId]/pdf/route.ts` **exists** | **leave — NOT stale** |

Verified route tree: API routes are exactly `app/api/report/[runId]/pdf/route.ts` and
`app/api/respond/[token]/route.ts`.

### 7.2 The `<h1>` audit — closes clean, no code change

The probe verified exactly one `<h1>` on 8 routes. The remainder resolves by reading:

- Three files hold `<h1>` outside `page.tsx` — `components/marketing/hero.tsx`,
  `app/app/[churchId]/diagnosis/report.tsx`, `components/answer-form.tsx` — which explains every
  `page.tsx` reporting 0 (`app/page.tsx`, `diagnosis/page.tsx`, `answer/[categoryId]/page.tsx`,
  `r/[shareToken]/page.tsx`).
- `app/accept/[token]/page.tsx` reports **7**, which is 7 **mutually exclusive early-return
  branches**: `Invitation not found` (`:21`), `Invitation revoked` (`:25`), `Already accepted`
  (`:29`), `Invitation expired` (`:34`), `Join {church}` (`:47`), `Wrong account` (`:60`),
  `Join {church}` (`:70`). Exactly one renders per request.

➡️ Recorded as **verified**. No defect, no code change.

### 7.3 Narrative corrections the eng spec absorbs

A future "restore prototype fidelity" pass would otherwise undo these, so each is written down with
its reason:

1. **Marketing content carries THREE sanctioned edits from the prototype, not two:**
   `Cairn` → `XP Gathering`; the ghost CTA relabelled `See a completed assessment` → `See how it
   works`; and **curly apostrophes throughout**. Commit `53e364b`'s message and the M6b ledger's
   Task-5 note claim the change "restored the prototype's typographic `’`" — the prototype has
   **straight `0x27`** at all three sites, so the record is backwards. The third edit is a
   deliberate typographic **improvement**, not a fidelity restoration. `53e364b` is merged; the
   correction is documentation, not history rewriting.
2. **`--ink-faint` is deliberately not adopted** — with the measured 3.23:1 vs 6.65:1 and the note
   that all prototype uses are 8.5–13px.
3. **`--radius-card: 14px` is adopted**, at the two marketing card sites only.
4. **`min-[861px]:` is a marketing-only typographic exception**, explicitly not a codebase
   convention; app routes use the standard Tailwind scale.
5. **Range sliders are excluded** from the tap-target sweep under SC 2.5.8's UA-default exception.

Layer 3 touches `docs/XPG-Engineering-Spec.md` and this spec. **No source files.**

---

## 8. Responsive — confirmation only

### 8.1 What the session-90 probe established (do NOT re-run it)

Method: `npx next build` → `npx next start -p 3100` → viewport forced to 375×812 → per-page DOM
measurement. Auth minted in-page by replicating `scripts/forge-auth-cookie.mjs`. Fixtures untouched.

**Zero horizontal overflow on all 8 probed route families.** `scrollWidth === 375` everywhere;
overflowing-element count **0** everywhere; `<h1>` count exactly **1** on all 8. Landing `<h1>`
computes **44px** with the `min-[861px]:` break suppressed — reproduces M6b's session-85 record
exactly, no regression.

Probed: `/`, `/sign-in`, `/get-started`, `/app/[churchId]`, `/app/[churchId]/answer/guest`,
`/app/[churchId]/diagnosis`, `/app/[churchId]/access`, `/respond/<id>` (invalid state).

The s88 hypothesis is confirmed: with no tables, no `overflow-x`, and only three `max-w-[1080px]`
caps, the single-column stacks reflow correctly at 375px **by construction**. 24 of ~30 tsx files
having zero responsive prefixes is not a defect here.

### 8.2 The one coverage gap — closed additively (S1-b)

`/respond/[token]`'s **valid** survey could not be probed: all 24 fixture invitations are
`status=completed`, so every token renders the invalid-link state. This is the **respondent-facing
survey — the most phone-used surface in the product** — and the one route whose mobile layout is
unproven.

**Approved method:** **INSERT one throwaway invitation** against the existing run → probe
`/respond/<token>` at 375px → **DELETE it**. No existing fixture row is ever mutated; the expected
count returns to 24. Runs as acceptance check 5, on explicit go-ahead.

Rejected alternative: flipping an existing row to `pending`, which could strand a real fixture row
in the wrong state if the session were interrupted.

Still unreachable and accepted as-is: `/accept/[token]` valid invite (no pending membership invite
in fixtures) and `/r/[shareToken]` valid share (`report_shares = 0`).

---

## 9. Testing position — ZERO new vitest tests

**This is a position, not an oversight. Copy it into every reviewer's constraints block.**

Every M6c change is presentational: CSS utility classes, ARIA attributes, one theme token, and text
bytes. vitest does not render or measure computed styles, so a unit test here would assert on
`className` strings — a change-detector, not a safety net. The real verification is the 375px
browser probe, which measures the actual property SC 2.5.8 and the overflow checks are about.

Without this note a reviewer will raise missing coverage as an Important finding, exactly as would
have happened on M6b.

---

## 10. Acceptance checks (12)

1. **Gates green** at the branch-time floors (§11).
2. **`focus-visible`:** files with interactive elements and zero `focus-visible` = **0** (was **11** —
   use the EOL-safe sweep in §6.2 verbatim; the old `<Link>`-blind command under-reports by 3).
3. **Tap targets:** 375px probe re-run → **0** sub-24px controls, excluding the 5 sliders; and each
   of the **12 fixed sites measures ≥28px**, matching §6.3's target rather than sitting on the
   24px WCAG floor.
4. **No horizontal overflow at 375px** on all 8 previously-probed routes — regression check against
   the session-90 baseline (`scrollWidth === 375`, 0 overflowers, 1 `<h1>` each).
5. **`/respond/[token]` valid survey** probed at 375px via the additive fixture row; **row deleted**;
   counts back to `1 church / 1 run / 24 invitations / 1 diagnosis / 0 report_shares`; positive
   control **Redwood** present.
6. **Reduced-motion:** block present, verified by emulating `prefers-reduced-motion: reduce` and
   reading a computed `transition-duration` ≈ 0.
7. **Berry guardrail intact — asserted by count and content, NOT by line number** (§6.7):
   `grep -rn "berry" app/ components/` returns exactly **five** hits, in exactly two files —
   **one** in `hero.tsx` (the `<em>` in the headline), **one** in `site-header.tsx` (the middle
   `<circle>` of the glyph), **three** in `chain-viz.tsx` (the filled node, the active label, the
   "the break" tag). Exactly **one** `bg-berry`, in `chain-viz.tsx`. **Zero** `#8E2B3E`, **zero**
   `berry-tint`. Pre-edit anchors were `hero.tsx:12`, `site-header.tsx:11`, `chain-viz.tsx:27/37/45`;
   the last four legitimately shift and a line-pinned check would fail a correct implementation.
8. **Apostrophes:** `&apos;` = 0 and `&rsquo;` = 0 across `app/` + `components/`;
   raw U+2019 = **13** (`grep -rnP "\x{2019}" app/ components/ | wc -l`) — count includes the
   pre-existing `app/app/[churchId]/actions.ts:87`, so restrict nothing to `.tsx`.
9. **`aria-hidden`:** present on the header glyph; **absent** on the ChainViz wrapper.
10. **Skip link** is the first tabbable element, becomes visible on focus, and `#main-content` exists.
11. **`rounded-card`** used at exactly 2 sites; **`rounded-xl` = 0**.
12. **`/app/[churchId]/report` = 0 occurrences** in `docs/XPG-Engineering-Spec.md`.

---

## 11. Gates

| Gate | Floor |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint .` | **0 problems** |
| `npx vitest run` | **captured at branch time** — see the trap below |
| `npx next build` | **exit 0** |
| pgTAP | **JUSTIFIED SKIP** — zero SQL, zero migrations. Floor stays Files=19 / Tests=195 |

⚠️ **The vitest trap.** M6c branches off `origin/master` *after* the prose hotfix merges, and that
hotfix adds one regression test. **The floor is therefore NOT 166.** Capture it by running at branch
time; do not hardcode the M6b number.

⚠️ **NEVER run `npm run test:db`** — it wipes the local e2e fixtures. The safe pgTAP gate, if ever
needed, is `supabase migration up --local && supabase test db`.

---

## 12. Standing constraints (bind every task)

- **Branch from `origin/master` after the hotfix merges — NEVER from local `master` (`77f0b36`).**
- **`--color-berry` is RESERVED to exactly FIVE blessed sites** — 1 in `hero.tsx` (headline `<em>`),
  1 in `site-header.tsx` (glyph middle `<circle>`), 3 in `chain-viz.tsx` (filled node, active label,
  "the break" tag). Pre-edit anchors `hero.tsx:12`, `site-header.tsx:11`, `chain-viz.tsx:27/37/45`;
  **four of the five shift during M6c (§6.7) — identify them by content, never by line.** Never a
  fill or background outside them. `#8E2B3E` is never hardcoded; `--berry-tint` is never added.
- **In `components/marketing/`, 860px is `min-[861px]:`, never `sm:`.** This does not extend to app
  routes (Q5).
- **Leave `app/app/[churchId]/page.tsx:97` (`sm:grid-cols-2`) exactly as-is.**
- **Add no theme tokens other than `--radius-card`.**
- **No service-role client in app code.** **`.superpowers/` stays UNTRACKED.**
- **Do not touch `next.config.ts` or `vitest.config.ts`.** Migrations are append-only.
- **Do not add a page-level `metadata` export** — `app/layout.tsx` already sets it.
- **Verify by RUNNING, not reading.**
- **Push as MylesM18 on EXPLICIT go-ahead ONLY.** Never merge `chore/rename-cairn-to-xpg`.
- **Do NOT re-plan, re-review, or re-open M6a or M6b.**

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Tap-target padding shifts layout on dense dashboard cards | Target ≥28px (not 44px); re-run the 375px probe as acceptance check 3, and check 4 re-proves zero overflow |
| Un-hiding ChainViz adds noise to screen-reader output | The exposed content is a labelled `<h2>` + `<ol>` of five named stages — informative, and it restores the document outline |
| Reduced-motion `!important` block over-reaches | Only `animation-*`, `transition-duration` and `scroll-behavior` are touched, and only inside the media query |
| The `/respond` fixture row is left behind | Additive-only INSERT/DELETE; acceptance check 5 re-asserts the exact fixture counts and the Redwood positive control |
| Reviewer flags zero new tests as Important | §9 is copied verbatim into every reviewer's constraints block |
| Vitest floor hardcoded to the stale 166 | §11 requires capturing the floor by running at branch time |
| A task seeks `chain-viz.tsx:15` after deleting `:14` and edits the wrong line | §6.7 requires content-matched edits in that file; acceptance check 11 (`rounded-xl` = 0) catches a miss |
| Berry guardrail asserted by line number fails a *correct* implementation | Check 7 + §12 restated as count-and-content; §6.7 records exactly which anchors move and why |
| A `<Link>`-blind grep re-reports the focus-visible gap as 8 and 3 files ship unfixed | §6.2 gives the EOL-safe sweep verbatim; check 2 names it as the required command |

---

## 14. Provenance

| Artifact | Path |
|---|---|
| 375px probe evidence (session 90) | `.superpowers/sdd/m6c-375px-probe.md` |
| Rulings Q1–Q5 + S1–S5 | `.superpowers/sdd/m6c-decisions.md` |
| Context scan (session 88) | `.superpowers/sdd/m6c-context-scan.md` |
| Live SDD ledger | `.superpowers/sdd/progress.md` |
| Prose cache bug | `app/app/[churchId]/actions.ts:118-121` |
| Prototype | `docs/Cairn-Church-Health-Assessment-Prototype.html` |
| Headless authed fetch | `scripts/forge-auth-cookie.mjs` (source `.env.local` first) |
