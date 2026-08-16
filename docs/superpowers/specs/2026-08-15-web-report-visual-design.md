# XPG web report — visual layout redesign

**Date:** 2026-08-15
**Status:** Design approved. Not implemented.
**Scope:** The **web** view of the final diagnosis report only. The PDF renderer is explicitly good
and stays untouched.

---

## 1. The ask

> "Let's actually talk through the visual layout and structure of the view of the final assessment
> on the site. The PDF is great. However we need to actually talk through the layout and design of
> the site version. Use graphs for some of the analytics of this report, and lines that break up
> each paragraph."

A 9/11 Victim Compensation Fund infographic was supplied as the reference. The cues taken from it:
caps section headers over full-width rules, horizontal bar charts with value labels, big
inverse-filled callouts, a serif pull-quote, thin rules dividing zones, generous whitespace.

## 2. Goals

1. Give the web report its own layout language instead of a scaled-down transcription of the PDF.
2. Draw the analytics the facts pack already computes and currently renders nowhere.
3. Eliminate the sub-5px type caused by scaling a 500-unit PDF viewBox into a 327px phone column.
4. Break long prose runs with rules and labelled beats.

## 3. Non-goals

- **The PDF is untouched.** No change to `pdf/document.tsx`, the PDF renderer, or any existing
  geometry in `lib/report/charts.ts`.
- **The prose is byte-identical.** No sentence of report copy changes. The only new words on the
  page are chrome: section eyebrows, the six `s6` beat labels, and chart labels.
- **No new dependencies.** No charting library. Hand-rolled HTML/CSS.
- **No summary panel or jump-nav** above the sections (rejected: it gives away the verdict before
  the report walks you to it).
- **No new methodology, scoring, or database work.**

---

## 4. Current state

Entry point `app/app/[churchId]/diagnosis/page.tsx` (Server Component) renders into
`<main class="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">`, in the order
`ReportToolbar` → optional stale notice → `ReportCover` → `ReportSections`.

| File | Lines | Role |
|---|---|---|
| `app/app/[churchId]/diagnosis/report/sections.tsx` | 297 | The 13 sections + the 7 AI renderers |
| `app/app/[churchId]/diagnosis/report/charts.tsx` | 128 | Web half of the chart seam (3 charts) |
| `app/app/[churchId]/diagnosis/report/report-cover.tsx` | 100 | Web mirror of the PDF cover |
| `app/app/[churchId]/diagnosis/report/shared.tsx` | 243 | Shared chrome |
| `lib/report/charts.ts` | 343 | Pure shared geometry, imported by both renderers |
| `lib/report/facts.ts` | 251 | The facts pack |

### The four problems this design fixes

1. **All 13 section openers are the same colour.** `ReportSections` takes one `band` prop
   (`cover.band`) and paints every opener `BAND_FILL[band]`. Section 01 and section 13 look
   identical — no rhythm, no sense of place, no progress.
2. **Only 2 of 13 sections have a visual.** `chartsForSection` (`lib/report/compose.ts`) is
   `s3 → [verdictBlockModel, statGridModel]`, `s7 → [rankListModel]`, everything else `[]`.
3. **The charts are PDF transcriptions.** `lib/report/charts.ts` computes geometry in a fixed
   500-unit space tuned so 1 unit ≈ 1pt at A4's 499pt content width. The web SVGs scale that whole
   viewBox into the column (~0.65× on a 375px screen), which is why label sizes keep needing
   patches. The standing comment at `charts.tsx:55` — the `RANK_TEXT_MAX` note explaining why two
   labels are stuck at `fontSize={7.5}` (≈4.9px rendered) and cannot simply be bumped — is the
   strongest single argument for this redesign.
4. **`s6` is 48 consecutive `<p>` tags.** `S6View` (`sections.tsx:104`) renders 8 areas × 6
   paragraphs with nothing between them.

### Dead subtree — not designed on

`chain.tsx`, `system.tsx`, `dossier.tsx`, `cover.tsx` in the report directory are imported by
`shared.tsx` only. They are the whole scope of open
[PR #64](https://github.com/MylesM18/XPG-Church-Assess/pull/64) and are assumed to be going away.
Nothing in this design touches or depends on them.

### Palette (from `lib/report/charts.ts`)

Band fills: severe `#8C2F1F`, broken `#B4552F`, watch `#C08A2E`, holding `#4A6B4F`.
Band text on cream: the same, except watch darkens to `#906722` for contrast.
Ink `#1A1A18`, ink-soft `#5A5A54`, rule `#D8D5CE`, cream `#FAF7F0`.
`textOnBand(band)` → ink on watch, cream on the other three.
`THEME_FILL`: systems `#3F5E78`, culture `#7A5A86`, theology `#8A6A3A`, relational `#4A6B4F`.

Throughout this spec, **"display serif"** means the report's existing display face — the one the
cover score and section titles already use. No new typeface is introduced. All type sizes given in
`rem`/`px` are real CSS sizes, not viewBox units.

---

## 5. Architecture

### 5.1 The data seam — `lib/report/web-visuals.ts`

A **new pure module** `lib/report/web-visuals.ts`, with the signature:

```
webVisuals(facts, methodology) → { s3, s4, s7, s8, s9, s10, s13 }
```

- **Pure.** No JSX, no `@react-pdf/renderer` import, no DOM. A react-pdf import there would pull
  the PDF engine into the public share page's client bundle.
- **Takes `methodology` as well as `facts`** because two visuals need methodology-only data: the
  chain stage order (`rules.chain`) and the gate→stage mapping (`rules.enablers[].gates`). Neither
  is present in the facts pack. This mirrors `statGridModel`, which already takes both.
- **Computes bands with `readingBand`**, exactly as `statGridModel` does — *not* from
  `areaIndexFrom(sections)`. Same function means no drift, and the module stays a pure function of
  facts + methodology with no dependency on assembled sections. `areaIndexFrom` remains the
  renderer-side `s6` dossier lookup.
- **Returns a keyed record.** Each key holds that section's new visual model(s), nullable wherever
  the visual can be absent (§8). `s4` is the one section with two independent visuals, so its key
  holds both the constraint callout and the dumbbells as separately nullable members.
- **Attached to `ResolvedReportSections` beside `cover` — never to `section.charts`.**
  `tests/report/chart-parity.test.ts` hard-codes the three known chart kinds; routing eight new
  web-only visuals through `section.charts` would trip it. Attaching beside `cover` also keeps
  `pdf/document.tsx` blind to all eight.
- **Called from both `assembleReport` and `assembleFallbackOnly`**, so the public share page gets
  the same visuals. Satisfies the compute-on-the-model invariant at `resolve.ts:55`.

### 5.2 The layout dispatcher — `SectionVisuals`

Today `sections.tsx:274` blind-maps `section.charts` **above** `<SectionContent>` for every
section. That is replaced by a `SectionVisuals` dispatcher that switches on `section.id` and yields
`{ above, below, replacesBody }`. Sections with no visual keep today's behaviour exactly.

The dispatcher uses **literal component tags with a `never` default**, per the eslint
`react-hooks/static-components` + tsc-exhaustiveness reasoning already recorded at
`sections.tsx:196`.

**Two sources feed the dispatcher.** The eight new visuals come from `webVisuals` on
`ResolvedReportSections` (§5.1). The three existing charts keep coming from `section.charts` — the
dispatcher just stops mapping them blindly and places them explicitly. So `s3` yields
`above: [verdict block, chart 1, stat grid]`; `s7` yields `above: [chart 4]`,
`below: [rank list]`. Nothing is added to or removed from `section.charts`.

> ⚠️ **The opener JSX is untouched.** `tests/a11y/shared-report-heading.test.ts` counts the literal
> string `<h1` in the **source text** of `sections.tsx`. The two-literal-branch `h1`/`h2` shape at
> `sections.tsx:268` must survive the refactor — a dynamic tag reads as "no h1" and fails the test.

### 5.3 Layout principle

> **A visual that IS the reveal goes above the prose. A visual that EVIDENCES the prose goes below
> it.**

This is why `s4`'s constraint callout and `s9`'s chain sit above the body, while `s7`'s rank list
and `s8`'s spread bars sit below it.

Three sections independently break the blind `section.charts.map`, which is why the dispatcher is
required rather than merely tidier: `s7` needs visuals on **both sides** of its prose; `s3` needs a
new visual **interleaved between two existing ones**; `s10` needs its body **replaced**.

---

## 6. Design

### 6.1 Page frame

**Section header.** The solid band slab retires. Each section opener becomes:

- a band-coloured tick, **3px × 22px**, filled `BAND_FILL[cover.band]`
- a caps eyebrow reading `01 / 13`, derived from the section's index and the section count — no
  authored kicker strings
- the section title in display serif
- a **2px ink rule** beneath

Band colour survives and stays meaningful — it is the single verdict band for the whole report. No
per-section band is invented.

**Section interior.** Hairline rules between **structural siblings only** — between a section's
distinct thought groups, never between every `<p>`. In practice that means the six `s6` beats, and
the seam between prose and a visual that evidences it. In `s6`, each of the six dossier beats gets
a caps micro-label with a hairline above it.
The labels stack above their paragraph on narrow screens and move to a left gutter
(`grid-cols-[7rem_1fr]`) from the `sm` breakpoint up.

**`s6` beat labels — web only.** The PDF keeps its unlabelled paragraphs; the two surfaces
deliberately diverge here. Wording confirmed as-is:

| schema field | web label |
|---|---|
| `affirm` | WHAT'S WORKING |
| `pivot` | WHERE IT TURNS |
| `evidence` | THE EVIDENCE |
| `not_statement` | WHAT THIS IS NOT |
| `reframe` | ANOTHER WAY TO SEE IT |
| `trajectory` | IF NOTHING CHANGES |

### 6.2 Cover — tier ladder

The cover's continuous score strip is **replaced by a four-step vertical tier ladder**.

- Four full-width rows, worst → best, one per tier from `rules.tiers`.
- The church's tier is solid `BAND_FILL[band]` and raised; the other three are the same hex at
  `opacity: .18`.
- Labels are **tier names** (from `rules.tiers`), one line each at 11px. This closes a vocabulary
  split: today the strip says BROKEN while the caption two lines below says Strained.
- Markup: `<ul role="list">` with `aria-current` on the active row.
- The score's exact position is dropped. The 56px score and `"Strained · 61 of 100"` already carry
  it.
- Rendered web-native in HTML/CSS. The web `CoverStrip` SVG is deleted; `CoverModel.strip` stays
  for the PDF.

**Why a ladder rather than a fixed strip.** Reading `report-cover.tsx` against `coverModel()`
surfaced two defects:

1. Labels are still sub-legible — even after the 7.5 → 12 bump in `3120694`, 12 units ×
   (327 ÷ 500) renders at **7.9px** in a real phone column.
2. **The marker contradicts the segments.** Segments are equal quarters (125 units ⇒ 25 points
   each) but the real tier cuts are **55 / 70 / 85**, and the marker plots linearly at
   `score ÷ 100`. At 61 it lands over WATCH while the cover is painted broken and captioned
   Strained. Every Strained score (55–69) is wrong; 30 → BROKEN (should be SEVERE); 80 → HOLDING
   (should be WATCH).

Four discrete steps have no continuous axis, so the drawing cannot contradict the caption.

> 📌 **Out of scope, logged as a follow-up.** Defect 2 lives in shared geometry, so **the printed
> cover has it too**. Fixing it there means editing `coverModel()` in `lib/report/charts.ts`, which
> is outside "the PDF stays untouched". Separate change, separate approval. Do not fix it here.

### 6.3 `s3` — health dashboard

**Verdict block, rebuilt in HTML.** Hero score at `clamp(3.5rem, 12vw, 5.25rem)` in `BAND_TEXT`;
tier caption at a real `0.6875rem`; four stats in `grid-cols-2` hairline cells with wrapping caps
labels; `role="list"`.

**Chart 1 — capacity vs throughput**, directly under the verdict block. Two bars on a shared 0–100
scale: capacity solid `BAND_FILL`, throughput the same hex at `opacity: .45`. An inverse chip reads
`<gap> POINTS LOST` (e.g. `19 POINTS LOST`). **The chip is omitted when `overall.gap <= 0`.**

**`WebStatGrid` is NOT rebuilt.** It is already `grid-cols-2 sm:grid-cols-4` reading
`cell.bar.w / inner` as a percentage — it is the proof the pattern works. It gains a
`<n>TH PCTL` line at `0.625rem` caps (e.g. `62ND PCTL`), **omitted when `percentile` is null**. Carry its `role="list"` comment
into every new list component (Safari/VoiceOver drops the implicit list role under `display: grid`).

**Body unchanged.** The `xpg_read` bullet stays an ordinary bullet — see §6.7.

### 6.4 `s4` — what the assessment revealed

**Chart 2 — constraint callout**, above the prose (it is the reveal). Two faces, then omission:

1. If `primary_constraint` is present: a full-bleed panel with eyebrow `PRIMARY CONSTRAINT`, the
   area name, and its score.
2. Else if any enabler is gated: the same panel with eyebrow `GATING ENABLER`, one row per gated
   enabler carrying name + score + `note`.
3. Else the panel is omitted entirely.

Panel ground is `BAND_FILL` with `textOnBand` text. **The band and score are computed inside
`webVisuals` via `readingBand`**, per §5.1 — not from `areaIndexFrom(sections)`. (An earlier note
during design said `areaIndexFrom`; §5.1 supersedes it. `areaIndexFrom` remains the renderer-side
`s6` dossier lookup and nothing else.)

**Chart 3 — blind-spot dumbbells**, below the prose (it evidences it). Per row: the area name over
a full-width 0–100 track, a solid dot at `evidence` → a hollow dot at `belief`, the segment between
them in that area's `BAND_FILL`, and the `gap` in display serif on the right. **The whole block is
omitted when `blind_spots` is empty.**

### 6.5 `s7` — lowest scoring indicators

**Split layout**, applying §5.3: opener → **chart 4** (the reveal) → `S7View` prose → hairline →
**rebuilt rank list** (the evidence). This is the second section, after `s3`, that forces the
explicit dispatcher.

**Chart 4 — theme split.** Reads `pattern_counts`.

- **All four theme rows always render, including zero-count rows** — that is the point of the
  comment at `charts.ts:40`.
- Row = caps label at `0.6875rem` in `THEME_FILL[theme]` · full-width track · bar at
  `count ÷ total × 100%` · count numeral in display serif on the right.
- A zero row keeps its label and empty track, with `0` in ink-soft.
- **Order: descending by count; ties broken by canonical key order** (systems, culture, theology,
  relational).
- Chart label: `THEME OF THE WEAKEST INDICATORS` — not "the six", because `bottom_items` can be
  fewer than six.
- **Omitted when `total === 0`** — the same condition under which `rankListModel` already returns
  `null`.
- `<ul role="list">`; bars `aria-hidden`; counts are real text.
- **No generated closing line.** A sentence summarising the counts ("Half of what is failing is a
  systems problem…") would be new prose the report does not have, which violates the
  prose-parity rule. Cut.

**Rebuilt `WebRankList`** — HTML/CSS. It reads the model for **values only** (`rank`, `fullText`,
`mean`, `theme`, `themeLabel`) and never for geometry (`width` / `height` / `y` / `scoreBlock`,
which stay for the PDF).

- Row is `grid-cols-[2.25rem_1fr_auto]` with `gap-3` and a hairline `border-t` between rows.
- Rank numeral in display serif at `1.75rem`, **in ink-soft — not `BAND_FILL.broken`**. Today's
  hardcoded `broken` is exactly the meaningless band colour this redesign retires.
- Question is a wrapping `<p>` at `0.8125rem`, **in sentence case as authored — no
  `.toUpperCase()`**.
- Theme label beneath at `0.625rem` in `THEME_FILL[theme]`.
- Score block keeps a `BAND_FILL.severe` ground with the mean in cream display serif at
  `1.125rem`.

> ⚠️ **Accepted inherited caveat.** The `severe` score block is hardcoded for all six rows today
> and the model carries no per-item band — items have no `CategoryState`, so no truthful per-row
> band is derivable without new methodology work. Kept as-is; the redesign inherits this rather
> than fixing it.

Both new lists are flex columns whose *rows* are grids, so the Safari/VoiceOver grid-role trap does
not apply; `role="list"` is added anyway for consistency with `WebStatGrid`.

### 6.6 `s8` / `s9` / `s10` / `s13`

**Chart 5 — disagreement spread (`s8`, below the prose).**

- `dispersion` is **flagged-only**: `facts.ts:219` maps `d.disagreement_flags`, so every row has
  already cleared the 2.0 threshold. The dashed marker is therefore a **floor every bar crosses**.
  Label it `THRESHOLD 2.0` — never "above" or "below", never pass/fail language.
- `spread` is a population standard deviation of deviation on a **0–10 scale** at 2dp
  (`disagreement.ts:9`). A true 0–10 axis stubs every bar, so the axis **self-scales**:
  `0 → max(ceil(largest spread), 4)`, with the max labelled. Self-scaling never clips.
- Row = caps area name · track · bar in that area's `BAND_FILL` · spread in display serif right.
- **Omitted when `dispersion` is empty.**

**Chart 6 — dependency chain + gates (`s9`, above the prose — it is the diagnosis in one picture).**

- **Stage order is not in the facts pack.** `facts.categories` is score-sorted and `dependencies[]`
  is a mapped edge list with no path guarantee. The order lives in
  `methodology.rules.chain = [guest, conn, disc, vol, gen]` (`rules.yaml:2`) — the same array
  `facts.ts:128` builds `chainSet` from. **This is why `webVisuals` takes `methodology`.**
- **Gates map to specific stages** via `rules.enablers[id].gates` (`gov: all`,
  `comm: [guest, conn]`, `sys: [vol, disc]`). `gating[]` carries no mapping, so gate chips sit
  beside the stages they actually gate rather than in one list at the bottom.
- **Vertical rail** on web: five numbered markers on an ink-soft spine, each with the area name and
  its score in `BAND_TEXT[band]`. Five long area names across a 340px column is exactly how the
  4.9px bug was made; going vertical is the clearest single demonstration of "web-native, not
  scaled PDF".
- Gate chip = enabler name + score + `note`, in the enabler's band colour.
- `read_sentence` lines (the existing `copy.dependency_reads` strings) sit hairline-separated
  beneath.
- **Never empty.**

**Chart 7 — 30/60/90 phase rail (`s10`, REPLACES the body).**

- `s10` has **no AI renderer** — `SectionContent` (`sections.tsx:204`) switches only on
  s2/s4/s5/s6/s7/s9/s12, so `s10` always falls through to `SectionBodyView` with the deterministic
  fallback bullets. A rail *above* the body would therefore print the same three strings twice.
  The rail replaces them.
- Rail = three colour-keyed phase blocks: the `30`/`60`/`90` numeral in display serif, the
  `dayLabel` in caps, the `text` as body.
- **Colour keying introduces no new colours.** The three phases step down the verdict band —
  `BAND_FILL[cover.band]` at full, `.6`, and `.3` opacity for 30 / 60 / 90 — the same
  same-hex-reduced-opacity treatment §6.3 uses for the throughput bar. *(This is the one detail the
  approvals left as "colour-keyed" without pinning; resolved here at spec time. Easy to rule
  differently.)*
- It renders the **identical** `roadmapEntries()` data the bullets render — no prose parsing.
  `roadmapEntries()` (`fallback-sections.ts:238`) already returns `{dayLabel, text}` per phase; only
  `s10Bullets` flattens it to `"30 days — …"`.
- The PDF and its bullets are untouched.

**Chart 8 — confidence + sample basis (`s13`, below the prose).**

- `confidence` is a **0–1 float**, `max(floor, 1 − 0.15 × penalties)` (`assemble.ts:73`). Only
  `{0.70, 0.85, 1.00}` are reachable under current rules and the 0.4 floor never binds, so the
  meter looks identical across most reports. That is a property of the rules, not the drawing.
- Drawing: a plain continuous track plus the **printed percentage**. Honest at any future
  constants, and the printed number prevents false precision.
- Sample basis beneath: total respondents, areas assessed, and **thinnest coverage** = the minimum
  `categories[].respondent_count` with its area name.
- **Area names only — never respondent labels or ids.**
- **Never empty.**

### 6.7 No pull-quote

**No separate pull-quote is added.** The page already has one and it ships today: the cover's
band-filled foot block is a full-bleed display-serif statement carrying the `xpg_read` line. The
reference image's serif pull-quote beat is already satisfied, at the top of the page, for free.

`xpg_read` reaches the renderer through **two** paths already:

| Consumer | Renders as |
|---|---|
| `coverModel().headline` (`charts.ts:308`) | The cover's band-filled foot block |
| `bulletsFor('s3')` (`fallback-sections.ts:367`) | `s3`'s entire body |

`s3` has no AI renderer, so the `s3` bullet always renders — authed page and public share page
alike. Both renderings are locked by tests (`charts.test.ts:216`,
`fallback-sections.test.ts:243` and `:512`), and the standing comment at `charts.ts:288` says so
outright. Any added pull-quote would put the identical sentence on the page a **third** time.

---

## 7. Visual inventory

Eight new web-only visuals, all built from facts already in the pack. With the three that exist
today — the verdict block, the stat grid, and the rank list — that is **11 visuals over 13
sections**.

| # | Visual | Section | Placement | Source facts |
|---|---|---|---|---|
| 1 | Capacity vs throughput | s3 | below verdict block | `overall.{capacity,throughput,gap}` |
| 2 | Constraint callout | s4 | above prose | `primary_constraint`, `gating[]` |
| 3 | Blind-spot dumbbells | s4 | below prose | `blind_spots[]` |
| 4 | Theme split | s7 | above prose | `pattern_counts` |
| — | Rebuilt rank list | s7 | below prose | `rankListModel` (values only) |
| 5 | Disagreement spread | s8 | below prose | `dispersion[]`, `rules.thresholds.dispersion` |
| 6 | Dependency chain + gates | s9 | above prose | `dependencies[]`, `gating[]`, `rules.chain`, `rules.enablers[].gates` |
| 7 | 30/60/90 phase rail | s10 | **replaces body** | `roadmapEntries()` |
| 8 | Confidence + sample basis | s13 | below prose | `confidence`, `cover.respondent_count`, `categories[].respondent_count` |

**Sections deliberately left with no visual:** s1 (cover), s2 (executive summary — the one place to
just read), s5, s6 (the six labelled beats *are* the structure), s11 (the offer), s12.

**Rulings folded into the inventory:**

- **Tier ladder at s12 — cut.** The tier is already the loudest element in `s3`'s verdict block and
  on the cover ladder; a third drawing is repetition, and `s12`'s job is a verdict in words.
- **`s5` (strengths) stays prose.** The asymmetry against `s7` is intentional: this is a diagnosis,
  not a scorecard.
- **`categories[].percentile` gets no chart** — it folds into `s3`'s stat grid as a "vs. cohort"
  annotation.

---

## 8. Empty states

**Rule: never an empty frame, never a "no data" message. The visual is absent and the prose stands
alone.**

| # | Visual | Empty behaviour |
|---|---|---|
| 1 | Capacity vs throughput | Never absent. The `19 POINTS LOST` chip is omitted when `overall.gap <= 0`. |
| 2 | Constraint callout | Omitted when there is no `primary_constraint` **and** no gated enabler. |
| 3 | Blind-spot dumbbells | Omitted when `blind_spots` is empty. |
| 4 | Theme split | Omitted when `total === 0`. |
| 5 | Disagreement spread | Omitted when `dispersion` is empty. |
| 6 | Dependency chain | Never absent. |
| 7 | Phase rail | Falls back to today's bullets when `roadmapEntries()` is empty. |
| 8 | Confidence | Never absent. |

---

## 9. Accessibility

- **All eight visuals are HTML/CSS, so no scaled viewBox survives anywhere in the web report.** The
  root cause of the sub-5px labels is eliminated, not patched.
- `role="list"` on every list-shaped visual.
- **Values are always real text**, never encoded in bar width alone.
- Bars and tracks are `aria-hidden`.
- **Colour is never the only carrier of meaning** — always paired with a spelled band name or a
  number, per the comment at `charts.ts:62`.
- `textOnBand()` on band fills; `BAND_TEXT` on cream grounds.
- `aria-current` on the active cover-ladder row.

---

## 10. Public share page

The share page renders the same sections fallback-only. All eight visuals read **facts, not AI
prose**, so all eight render there identically. The two web-only divergences from the PDF — the
`s6` beat labels and the `s10` phase rail — are deterministic and present there too.

The only real difference: `pattern_claim` is AI-only, so share-page `s7` is theme split + fallback
narrative + rank list. Accepted.

**Anonymity holds throughout:** respondent labels and ids never reach a renderer. Chart 8 shows
area names and counts only.

---

## 11. `lib/report/` changes — exactly four items

| # | Change | For |
|---|---|---|
| 1 | Add `CoverModel.ladder` | §6.2 cover tier ladder |
| 2 | Add `StatCell.percentile` | §6.3 "vs. cohort" annotation |
| 3 | Add `RankRow.fullText` (untruncated `item.text`, alongside the 90-char `text`) | §6.5 rebuilt rank list |
| 4 | New pure module `lib/report/web-visuals.ts` + export `roadmapEntries` from `fallback-sections.ts:238` (module-private today, one caller) | §5.1 seam, §6.6 chart 7 |

Items 1–3 add **fields to existing models**. The PDF keeps reading `strip`, `text` +
`RANK_TEXT_MAX`, and the stat grid as before, so `pdf/document.tsx` is unaffected. Values are
computed **on the model, not re-derived in the renderer**, per the `resolve.ts:55` invariant.

Everything else in `lib/report/charts.ts` — all existing geometry — is untouched.

---

## 12. Test impact

| Test | Impact |
|---|---|
| `tests/report/charts.test.ts` | **Needs updating.** It asserts `CoverModel`, `StatCell`, and `RankRow` by exact shape; three new fields are added. |
| `tests/report/chart-parity.test.ts` | **Unchanged.** The eight new visuals are outside `section.charts` by design, so its hardcoded three-kind set never sees them. |
| `tests/report/fallback-sections.test.ts` | **Unchanged.** The `roadmapEntries` export is additive; `s10Bullets` keeps its current behaviour and assertions. |
| `tests/a11y/shared-report-heading.test.ts` | **Must stay green.** It counts the literal `<h1` in `sections.tsx` source text; the two-literal-branch shape at `sections.tsx:268` must survive the dispatcher refactor. |
| **New:** `lib/report/web-visuals.ts` unit tests | One per empty state in §8, plus the chain stage ordering and gate→stage mapping. |
| Booking-CTA tripwire, a11y guard | Untouched. |

---

## 13. Out of scope / follow-ups

1. **The cover-strip marker-vs-segments defect** (§6.2, defect 2). Shared geometry, so the printed
   cover has it too. Separate change, separate approval.
2. **The summary panel + jump-nav** rejected in the direction decision. Could be added on top of
   this later; not ruled out permanently.
3. **A truthful per-row band for rank-list items** (§6.5). Needs new methodology work.

---

## 14. Guardrails

- The agent does **not** merge, push to `master`, or force-push without Natalie.
- Never run `npm run test:db`, `supabase db push`, or `supabase db reset`.
- Use explicit git paths; never stage `.claude/`. Use `GIT_LITERAL_PATHSPECS=1` for `[churchId]`
  and `[categoryId]` paths.
- **No new dependencies** — no charting library.
- `lib/report/charts.ts` and the new `lib/report/web-visuals.ts` are **pure**: no JSX, no
  `@react-pdf/renderer`, no DOM.
- Do not design on or depend on the dead subtree (`chain.tsx`, `system.tsx`, `dossier.tsx`,
  `cover.tsx` — PR #64's scope).
- CI "Vercel unstable" / `UNSTABLE` is a `cornerleague` permissions artifact, not a code failure.

---

## 15. Decision record

Seven decisions were taken during brainstorming. Recorded here so the plan does not reopen them.

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Overall direction | **Editorial infographic** — own layout language, meaningful band colour, new web-only visuals from existing facts | Typeset the mirror (rules only, no charts); dashboard-first with summary panel + jump-nav (gives away the verdict) |
| 2 | Section chrome | **Labelled beats + editorial masthead** — tick, caps eyebrow, serif title, 2px rule; labelled `s6` beats | Hairlines with no labels (a bare rule only says "new paragraph"); full-bleed chapter slabs (longest, hostile to charts) |
| 3 | `s6` beat labels | **Web only**; PDF keeps unlabelled paragraphs | Both surfaces |
| 4 | Chart inventory | **Eight new visuals as listed in §7**; s12 tier ladder cut; s5 stays prose; chain goes vertical | A tier ladder at s12; a percentile chart |
| 5 | Existing charts | **Rebuild `WebRankList` + `WebVerdictBlock` web-native** (two, not three — `WebStatGrid` is already a responsive HTML grid) | Keep the SVG and lower `RANK_TEXT_MAX` (shared with the PDF, shortens the printed report, buys ~8.2px with no wrapping); rebuild the rank list only (leaves one scaled viewBox among HTML siblings) |
| 6 | Pull-quote | **Dropped** — `xpg_read` already renders twice, so a pull-quote would be a third instance | Source it from `xpg_read`; from `dependencies[].read_sentence` (chart 6 renders those inches away); lift a sentence of AI prose (varies run to run, absent on the share page) |
| 7 | Cover strip | **Four-step tier ladder** | Leave as-is (both defects stay); rebuild the same design web-native (fixes labels, keeps the false axis); honest proportional 0–100 scale (accurate, but paints every report 55% dark red and forces a legend) |
