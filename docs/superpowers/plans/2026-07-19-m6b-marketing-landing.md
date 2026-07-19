# M6b — Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder at `app/page.tsx` with the real marketing landing page — statically prerendered, following the prototype's content and register.

**Architecture:** `app/page.tsx` becomes a synchronous (non-`async`) Server Component composing four pure presentational Server Components under `components/marketing/`. Removing the current `auth.getUser()` call flips the route from `ƒ (Dynamic)` to `○ (Static)` — that flip is the machine-verifiable evidence the design landed. No props, no state, no `lib/` imports anywhere in the tree.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2.7, Tailwind CSS v4.3.2 (CSS-first `@theme` in `app/globals.css`, **no `tailwind.config.*` exists**), TypeScript 5.5.4.

**Source of truth:** `docs/superpowers/specs/2026-07-19-m6b-marketing-landing-design.md` (approved, `dac4470`).

## Global Constraints

Every task's requirements implicitly include this section.

- **Pure frontend.** No SQL, no migrations, no new routes, no new API surface.
- **Add ZERO new theme tokens.** Do not edit `app/globals.css`. Token work is M6c.
- **No new vitest tests. The count stays at exactly 166 passed / 39 files.** This is a position, not an oversight — see the spec's Testing section.
- **Do NOT touch `next.config.ts` or `vitest.config.ts`.**
- **⚠️ NEVER run `npm run test:db`** — it wipes the local e2e fixtures. The safe pgTAP gate, if ever needed, is `supabase migration up --local && supabase test db`. M6b touches zero SQL, so pgTAP is a **justified skip**.
- **Migrations are append-only.** `.superpowers/` stays **untracked**.
- **No service-role client in app code.**
- **`--color-berry` is RESERVED** — diagnosis / constraint / active foreground only. **Never a fill, never a background, never a brand tile.** It may appear at exactly **five** sites on the finished page: the `<em>` on *"one thing"*, the `cv-node.brk` fill, the **stage-2 name**, the `cv-tag` text, and the header glyph's middle circle.
- **All five components are pure presentational Server Components** — no props, no state, no `'use client'`, no imports from `lib/`.
- **Do NOT add a page-level `metadata` export.** `app/layout.tsx:8-11` already sets title `XP Gathering` and description *"Church health, one honest look at a time."* Leave it alone — SEO copy is not in M6b's mandate.
- **Content is verbatim** from `docs/Cairn-Church-Health-Assessment-Prototype.html:452-520`, with exactly **two** sanctioned edits: `Cairn` → `XP Gathering` in the hero lede, and the ghost CTA relabelled `See a completed assessment` → `See how it works`.
- **Focus states** on all three links use the existing repo pattern from `app/page.tsx:37`:
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`
- **The 860px breakpoint** (`prototype:405`) matches no Tailwind default. Write it as the arbitrary variant `min-[861px]:`, mobile-first. **Never use `sm:`** for these collapses.
- **Gates preserved, must not regress from `ca3a5b8`:** `npx tsc --noEmit` → 0 · `npx eslint .` → 0 · `npx vitest run` → **166 passed / 39 files** · `npx next build` → exit 0.
- **Fixtures — DO NOT WIPE:** 1 church / 1 run / 24 invitations / 1 diagnosis / 0 report_shares.
- **Push as MylesM18 on explicit go-ahead ONLY.** Do not push during plan execution.
- **Verify by RUNNING, not reading.**

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/page.tsx` | **Rewrite** (currently 44 lines, async + auth) | Composes header, `<main>` of two sections, footer. Synchronous Server Component |
| `components/marketing/site-header.tsx` | Create | Wordmark lockup + glyph + static "Sign in" ghost button |
| `components/marketing/hero.tsx` | Create | Eyebrow, h1, lede, 2 CTAs, privacy note; renders `<ChainViz />` |
| `components/marketing/chain-viz.tsx` | Create | 5-stage chain + enablers row. Split out because it is the largest block and M6c's most likely revisit |
| `components/marketing/how-it-works.tsx` | Create | Heading + 3 numbered cards; owns `id="how-it-works"` |
| `components/marketing/site-footer.tsx` | Create | Small wordmark line + `© XP Gathering` |
| `docs/XPG-Engineering-Spec.md` | **Modify: line 29** | `/(marketing)/page.tsx` → `/page.tsx` |

`components/marketing/` is a new subdirectory. The existing convention is a single flat `components/answer-form.tsx`; five related files warrant grouping.

---

### Task 1: Capture the baseline and amend the engineering spec

**Why first:** acceptance check 1 requires proving the route currently reads `ƒ (Dynamic)`. Once `app/page.tsx` is rewritten that evidence is unrecoverable. **Nothing may edit `app/page.tsx` before this task's step 1 completes.**

**Files:**
- Create: `/private/tmp/m6b-baseline-route-table.txt` (scratch evidence, not committed)
- Modify: `docs/XPG-Engineering-Spec.md:29`

**Interfaces:**
- Consumes: nothing.
- Produces: the recorded `ƒ (Dynamic)` before-state, quoted in Task 6's acceptance check 1.

- [ ] **Step 1: Capture the BEFORE route table**

```bash
cd /Users/newmac/Desktop/XPG-Church-Assess
npx next build 2>&1 | tee /private/tmp/m6b-baseline-route-table.txt | grep -E "^\s*[○ƒ●]\s+/\s*$|Route \(app\)" 
```

Expected: a line for the `/` route reading **`ƒ /`** (Dynamic). Record the exact line verbatim — Task 6 compares against it.
If `/` already reads `○`, **stop and report** — the premise of ruling 4 does not hold and the plan needs revisiting.

- [ ] **Step 2: Confirm line 29 is the only `(marketing)` occurrence**

```bash
grep -n "(marketing)" docs/XPG-Engineering-Spec.md
```

Expected: exactly one hit — `29:  /(marketing)/page.tsx   public landing`

- [ ] **Step 3: Amend line 29**

Change the line from:

```
  /(marketing)/page.tsx   public landing
```

to:

```
  /page.tsx               public landing
```

Preserve the surrounding tree's column alignment — the description text must stay in the same column as its neighbours in the `§1` tree block. Inspect `sed -n '24,32p' docs/XPG-Engineering-Spec.md` and match it.

- [ ] **Step 4: Verify the amendment**

```bash
grep -n "(marketing)" docs/XPG-Engineering-Spec.md; echo "exit=$?"
grep -n "public landing" docs/XPG-Engineering-Spec.md
```

Expected: first grep returns **no hits** (`exit=1`); second shows `/page.tsx` carrying `public landing`.

- [ ] **Step 5: Commit**

```bash
git add docs/XPG-Engineering-Spec.md
git commit -m "docs(m6b): amend eng spec route tree to flat /page.tsx

Ruling 5 keeps the landing at a flat app/page.tsx rather than an
app/(marketing)/ route group. Amends the canonical spec so it stays
truthful, following M6a's precedent at :39."
```

---

### Task 2: Static page shell — `SiteHeader`, `SiteFooter`, and the `ƒ` → `○` flip

**Deliverable:** `/` renders header + empty `<main>` + footer, and the route table flips to `○ (Static)`. This is the single highest-risk change in M6b; it lands alone so it can be verified alone.

**Files:**
- Rewrite: `app/page.tsx`
- Create: `components/marketing/site-header.tsx`
- Create: `components/marketing/site-footer.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function SiteHeader(): JSX.Element` — no props
  - `export function SiteFooter(): JSX.Element` — no props
  - `app/page.tsx` default-exports `function Home()` — **synchronous, not `async`**. Tasks 3–5 add `<Hero />` and `<HowItWorks />` inside its `<main>`.

- [ ] **Step 1: Write `components/marketing/site-header.tsx`**

Transcribes prototype `:428-447` (chrome) with the CSS at `:46-57`. The role-switcher is a prototype-only demo device (it drives `setRole()`) and is **dropped entirely**. Static, **not sticky** — the prototype's `position:sticky` is deliberately not carried over, so `#how-it-works` needs no `scroll-margin-top`.

```tsx
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1080px] items-center gap-[11px] px-[26px] py-3">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className="h-[26px] w-[26px] shrink-0 text-ink"
        >
          <circle cx="6" cy="16" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16" cy="16" r="3.4" fill="currentColor" className="text-berry" />
          <circle cx="26" cy="16" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          <line x1="9.4" y1="16" x2="12.6" y2="16" stroke="currentColor" strokeWidth="1.6" />
          <line x1="19.4" y1="16" x2="22.6" y2="16" stroke="currentColor" strokeWidth="1.6" />
        </svg>

        <div className="font-display text-[17px] font-medium leading-none tracking-[.1px]">
          XP Gathering
          <small className="mt-[3px] block font-body text-[8.5px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
            Church Health
          </small>
        </div>

        <a
          href="/sign-in"
          className="ml-auto inline-flex items-center rounded-full border border-line px-[15px] py-2 font-body text-[12.5px] font-semibold text-ink transition-colors hover:border-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Sign in
        </a>
      </div>
    </header>
  )
}
```

Notes that matter and are easy to get wrong:
- The middle circle is the **berry glyph — one of the five blessed sites.** The prototype hardcodes `fill="#8E2B3E"` (`:432`); we drive it from the token via `className="text-berry"` + `fill="currentColor"`. **Do not reintroduce the hex.**
- **The wordmark is deliberately NOT a link.** The prototype's is clickable, but on the landing page itself that is a self-link — a link that does nothing. If `SiteHeader` is ever reused on a second marketing route, it becomes a link then.
- `py-3` = 12px, matching `.chrome{padding:12px 26px}` (`:49`).

- [ ] **Step 2: Write `components/marketing/site-footer.tsx`**

The prototype has **no footer** — verified: zero hits for `footer` in the whole file. This component is invention, not transcription. Minimal by ruling: wordmark line plus copyright, nothing else. A footer of privacy/terms/contact links was rejected because those routes do not exist.

**The year is deliberately omitted.** `new Date().getFullYear()` would bake the *build* year into statically prerendered HTML and reintroduce a dynamic call into a tree we have just declared pure; a hardcoded `2026` goes stale just as silently. So: no year.

```tsx
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-1 px-[26px] py-10 font-body text-[13px] text-ink-soft">
        <span className="font-display text-[15px] font-medium text-ink">XP Gathering</span>
        <span>© XP Gathering</span>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Rewrite `app/page.tsx`**

Replace the file's **entire** contents. The `createClient` import, the `async`, the `auth.getUser()` call, the `user ?` branch and the `/auth/signout` form all go away.

```tsx
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className="mx-auto max-w-[1080px] px-[26px]">
          {/* Task 3 inserts <Hero /> here; Task 5 inserts <HowItWorks /> */}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
```

- [ ] **Step 4: Verify the route flipped to static**

```bash
npx next build 2>&1 | grep -E "Route \(app\)" -A 12
```

Expected: the `/` row now reads **`○ /`**, where Task 1 step 1 recorded **`ƒ /`**. This flip is the machine-check for ruling 4.
If it still reads `ƒ`, something in the tree still touches a dynamic API — grep for it before proceeding; do not continue with a dynamic route.

- [ ] **Step 5: Verify no auth and no client boundary**

```bash
grep -rn "getUser\|@/lib/supabase" app/page.tsx components/marketing/ ; echo "auth_exit=$?"
grep -rn "use client" components/marketing/ ; echo "client_exit=$?"
```

Expected: **both return no hits** (`exit=1` each).

- [ ] **Step 6: Run the preserved gates**

```bash
npx tsc --noEmit && echo "TSC OK"
npx eslint . && echo "ESLINT OK"
npx vitest run 2>&1 | tail -5
```

Expected: tsc 0 errors, eslint 0 problems, vitest **166 passed / 39 files**. The vitest count must be unchanged — no test in the suite renders `app/page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx components/marketing/site-header.tsx components/marketing/site-footer.tsx
git commit -m "feat(m6b): static page shell with site header and footer

Rewrites app/page.tsx as a synchronous Server Component, dropping
auth.getUser(). The route flips from f (Dynamic) to o (Static) --
the machine-verifiable evidence for ruling 4.

Accepted consequences, asserted deliberately: the landing's Sign out
button goes away (it belongs in the app shell), and signed-in visitors
to / now see marketing and reach the app via the header Sign in link.
This also fixes a live defect -- signed-out visitors previously saw no
Get started CTA at all."
```

---

### Task 3: `Hero` — the copy column

**Deliverable:** `/` renders the eyebrow, h1, lede, both CTAs and the privacy note. ChainViz arrives in Task 4.

**Files:**
- Create: `components/marketing/hero.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `app/page.tsx`'s `<main>` wrapper from Task 2.
- Produces: `export function Hero(): JSX.Element` — no props. Task 4 adds `<ChainViz />` as the grid's second column inside this file.

- [ ] **Step 1: Write `components/marketing/hero.tsx`**

Content verbatim from prototype `:456-470`; styles from `:102-107`. Section padding `82px` top / `64px` bottom (`:102`). Grid `1.15fr / .85fr`, `gap-12` (48px), vertically centred, collapsing to one column at the 860px breakpoint (`:406`).

```tsx
export function Hero() {
  return (
    <section className="grid items-center gap-[34px] pb-16 pt-[82px] min-[861px]:grid-cols-[1.15fr_.85fr] min-[861px]:gap-12">
      <div>
        <p className="font-body text-[11px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
          A diagnostic instrument for church leadership
        </p>

        <h1 className="mt-[18px] font-display text-[44px] font-light leading-[1.02] tracking-[-.5px] min-[861px]:text-[60px]">
          Find the <em className="italic text-berry">one thing</em>
          <br className="hidden min-[861px]:block" />{' '}
          that&rsquo;s actually stuck.
        </h1>

        <p className="mb-8 mt-6 max-w-[30em] font-body text-[18px] leading-[1.55] text-ink-soft">
          Most church assessments hand you twelve scores and leave you to guess. XP Gathering reads
          how your ministry areas depend on each other, finds the earliest place the chain breaks,
          and tells you where to focus — and, just as often, where not to.
        </p>

        <div className="flex flex-wrap items-center gap-[14px]">
          <a
            href="/get-started"
            className="inline-flex items-center gap-[9px] rounded-full bg-ink px-6 py-3 font-body text-[14px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Get started
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>

          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-full border border-line px-6 py-3 font-body text-[14px] font-semibold text-ink transition-colors hover:border-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            See how it works
          </a>
        </div>

        <p className="mt-5 flex items-center gap-2 font-body text-[13px] text-ink-soft">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
            <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Results are private to your church&rsquo;s leadership. You control who sees them.
        </p>
      </div>
    </section>
  )
}
```

Details that are decisions, not style preferences:
- **The `<em>` keeps berry** — blessed site #1. Foreground text that literally names the constraint. Fraunces ships a real italic.
- **The eyebrow's berry is STRIPPED** → `text-ink-soft`. It is brand chrome, not a diagnosis. (The prototype itself ships an `.eyebrow.faint` variant.)
- **The primary CTA is `bg-ink`, NOT `bg-berry`.** Berry as a fill is exactly what the guardrail forbids. The prototype ships `.btn-ink` (`:89`) and the current `app/page.tsx:21` already uses `bg-ink` + `hover:opacity-90` for this same button — established house style. The prototype's `berry-deep` hover is moot; `.btn-ink:hover` is `#000`, for which no token exists.
- **The h1 line break is `hidden min-[861px]:block`** — approved amendment. **Do not write `sm:block`**: Tailwind's `sm` is 640px, which would restore the break at ~700px where the h1 is still at its 44px mobile size — the exact widow this rule prevents.
- **Both SVGs get `aria-hidden="true"`** — the correct use: purely decorative, with adjacent text carrying the meaning.
- The ghost CTA is a plain `<a href="#how-it-works">` with **no JavaScript**.
- Mobile-first sizing: base is the 44px h1 and the 34px gap from the `max-width:860px` block (`:406-407`); `min-[861px]:` restores the desktop 60px / 48px values.

- [ ] **Step 2: Wire it into `app/page.tsx`**

```tsx
import { Hero } from '@/components/marketing/hero'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className="mx-auto max-w-[1080px] px-[26px]">
          <Hero />
          {/* Task 5 inserts <HowItWorks /> */}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
```

- [ ] **Step 3: Verify content fidelity against the prototype**

```bash
npx next build && npx next start -p 3100 &
sleep 6
curl -s http://localhost:3100/ > /private/tmp/m6b-hero.html
grep -c "A diagnostic instrument for church leadership" /private/tmp/m6b-hero.html
grep -c "that.s actually stuck" /private/tmp/m6b-hero.html
grep -c "See how it works" /private/tmp/m6b-hero.html
grep -c "Results are private to your church" /private/tmp/m6b-hero.html
grep -c "See a completed assessment" /private/tmp/m6b-hero.html
grep -c "Cairn" /private/tmp/m6b-hero.html
grep -c "XP Gathering" /private/tmp/m6b-hero.html
```

Expected: `1`, `1`, `1`, `1` for the first four; **`0`** for `See a completed assessment` (relabelled per ruling 2); **`0`** for `Cairn`; **≥1** for `XP Gathering`. Kill the server afterward (`kill %1`).

- [ ] **Step 4: Verify the berry guardrail holds so far**

```bash
grep -rn "bg-berry\|bg-\[#8E2B3E\]\|#8E2B3E" components/marketing/ ; echo "exit=$?"
grep -rno "text-berry\|fill=\"currentColor\" className=\"text-berry\"" components/marketing/
```

Expected: first grep **no hits** (`exit=1`) — berry is never a background and the hex is never hardcoded. Second shows berry only at sites created so far: the glyph circle (Task 2) and the `<em>` (Task 3).

- [ ] **Step 5: Run the gates and commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run 2>&1 | tail -3
git add components/marketing/hero.tsx app/page.tsx
git commit -m "feat(m6b): hero copy column

Content verbatim from prototype :456-470 with the two sanctioned edits
(Cairn -> XP Gathering in the lede; ghost CTA relabelled to 'See how it
works' per ruling 2).

Berry stripped from the eyebrow (brand chrome, not a diagnosis) and from
the primary CTA fill (bg-ink, house style). Berry kept on the <em> --
foreground text naming the constraint. h1 break uses min-[861px]:, the
prototype's own breakpoint, not Tailwind's 640px sm:."
```

---

### Task 4: `ChainViz` — the signature panel

**Deliverable:** the hero's right column renders the 5-stage chain and the enablers row.

**Files:**
- Create: `components/marketing/chain-viz.tsx`
- Modify: `components/marketing/hero.tsx`

**Interfaces:**
- Consumes: nothing (`ChainViz` is self-contained).
- Produces: `export function ChainViz(): JSX.Element` — no props. `Hero` renders it as the grid's second child.

- [ ] **Step 1: Write `components/marketing/chain-viz.tsx`**

Content from prototype `:472-487`; styles from `:110-123`. Panel padding is an asymmetric `28px 26px`.

**The semantics decision, which is the point of this component:** the prototype is `<div>` soup marked `aria-hidden="true"` on the wrapper (`:472`). We **write the markup semantically now** — a real `<ol>` of `<li>` stages and a real heading — **and keep `aria-hidden="true"` on the wrapper** for M6b fidelity. M6c's ruling then collapses to a one-attribute change on already-correct markup instead of a rewrite. Same visual output either way.

```tsx
const STAGES = [
  { n: 1, name: 'Guest Experience', broken: false },
  { n: 2, name: 'Community / Connection', broken: true },
  { n: 3, name: 'Discipleship / Leadership', broken: false },
  { n: 4, name: 'Volunteer', broken: false },
  { n: 5, name: 'Generosity', broken: false },
]

const ENABLERS = ['Governance', 'Communication', 'Systems']

export function ChainViz() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-line bg-white px-[26px] py-7 shadow-sm"
    >
      <h2 className="mb-5 font-body text-[10.5px] font-semibold uppercase tracking-[1.8px] text-ink-soft">
        How your church is read
      </h2>

      <ol>
        {STAGES.map((stage, i) => (
          <li key={stage.n} className="relative flex items-center gap-[13px] py-[9px]">
            <span
              className={
                stage.broken
                  ? 'z-[2] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-berry bg-berry font-body text-[11px] font-bold text-white'
                  : 'z-[2] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-body text-[11px] font-bold'
              }
            >
              {stage.n}
            </span>

            <span
              className={
                stage.broken
                  ? 'font-body text-[13.5px] font-bold text-berry'
                  : 'font-body text-[13.5px] font-medium'
              }
            >
              {stage.name}
            </span>

            {stage.broken && (
              <span className="ml-auto rounded-[5px] border border-berry px-2 py-[3px] font-body text-[10px] font-semibold uppercase tracking-[1px] text-berry">
                the break
              </span>
            )}

            {i < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[12.5px] top-[26px] z-[1] h-5 w-[1.5px] bg-line"
              />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-dashed border-line pt-[18px]">
        <p className="mb-[10px] font-body text-[10px] font-semibold uppercase tracking-[1.4px] text-sage">
          Enablers — they hold the chain up
        </p>
        <div className="flex flex-wrap gap-[7px]">
          {ENABLERS.map((name) => (
            <span
              key={name}
              className="rounded-full border border-sage px-[11px] py-1 font-body text-[11.5px] font-medium text-sage opacity-90"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

The three berry uses in this panel — **all blessed**:
1. `cv-node.brk` **fill** on stage 2 (`:115`)
2. the **stage-2 name** (`:117`) — berry foreground text naming the constraint
3. the **"the break" tag text** (`:119`)

**The tag LOSES its `--berry-tint` fill.** The prototype gives it `background:var(--berry-tint)`; `--berry-tint` is not in our `@theme`, and adding it would create a berry *background* token — precisely what the guardrail forbids. It becomes transparent with a `border-berry` hairline instead.

The enablers row is entirely `sage` — the healthy/enabler token, unreserved, a correct use.

**Connector lines:** kept as explicit `<span aria-hidden="true">` elements rather than a stacked `[&:not(:last-child)]:after:…` arbitrary variant — same rendered result, far more readable.

`STAGES` / `ENABLERS` are module-level constants, not props. There is exactly one landing page and no CMS; a props API would be invented indirection.

- [ ] **Step 2: Render it from `Hero`**

In `components/marketing/hero.tsx`, add the import at the top:

```tsx
import { ChainViz } from '@/components/marketing/chain-viz'
```

and add it as the **second child of the `<section>`**, immediately after the closing `</div>` of the copy column and before `</section>`:

```tsx
      <ChainViz />
    </section>
```

- [ ] **Step 3: Verify the panel renders and berry is confined**

```bash
npx next build && npx next start -p 3100 &
sleep 6
curl -s http://localhost:3100/ > /private/tmp/m6b-chainviz.html
grep -c "Community / Connection" /private/tmp/m6b-chainviz.html
grep -c "the break" /private/tmp/m6b-chainviz.html
grep -c "Enablers" /private/tmp/m6b-chainviz.html
grep -c "Governance" /private/tmp/m6b-chainviz.html
grep -o "berry" /private/tmp/m6b-chainviz.html | wc -l
kill %1
```

Expected: `1` for each of the first four. The final count is informational — confirm by eye that no `bg-berry` utility appears:

```bash
grep -rn "bg-berry" components/marketing/ ; echo "exit=$?"
```

Expected: **no hits except the intentional `bg-berry` on the stage-2 node fill in `chain-viz.tsx`** — that one is blessed site #2. Confirm there is exactly one hit and it is that line.

- [ ] **Step 4: Run the gates and commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run 2>&1 | tail -3
git add components/marketing/chain-viz.tsx components/marketing/hero.tsx
git commit -m "feat(m6b): ChainViz signature panel

Semantic <ol> markup written now, with aria-hidden kept on the wrapper
for M6b fidelity -- M6c's ruling then collapses to a one-attribute
change rather than a rewrite.

Three blessed berry uses in-panel: the stage-2 node fill, the stage-2
name, and the 'the break' tag text. The tag loses its --berry-tint
background in favour of a border-berry hairline; adding that token
would have created a berry background token."
```

---

### Task 5: `HowItWorks` — the three cards and the anchor

**Deliverable:** the page's second section renders, and the hero's ghost CTA has a live target.

**Files:**
- Create: `components/marketing/how-it-works.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `app/page.tsx`'s wrapper.
- Produces: `export function HowItWorks(): JSX.Element` — no props. **It owns `id="how-it-works"` on its own `<section>`**; nothing else on the page may declare that id.

- [ ] **Step 1: Write `components/marketing/how-it-works.tsx`**

Content **verbatim** from prototype `:499-511`; styles from `:125-131`. Section padding `20px` top / `90px` bottom (`:125`). Header block centred, `max-w-[40em]`, `mb-11` (44px). Grid of 3 with `gap-[22px]`, collapsing to one column at 860px (`:408`).

```tsx
const STEPS = [
  {
    n: 1,
    title: 'Create your church profile',
    body: 'A quick overview of your church — size, staff, budget, context. It sets the benchmark every score is measured against, so you’re compared to churches like yours, not to megachurches.',
  },
  {
    n: 2,
    title: 'Answer, or hand it off',
    body: 'You can answer all eight categories yourself, or invite the right leader to weigh in on the area they know best. Invite more than one person per category — where they disagree is often the finding.',
  },
  {
    n: 3,
    title: 'Read your diagnosis',
    body: 'Not a scorecard. A verdict: the one constraint holding you back, the evidence behind it, what not to waste a year on, and the single next step. Visible only to you and whoever you approve.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="pb-[90px] pt-5">
      <div className="mx-auto mb-11 max-w-[40em] text-center">
        <p className="mb-3 font-body text-[11px] font-semibold uppercase tracking-[2.4px] text-ink-soft">
          The flow
        </p>
        <h2 className="font-display text-[32px] font-normal tracking-[-.3px]">
          Built for the exec who owns it, and the leaders who help.
        </h2>
      </div>

      <ol className="grid gap-[22px] min-[861px]:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-xl border border-line bg-white px-6 py-[26px]">
            <span
              aria-hidden="true"
              className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] border-ink font-display text-[15px] font-semibold text-ink"
            >
              {step.n}
            </span>
            <h3 className="mb-[9px] font-display text-[19px] font-medium">{step.title}</h3>
            <p className="font-body text-[13.5px] leading-[1.5] text-ink-soft">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
```

Decisions embedded here:
- **`.how-num` is `text-ink` + `border-ink`, NOT berry.** The prototype's berry numeral (`:130`) is wayfinding chrome, not a diagnosis. `border-ink` matches `.cv-node` (`:114`) — house style within the same design, not an arbitrary pick. It is also **not** `border-line`, which left the section's only wayfinding too quiet.
- **The eyebrow has no berry to strip** — the prototype already uses `.eyebrow.faint` here (`:493`).
- **`<ol>` / `<li>`, consistent with `ChainViz`.** The `<ol>` conveys the order, which makes the visual numeral circle a decorative echo — hence `aria-hidden="true"` on it, the same discipline as the hero SVGs.
- **No `scroll-margin-top`** is needed on the anchor, because Task 2's header is static rather than sticky.
- Body copy uses typographic apostrophes (`’`) matching the prototype. Verify no `&rsquo;`/`'` mismatch when grepping.

- [ ] **Step 2: Wire it into `app/page.tsx`**

`app/page.tsx` reaches its final form:

```tsx
import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className="mx-auto max-w-[1080px] px-[26px]">
          <Hero />
          <HowItWorks />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
```

- [ ] **Step 3: Verify the anchor resolves against a production build**

```bash
npx next build && npx next start -p 3100 &
sleep 6
curl -s http://localhost:3100/ > /private/tmp/m6b-full.html
grep -c 'id="how-it-works"' /private/tmp/m6b-full.html
grep -c 'href="#how-it-works"' /private/tmp/m6b-full.html
kill %1
```

Expected: **`1` and `1`** — a live target, not a dangling link.

- [ ] **Step 4: Run the gates and commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run 2>&1 | tail -3
git add components/marketing/how-it-works.tsx app/page.tsx
git commit -m "feat(m6b): how-it-works section and the #how-it-works anchor

Three cards verbatim from prototype :499-511 as an <ol>, consistent
with ChainViz. The numeral circles are decorative echoes of the list
order, so they carry aria-hidden.

.how-num deviates from the prototype's berry to text-ink + border-ink,
matching .cv-node -- wayfinding chrome is not a diagnosis. The anchor
needs no scroll-margin-top because the header is static, not sticky."
```

---

### Task 6: Full acceptance sweep

**Deliverable:** all ten of the spec's acceptance checks pass, evidenced by command output. No code changes expected — if a check fails, fix it here and re-run the whole sweep.

**Files:** none created or modified (unless a check fails).

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: the evidence record for `superpowers:verification-before-completion`.

- [ ] **Step 1: Gates**

```bash
npx tsc --noEmit && echo "GATE tsc: 0"
npx eslint . && echo "GATE eslint: 0"
npx vitest run 2>&1 | tail -5
npx next build 2>&1 | tail -25; echo "GATE build exit: $?"
```

Expected: tsc 0 · eslint 0 · vitest **166 passed / 39 files** · build **exit 0**.
**pgTAP is a justified skip** — M6b touches zero SQL. **Do not run `npm run test:db`.**

- [ ] **Step 2: Checks 1–3 (static route, no auth, no client boundary)**

```bash
npx next build 2>&1 | grep -E "Route \(app\)" -A 12
grep -rn "getUser\|@/lib/supabase" app/page.tsx components/marketing/ ; echo "check2_exit=$?"
grep -rn "use client" components/marketing/ ; echo "check3_exit=$?"
```

Expected: `/` reads **`○ (Static)`** where Task 1 recorded `ƒ (Dynamic)`; checks 2 and 3 both return **no hits** (`exit=1`).

- [ ] **Step 3: Serve a production build and capture the response**

```bash
npx next build && npx next start -p 3100 &
sleep 6
curl -s http://localhost:3100/ > /private/tmp/m6b-accept.html
wc -c /private/tmp/m6b-accept.html
```

Keep the server running through step 5.

- [ ] **Step 4: Checks 4, 6, 7 (anchor, sign-out gone, name check with positive control)**

```bash
echo "check4 id:   $(grep -c 'id="how-it-works"' /private/tmp/m6b-accept.html)"
echo "check4 href: $(grep -c 'href="#how-it-works"' /private/tmp/m6b-accept.html)"
echo "check6 signout: $(grep -c '/auth/signout' /private/tmp/m6b-accept.html)"
echo "check7 Cairn: $(grep -c 'Cairn' /private/tmp/m6b-accept.html)"
echo "check7 XPG:   $(grep -c 'XP Gathering' /private/tmp/m6b-accept.html)"
```

Expected: `1`, `1`, **`0`**, **`0`**, **≥1**.
The `XP Gathering` count is what makes the `Cairn` zero non-vacuous — the codebase's standing discipline on zero-match assertions. A zero on both would mean the page did not render at all.

- [ ] **Step 5: ⭐ Check 5 — the CTA routes correctly for BOTH auth states**

This is the crux of ruling 4 and the only thing going static actually risks. Credentials are in `.superpowers/sdd/progress.md`; source `.env.local` first.

```bash
# signed-out: must redirect to sign-in and preserve the return path
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3100/get-started

# signed-in: forge a cookie, then expect the "Add your church" form
node scripts/forge-auth-cookie.mjs <email> <password>   # prints the cookie
curl -s -b "<forged-cookie>" http://localhost:3100/get-started | grep -c "Add your church"
```

Expected:
- signed-out → a **3xx redirecting to `/sign-in?next=/get-started`**
- signed-in → **`1`** (200 with the "Add your church" form)

The landing itself never inspects auth; `app/get-started/page.tsx:5-10` self-gates, which is why one unconditional CTA is correct for both states. Kill the server after this step (`kill %1`).

- [ ] **Step 6: Check 8 — the berry guardrail**

```bash
grep -rn "bg-berry\|berry-tint\|#8E2B3E" components/marketing/
grep -rn "berry" components/marketing/ | wc -l
```

Expected: the **only** `bg-berry` hit is the stage-2 node fill in `chain-viz.tsx`; **zero** hits for `berry-tint` and for the hardcoded hex `#8E2B3E`.

Berry appears at exactly **five** sites, and you should be able to point at each:

| # | Site | File |
|---|---|---|
| 1 | The `<em>` on *"one thing"* | `components/marketing/hero.tsx` |
| 2 | `cv-node.brk` **fill** (stage 2) | `components/marketing/chain-viz.tsx` |
| 3 | Stage-2 **name** *"Community / Connection"* | `components/marketing/chain-viz.tsx` |
| 4 | `cv-tag` **text** *"the break"* | `components/marketing/chain-viz.tsx` |
| 5 | Header **glyph** middle circle | `components/marketing/site-header.tsx` |

If you count four, you have missed the stage-2 name — the count is **five** by approved amendment, and four would fail a correct implementation.

- [ ] **Step 7: Check 9 — content fidelity**

Diff the rendered copy against `docs/Cairn-Church-Health-Assessment-Prototype.html:452-520` by eye, confirming the eyebrow, h1, lede, hero note and three card bodies match **exactly**, except for the two sanctioned edits:
1. `Cairn` → `XP Gathering` in the lede
2. `See a completed assessment` → `See how it works`

```bash
grep -c "twelve scores and leave you to guess" /private/tmp/m6b-accept.html
grep -c "where they disagree is often the finding" /private/tmp/m6b-accept.html
grep -c "what not to waste a year on" /private/tmp/m6b-accept.html
grep -c "It sets the benchmark every score is measured against" /private/tmp/m6b-accept.html
```

Expected: `1` for each.

- [ ] **Step 8: Check 10 — fixtures intact**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c "
  select 'churches='       || (select count(*) from churches)
      || ' runs='          || (select count(*) from assessment_runs)
      || ' invitations='   || (select count(*) from invitations)
      || ' diagnoses='     || (select count(*) from diagnoses)
      || ' report_shares=' || (select count(*) from report_shares);
"
```

If a table name differs, confirm it against the migrations in `supabase/migrations/` rather than
guessing — **do not run `npm run test:db` to find out.** If the local Supabase stack is not running,
`supabase start` first.

Expected: **1 church / 1 run / 24 invitations / 1 diagnosis / 0 report_shares** — unchanged. M6b touches no SQL, so any deviation means something else wiped them.

- [ ] **Step 9: Visual confirmation at both breakpoints**

Start the dev server via `preview_start` (never `npm run dev` in Bash) and screenshot `/` at **1280px** and **375px**, confirming:
- desktop: two-column hero, h1 breaks after *"one thing"*, three-across cards
- mobile: single-column hero, 44px h1 with **no** hard break, stacked cards

- [ ] **Step 10: Final commit if anything changed**

```bash
git status --porcelain
# only if non-empty:
git add -A && git commit -m "fix(m6b): acceptance sweep corrections"
```

---

## Deferred — do NOT fold into M6b

| Item | Goes to | Note |
|---|---|---|
| A real public demo report | post-M6b | When built: a **hand-authored fictional fixture rendered through `ReportView`**. **Never seeded production rows** |
| `ChainViz` `aria-hidden` ruling | **M6c** | Recorded lean: delete the attribute and let the `<ol>` speak. M6b's semantic markup makes it a one-attribute change |
| `--ink-faint` token (`#8A8B90`) | **M6c** | Mapped to `text-ink-soft` (`#565962`) — a tonal loss, not a structural one |
| Exact `14px` radius token (`--r`) | **M6c** | Mapped to `rounded-xl` (12px) |
| Stale `report` vs `diagnosis` path in eng spec §1 and §10 | **M6c doc list** | Pre-existing doc inaccuracy, not introduced by M6b |
| Responsive + a11y sweep | **M6c** | M6b implements only the prototype's own single 860px breakpoint |
| Prose cache-check scoped by `response_hash` only, not `church_id` (`app/app/[churchId]/actions.ts:118-121`) | **project-wide, pre-existing** | Must be fixed before any multi-run flow ships. **Not M6b's** |

## Open question flagged during planning

**The header glyph SVG carries no `aria-hidden`.** The spec's accessibility posture states `aria-hidden="true"` is used in "exactly three places" and does not list the glyph, so this plan follows the spec literally. But a decorative SVG without `aria-hidden` may be announced as an unlabelled image by some screen readers. **Recommended: fold into M6c's a11y sweep** rather than deviating from the approved spec now. Raise with Natalie if she wants it added in M6b instead.
