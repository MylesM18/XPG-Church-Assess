# M6b — Marketing Landing Page (design)

**Date:** 2026-07-19
**Milestone:** M6b (second of three; M6a = share links ✅ merged, M6c = responsive/a11y/token polish)
**Status:** APPROVED — design approved in 4 gates (s76); written spec approved by Natalie (s78),
including both step-7 amendments (berry count four → **five**; h1 break `sm:` → **`min-[861px]:`**)
**Branches off:** `ca3a5b8` (`chore: rename product Cairn → XP Gathering`)

## Goal

Replace the placeholder at `app/page.tsx` with the real marketing landing page, following the
prototype's content and register. Acceptance criterion from the engineering spec (`:460`):
*"follow the prototype's content and register."*

M6b is **pure frontend**. No SQL, no migrations, no new routes, no new API surface, no new theme
tokens.

## Scope

**In scope:** `app/page.tsx` rewritten; five new presentational components under
`components/marketing/`; one line amended in `docs/XPG-Engineering-Spec.md`.

**Not in scope:** token additions, responsive polish beyond the prototype's own single breakpoint,
the a11y sweep, SEO/metadata copy, a public demo report. All of these are M6c or later — see
[Deferred](#deferred).

## Decisions

The five clarifying questions, ruled in session 75. These are settled; the spec records them so the
rationale is not rediscovered.

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Product name on the landing | **"XP Gathering"** | Rename landed as `ca3a5b8`. `Cairn` in `docs/` stays — historical record, out of scope |
| 2 | Prototype's ghost CTA *"See a completed assessment"* | **Relabel → "See how it works"**, anchored to `#how-it-works` | No new route; the target already exists on the page |
| 3 | Build a real public demo report? | **Deferred out of M6b** | See below |
| 4 | Auth-conditional CTA, or static? | **Static.** One primary CTA `Get started` → `/get-started`, plus a static `Sign in` header link | See below |
| 5 | Introduce an `app/(marketing)/` route group? | **No — keep flat `app/page.tsx`** | Header is a plain imported component, not a layout |

### Why ruling 3 (demo report) is deferred

Three independent reasons, any one of which is sufficient:

1. **Confidentiality.** A demo built from real data permanently publishes a real church's
   *diagnosis*. M6a's strips remove respondent **names**, not the finding itself.
2. **It would break an M6a invariant.** A permanent demo share link is a standing exception to
   M6a's locked *one active link per run* and *30-day expiry* rules.
3. **It would break M6b's shape.** A seeded demo needs rows; M6b is pure-frontend and SQL-free.

**When it is eventually built:** a **hand-authored fictional fixture rendered through `ReportView`**.
Never seeded production rows.

### Why ruling 4 (static CTA) is safe — and what it fixes

**Evidence.** `app/get-started/page.tsx:5-10` self-gates:

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/sign-in?next=/get-started')
```

One unconditional CTA therefore routes correctly for **both** auth states — signed-out visitors get
bounced to sign-in and returned, signed-in visitors get the "Add your church" form. The landing does
not need to know which it is.

**Defect this fixes.** `app/page.tsx:34-40` today shows signed-**out** visitors only a *"Sign in"*
link. The primary conversion CTA is currently hidden from the entire marketing audience. The static
rewrite fixes this by construction.

**Accepted consequences,** asserted deliberately rather than discovered later:

- The landing's **"Sign out"** button goes away. It belongs in the app shell, not on marketing.
- Signed-in visitors to `/` see marketing, and reach the app via the header "Sign in" link.

### Why ruling 5 (flat route) is consistent with the engineering spec

The engineering spec's §1 tree is **illustrative, not binding** — it lists `/app/[churchId]/report`
while the repo has used `/app/[churchId]/diagnosis/` since M5 (an accepted, un-amended divergence;
§10 repeats the same stale path). §10's landing bullet says "a Get started CTA" — **singular** —
which is consistent with ruling 4.

### Recorded spec amendment

**M6b must amend `docs/XPG-Engineering-Spec.md:29`** (§1's tree), changing `/(marketing)/page.tsx` →
`/page.tsx`, so the canonical spec stays truthful. Verified: `:29` is the file's only occurrence of
`(marketing)`, so this is a one-line change. This follows M6a's precedent, which amended
`:39` when it deviated.

The stale `report` vs `diagnosis` path in §1 and §10 is a **pre-existing** doc inaccuracy and is
**not** folded into M6b — it goes on the M6c doc list.

## Architecture

### Page structure

```
<SiteHeader />                        wordmark left · "Sign in" right
<main>
  <Hero />                            eyebrow · h1 · lede · 2 CTAs · privacy note · <ChainViz />
  <HowItWorks id="how-it-works" />    eyebrow · h2 · 3 numbered cards
</main>
<SiteFooter />
```

Section order is the prototype's, unchanged. Header and footer are additions — the prototype's
landing lived inside an app-chrome shell (`:428`) and has no footer at all. The ghost CTA is a plain
`<a href="#how-it-works">` with no JavaScript.

### Static rendering

`app/page.tsx` becomes a **synchronous, non-async Server Component** with zero dynamic APIs: no
`createClient()`, no `auth.getUser()`, no `cookies()`, no `headers()`, and no `'use client'`
anywhere in the tree. Next.js then statically prerenders it.

**Falsifiable done-check:** `next build` must report `/` as `○ (Static)`. It is currently
`ƒ (Dynamic)` because of `auth.getUser()` at `app/page.tsx:7`. **Capture the route table both before
and after** — the `ƒ` → `○` flip is the machine-verifiable evidence that ruling 4 landed.

### Component boundaries

The existing convention is a flat `components/answer-form.tsx` — the only top-level component. Five
new files warrant a subdirectory: **`components/marketing/`**.

| File | Responsibility | Depends on |
|---|---|---|
| `app/page.tsx` | Composes the four sections | the four components |
| `components/marketing/site-header.tsx` | Wordmark + static "Sign in" link | none |
| `components/marketing/hero.tsx` | Eyebrow, h1, lede, CTAs, privacy note; renders `<ChainViz />` | `chain-viz` |
| `components/marketing/chain-viz.tsx` | 5-stage chain + enablers row | none |
| `components/marketing/how-it-works.tsx` | Heading + 3 cards; owns `id="how-it-works"` | none |
| `components/marketing/site-footer.tsx` | Wordmark line + copyright | none |

All five are **pure presentational Server Components — no props, no state, no imports from `lib/`.**

Content is inlined as JSX rather than passed in as props: there is exactly one landing page and no
CMS, so a props API would be invented indirection. Each file is independently readable and the whole
tree is trivially static.

`ChainViz` is split out from `Hero` because it is the largest single block (~40 lines) and is the
piece M6c will most likely revisit for a11y and responsive work.

### Page metadata

`app/layout.tsx:8-11` already sets title `XP Gathering` and description *"Church health, one honest
look at a time."* **Leave it alone** — no page-level override. SEO copy is not in M6b's mandate.

## Design tokens

Tailwind v4, CSS-first. **No `tailwind.config.*` exists** — all tokens live in `app/globals.css`
under `@theme`:

`--color-paper #FBF9F5` · `--color-ink #1A1C22` · `--color-ink-soft #565962` ·
`--color-line #E4DED3` · `--color-berry #8E2B3E` · `--color-berry-deep #6E1F30` ·
`--color-sage #4E6B60` · `--color-sand #EEE8DD`; `--font-display` (Fraunces) / `--font-body`
(Hanken).

> ⚠️ **`--color-berry` is RESERVED — diagnosis / constraint / active foreground only. Never a brand
> tile or a background.**

### The berry adjudication

The prototype leans on berry considerably harder than our guardrail allows. Every collision,
adjudicated:

| Prototype use | Line | Ruling |
|---|---|---|
| `.btn-primary{background:var(--berry)}` | `:87` | **Deviate → `bg-ink`.** Berry as a fill is exactly what the guardrail forbids. The prototype itself ships `.btn-ink` (`:89`), and `app/page.tsx:21` already uses `bg-ink` for this same CTA — established house style |
| `.eyebrow{color:var(--berry)}` | `:97` | **Deviate → `text-ink-soft`.** Brand chrome, not a diagnosis. The prototype itself offers `.eyebrow.faint` |
| `.hero h1 em{color:var(--berry)}` — *"one thing"* | `:105` | **Keep berry.** Foreground text that literally names the constraint — the one place berry means what berry is reserved to mean |
| `.how-num{color + border:var(--berry)}` | `:130` | **Deviate → `text-ink` + `border-ink`.** `border-ink` matches `.cv-node` (`:114`) — house style within the same design, not an arbitrary pick |
| `.cv-node.brk{background:var(--berry)}` | `:115` | **Keep** — berry's blessed use |
| `.cv-stage.brk .cv-name{color:var(--berry)}` — *"Community / Connection"* | `:117` | **Keep berry.** Foreground text naming the constraint — semantically identical to the `<em>`. *Added during spec self-review: Gate 1d's table had no row for this rule, and the "four blessed sites" count omitted it (see note below)* |
| `.cv-tag{color:berry; background:var(--berry-tint)}` | `:119` | **Split.** Keep the berry text; **drop the tint fill** → transparent with a `border-berry` hairline. `--berry-tint` is not in our `@theme`, and adding it would create a berry *background* token |
| Header glyph middle circle `fill="#8E2B3E"` | `:432` | **Keep the berry fill.** Semantically identical to the blessed `.cv-node.brk` — a 3.4px marker, not a tile. **Replace the hardcoded hex with `fill="currentColor"` on a `text-berry` wrapper** so the colour flows from the token |

Berry therefore appears at exactly **five** sites on the finished page: the `<em>` on *"one thing"*,
the `cv-node.brk` fill, the **stage-2 name**, the `cv-tag` text, and the header glyph.

> **⚠️ Amends the approved Gate 1d table, by addition.** Gate 1d adjudicated seven prototype
> collisions and concluded with four surviving berry uses. Prototype `:117`
> (`.cv-stage.brk .cv-name`) is an eighth collision that no row covered, so the count was four when
> the correct answer is five. It resolves the same way as the `<em>` — berry foreground text that
> literally names the constraint, which is precisely what the token is reserved for — so this is a
> gap being filled, not a decision being reopened. It is called out because **acceptance check 8
> would otherwise fail a correct implementation.**

### Missing prototype tokens — mapped, not added

**Add zero new theme tokens in M6b.** Token work is M6c.

| Prototype token | Value | Mapped to |
|---|---|---|
| `--white` (card surface) | `#FFFFFF` | `bg-white` — Tailwind v4 `@theme` *extends*, so the default `white` survives. No token needed |
| `--ink-faint` | `#8A8B90` | `text-ink-soft` (`#565962`). A tonal loss, not a structural one → **M6c** |
| `--shadow` | 2-layer soft | `shadow-sm` |
| `--r` | `14px` | `rounded-xl` (12px) → **M6c** for an exact token |

### Shared layout values

Transcribed from the prototype; these were not in the gate presentations but are needed for
faithful implementation.

| Prototype rule | Line | Tailwind |
|---|---|---|
| `.wrap{max-width:1080px;margin:0 auto;padding:0 26px}` | `:77` | `mx-auto max-w-[1080px] px-[26px]` — wraps both sections |
| `.btn{border-radius:999px}` | `:83` | `rounded-full` — both CTAs and the header button |
| `@media (max-width:860px)` | `:405` | mobile-first: single column by default, two columns at `min-[861px]:` |

The 860px breakpoint matches no Tailwind default (`md` is 768px, `lg` is 1024px), so it is written as
the arbitrary variant `min-[861px]:`. This is exact fidelity and needs no config change.

**Focus states.** The prototype uses a berry outline (`:94`). We instead use the pattern already in
the repo at `app/page.tsx:37`, applied to **all three** links on the page:

```
focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink
```

M6c then inherits a page that is already keyboard-visible.

## Components

### `SiteHeader`

Prototype chrome is at `:428-447`. Its **role-switcher is a prototype-only demo device** (it drives
`setRole()`) and is **dropped entirely**. What survives is the left half plus "Sign in" on the right
(ruling 4).

```
<header> border-b border-line
  [glyph] XP Gathering          ············          Sign in
          CHURCH HEALTH
</header>
```

- **Wordmark lockup** (`:437`) is a two-line stack: Fraunces 17px/500 over an 8.5px uppercase sans
  kicker at `tracking-[2.4px]`. `Cairn` → **`XP Gathering`**; the `Church Health` kicker stays.
  `font-display` / `font-body`, kicker in `text-ink-soft`.
- **Glyph** (`:430-436`) is an inline SVG: three circles joined by two short lines — a chain of three
  nodes, the middle one berry-filled. **Kept**, converted to `currentColor` per the adjudication above.
- **The wordmark is not a link.** The prototype's is clickable (`onclick="go('landing')"`), but on
  the landing itself that is a self-link — a link that does nothing, which is a mild a11y smell
  immediately before M6c's a11y pass. If `SiteHeader` is later reused on a second marketing route,
  it becomes a link then.
- **Static, not sticky.** This is a two-section page; sticky buys nothing and costs z-index handling
  plus a scroll-offset correction that would then interact with the `#how-it-works` anchor. M6c may
  revisit.
- **"Sign in" is a small ghost button** — prototype `.btn-ghost` + `.btn-sm` (`:91`, `:93`):
  transparent, `border-line`, `hover:border-ink hover:bg-white`. Deliberately secondary to the hero's
  primary CTA.

### `Hero`

**Layout.** Two-column grid `1.15fr / .85fr`, `gap-12` (48px), vertically centred (`:103`); copy
left, ChainViz right. Collapses to a single column at the 860px breakpoint (`:406`). Section padding
`82px` top / `64px` bottom (`:102`).

**Copy — verbatim from `:457-469`, with exactly two changes.**

| Element | Content | Style |
|---|---|---|
| Eyebrow | `A diagnostic instrument for church leadership` | `text-ink-soft`, 11px, `tracking-[2.4px]`, uppercase — **berry stripped** |
| H1 | `Find the ` *`one thing`* `<br>that's actually stuck.` | `font-display` 60px/1.02, weight 300, `tracking-[-.5px]` |
| Lede | `Most church assessments hand you twelve scores and leave you to guess. XP Gathering reads how your ministry areas depend on each other, finds the earliest place the chain breaks, and tells you where to focus — and, just as often, where not to.` | 18px `text-ink-soft`, `max-w-[30em]`, `leading-[1.55]` |
| Primary CTA | `Get started` + arrow SVG → `/get-started` | `bg-ink text-white rounded-full`, `hover:opacity-90` |
| Ghost CTA | `See how it works` → `#how-it-works` | `.btn-ghost` equivalent, `rounded-full` |
| Hero note | lock icon + `Results are private to your church's leadership. You control who sees them.` | 13px `text-ink-soft` |

The **two sanctioned content changes** are `Cairn` → `XP Gathering` in the lede (it is the subject of
the second sentence and reads cleanly), and the ghost-CTA relabel per ruling 2.

**Details:**

- The `<em>` **keeps berry** — `italic text-berry` on *"one thing"*. Fraunces ships a real italic.
- **Primary CTA hover.** The prototype's `.btn-primary:hover` → `berry-deep` (`:88`) is moot since
  our button is `bg-ink`; its `.btn-ink:hover` is `#000`, for which there is no token. Use
  **`hover:opacity-90`**, already what `app/page.tsx:21` does for this exact button.
- **Both hero SVGs** — the CTA arrow (`:462`) and the lock (`:467`) — get `aria-hidden="true"`. This
  is the *correct* use of the attribute: purely decorative, with adjacent text carrying the meaning.
  It is explicitly distinct from the contested use in `ChainViz` below.

**⚠️ H1 line break — one flagged deviation from the gate presentation.** The prototype hard-breaks
after *"one thing"* (`:458`), a deliberate rhetorical break that works at 60px but risks an ugly
widow at the 44px mobile size (`:407`). Gate 3 approved the intent — *"break holds on desktop, mobile
wraps naturally"* — but wrote the class as `hidden sm:block`. Those disagree: Tailwind's `sm` is
640px, so `sm:block` would restore the break at ~700px, where the h1 is still at its 44px mobile
size. **This spec uses `hidden min-[861px]:block`**, which is the same breakpoint as every other
collapse on the page and matches the stated intent. Flagged here rather than silently changed.

### `ChainViz`

Panel (`:472-487`): `bg-white border border-line rounded-xl shadow-sm`, padding `28px 26px`
(`py-7 px-[26px]`).

```
HOW YOUR CHURCH IS READ                        ← cv-label, becomes an <h2>
 ①  Guest Experience
 ●  Community / Connection        THE BREAK    ← node filled berry; name berry + bold
 ③  Discipleship / Leadership
 ④  Volunteer
 ⑤  Generosity
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                       ← border-t border-dashed border-line
 ENABLERS — THEY HOLD THE CHAIN UP             ← sage label
 (Governance) (Communication) (Systems)        ← sage-outline pills, rounded-full
```

Berry appears exactly three times in this panel, all blessed: the stage-2 node fill (`:115`), the
stage-2 name (`:117`), and the "the break" tag's text. The tag keeps that berry text but **loses its
`--berry-tint` fill** in favour of a `border-berry` hairline. The enablers row is entirely `sage` — the healthy/enabler token,
unreserved, and a correct use.

**Connector lines.** The prototype uses four absolutely-positioned `.cv-line` divs (`:118`). In the
`<ol>` version, keep them as explicit `<span aria-hidden="true">` elements rather than a stacked
`[&:not(:last-child)]:after:…` arbitrary variant — same rendered result, far more readable in a
Tailwind file.

#### The `aria-hidden` flag

The prototype marks the whole panel `aria-hidden="true"` (`:472`). That is not a small thing: the
panel is the visual thesis of the product and names **eight ministry areas**, identifying which one
breaks. Hiding it leaves screen-reader users with only the lede's prose gloss.

**This is M6c's ruling to make, not M6b's.** But M6b makes it cheap:

> **Write the markup semantically now** — an `<ol>` of `<li>` stages, a real heading for the label —
> **and keep `aria-hidden="true"` on the wrapper** for M6b fidelity.

M6c's decision then collapses to a one-attribute change on already-correct markup. Transcribing the
prototype's `<div>` soup instead would force M6c to rewrite the component before it could exercise
any option. Same visual output either way; one path leaves M6c a deletion, the other a refactor.

### `HowItWorks`

Centred header block (`max-w-[40em]`, `mb-11`), then a 3-column grid (`gap-[22px]`) collapsing to a
single column at 860px (`:408`). Section padding `20px` top / `90px` bottom (`:125`).

| Element | Content | Style |
|---|---|---|
| Eyebrow | `The flow` | `text-ink-soft` — the prototype already uses `.eyebrow.faint` here (`:493`), so there is no berry to strip |
| H2 | `Built for the exec who owns it, and the leaders who help.` | `font-display` 32px/400, `tracking-[-.3px]` |
| 3 cards | **Verbatim `:499-511`** — *Create your church profile* / *Answer, or hand it off* / *Read your diagnosis* | `bg-white border-line rounded-xl`, h3 `font-display` 19px/500, body 13.5px `text-ink-soft` |

- `id="how-it-works"` sits on the `<section>` — the ghost CTA's target. **Because the header is
  static rather than sticky, this anchor needs no `scroll-margin-top` correction.**
- **Semantics, consistent with `ChainViz`:** the three cards are an ordered sequence, so `<ol>` /
  `<li>`. The `<ol>` conveys the order, which makes the visual numeral circle a decorative echo — so
  it gets `aria-hidden="true"`, the same discipline as the hero SVGs.
- `.how-num` uses `text-ink` + `border-ink` (not berry, and not `border-line`, which left the only
  wayfinding in the section too quiet).

### `SiteFooter`

**The prototype has no footer** — verified by grep, zero hits for `footer` in the entire file. The
landing simply ends after how-it-works. This component is therefore invention, not transcription.

Options weighed: (a) no footer — the most faithful, but the page ends on a card edge and reads
unfinished; (b) **minimal — wordmark line plus copyright ← chosen**; (c) a footer with
privacy/terms/contact links — **rejected**, because those routes do not exist and shipping a footer
of 404s to fill space is worse than shipping no footer.

So: `border-t border-line`, the wordmark repeated small in `text-ink-soft`, one copyright line,
nothing else.

**The year, and why it is dropped.** Because the page is statically prerendered, a
`new Date().getFullYear()` call would bake the *build* year into the HTML permanently — silently
frozen until the next redeploy, and a dynamic call inside a tree we have just declared pure. A
hardcoded `2026` goes stale just as silently. **Ruling: drop the year entirely — `© XP Gathering`.**
No staleness, no dynamic call, no purity question.

## Accessibility posture

M6b is not the a11y milestone, but it sets the page up so M6c sweeps rather than rewrites:

- Heading outline: `h1` (hero) → `h2` (how-it-works) → `h3` ×3 (cards). The ChainViz label *"How
  your church is read"* is **also an `<h2>`** inside the panel — out of the a11y tree today via the
  wrapper's `aria-hidden`, and correctly levelled as a peer if M6c un-hides it.
- `aria-hidden="true"` is used in exactly three places, two of them uncontested-decorative (hero
  arrow + lock SVGs, the how-num circles) and one flagged for M6c (the ChainViz wrapper).
- Focus-visible rings on all three links, using the existing repo pattern.
- Ordered content uses real `<ol>` / `<li>` markup in both places it occurs.

## Testing

**No new vitest tests. The count stays at exactly 166.** This is a position, not an oversight.

The properties worth protecting here are structural — static route, no auth import, no client
boundary — and `next build`'s route table plus acceptance checks 2 and 3 catch them better than a
render test would. A snapshot test over marketing copy is a maintenance tax with no confidentiality
stake: unlike M6a, nothing on this page can leak.

If this is ever revisited, the honest shape is a small test asserting that the landing tree imports
nothing from `lib/supabase`.

## Definition of done

### Gates preserved — must not regress from `ca3a5b8`

| Gate | Command | Target |
|---|---|---|
| tsc | `npx tsc --noEmit` | **0** |
| eslint | `npx eslint .` | **0** |
| vitest | `npx vitest run` | **166 passed / 39 files** |
| build | `next build` | **exit 0** |
| pgTAP | — | **Not re-run — justified skip.** M6b touches zero SQL |

> ⚠️ **Never run `npm run test:db`** — it wipes the local e2e fixtures. The safe gate, if one is ever
> needed, is `supabase migration up --local && supabase test db`.

### Acceptance checks — every item runnable, not readable

1. **Route flips to static.** `next build`'s route table shows `/` as `○ (Static)`. **Capture the
   before state too** — it must currently read `ƒ (Dynamic)`. The flip is the machine-check for
   ruling 4.
2. **No auth on the landing.**
   `grep -n "getUser\|@/lib/supabase" app/page.tsx components/marketing/` → **0**.
3. **No client boundary.** `grep -rn "use client" components/marketing/` → **0**.
4. **Anchor resolves.** Against a production build, `curl /` and assert that both
   `id="how-it-works"` and `href="#how-it-works"` are present — a live target, not a dangling link.
5. **⭐ The CTA routes correctly for both auth states.** This is the crux of ruling 4 and the only
   thing going static actually risks. Using `node scripts/forge-auth-cookie.mjs <email> <password>`:
   - signed-out → `curl /get-started` redirects to `/sign-in?next=/get-started`
   - signed-in → `curl -b <forged> /get-started` returns 200 with the "Add your church" form
6. **"Sign out" is gone from `/`.** grep the response for `/auth/signout` → **0**. An accepted
   consequence of ruling 4, asserted deliberately rather than discovered later.
7. **Name check, with a positive control.** The response contains **0** occurrences of `Cairn` **and
   ≥1** of `XP Gathering`. The second half is what makes the first non-vacuous — the codebase's
   standing discipline on zero-match assertions.
8. **Berry guardrail.** grep `components/marketing/` for berry-as-background utilities → **0**.
   Berry appears only at the five blessed sites: the `<em>`, the `cv-node.brk` fill, the stage-2
   name, the `cv-tag` text, and the glyph.
9. **Content fidelity.** The eyebrow, h1, lede, hero note and three card bodies match `:452-520`
   exactly, except for the two sanctioned edits (ruling 1's `Cairn` → `XP Gathering` in the lede, and
   ruling 2's ghost-CTA relabel).
10. **Fixtures intact afterward** — 1 church / 1 run / 24 invitations / 1 diagnosis / 0 report_shares.

### Also in scope

Amend `docs/XPG-Engineering-Spec.md` §1's tree: `/(marketing)/page.tsx` → `/page.tsx` (ruling 5,
following M6a's precedent at `:39`).

## Deferred

| Item | Goes to | Note |
|---|---|---|
| **A real public demo report** (ruling 3) | post-M6b | When built: a **hand-authored fictional fixture rendered through `ReportView`**. **Never seeded production rows.** Reasons for deferral are recorded above |
| **ChainViz `aria-hidden`** | **M6c** | Three options: **(i)** keep it hidden — the lede does prose-describe the thesis, and only the area names are lost; **(ii)** delete the attribute and let the `<ol>` speak — **the recorded lean**, since an ordered list of named stages is content, not decoration; **(iii)** hide it but add an `sr-only` prose summary. M6b's semantic markup makes all three a one-attribute change |
| **`--ink-faint` token** (`#8A8B90`) | **M6c** | Currently mapped to `text-ink-soft` (`#565962`); a tonal loss, not a structural one |
| **Exact `14px` radius token** (`--r`) | **M6c** | Currently mapped to `rounded-xl` (12px) |
| **Stale `report` vs `diagnosis` path** in eng spec §1 and §10 | **M6c doc list** | Pre-existing doc inaccuracy, not introduced by M6b |
| **Responsive + a11y sweep** | **M6c** | M6b implements only the prototype's own single 860px breakpoint |

## Key paths

| Artifact | Path |
|---|---|
| SDD ledger (state file) | `.superpowers/sdd/progress.md` |
| Landing content source of truth | `docs/Cairn-Church-Health-Assessment-Prototype.html` **:452-520** |
| Prototype CSS for these sections | same file **:77-132**; `:root` tokens **:11-32**; breakpoint **:405-408**; header chrome **:428-447** |
| Landing behavioural spec | `docs/XPG-Engineering-Spec.md` **:460** (route tree **§1 :24-29**, to amend) |
| Page to replace | `app/page.tsx` |
| New components | `components/marketing/` (5 files) |
| Auth-gate evidence for ruling 4 | `app/get-started/page.tsx:5-10` |
| Design tokens | `app/globals.css` |
| Existing focus-state precedent | `app/page.tsx:37` |
