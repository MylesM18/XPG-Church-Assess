# XPG Final Report — Quality Pass + Data Visualisation (design)

**Date:** 2026-08-13
**Branch:** `feat/report-quality-charts`, off `origin/master` @ `291ecb0`
**Inputs:** `~/Desktop/xpg-diagnosis-test-church-2026-08-14.pdf`, `~/Desktop/XPG Final Report — Deconstruction & Rebuild Blueprint.md`

---

## 0. Finding that reframes the brief: the sample PDF is 100% deterministic fallback

The 2026-08-14 test PDF contains **zero AI sections**. Every one of the 13 sections is
byte-shape-identical to `lib/report/fallback-sections.ts`:

| PDF output | Fallback source |
|---|---|
| `Volunteer: 72 out of 100 — This is strong…` | `fallback-sections.ts:274` |
| `XPG Assessment: Volunteer — 72 out of 100.` | `:278` |
| `This is strong… Discipleship / Leadership: 60 out of 100.` | `s6Bullet` `:93` (`bandRead` + `evidenceBeat`) |
| `Tell about one person who…: Greeted the guest and…` | `:120` — the `facts.themes.length === 0` branch |
| 13× `Both are strong — nothing to flag here.` | `facts.dependencies[].read_sentence` `:125` |
| `Overall: 59 / Band: Strained / Objective: no single stage.` | `:292` |

Section bodies are `interp(section.templates[archetype], tokens)` verbatim.

**Root cause.** `.env.local` contains only `APP_URL`, `MONOGRAM_LETTERS`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`. There is **no
`OPENAI_API_KEY` and no `OPENAI_MODEL_PROSE`**. `lib/ai/sections.ts:119` and
`lib/ai/themes.ts:160` both call `new OpenAI()`, which throws on a missing key → caught →
`return null` → all seven AI sections fall back, and `clusterThemes` returns null so
`facts.themes = []`. This is the owner-config item still open from the OpenAI migration.

### Corrections to the brief's premises

1. **The repeated "This is strong" line is not a canned AI line, and setting the key will not
   fix it.** `readingBand()` (`lib/report/view.ts:107`) is **state-driven, not score-driven**:
   anything not `broken`/`gate`/`watch` returns `holding` → `copy.yaml:21` (stage) / `:26`
   (enabler). All eight areas are `holding`, so all eight draw from a two-string pool.
   Governance at **53/100** is currently told *"This is strong."* Because the AI layer rewords
   the fallback draft, it will faithfully reword a wrong claim. This is a threshold defect in the
   deterministic layer, upstream of anything prose-shaped.
2. **Priority 4 is already built.** `lib/ai/themes.ts`, `lib/ai/theme-gates.ts`
   (`MIN_SUPPORT = 3`), verbatim substring verification, item-id mapping, the `s8Bullets` theme
   branch, and `revalidatedThemes` read-back all ship today. Dark only because of the key.
   Priority 4 is verify-and-tune, not build.
3. **Priority 2's six beats are deliberately three.** `fallback-sections.ts:84-96` documents that
   pivot / not-statement / trajectory *"have no lookup anywhere in the facts pack or copy.yaml"*
   and are omitted by design. Closing that is the genuine new work.
4. **Charts are net-new on both surfaces.** `lib/report/pdf/document.tsx:1` imports only
   `Document, Page, Text, View, Link, StyleSheet` — no `Svg`. `@react-pdf/renderer` is `4.5.1`,
   which does carry the SVG primitives, so the hard constraint holds.

### The sample dataset is degenerate

1 respondent, all eight areas in a 53–72 `holding` band, no broken stage, confidence 0.85. It
cannot exercise blind spots, dispersion, themes (k=3 kills every theme at n=1), or any
constraint/foundation archetype. **Nothing in this design may be validated against that PDF
alone** — hence §6.

---

## 1. Architecture: the shared-geometry seam

`AssembledSection` is `{ id, source, ai, fallback }` and carries **no facts**.
`lib/report/resolve.ts:55` states the invariant: *"no renderer reads derived NUMBERS from
`facts`."* Charts are derived numbers, so they must be computed in the deterministic layer and
handed to renderers as data.

**New module `lib/report/charts.ts`** — pure functions. No JSX, no `@react-pdf/renderer` import,
no DOM. Coordinates in a fixed viewBox unit space so both surfaces consume identical numbers:

```ts
areaBarsModel(facts)         → { bars: {id,name,score,x,y,w,h,band}[], ticks, w, h }
tierGaugeModel(facts, meth)  → { bands: {name,from,to,x,w}[], marker: {x,label}, w, h }
bottomItemsModel(facts)      → { bars: {id,text,mean,theme,x,y,w,h}[], ticks, w, h }
```

`assembleReport` (and `assembleFallbackOnly`, so the share page gets them too) computes these
alongside `fallbacks` and attaches `chart: ChartModel | null` to each section — exactly the way
`fallback.bullets` already rides along. `ReportDocument` and `ReportSections` each render the
same numbers through their own primitives (`<Svg><Rect>` vs `<svg><rect>`).

**Parity is structural, not maintained by discipline.** A geometry bug is one bug in one place;
a rendering divergence is caught by asserting both renderers consume the same model object.

### Two consequences, stated explicitly

- **Charts render identically on the AI and fallback paths.** They never read `section.source`.
  Charts become the one part of the report that cannot degrade — which matters because the public
  share page is fallback-only, permanently, by design (`assembleFallbackOnly`).
- **`inputsHash` is untouched.** Verified: the hash is
  `methodologyVersion | responseHash | item→theme map | reflections | profile | report.yaml:version`
  (`lib/report/report-hash.ts:53`). `copy.yaml` content and version are **not** in it. Adding
  chart models and `copy.yaml` keys changes nothing about the hash.

---

## 2. ⚠️ Hazard: `report.yaml:version` is in `inputsHash`

`report.yaml:version` **is** a hash component. Bumping it makes **every persisted report in the
system stale at once**. Combined with the known, still-unfixed
`rpc_save_report.sql:45 on conflict do nothing`, a stale row cannot be overwritten — which would
pin every existing church to 100% fallback permanently, with no regenerate path.

**Ruling (approved):** avoid the `report.yaml` bump entirely. All new copy goes in `copy.yaml`,
which is outside the hash. No version bump, no stale reports, no migration. The finding-1
follow-up PR remains a **separate task on its own branch**, unblocked and unchanged by this work.

**Constraint this places on implementation:** the three new s6 beats, the s3 XPG read, and the
s8 suppression line must all be expressible as `copy.yaml` additions plus facts-pack lookups. If
any of them turns out to require a `report.yaml` section-template change, **stop and escalate** —
do not bump the version to get unblocked.

---

## 3. Priority 1 — Executive Health Dashboard (s3)

s3 is **not** in `AI_SECTION_IDS`, so this is pure deterministic work.

Per blueprint §2 row 3, s3 delivers: eight areas sorted descending, overall %, tier name, a
one-line XPG read, and the chart.

- Keep the templated body.
- Replace the eight `Name: score — bandRead` bullets with the **horizontal bar chart**
  (`areaBarsModel`) plus a compact score column. Bars sorted descending; bar fill keyed to the
  corrected band (§7), not to a single flat colour.
- Add the **tier gauge** (`tierGaugeModel`) — band segments across 0–100 with a marker at the
  overall %, labelled with the tier name.
- Add the **one-line XPG read**: a new deterministic `copy.yaml` entry keyed
  `archetype × tier`.

**Rejected alternative:** promoting s3 to an eighth AI section. That would mean touching
`AI_SECTION_IDS`, both exhaustive `switch` statements (whose `never` arms are load-bearing
compile-time guards), the gate registry, and the two-surface smoke matrix — and it would make the
dashboard degrade to prose when the model is unavailable. The dashboard is the numbers layer; it
should never depend on the model.

---

## 4. Priority 2 — the three missing beats (s6)

The blueprint's micro-template is affirm → pivot → evidence → not-statement → reframe →
trajectory. Today only affirm / evidence / reframe have sources. New sources:

| Beat | Source | Where it lives |
|---|---|---|
| **pivot** | this area's score delta vs the top-3 mean (and its rank) | new `copy.inserts.pivot`, keyed by band |
| **not-statement** | the `theme` tags on this area's low items — already computed as `facts.bottom_items[].theme` / `facts.pattern_counts` | new `copy.blocks.not_statement`, keyed by dominant theme (systems / culture / theology / relational) |
| **trajectory** | `facts.profile.growth_trajectory` — already present (sample shows `growing_steadily`) | new `copy.inserts.trajectory`, keyed by trajectory value |

Rules carried forward from the existing beat design: **an absent input drops its beat**, never
emits an empty sentence, never throws on an undefined lookup. `s6Bullet` must remain non-empty in
all cases (affirm always resolves).

**AI side (in scope per the brief):** extend `S6Schema` from `{affirm, evidence, reframe}` to all
six fields, update the s6 prompt/template shaping, and extend the s6 gate so the new fields are
numeric-contained and category-faithful like the existing three. `SYSTEM_PROMPT` register is
**not** touched — the blueprint confirms it is already correct.

Both `S6View` renderers (PDF and web) grow from three `<Text>`/`<p>` to six, in beat order.

---

## 5. Priorities 3 and 4

**Priority 3 — Lowest Scoring Indicators (s7).** Working correctly today, including the
computable pattern read (`pattern_counts` zero-count lines). **Keep the logic unchanged**; add
the bottom-N bar chart (`bottomItemsModel`) with theme-keyed bar fills so the "none of these are
theological" claim is visible as well as stated. No copy changes.

**Priority 4 — What Leaders Are Saying (s8).** Already built end-to-end. Work is:

1. **Verify** the theme path lights up against a fixture with ≥3 respondents and a key present —
   `clusterThemes` → `theme-gates` (`MIN_SUPPORT = 3`, verbatim substring check, item-id mapping)
   → `facts.themes` → `revalidatedThemes` read-back → `s8Bullets` theme branch.
2. **Close the anonymity gap (approved for this pass).** The **theme path** enforces k≥3. The
   **fallback path** (`fallback-sections.ts:117-121`) prints every reflection verbatim with its
   prompt and **no k-threshold at all**. In the sample PDF that is one person's four answers,
   fully attributable — and this path is what the **public share page always renders**. Apply the
   same `MIN_SUPPORT` philosophy: below threshold, suppress the verbatim dump and emit a neutral
   "not enough responses to report themes yet" line from `copy.yaml`.

---

## 6. Fixtures — the validation substrate

`tests/fixtures/facts/` — hand-built `FactsPack` fixtures, no DB, no migration, no new deps:

1. `capacity` — nothing broken (the sample's archetype, but with n≥8)
2. `constraint` — one broken stage, primary constraint set
3. `foundation` — gated enablers, 2 and 3 gated variants
4. `broken-stage-severe` — score below `thresholds.severe`
5. `high-dispersion` — disagreement flags present, blind spots present
6. `themes-n3` — ≥3 respondents with reflections that legitimately cluster

Charts, the six beats, the corrected bands, and the s8 k-guard are unit-tested against all six.

---

## 7. Fallback-correctness fixes (prerequisite to everything above)

1. **`readingBand` is score-blind.** `view.ts:107` returns `holding` for every non-broken,
   non-watch state, so 53 and 100 read identically. Introduce a score-aware band so an area at 53
   is not told *"This is strong."* This also feeds the chart bar fills (§3), so it must land
   first. Note `READING_BAND_LABEL` (`view.ts:117`) and the cover table share this function — one
   fix, both surfaces.
2. **Make composer-vs-fallback observable.** Today "the model is off" and "the model ran" are
   indistinguishable in the output. Add a signal — a dev/server warning when `OPENAI_API_KEY` is
   absent at the point of first use, and a `section_sources` summary in the existing `[report]`
   log line — so a fallback-only report is never again mistaken for a composed one.

---

## 8. Scope boundaries (from the brief, restated)

- Surfaces: **both** (diagnosis page + PDF), parity maintained.
- Methodology version bump: **no**.
- New migration: **no** (see §2 for why this is now safe).
- New dependencies: **no**. `zod` stays pinned `3.25.76`.
- AI prose: **yes** for section templates / prompt shaping (s6). **No** change to
  `SYSTEM_PROMPT` register.
- `react-pdf` SVG only for the PDF charts. Confirmed available at 4.5.1.
- Do not stage the three known untracked entries (`.claude/`, the two
  `docs/superpowers/plans/` files). Use explicit git paths.

## 9. Open dependency on the never-run two-surface smoke

The two surfaces agree **today only because both render 100% fallback** — the never-run
two-surface smoke is currently proving nothing. It becomes load-bearing the moment
`OPENAI_API_KEY` is set. Every parity claim in this design rests on the shared-geometry seam
(§1), which is verifiable by unit test; but the **prose** parity between the diagnosis page and
the PDF remains unverified and is owner-driven. Flag this in the PR body.
